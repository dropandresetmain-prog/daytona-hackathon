import { NetworkingApp } from "@/components/networking-app";
import { publicProfile } from "@/lib/attendee-profile";
import { demoEvent, mockAttendees } from "@/lib/mock-data";
import { recommendationMode } from "@/lib/recommendations/mode";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <NetworkingApp
      event={demoEvent}
      attendees={mockAttendees.map(publicProfile)}
      matcher={recommendationMode() === "daytona" ? "daytona" : "local"}
    />
  );
}
