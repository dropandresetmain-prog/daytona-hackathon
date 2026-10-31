import { NextResponse } from "next/server";
import {
  AttendeeNotFoundError,
  getRecommendations,
} from "@/lib/recommendations/service";
import { parseRecommendationRequest } from "@/lib/recommendations/validation";

export const runtime = "nodejs";

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

  let input;
  try {
    input = parseRecommendationRequest(await request.json());
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
    return NextResponse.json(await getRecommendations(input));
  } catch (error) {
    if (error instanceof AttendeeNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error("Recommendation request failed:", error);
    return NextResponse.json(
      { error: "Recommendations are unavailable. Please try again." },
      { status: 500 },
    );
  }
}
