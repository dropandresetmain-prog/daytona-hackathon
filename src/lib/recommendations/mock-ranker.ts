import { publicProfile } from "@/lib/attendee-profile";
import type { RecommendationRanker } from "@/lib/integrations/contracts";

const normalize = (value: string) => value.toLocaleLowerCase().trim();
const intersect = (wanted: string[], offered: string[]) => {
  const available = new Set(offered.map(normalize));
  return [...new Set(wanted)].filter((value) =>
    available.has(normalize(value)),
  );
};

export const mockRecommendationRanker: RecommendationRanker = {
  async rank({ attendee, candidates, goal }) {
    // Literal keyword matching only; this is not semantic understanding or an LLM.
    const goalWords = new Set(normalize(goal).match(/[\p{L}\p{N}]+/gu) ?? []);
    return candidates.map((candidate) => {
      const offers = [...candidate.canOffer, ...candidate.skills];
      const needs = intersect(attendee.lookingFor, offers);
      const reciprocal = intersect(candidate.lookingFor, [
        ...attendee.canOffer,
        ...attendee.skills,
      ]);
      const interests = intersect(
        attendee.interests ?? [],
        candidate.interests ?? [],
      );
      const goalMatches = [...new Set([...offers, candidate.industry])].filter(
        (value) =>
          normalize(value)
            .split(/[^\p{L}\p{N}]+/u)
            .some((word) => goalWords.has(word)),
      );
      const sameIndustry =
        normalize(attendee.industry) === normalize(candidate.industry);
      const reasons = [
        ...needs.map(
          (need) => `Offers ${need.toLowerCase()}, which you are looking for.`,
        ),
        ...goalMatches.map(
          (match) => `${match} overlaps with a keyword in your goal.`,
        ),
        ...reciprocal.map(
          (need) =>
            `You can offer ${need.toLowerCase()}, which they are looking for.`,
        ),
        ...(interests.length
          ? [`Shared interests: ${interests.join(", ")}.`]
          : []),
        ...(sameIndustry ? [`You both work in ${attendee.industry}.`] : []),
      ];

      return {
        attendee: publicProfile(candidate),
        // Explicit goal keywords carry more weight than background similarities.
        score:
          Math.min(60, goalMatches.length * 30) +
          Math.min(20, needs.length * 10) +
          Math.min(10, reciprocal.length * 5) +
          Math.min(6, interests.length * 3) +
          (sameIndustry ? 4 : 0),
        reasons: reasons.length
          ? reasons
          : [
              "No direct profile overlap found; this is an exploratory introduction.",
            ],
        matchedOn: [
          ...new Set([...needs, ...goalMatches, ...reciprocal, ...interests]),
        ],
        mutualValue: reciprocal.length
          ? `You bring ${reciprocal.join(", ")}; ${candidate.name.split(" ")[0]} brings ${offers.slice(0, 2).join(", ")}.`
          : `Explore whether your work at ${attendee.company} connects with their work at ${candidate.company}; mutual value is not established yet.`,
        conversationStarter: `Hi ${candidate.name.split(" ")[0]}, I noticed your work in ${candidate.industry.toLowerCase()}. I'd love to hear about ${needs[0]?.toLowerCase() ?? candidate.canOffer[0]?.toLowerCase() ?? "what you're working on"}.`,
      };
    });
  },
};
