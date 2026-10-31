import { loadEnvConfig } from "@next/env";
import {
  executeNetworking,
  getNetworkingStatus,
} from "../src/lib/integrations/networking-executor";
import { mockAttendees } from "../src/lib/mock-data";

// Deliberately opt-in: this script makes one paid inference and creates one
// temporary sandbox when Daytona is configured. Never part of automated tests.
loadEnvConfig(process.cwd());

async function main() {
  const status = getNetworkingStatus();
  console.log(JSON.stringify({ status }));
  if (status.mode !== "qwen")
    throw new Error("Configure Qwen before running the live provider check.");
  const attendee = mockAttendees[0];
  const result = await executeNetworking({
    attendee,
    candidates: mockAttendees.filter(
      (candidate) =>
        candidate.id !== attendee.id && candidate.eventId === attendee.eventId,
    ),
    goal: "Who should I meet to find technical collaborators for AI products?",
    limit: 5,
  });
  console.log(
    JSON.stringify({
      ok: true,
      mode: result.mode,
      execution: result.execution,
      count: result.recommendations.length,
      attendeeIds: result.recommendations.map((item) => item.attendee.id),
    }),
  );
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Provider check failed.",
  );
  process.exitCode = 1;
});
