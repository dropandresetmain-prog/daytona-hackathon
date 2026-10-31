import { publicProfile } from "@/lib/attendee-profile";
import type { RecommendationRanker } from "@/lib/integrations/contracts";
import { hydrateRanked } from "./hydrate";
import { rankProfiles } from "./rank.mjs";

export const mockRecommendationRanker: RecommendationRanker = {
  async rank(context) {
    return hydrateRanked(
      context.candidates,
      rankProfiles({
        attendee: publicProfile(context.attendee),
        candidates: context.candidates.map(publicProfile),
        goal: context.goal,
      }),
    );
  },
};
