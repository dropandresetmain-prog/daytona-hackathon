export interface MeetingRequest {
  id: string;
  eventId: string;
  fromAttendeeId: string;
  toAttendeeId: string;
  message: string;
  status: "pending";
  createdAt: string;
  delivery: "demo";
}

export interface CreateMeetingRequest {
  attendeeId: string;
  recipientId: string;
  message: string;
}
