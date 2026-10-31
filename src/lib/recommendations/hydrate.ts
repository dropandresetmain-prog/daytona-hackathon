import { publicProfile } from "@/lib/attendee-profile";
import type { Attendee, Recommendation } from "@/lib/types";

export interface RankedMatch {
  id: string;
  score: number;
  reasons: string[];
  matchedOn: string[];
  mutualValue: string;
  conversationStarter: string;
}

function stringList(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    return null;
  }
  return value;
}

// Reattach profiles from the local repository so the sandbox cannot rewrite them.
export function hydrateRanked(
  candidates: Attendee[],
  ranked: RankedMatch[],
): Omit<Recommendation, "rank">[] {
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  if (ranked.length !== candidates.length) {
    throw new Error("Ranker returned an unexpected number of matches.");
  }

  const seen = new Set<string>();
  return ranked.map((item) => {
    const reasons = stringList(item?.reasons);
    const matchedOn = stringList(item?.matchedOn);
    const candidate = typeof item?.id === "string" ? byId.get(item.id) : undefined;
    if (
      !candidate ||
      seen.has(candidate.id) ||
      typeof item.score !== "number" ||
      !Number.isFinite(item.score) ||
      item.score < 0 ||
      item.score > 100 ||
      !reasons?.length ||
      !matchedOn ||
      typeof item.mutualValue !== "string" ||
      !item.mutualValue ||
      typeof item.conversationStarter !== "string" ||
      !item.conversationStarter
    ) {
      throw new Error("Ranker returned a match the server could not accept.");
    }
    seen.add(candidate.id);
    return {
      attendee: publicProfile(candidate),
      score: item.score,
      reasons,
      matchedOn,
      mutualValue: item.mutualValue,
      conversationStarter: item.conversationStarter,
    };
  });
}
