import { NetworkingApp } from "@/components/networking-app";
import { demoEvent } from "@/lib/mock-data";
import { publicProfile } from "@/lib/attendee-profile";
import { getAttendeeRepository } from "@/lib/integrations/data-sources";
import { connection } from "next/server";

export default async function Home() {
  // Keep future graph-backed profile reads at request time, outside the build.
  await connection();
  const attendees = await getAttendeeRepository().listByEvent(demoEvent.id);
  return (
    <NetworkingApp event={demoEvent} attendees={attendees.map(publicProfile)} />
  );
}
