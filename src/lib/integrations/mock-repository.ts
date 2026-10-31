import { mockAttendees } from "@/lib/mock-data";
import type { AttendeeRepository } from "./contracts";

export const mockAttendeeRepository: AttendeeRepository = {
  async getById(id) {
    return mockAttendees.find((attendee) => attendee.id === id) ?? null;
  },
  async listByEvent(eventId) {
    return mockAttendees.filter((attendee) => attendee.eventId === eventId);
  },
};
