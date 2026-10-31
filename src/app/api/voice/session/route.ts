import { NextResponse } from "next/server";
import { getRealtimeConfig } from "@/lib/integrations/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  const config = getRealtimeConfig();
  return NextResponse.json(
    {
      configured: Boolean(config.apiKey && config.workspace),
      available: false,
      model:
        process.env.QWEN_REALTIME_MODEL?.trim() ||
        "qwen3.8-omni-flash-realtime",
      message:
        "Server WebRTC handshake is prepared. Browser microphone and audio transport are not enabled yet.",
      missing: [
        ...(!config.apiKey ? ["ALIBABA_CLOUD_API_KEY"] : []),
        ...(!process.env.ALIBABA_WORKSPACE_ID?.trim()
          ? ["ALIBABA_WORKSPACE_ID"]
          : []),
      ],
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

// Relay SDP on the server; never hand the long-lived provider key to a browser.
// This prepares the optional voice seam without claiming a working audio UI.
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const requestUrl = new URL(request.url);
  // Next may reconstruct request.url with localhost while the browser uses
  // 127.0.0.1. Host preserves the authority the browser actually requested.
  const requestHost = request.headers.get("host") || requestUrl.host;
  const expectedOrigin = `${requestUrl.protocol}//${requestHost}`;
  if (origin && origin !== expectedOrigin)
    return NextResponse.json(
      { error: "Cross-origin voice sessions are not allowed." },
      { status: 403 },
    );
  const config = getRealtimeConfig();
  if (!config.apiKey || !config.endpoint)
    return NextResponse.json(
      {
        error:
          "Voice requires ALIBABA_CLOUD_API_KEY and ALIBABA_WORKSPACE_ID. Text chat remains available.",
      },
      { status: 503 },
    );
  if (Number(request.headers.get("content-length")) > 64_000)
    return NextResponse.json(
      { error: "Voice offer is too large." },
      { status: 413 },
    );
  let body: { sdp?: unknown };
  try {
    const raw = await request.text();
    if (raw.length > 64_000)
      return NextResponse.json(
        { error: "Voice offer is too large." },
        { status: 413 },
      );
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json(
      { error: "Provide a JSON SDP offer." },
      { status: 400 },
    );
  }
  if (
    !body ||
    typeof body.sdp !== "string" ||
    !body.sdp.startsWith("v=0") ||
    !body.sdp.includes("m=audio")
  )
    return NextResponse.json(
      { error: "Provide an audio WebRTC SDP offer." },
      { status: 400 },
    );
  try {
    const response = await fetch(config.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/sdp",
      },
      body: body.sdp,
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
    if (!response.ok)
      return NextResponse.json(
        {
          error: `Voice handshake failed (HTTP ${response.status}). Check workspace and model access.`,
        },
        { status: 502 },
      );
    const sdp = await response.text();
    if (!sdp.startsWith("v=0") || sdp.length > 64_000)
      return NextResponse.json(
        { error: "Voice provider returned an invalid SDP answer." },
        { status: 502 },
      );
    return NextResponse.json(
      { sdp, type: "answer" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Voice provider connection failed or timed out." },
      { status: 502 },
    );
  }
}
