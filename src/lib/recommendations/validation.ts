import type { RecommendationRequest } from "@/lib/types";

export function parseRecommendationRequest(
  value: unknown,
): RecommendationRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected a JSON object.");
  }
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
    typeof input.goal !== "string" ||
    !input.goal.trim() ||
    input.goal.length > 500
  ) {
    throw new Error(
      "goal must be a non-empty string of at most 500 characters.",
    );
  }
  const limit = input.limit === undefined ? 3 : input.limit;
  if (
    typeof limit !== "number" ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 10
  ) {
    throw new Error("limit must be an integer between 1 and 10.");
  }
  return {
    attendeeId: input.attendeeId.trim(),
    goal: input.goal.trim(),
    limit,
  };
}
