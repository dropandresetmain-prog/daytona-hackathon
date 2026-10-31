import type {
  RecommendationRequest,
  RecommendationResponse,
} from "@/lib/types";
import type {
  AttendeeRepository,
  RecommendationRanker,
} from "@/lib/integrations/contracts";
import { mockAttendeeRepository } from "@/lib/integrations/mock-repository";
import { mockRecommendationRanker } from "./mock-ranker";

export class AttendeeNotFoundError extends Error {}

// Swap dependencies here when teammate integrations are ready; the route stays stable.
export async function getRecommendations(
  request: RecommendationRequest,
  repository: AttendeeRepository = mockAttendeeRepository,
  ranker: RecommendationRanker = mockRecommendationRanker,
): Promise<RecommendationResponse> {
  const attendee = await repository.getById(request.attendeeId);
  if (!attendee) throw new AttendeeNotFoundError("Attendee not found.");

  const candidates = (await repository.listByEvent(attendee.eventId)).filter(
    (candidate) =>
      candidate.id !== attendee.id && candidate.eventId === attendee.eventId,
  );
  const ranked = await ranker.rank({
    attendee,
    candidates,
    goal: request.goal,
  });
  ranked.sort(
    (a, b) => b.score - a.score || a.attendee.id.localeCompare(b.attendee.id),
  );

  return {
    attendeeId: attendee.id,
    eventId: attendee.eventId,
    goal: request.goal,
    mode: "mock",
    recommendations: ranked
      .slice(0, request.limit)
      .map((result, index) => ({ ...result, rank: index + 1 })),
  };
}
