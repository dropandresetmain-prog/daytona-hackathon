import type { RecommendationRanker } from "./contracts";

// Provider-neutral boundary. No SDK, API calls, or automatic paid fallback.
export const llmRecommendationRanker: RecommendationRanker = {
  async rank() {
    throw new Error(
      "LLM integration is not implemented. Use mockRecommendationRanker.",
    );
  },
};
