import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  createVoiceConnection,
  type VoiceConnection,
  type VoiceConnectionOptions,
  type VoiceRealtimeEvent,
} from "../src/lib/voice/client";

const audioSdp = "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n";

class FakeTrack {
  readonly kind = "audio";
  stopped = false;
  stop() {
    this.stopped = true;
  }
}

class FakeStream {
  constructor(private readonly tracks: FakeTrack[] = []) {}
  getTracks() {
    return this.tracks;
  }
  getAudioTracks() {
    return this.tracks;
  }
  addTrack(track: FakeTrack) {
    this.tracks.push(track);
  }
}

class FakeChannel {
  readyState = "connecting";
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  constructor(readonly label: string) {}
  close() {
    this.readyState = "closed";
  }
  send(message: string) {
    this.sent.push(message);
  }
}

class FakePeer extends EventTarget {
  static instances: FakePeer[] = [];
  connectionState = "new";
  iceGatheringState = "complete";
  channel: FakeChannel | undefined;
  transceiver: { kind: string; direction: string } | undefined;
  localDescription: { type: string; sdp: string } | undefined;
  readonly senders: { track: FakeTrack }[] = [];
  readonly receivers: { track: FakeTrack }[] = [];
  onconnectionstatechange: (() => void) | null = null;
  ondatachannel: ((event: { channel: FakeChannel }) => void) | null = null;
  ontrack: ((event: { track: FakeTrack }) => void) | null = null;

  constructor() {
    super();
    FakePeer.instances.push(this);
  }
  createDataChannel(label: string) {
    this.channel = new FakeChannel(label);
    return this.channel;
  }
  addTransceiver(kind: string, options: { direction: string }) {
    this.transceiver = { kind, ...options };
  }
  addTrack(track: FakeTrack) {
    this.senders.push({ track });
  }
  getSenders() {
    return this.senders;
  }
  getReceivers() {
    return this.receivers;
  }
  async createOffer() {
    return { type: "offer", sdp: audioSdp };
  }
  async setLocalDescription(offer: { type: string; sdp: string }) {
    this.localDescription = offer;
  }
  async setRemoteDescription() {
    this.connectionState = "connected";
    assert.ok(this.channel);
    this.channel.readyState = "open";
    this.onconnectionstatechange?.();
    this.channel.onopen?.();
  }
  close() {
    this.connectionState = "closed";
  }
}

function browserHarness() {
  const descriptors = new Map<string, PropertyDescriptor | undefined>();
  const connections: VoiceConnection[] = [];
  const posts: { url: RequestInfo | URL; init?: RequestInit }[] = [];
  let microphoneCalls = 0;
  let microphone = async () => new FakeStream([new FakeTrack()]);
  let relay: (init?: RequestInit) => Promise<Response> = async () =>
    Response.json({ type: "answer", sdp: audioSdp });

  function replace(name: string, value: unknown) {
    descriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value,
    });
  }

  FakePeer.instances = [];
  replace("RTCPeerConnection", FakePeer);
  replace("MediaStream", FakeStream);
  replace("navigator", {
    mediaDevices: {
      async getUserMedia() {
        microphoneCalls += 1;
        return microphone();
      },
    },
  });
  replace("fetch", async (url: RequestInfo | URL, init?: RequestInit) => {
    posts.push({ url, init });
    return relay(init);
  });

  return {
    posts,
    get microphoneCalls() {
      return microphoneCalls;
    },
    get peer() {
      const peer = FakePeer.instances.at(-1);
      assert.ok(peer);
      return peer;
    },
    setMicrophone(factory: () => Promise<FakeStream>) {
      microphone = factory;
    },
    setRelay(factory: (init?: RequestInit) => Promise<Response>) {
      relay = factory;
    },
    start(options?: VoiceConnectionOptions) {
      const connection = createVoiceConnection(options);
      connections.push(connection);
      // Cleanup can reject an unfinished connection even if an assertion fails.
      void connection.ready.catch(() => {});
      return connection;
    },
    restore() {
      for (const connection of connections) connection.close();
      for (const [name, descriptor] of descriptors) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else Reflect.deleteProperty(globalThis, name);
      }
    },
  };
}

