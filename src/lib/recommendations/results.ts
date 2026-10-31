import { publicProfile } from "@/lib/attendee-profile";
import type { Attendee, Recommendation } from "@/lib/types";

export class InvalidRecommendationError extends Error {}

function boundedText(value: unknown, maximum: number): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maximum
  );
}

function textList(
  value: unknown,
  maximum: number,
  itemLength: number,
  allowEmpty = false,
): value is string[] {
  return (
    Array.isArray(value) &&
    (allowEmpty || value.length > 0) &&
    value.length <= maximum &&
    value.every((item) => boundedText(item, itemLength))
  );
}

// A provider may explain a match, but only the repository identifies attendees.
export function normalizeRecommendations(
  results: unknown,
  candidates: Attendee[],
  limit: number,
): Recommendation[] {
  if (!Array.isArray(results) || results.length > 100) {
    throw new InvalidRecommendationError(
      "The recommendation provider returned invalid results.",
    );
  }
  const canonical = new Map(
    candidates.map((candidate) => [candidate.id, candidate]),
  );
  const unique = new Map<string, Omit<Recommendation, "rank">>();
  for (const raw of results) {
    if (!raw || typeof raw !== "object")
      throw new InvalidRecommendationError(
        "The recommendation provider returned an invalid match.",
      );
    const item = raw as Record<string, unknown>;
    const profile = item.attendee as Record<string, unknown> | undefined;
    const candidate =
      profile && typeof profile.id === "string"
        ? canonical.get(profile.id)
        : undefined;
    if (
      !candidate ||
      typeof item.score !== "number" ||
      !Number.isFinite(item.score) ||
      item.score < 0 ||
      item.score > 100 ||
      !textList(item.reasons, 20, 500) ||
      !textList(item.matchedOn, 30, 200, true) ||
      !boundedText(item.mutualValue, 1500) ||
      !boundedText(item.conversationStarter, 1500)
    ) {
      throw new InvalidRecommendationError(
        "The recommendation provider returned an unsupported attendee or malformed match.",
      );
    }
    if (!unique.has(candidate.id)) {
      unique.set(candidate.id, {
        attendee: publicProfile(candidate),
        score: item.score,
        reasons: item.reasons.slice(0, 5),
        matchedOn: item.matchedOn.slice(0, 10),
        mutualValue: item.mutualValue,
        conversationStarter: item.conversationStarter,
      });
    }
  }
  return [...unique.values()]
    .sort(
      (a, b) => b.score - a.score || a.attendee.id.localeCompare(b.attendee.id),
    )
    .slice(0, limit)
    .map((item, index) => ({ ...item, rank: index + 1 }));
}
