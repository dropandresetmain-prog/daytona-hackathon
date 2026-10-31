import { NextResponse } from "next/server";
import { getNetworkingStatus } from "@/lib/integrations/networking-executor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  try {
    return NextResponse.json(getNetworkingStatus(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "Provider configuration is invalid. Check server environment variables.",
      },
      { status: 503 },
    );
  }
}
