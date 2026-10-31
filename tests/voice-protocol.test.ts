import assert from "node:assert/strict";
import test from "node:test";
import {
  createNetworkingVoiceSessionUpdate,
  createRecommendationToolOutput,
  createVoiceResponse,
  parseRecommendationToolCall,
} from "../src/lib/voice/protocol";

const completeCall = {
  type: "response.function_call_arguments.done",
  name: "recommend_connections",
  call_id: "opaque-provider-call-id",
  arguments: JSON.stringify({ goal: "  Find AI collaborators  " }),
};

test("Qwen voice session exposes only the nested, read-only recommendation tool", () => {
  const event = createNetworkingVoiceSessionUpdate("Alex");
  assert.equal(event.type, "session.update");
  const session = event.session as Record<string, unknown>;
  assert.deepEqual(session.modalities, ["text", "audio"]);
  assert.equal(session.enable_search, false);
  assert.deepEqual(session.input_audio_transcription, {
    model: "qwen3-asr-flash-realtime",
  });
  const tools = session.tools as { type: string; function: { name: string } }[];
  assert.equal(tools.length, 1);
  assert.equal(tools[0].type, "function");
  assert.equal(tools[0].function.name, "recommend_connections");
  assert.match(String(session.instructions), /MUST call recommend_connections/);
  assert.match(
    String(session.instructions),
    /cannot send, schedule, confirm, or accept meeting requests/,
  );
});

test("only completed function arguments trigger execution, preserving opaque call IDs", () => {
  assert.equal(
    parseRecommendationToolCall({
      ...completeCall,
      type: "response.function_call_arguments.delta",
    }),
    null,
  );
  assert.equal(
    parseRecommendationToolCall({
      type: "response.output_item.done",
      item: completeCall,
    }),
    null,
  );
  assert.deepEqual(parseRecommendationToolCall(completeCall), {
    callId: completeCall.call_id,
    goal: "Find AI collaborators",
  });
});

test("voice calls reject unknown tools, invalid arguments, and attempts to change identity", () => {
  assert.throws(
    () =>
      parseRecommendationToolCall({
        ...completeCall,
        name: "send_meeting_request",
      }),
    /unsupported tool/,
  );
  assert.throws(
    () => parseRecommendationToolCall({ ...completeCall, call_id: "" }),
    /call ID/,
  );
  assert.throws(
    () => parseRecommendationToolCall({ ...completeCall, arguments: "{" }),
    /invalid JSON/,
  );
  for (const args of [
    null,
    [],
    {},
    { goal: "" },
    { goal: "a".repeat(1001) },
    { goal: "AI", attendeeId: "another-attendee" },
  ]) {
    assert.throws(() =>
      parseRecommendationToolCall({
        ...completeCall,
        arguments: JSON.stringify(args),
      }),
    );
  }
});

test("tool result continuation uses Qwen's function_call_output followed by response.create", () => {
  const result = {
    recommendations: [{ attendee: { id: "canonical-id", name: "Priya" } }],
  };
  const event = createRecommendationToolOutput(completeCall.call_id, result);
  assert.deepEqual(event, {
    type: "conversation.item.create",
    item: {
      type: "function_call_output",
      call_id: completeCall.call_id,
      output: JSON.stringify(result),
    },
  });
  assert.deepEqual(createVoiceResponse(), { type: "response.create" });
  assert.throws(() => createRecommendationToolOutput("", result), /call ID/);
  assert.throws(
    () => createRecommendationToolOutput(completeCall.call_id, undefined),
    /empty/,
  );
  assert.throws(
    () =>
      createRecommendationToolOutput(completeCall.call_id, "a".repeat(80_000)),
    /too large/,
  );
});
