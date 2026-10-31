import { demoEvent } from "@/lib/mock-data";

export function getNetworkingEvent(source: "mock" | "csv") {
  if (source === "mock") return demoEvent;
  return {
    id: process.env.ATTENDEES_EVENT_ID?.trim() || "demo-event",
    name: process.env.ATTENDEES_EVENT_NAME?.trim() || "SWITCH 2026 demo",
    description:
      "Recommendations use the supplied attendee CSV. Missing profile details remain empty.",
  };
}
