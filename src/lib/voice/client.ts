"use client";

export type VoiceConnectionState =
  "connecting" | "connected" | "disconnected" | "closed" | "failed";

// Qwen events are passed through without assuming a particular tools schema.
export interface VoiceRealtimeEvent {
  type: string;
  [key: string]: unknown;
}

export interface VoiceConnectionOptions {
  /** Microphone capture requires an explicit user action and this opt-in. */
  captureMicrophone?: boolean;
  /** Playback requires both this opt-in and a caller-owned audio element. */
  playRemoteAudio?: boolean;
  audioElement?: HTMLAudioElement;
  timeoutMs?: number;
  iceGatheringTimeoutMs?: number;
  signal?: AbortSignal;
  onStateChange?: (state: VoiceConnectionState) => void;
  onEvent?: (event: VoiceRealtimeEvent) => void;
  onError?: (error: Error) => void;
}

export interface VoiceConnection {
  /** Resolves only after the peer transport and outgoing data channel connect. */
  ready: Promise<void>;
  readonly state: VoiceConnectionState;
  sendEvent: (event: VoiceRealtimeEvent) => void;
  close: () => void;
  setMicrophoneMuted: (muted: boolean) => void;
}

/**
 * Connect through our SDP relay. Defaults to receive-only audio, no microphone,
 * no playback, and no inference requests. Call close() when leaving the UI.
 * Qwen may send events on its own "txt" channel as well as "oai-events".
 * https://docs.modelstudio.console.alibabacloud.com/en/model-studio/realtime
 */