describe("browser voice connection lifecycle", { concurrency: false }, () => {
  let browser: ReturnType<typeof browserHarness>;
  beforeEach(() => {
    browser = browserHarness();
  });
  afterEach(() => {
    browser.restore();
  });

  it("connects without capturing a microphone or requesting inference by default", async () => {
    const events: VoiceRealtimeEvent[] = [];
    const connection = browser.start({
      onEvent: (event) => events.push(event),
    });
    await connection.ready;

    assert.equal(connection.state, "connected");
    assert.equal(browser.microphoneCalls, 0);
    assert.deepEqual(browser.peer.transceiver, {
      kind: "audio",
      direction: "recvonly",
    });
    assert.equal(browser.posts.length, 1);
    assert.equal(browser.posts[0].url, "/api/voice/session");
    assert.equal(browser.posts[0].init?.method, "POST");
    assert.deepEqual(JSON.parse(String(browser.posts[0].init?.body)), {
      sdp: audioSdp,
    });
    assert.ok(browser.peer.channel);
    assert.equal(browser.peer.channel.label, "oai-events");
    assert.deepEqual(browser.peer.channel.sent, []);

    const serverChannel = new FakeChannel("txt");
    browser.peer.ondatachannel?.({ channel: serverChannel });
    serverChannel.onmessage?.({
      data: JSON.stringify({ type: "session.created" }),
    });
    assert.deepEqual(events, [{ type: "session.created" }]);
    connection.sendEvent({ type: "session.update", session: {} });
    assert.deepEqual(JSON.parse(browser.peer.channel.sent[0]), {
      type: "session.update",
      session: {},
    });

    const remoteTrack = new FakeTrack();
    browser.peer.ontrack?.({ track: remoteTrack });
    connection.close();
    assert.equal(remoteTrack.stopped, true);
    assert.equal(serverChannel.readyState, "closed");
    assert.equal(browser.peer.channel.readyState, "closed");
    assert.equal(browser.peer.connectionState, "closed");
    assert.equal(connection.state, "closed");
  });

  it("captures only with explicit opt-in and stops microphone tracks on close", async () => {
    const microphoneTrack = new FakeTrack();
    browser.setMicrophone(async () => new FakeStream([microphoneTrack]));
    const connection = browser.start({ captureMicrophone: true });
    await connection.ready;

    assert.equal(browser.microphoneCalls, 1);
    assert.equal(browser.peer.senders[0].track, microphoneTrack);
    connection.close();
    assert.equal(microphoneTrack.stopped, true);
    assert.equal(browser.peer.connectionState, "closed");
  });

  it("stops a microphone whose permission prompt resolves after cancellation", async () => {
    let grantPermission!: (stream: FakeStream) => void;
    browser.setMicrophone(
      () =>
        new Promise((resolve) => {
          grantPermission = resolve;
        }),
    );
    const connection = browser.start({ captureMicrophone: true });
    const rejection = assert.rejects(connection.ready, { name: "AbortError" });
    connection.close();

    const lateTrack = new FakeTrack();
    grantPermission(new FakeStream([lateTrack]));
    await rejection;
    // Let the pending permission continuation release the just-acquired stream.
    await Promise.resolve();
    assert.equal(lateTrack.stopped, true);
    assert.equal(browser.posts.length, 0);
    assert.equal(connection.state, "closed");
  });

  it("rejects an invalid SDP answer and releases the peer connection", async () => {
    browser.setRelay(async () =>
      Response.json({ type: "answer", sdp: "invalid" }),
    );
    const connection = browser.start();
    await assert.rejects(connection.ready, /invalid SDP answer/);
    assert.equal(connection.state, "failed");
    assert.equal(browser.peer.connectionState, "closed");
    assert.equal(browser.peer.channel?.readyState, "closed");
  });

  it("bounds connection time and aborts an outstanding SDP relay", async () => {
    let relayAborted = false;
    browser.setRelay(
      (init) =>
        new Promise((_, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => {
              relayAborted = true;
              reject(new DOMException("Relay aborted.", "AbortError"));
            },
            { once: true },
          );
        }),
    );
    const connection = browser.start({ timeoutMs: 100 });
    await assert.rejects(connection.ready, /timed out/);
    assert.equal(relayAborted, true);
    assert.equal(connection.state, "failed");
    assert.equal(browser.peer.connectionState, "closed");
  });
});
