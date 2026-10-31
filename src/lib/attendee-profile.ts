import type { Attendee, AttendeeProfile } from "@/lib/types";

export function publicProfile(attendee: Attendee): AttendeeProfile {
  // Allowlist fields before serialization to keep private contacts out of the browser.
  return {
    id: attendee.id,
    eventId: attendee.eventId,
    name: attendee.name,
    company: attendee.company,
    position: attendee.position,
    industry: attendee.industry,
    lookingFor: attendee.lookingFor,
    canOffer: attendee.canOffer,
    skills: attendee.skills,
    bio: attendee.bio,
    interests: attendee.interests,
    linkedinUrl: attendee.linkedinUrl,
  };
}
