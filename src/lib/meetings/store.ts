import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { MeetingRequest } from "@/lib/meeting-types";

const storeFile = path.resolve(
  process.env.MEETING_REQUESTS_FILE || ".data/meeting-requests.json",
);

const state = globalThis as typeof globalThis & {
  meetingRequestWriteQueue?: Promise<unknown>;
};

async function readRequests(): Promise<MeetingRequest[]> {
  let text: string;
  try {
    text = await readFile(storeFile, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const data: unknown = JSON.parse(text);
  if (
    !Array.isArray(data) ||
    !data.every(
      (item) =>
        item &&
        typeof item === "object" &&
        [
          "id",
          "eventId",
          "fromAttendeeId",
          "toAttendeeId",
          "message",
          "createdAt",
        ].every((key) => typeof item[key] === "string") &&
        item.status === "pending" &&
        item.delivery === "demo",
    )
  ) {
    throw new Error("Meeting request storage is invalid.");
  }
  return data as MeetingRequest[];
}

export async function listMeetingRequests(attendeeId: string, eventId: string) {
  await state.meetingRequestWriteQueue;
  return (await readRequests()).filter(
    (item) => item.fromAttendeeId === attendeeId && item.eventId === eventId,
  );
}

export function saveMeetingRequest(
  input: Pick<
    MeetingRequest,
    "eventId" | "fromAttendeeId" | "toAttendeeId" | "message"
  >,
): Promise<{ request: MeetingRequest; duplicate: boolean }> {
  // Serialize writes within this single-process demo so double-clicks cannot
  // create duplicate requests or lose another user's saved request.
  const operation = (state.meetingRequestWriteQueue ?? Promise.resolve()).then(
    async () => {
      const requests = await readRequests();
      const existing = requests.find(
        (item) =>
          item.eventId === input.eventId &&
          item.fromAttendeeId === input.fromAttendeeId &&
          item.toAttendeeId === input.toAttendeeId,
      );
      if (existing) return { request: existing, duplicate: true };

      const request: MeetingRequest = {
        ...input,
        id: randomUUID(),
        status: "pending",
        createdAt: new Date().toISOString(),
        delivery: "demo",
      };
      await mkdir(path.dirname(storeFile), { recursive: true });
      const temporaryFile = `${storeFile}.${randomUUID()}.tmp`;
      try {
        await writeFile(
          temporaryFile,
          JSON.stringify([...requests, request], null, 2),
          { mode: 0o600 },
        );
        // Atomic replacement keeps interrupted writes from corrupting the inbox.
        await rename(temporaryFile, storeFile);
      } finally {
        await unlink(temporaryFile).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== "ENOENT") throw error;
        });
      }
      return { request, duplicate: false };
    },
  );
  // A failed write must not permanently block all future requests.
  state.meetingRequestWriteQueue = operation.catch(() => undefined);
  return operation;
}
