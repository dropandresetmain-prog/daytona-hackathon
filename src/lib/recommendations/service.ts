import type {
  RecommendationRequest,
  RecommendationResponse,
} from "@/lib/types";
import type {
  AttendeeRepository,
  RecommendationRanker,
} from "@/lib/integrations/contracts";
import { getAttendeeRepository } from "@/lib/integrations/data-sources";
import { mockRecommendationRanker } from "./mock-ranker";
import { normalizeRecommendations } from "./results";

export class AttendeeNotFoundError extends Error {}

// Swap dependencies here when teammate integrations are ready; the route stays stable.
export async function getRecommendations(
  request: RecommendationRequest,
  repository: AttendeeRepository = getAttendeeRepository(),
  ranker: RecommendationRanker = mockRecommendationRanker,
): Promise<RecommendationResponse> {
  const attendee = await repository.getById(request.attendeeId);
  if (!attendee) throw new AttendeeNotFoundError("Attendee not found.");

  const candidates = [
    ...new Map(
      (await repository.listByEvent(attendee.eventId))
        .filter(
          (candidate) =>
            candidate.id !== attendee.id &&
            candidate.eventId === attendee.eventId,
        )
        .map((candidate) => [candidate.id, candidate]),
    ).values(),
  ];
  const ranked = await ranker.rank({
    attendee,
    candidates,
    goal: request.goal,
  });

  return {
    attendeeId: attendee.id,
    eventId: attendee.eventId,
    goal: request.goal,
    mode: "mock",
    recommendations: normalizeRecommendations(
      ranked,
      candidates,
      request.limit,
    ),
  };
}
