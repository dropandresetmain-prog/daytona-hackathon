import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { mockRecommendationRanker } from "@/lib/recommendations/mock-ranker";
import type { Recommendation } from "@/lib/types";
import { networkingSkillPath, runNetworkingInDaytona } from "./daytona";
import {
  callQwen,
  createNetworkingPayload,
  getLlmConfig,
  parseNetworkingResponse,
  type NetworkingContext,
} from "./llm";

export function getNetworkingStatus() {
  const llm = getLlmConfig();
  const mode = process.env.NETWORKING_MODE || (llm.apiKey ? "qwen" : "mock");
  const execution =
    process.env.NETWORKING_EXECUTION ||
    (process.env.DAYTONA_API_KEY?.trim() ? "daytona" : "local");
  if (!["mock", "qwen"].includes(mode))
    throw new Error("NETWORKING_MODE must be mock or qwen.");
  if (!["local", "daytona"].includes(execution))
    throw new Error("NETWORKING_EXECUTION must be local or daytona.");
  return {
    llm: { configured: Boolean(llm.apiKey), model: llm.model },
    daytona: { configured: Boolean(process.env.DAYTONA_API_KEY?.trim()) },
    voice: {
      configured: Boolean(
        llm.apiKey && process.env.ALIBABA_WORKSPACE_ID?.trim(),
      ),
      model:
        process.env.QWEN_REALTIME_MODEL?.trim() ||
        "qwen3.8-omni-flash-realtime",
      available: Boolean(
        llm.apiKey && process.env.ALIBABA_WORKSPACE_ID?.trim(),
      ),
    },
    mode: mode as "mock" | "qwen",
    execution: execution as "local" | "daytona",
  };
}

export async function executeNetworking(context: NetworkingContext): Promise<{
  recommendations: Omit<Recommendation, "rank">[];
  message: string;
  execution: {
    provider: "local" | "daytona";
    model?: string;
    sandboxId?: string;
  };
  mode: "mock" | "qwen";
}> {
  const status = getNetworkingStatus();
  if (status.mode === "mock") {
    if (status.execution === "daytona")
      throw new Error(
        "Mock mode requires NETWORKING_EXECUTION=local. Set NETWORKING_MODE=qwen for Daytona.",
      );
    const ranked = await mockRecommendationRanker.rank(context);
    ranked.sort(
      (a, b) => b.score - a.score || a.attendee.id.localeCompare(b.attendee.id),
    );
    return {
      recommendations: ranked.slice(0, context.limit),
      message: `I checked ${context.candidates.length} attendee profiles. Here are ${Math.min(context.limit, ranked.length)} introductions based on your goal and profile. This preview uses keyword matching.`,
      execution: { provider: "local" },
      mode: "mock",
    };
  }
  let skill = "";
  try {
    const content = await readFile(
      join(process.cwd(), networkingSkillPath),
      "utf8",
    );
    // Load the teammate's completed guidance each request, excluding their placeholder.
    if (!content.startsWith("# Networking skill placeholder"))
      skill = content.slice(0, 24_000);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT")
      throw new Error("Could not load the networking skill file.");
  }
  const payload = createNetworkingPayload(context, skill);
  const result =
    status.execution === "daytona"
      ? await runNetworkingInDaytona(payload)
      : { raw: await callQwen(payload), sandboxId: undefined };
  return {
    ...parseNetworkingResponse(result.raw, context),
    mode: "qwen",
    execution: {
      provider: status.execution,
      model: status.llm.model,
      ...(result.sandboxId ? { sandboxId: result.sandboxId } : {}),
    },
  };
}
