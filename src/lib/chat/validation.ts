import type { ChatMessage, ChatRequest } from "@/lib/types";

export function parseChatRequest(value: unknown): ChatRequest {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Expected a JSON object.");
  const input = value as Record<string, unknown>;
  if (
    typeof input.attendeeId !== "string" ||
    !input.attendeeId.trim() ||
    input.attendeeId.length > 100
  ) {
    throw new Error(
      "attendeeId must be a non-empty string of at most 100 characters.",
    );
  }
  if (
    typeof input.message !== "string" ||
    !input.message.trim() ||
    input.message.length > 1000
  ) {
    throw new Error(
      "message must be a non-empty string of at most 1000 characters.",
    );
  }
  if (
    input.sessionId !== undefined &&
    (typeof input.sessionId !== "string" ||
      !input.sessionId.trim() ||
      input.sessionId.length > 100)
  ) {
    throw new Error(
      "sessionId must be a non-empty string of at most 100 characters.",
    );
  }
  return {
    attendeeId: input.attendeeId.trim(),
    message: input.message.trim(),
    ...(typeof input.sessionId === "string"
      ? { sessionId: input.sessionId.trim() }
      : {}),
    history: parseChatHistory(input.history),
  };
}

export function parseChatHistory(value: unknown): ChatMessage[] {
  if (value !== undefined && (!Array.isArray(value) || value.length > 10)) {
    throw new Error("history must contain at most 10 messages.");
  }
  const history = (value ?? []) as unknown[];
  return history.map((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      throw new Error("Invalid history message.");
    const item = raw as Record<string, unknown>;
    if (
      (item.role !== "user" && item.role !== "assistant") ||
      typeof item.content !== "string" ||
      !item.content.trim() ||
      item.content.length > 1000
    ) {
      throw new Error(
        "History messages must have a user or assistant role and 1–1000 characters of content.",
      );
    }
    return { role: item.role, content: item.content.trim() };
  });
}
