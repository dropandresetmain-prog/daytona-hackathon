import { NextResponse } from "next/server";
import {
  createMeetingRequest,
  getSentMeetingRequests,
  MeetingRequestError,
  parseAttendeeId,
  parseMeetingRequest,
  resetDemoMeetingInbox,
} from "@/lib/meetings/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

function failure(error: unknown) {
  if (error instanceof MeetingRequestError)
    return json({ error: error.message }, error.status);
  console.error(
    "Meeting request storage failed.",
    error instanceof Error ? error.name : "Unknown error",
  );
  return json(
    {
      error: "Meeting requests could not be saved or loaded. Please try again.",
    },
    503,
  );
}

export async function GET(request: Request) {
  try {
    const attendeeId = parseAttendeeId(
      new URL(request.url).searchParams.get("attendeeId"),
    );
    return json({
      requests: await getSentMeetingRequests(attendeeId),
      mode: "demo",
    });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  if (
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !==
    "application/json"
  ) {
    return json({ error: "Content-Type must be application/json." }, 415);
  }
  let input;
  try {
    const body = await request.text();
    if (Buffer.byteLength(body, "utf8") > 16_384) {
      return json({ error: "Meeting request body is too large." }, 413);
    }
    input = parseMeetingRequest(JSON.parse(body));
  } catch (error) {
    if (error instanceof SyntaxError)
      return json({ error: "Invalid JSON body." }, 400);
    return failure(error);
  }
  try {
    const result = await createMeetingRequest(input);
    return json(result, result.duplicate ? 200 : 201);
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE() {
  try {
    await resetDemoMeetingInbox();
    return json({ ok: true, mode: "demo" });
  } catch (error) {
    return failure(error);
  }
}
