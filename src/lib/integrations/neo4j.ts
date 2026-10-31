import type { AttendeeRepository } from "./contracts";

// Handoff only: the database teammate owns the driver, queries, and graph mapping.
// Do not wire this into the app until both methods satisfy AttendeeRepository.
export const neo4jAttendeeRepository: AttendeeRepository = {
  async getById() {
    throw new Error(
      "Neo4j integration is not implemented. Use mockAttendeeRepository.",
    );
  },
  async listByEvent() {
    throw new Error(
      "Neo4j integration is not implemented. Use mockAttendeeRepository.",
    );
  },
};
