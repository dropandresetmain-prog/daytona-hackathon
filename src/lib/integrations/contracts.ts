import type { Attendee, Recommendation } from "@/lib/types";

export interface AttendeeRepository {
  getById(id: string): Promise<Attendee | null>;
  listByEvent(eventId: string): Promise<Attendee[]>;
}

export interface RankingContext {
  attendee: Attendee;
  candidates: Attendee[];
  goal: string;
}

export interface RecommendationRanker {
  rank(context: RankingContext): Promise<Omit<Recommendation, "rank">[]>;
}
