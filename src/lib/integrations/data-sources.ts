import { existsSync } from "node:fs";
import path from "node:path";
import type { AttendeeRepository } from "./contracts";
import type { NetworkingContextStore } from "./context-contracts";
import {
  AttendeeCsvError,
  createCsvAttendeeRepository,
} from "./csv-repository";
import { mockAttendeeRepository } from "./mock-repository";

const defaultCsvPath = "data/attendees.csv";
let csvBinding: { key: string; repository: AttendeeRepository } | undefined;
const contextStore: NetworkingContextStore | null = null;

export function getAttendeeDataSource(): "mock" | "csv" {
  const selection = process.env.ATTENDEE_DATA_SOURCE?.trim();
  if (selection && selection !== "mock" && selection !== "csv") {
    throw new AttendeeCsvError("ATTENDEE_DATA_SOURCE must be mock or csv.");
  }
  if (selection === "mock" || selection === "csv") return selection;
  return process.env.ATTENDEES_CSV_PATH?.trim() ||
    existsSync(path.resolve(defaultCsvPath))
    ? "csv"
    : "mock";
}

export function getAttendeeRepository(): AttendeeRepository {
  if (getAttendeeDataSource() === "mock") return mockAttendeeRepository;
  const filePath = path.resolve(
    process.env.ATTENDEES_CSV_PATH?.trim() || defaultCsvPath,
  );
  const eventId = process.env.ATTENDEES_EVENT_ID?.trim() || "demo-event";
  const key = JSON.stringify([filePath, eventId]);
  if (csvBinding?.key !== key) {
    csvBinding = {
      key,
      repository: createCsvAttendeeRepository(filePath, eventId),
    };
  }
  return csvBinding.repository;
}

export function getNetworkingContextStore(): NetworkingContextStore | null {
  return contextStore;
}
