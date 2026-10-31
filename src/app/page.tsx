import { NetworkingApp } from "@/components/networking-app";
import { demoEvent, mockAttendees } from "@/lib/mock-data";
import { publicProfile } from "@/lib/attendee-profile";

export default function Home() {
  return (
    <NetworkingApp
      event={demoEvent}
      attendees={mockAttendees.map(publicProfile)}
    />
  );
}
