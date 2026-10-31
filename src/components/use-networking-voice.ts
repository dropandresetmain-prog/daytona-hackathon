"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import {
  createVoiceConnection,
  type VoiceConnection,
  type VoiceRealtimeEvent,
} from "@/lib/voice/client";
import {
  createNetworkingVoiceSessionUpdate,
  createRecommendationToolOutput,
  createVoiceResponse,
  parseRecommendationToolCall,
} from "@/lib/voice/protocol";
import type { ChatResponse } from "@/lib/types";

export function useNetworkingVoice({
  attendeeName,
  audio,
  onRecommend,
}: {
  attendeeName: string;
  audio: RefObject<HTMLAudioElement | null>;
  onRecommend: (goal: string) => Promise<ChatResponse>;
}) {
  const [state, setState] = useState<
    "idle" | "connecting" | "connected" | "failed"
  >("idle");
  const [error, setError] = useState("");
  const [heard, setHeard] = useState("");
  const [spoken, setSpoken] = useState("");
  const [muted, setMuted] = useState(false);
  const connection = useRef<VoiceConnection | null>(null);
  const version = useRef(0);
  const recommend = useRef(onRecommend);
  useEffect(() => {
    recommend.current = onRecommend;
  }, [onRecommend]);
  useEffect(
    () => () => {
      version.current += 1;
      connection.current?.close();
    },
    [],
  );

  function stop() {
    version.current += 1;
    connection.current?.close();
    connection.current = null;
    setState("idle");
    setMuted(false);
  }

  async function start() {
    if (connection.current) return;
    const current = ++version.current;
    const calls = new Set<string>();
    let toolBusy = false;
    setState("connecting");
    setError("");
    setHeard("");
    setSpoken("");
    let call: VoiceConnection;
    async function receive(event: VoiceRealtimeEvent) {
      if (current !== version.current) return;
      if (event.type === "error") {
        setError(
          "The voice provider rejected an event. End the call and retry, or use text chat.",
        );
        return;
      }
      if (
        event.type === "conversation.item.input_audio_transcription.delta" &&
        typeof event.text === "string"
      )
        setHeard(event.text);
      if (
        event.type ===
          "conversation.item.input_audio_transcription.completed" &&
        typeof event.transcript === "string"
      )
        setHeard(event.transcript);
      if (
        event.type === "response.audio_transcript.delta" &&
        typeof event.delta === "string"
      )
        setSpoken((text) => text + event.delta);
      if (
        event.type === "response.audio_transcript.done" &&
        typeof event.transcript === "string"
      )
        setSpoken(event.transcript);
      if (event.type === "response.created") setSpoken("");
      let tool;
      try {
        tool = parseRecommendationToolCall(event);
      } catch {
        setError(
          "The voice assistant sent an invalid recommendation request. Please retry by text.",
        );
        return;
      }
      if (!tool || calls.has(tool.callId)) return;
      calls.add(tool.callId);
      if (calls.size > 100) {
        setError("Start a new voice session to continue.");
        stop();
        return;
      }
      const respond = (result: unknown) => {
        if (current !== version.current) return;
        call.sendEvent(createRecommendationToolOutput(tool.callId, result));
        call.sendEvent(createVoiceResponse());
      };
      if (toolBusy) {
        respond({
          error:
            "Another recommendation request is still running. Wait for it to finish.",
        });
        return;
      }
      toolBusy = true;
      try {
        const result = await recommend.current(tool.goal);
        respond({
          message: result.message,
          recommendations: result.recommendations,
        });
      } catch {
        respond({
          error:
            "The recommendation engine could not complete the request. No matches are available for this attempt.",
        });
      } finally {
        toolBusy = false;
      }
    }
    try {
      call = createVoiceConnection({
        captureMicrophone: true,
        playRemoteAudio: true,
        audioElement: audio.current ?? undefined,
        onEvent: (event) => {
          void receive(event).catch(() => {
            if (current === version.current)
              setError(
                "Voice response could not be completed. Use text chat or reconnect.",
              );
          });
        },
        onError: (cause) => {
          if (current === version.current) setError(cause.message);
        },
        onStateChange: (next) => {
          if (current !== version.current) return;
          if (next === "failed" || next === "disconnected") {
            connection.current?.close();
            connection.current = null;
            setState("failed");
          }
        },
      });
      connection.current = call;
      await call.ready;
      if (current !== version.current) {
        call.close();
        return;
      }
      call.sendEvent(createNetworkingVoiceSessionUpdate(attendeeName));
      setState("connected");
    } catch (cause) {
      if (current !== version.current) return;
      connection.current?.close();
      connection.current = null;
      setState("failed");
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not start voice. Text chat is still available.",
      );
    }
  }

  function toggleMute() {
    const next = !muted;
    connection.current?.setMicrophoneMuted(next);
    setMuted(next);
  }
  return { state, error, heard, spoken, muted, start, stop, toggleMute };
}