export function createVoiceConnection(
  options: VoiceConnectionOptions = {},
): VoiceConnection {
  if (typeof RTCPeerConnection === "undefined") {
    throw new Error("This browser does not support WebRTC voice connections.");
  }
  if (options.playRemoteAudio && !options.audioElement) {
    throw new Error("Provide an audio element to enable voice playback.");
  }
  const timeoutMs = boundedDuration(options.timeoutMs, 30_000, "timeoutMs");
  const iceTimeoutMs = boundedDuration(
    options.iceGatheringTimeoutMs,
    3_000,
    "iceGatheringTimeoutMs",
  );
  const pc = new RTCPeerConnection({ iceServers: [] });
  const controller = new AbortController();
  const channels = new Set<RTCDataChannel>();
  const remoteStream = new MediaStream();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let microphone: MediaStream | undefined;
  let state: VoiceConnectionState = "connecting";
  let closed = false;
  let settled = false;
  let resolveReady!: () => void;
  let rejectReady!: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  // Consumer callback failures must not prevent releasing microphone resources.
  function notify<T>(callback: ((value: T) => void) | undefined, value: T) {
    try {
      callback?.(value);
    } catch {
      console.error("Voice UI callback failed.");
    }
  }

  function setState(next: VoiceConnectionState) {
    if (state === next) return;
    state = next;
    notify(options.onStateChange, next);
  }

  function teardown() {
    closed = true;
    controller.abort();
    options.signal?.removeEventListener("abort", abort);
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    for (const channel of channels) {
      channel.onopen =
        channel.onclose =
        channel.onerror =
        channel.onmessage =
          null;
      channel.close();
    }
    pc.onconnectionstatechange = pc.ondatachannel = pc.ontrack = null;
    for (const track of microphone?.getTracks() ?? []) track.stop();
    for (const track of remoteStream.getTracks()) track.stop();
    for (const sender of pc.getSenders()) sender.track?.stop();
    for (const receiver of pc.getReceivers()) receiver.track?.stop();
    pc.close();
    if (options.audioElement?.srcObject === remoteStream) {
      options.audioElement.pause();
      options.audioElement.srcObject = null;
    }
  }

  function fail(cause: unknown) {
    if (closed) return;
    const error =
      cause instanceof Error ? cause : new Error("Voice connection failed.");
    teardown();
    setState("failed");
    if (!settled) {
      settled = true;
      rejectReady(error);
    }
    notify(options.onError, error);
  }

  function close() {
    if (closed) return;
    teardown();
    setState("closed");
    if (!settled) {
      settled = true;
      rejectReady(new DOMException("Voice connection closed.", "AbortError"));
    }
  }

  function abort() {
    close();
  }

  function checkConnected() {
    if (
      closed ||
      pc.connectionState !== "connected" ||
      outgoing.readyState !== "open"
    )
      return;
    clearTimeout(connectionTimer);
    timers.delete(connectionTimer);
    setState("connected");
    if (!settled) {
      settled = true;
      resolveReady();
    }
  }

  function attachChannel(channel: RTCDataChannel) {
    channels.add(channel);
    channel.onopen = checkConnected;
    channel.onclose = () => {
      if (!closed && channel === outgoing)
        fail(new Error("Voice control channel closed."));
    };
    channel.onerror = () => fail(new Error("Voice control channel failed."));
    channel.onmessage = (message: MessageEvent) => {
      if (closed || typeof message.data !== "string") return;
      let event: unknown;
      try {
        event = JSON.parse(message.data);
      } catch {
        return;
      }
      if (
        event &&
        typeof event === "object" &&
        !Array.isArray(event) &&
        "type" in event &&
        typeof event.type === "string"
      ) {
        notify(options.onEvent, event as VoiceRealtimeEvent);
      }
    };
  }

  const outgoing = pc.createDataChannel("oai-events");
  attachChannel(outgoing);
  pc.ondatachannel = ({ channel }) => {
    if (closed) {
      channel.close();
      return;
    }
    attachChannel(channel);
  };
  pc.onconnectionstatechange = () => {
    if (closed) return;
    if (pc.connectionState === "failed" || pc.connectionState === "closed")
      fail(new Error("Voice peer connection ended."));
    else if (pc.connectionState === "disconnected") setState("disconnected");
    else checkConnected();
  };
  pc.ontrack = ({ track }) => {
    if (closed) {
      track.stop();
      return;
    }
    if (track.kind !== "audio") return;
    remoteStream.addTrack(track);
    if (options.playRemoteAudio && options.audioElement) {
      options.audioElement.srcObject = remoteStream;
      void options.audioElement.play().catch(() => {
        if (!closed)
          notify(
            options.onError,
            new Error(
              "Audio playback was blocked. Use the audio element's play control to listen.",
            ),
          );
      });
    }
  };
  const connectionTimer = setTimeout(
    () => fail(new Error("Voice connection timed out.")),
    timeoutMs,
  );
  timers.add(connectionTimer);
  options.signal?.addEventListener("abort", abort, { once: true });

  async function connect() {
    if (options.captureMicrophone) {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error(
          "Microphone capture requires a supported browser and secure connection.",
        );
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      // Permission prompts can resolve after cancellation; never retain that mic.
      if (closed) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      microphone = stream;
      for (const track of stream.getAudioTracks()) pc.addTrack(track, stream);
    } else {
      pc.addTransceiver("audio", { direction: "recvonly" });
    }
    if (closed) return;
    await pc.setLocalDescription(await pc.createOffer());
    if (closed) return;
    await gatherIce();
    if (closed) return;
    const offer = pc.localDescription?.sdp;
    if (!offer?.startsWith("v=0") || !offer.includes("m=audio"))
      throw new Error("Browser could not create an audio SDP offer.");
    const response = await fetch("/api/voice/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sdp: offer }),
      signal: controller.signal,
      cache: "no-store",
    });
    const body: unknown = await response.json();
    if (closed) return;
    if (!response.ok) {
      const message =
        body &&
        typeof body === "object" &&
        "error" in body &&
        typeof body.error === "string"
          ? body.error
          : "Voice handshake failed.";
      throw new Error(message);
    }
    if (
      !body ||
      typeof body !== "object" ||
      !("type" in body) ||
      body.type !== "answer" ||
      !("sdp" in body) ||
      typeof body.sdp !== "string" ||
      body.sdp.length > 64_000 ||
      !body.sdp.startsWith("v=0") ||
      !body.sdp.includes("m=audio")
    ) {
      throw new Error("Voice relay returned an invalid SDP answer.");
    }
    await pc.setRemoteDescription({ type: "answer", sdp: body.sdp });
    checkConnected();
  }

  function gatherIce(): Promise<void> {
    if (pc.iceGatheringState === "complete" || closed) return Promise.resolve();
    return new Promise((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        timers.delete(timer);
        pc.removeEventListener("icegatheringstatechange", changed);
        controller.signal.removeEventListener("abort", finish);
        resolve();
      };
      const changed = () => {
        if (pc.iceGatheringState === "complete") finish();
      };
      const timer = setTimeout(finish, iceTimeoutMs);
      timers.add(timer);
      pc.addEventListener("icegatheringstatechange", changed);
      controller.signal.addEventListener("abort", finish, { once: true });
      changed();
    });
  }

  if (options.signal?.aborted) close();
  else {
    notify(options.onStateChange, "connecting");
    void connect().catch(fail);
  }

  return {
    ready,
    get state() {
      return state;
    },
    close,
    setMicrophoneMuted(muted) {
      for (const track of microphone?.getAudioTracks() ?? [])
        track.enabled = !muted;
    },
    sendEvent(event) {
      if (closed || outgoing.readyState !== "open")
        throw new Error("Voice control channel is not open.");
      if (!event || typeof event.type !== "string" || !event.type.trim())
        throw new Error("Voice events require a type.");
      outgoing.send(JSON.stringify(event));
    },
  };
}

function boundedDuration(
  value: number | undefined,
  fallback: number,
  label: string,
) {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value < 100 || value > 60_000)
    throw new Error(`${label} must be between 100 and 60000 milliseconds.`);
  return value;
}
