import type { CreateMeetingRequest } from "@/lib/meeting-types";
import type { AttendeeRepository } from "@/lib/integrations/contracts";
import { getAttendeeRepository } from "@/lib/integrations/data-sources";
import { listMeetingRequests, saveMeetingRequest } from "./store";

export class MeetingRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export function parseAttendeeId(value: unknown, label = "attendeeId"): string {
  if (typeof value !== "string" || !value.trim() || value.length > 100) {
    throw new MeetingRequestError(
      `${label} must be a non-empty string of at most 100 characters.`,
      400,
    );
  }
  return value.trim();
}

export function parseMeetingRequest(value: unknown): CreateMeetingRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new MeetingRequestError("Expected a JSON object.", 400);
  }
  const input = value as Record<string, unknown>;
  const attendeeId = parseAttendeeId(input.attendeeId);
  const recipientId = parseAttendeeId(input.recipientId, "recipientId");
  if (attendeeId === recipientId) {
    throw new MeetingRequestError("Choose another attendee to meet.", 400);
  }
  if (
    typeof input.message !== "string" ||
    !input.message.trim() ||
    input.message.length > 1000
  ) {
    throw new MeetingRequestError(
      "message must be a non-empty string of at most 1000 characters.",
      400,
    );
  }
  return { attendeeId, recipientId, message: input.message.trim() };
}

export async function createMeetingRequest(
  input: CreateMeetingRequest,
  repository: AttendeeRepository = getAttendeeRepository(),
) {
  const [from, to] = await Promise.all([
    repository.getById(input.attendeeId),
    repository.getById(input.recipientId),
  ]);
  if (!from || !to) throw new MeetingRequestError("Attendee not found.", 404);
  if (from.id === to.id)
    throw new MeetingRequestError("Choose another attendee to meet.", 400);
  if (from.eventId !== to.eventId) {
    throw new MeetingRequestError(
      "Meeting requests must stay within the same event.",
      409,
    );
  }
  return saveMeetingRequest({
    eventId: from.eventId,
    fromAttendeeId: from.id,
    toAttendeeId: to.id,
    message: input.message,
  });
}

export async function getSentMeetingRequests(
  attendeeId: string,
  repository: AttendeeRepository = getAttendeeRepository(),
) {
  const attendee = await repository.getById(attendeeId);
  if (!attendee) throw new MeetingRequestError("Attendee not found.", 404);
  return listMeetingRequests(attendee.id, attendee.eventId);
}
