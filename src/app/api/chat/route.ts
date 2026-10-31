import { NextResponse } from "next/server";
import { parseChatRequest } from "@/lib/chat/validation";
import {
  getChatRecommendations,
  SessionRequiredError,
} from "@/lib/chat/service";
import { AttendeeNotFoundError } from "@/lib/recommendations/service";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  if (
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !==
    "application/json"
  ) {
    return NextResponse.json(
      { error: "Content-Type must be application/json." },
      { status: 415 },
    );
  }
  // Reject oversized declared bodies before parsing; field limits also constrain ordinary requests.
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > 64_000) {
    return NextResponse.json(
      { error: "Chat request is too large." },
      { status: 413 },
    );
  }
  let input;
  try {
    const body = await request.text();
    if (body.length > 64_000)
      return NextResponse.json(
        { error: "Chat request is too large." },
        { status: 413 },
      );
    input = parseChatRequest(JSON.parse(body));
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof SyntaxError
            ? "Invalid JSON body."
            : error instanceof Error
              ? error.message
              : "Invalid request.",
      },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json(await getChatRecommendations(input));
  } catch (error) {
    if (error instanceof AttendeeNotFoundError)
      return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof SessionRequiredError)
      return NextResponse.json({ error: error.message }, { status: 400 });
    // Keep provider details and credentials out of browser responses and application logs.
    console.error("Chat recommendation execution failed.");
    return NextResponse.json(
      {
        error:
          "The recommendation engine could not complete this request. Check the configured provider and try again.",
      },
      { status: 502 },
    );
  }
}
