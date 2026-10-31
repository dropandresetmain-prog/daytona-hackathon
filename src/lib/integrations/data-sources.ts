import type { AttendeeRepository } from "./contracts";
import type { NetworkingContextStore } from "./context-contracts";
import { mockAttendeeRepository } from "./mock-repository";

// Teammate integration point: replace these bindings with the CSV/Neo4j
// attendee adapter and Neo4j context adapter when their branch is ready.
const attendeeRepository: AttendeeRepository = mockAttendeeRepository;
const contextStore: NetworkingContextStore | null = null;

export function getAttendeeRepository(): AttendeeRepository {
  return attendeeRepository;
}

export function getNetworkingContextStore(): NetworkingContextStore | null {
  return contextStore;
}
