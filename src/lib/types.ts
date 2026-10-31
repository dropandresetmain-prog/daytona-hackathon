export interface Attendee {
  id: string;
  eventId: string;
  name: string;
  email?: string;
  phone?: string;
  company: string;
  position: string;
  industry: string;
  lookingFor: string[];
  canOffer: string[];
  skills: string[];
  bio: string;
  interests?: string[];
  linkedinUrl?: string;
}

// Recommendations do not need private contact details.
export type AttendeeProfile = Omit<Attendee, "email" | "phone">;

export interface RecommendationRequest {
  attendeeId: string;
  goal: string;
  limit: number;
}

export interface Recommendation {
  rank: number;
  attendee: AttendeeProfile;
  /** A deterministic relevance score from 0–100, not a probability. */
  score: number;
  reasons: string[];
  matchedOn: string[];
  mutualValue: string;
  conversationStarter: string;
}

export interface RecommendationResponse {
  attendeeId: string;
  eventId: string;
  goal: string;
  mode: "mock" | "daytona";
  recommendations: Recommendation[];
}
