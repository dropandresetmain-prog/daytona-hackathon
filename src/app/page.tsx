import { NetworkingApp } from "@/components/networking-app";
import { publicProfile } from "@/lib/attendee-profile";
import {
  getAttendeeRepository,
  getAttendeeDataSource,
} from "@/lib/integrations/data-sources";
import { getNetworkingEvent } from "@/lib/event-config";
import { connection } from "next/server";

export default async function Home() {
  // Read CSV at request time so file errors are not hidden in a static build.
  await connection();
  const dataSource = getAttendeeDataSource();
  const event = getNetworkingEvent(dataSource);
  const attendees = await getAttendeeRepository().listByEvent(event.id);
  return (
    <NetworkingApp
      event={event}
      attendees={attendees.map(publicProfile)}
      dataSource={dataSource}
    />
  );
}
