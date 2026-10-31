import type { RecommendationResponse } from "@/lib/types";

export type RecommendationMode = RecommendationResponse["mode"];

// `mock` keeps ranking on this machine (used by the smoke tests).
// `daytona` requires DAYTONA_API_KEY. With neither set, a key selects Daytona.
export function recommendationMode(): RecommendationMode {
  const requested = process.env.RECOMMENDATION_MODE?.trim().toLowerCase();
  if (requested === "mock") return "mock";
  if (requested === "daytona") return "daytona";
  return process.env.DAYTONA_API_KEY?.trim() ? "daytona" : "mock";
}
