import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  Daytona,
  DaytonaConflictError,
  DaytonaNotFoundError,
  SandboxState,
  type Sandbox,
} from "@daytona/sdk";
import { publicProfile } from "@/lib/attendee-profile";
import type { RecommendationRanker } from "@/lib/integrations/contracts";
import { hydrateRanked, type RankedMatch } from "@/lib/recommendations/hydrate";

const SANDBOX_NAME = "common-ground-ranker";
const LABELS = { app: "common-ground", role: "recommendation-ranker" };

let sandboxPromise: Promise<Sandbox> | null = null;

function daytonaClient() {
  const apiKey = process.env.DAYTONA_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "DAYTONA_API_KEY is not set. Add it to .env to rank inside a sandbox.",
    );
  }
  return new Daytona({ apiKey });
}

async function connectSandbox(): Promise<Sandbox> {
  const daytona = daytonaClient();
  try {
    return await daytona.get(SANDBOX_NAME);
  } catch (error) {
    if (!(error instanceof DaytonaNotFoundError)) throw error;
  }

  try {
    return await daytona.create(
      {
        name: SANDBOX_NAME,
        language: "typescript",
        labels: LABELS,
        autoStopInterval: 30,
        networkBlockAll: true,
      },
      { timeout: 120 },
    );
  } catch (error) {
    if (error instanceof DaytonaConflictError) return daytona.get(SANDBOX_NAME);
    throw error;
  }
}

async function ensureStarted(sandbox: Sandbox) {
  await sandbox.refreshData();
  if (sandbox.state === SandboxState.STARTED) return;

  const waitForStart = new Set<SandboxState>([
    SandboxState.CREATING,
    SandboxState.STARTING,
    SandboxState.RESTORING,
    SandboxState.RESUMING,
    SandboxState.PULLING_SNAPSHOT,
  ]);
  if (sandbox.state && waitForStart.has(sandbox.state)) {
    await sandbox.waitUntilStarted(120);
    return;
  }

  if (sandbox.state === SandboxState.ERROR) {
    await sandbox.recover(120);
    return;
  }

  await sandbox.start(120);
}

async function getSandbox(): Promise<Sandbox> {
  if (!sandboxPromise) {
    sandboxPromise = connectSandbox().catch((error) => {
      sandboxPromise = null;
      throw error;
    });
  }
  const sandbox = await sandboxPromise;
  try {
    await ensureStarted(sandbox);
    return sandbox;
  } catch (error) {
    sandboxPromise = null;
    throw error;
  }
}

function isRankedMatch(value: unknown): value is RankedMatch {
  if (!value || typeof value !== "object") return false;
  const match = value as RankedMatch;
  return typeof match.id === "string" && typeof match.score === "number";
}

async function executeRanker(
  sandbox: Sandbox,
  input: unknown,
): Promise<RankedMatch[]> {
  const id = randomUUID();
  const scriptPath = `tmp/recommend-${id}.mjs`;
  const inputPath = `tmp/input-${id}.json`;
  const script = await readFile(
    path.join(process.cwd(), "src/lib/recommendations/rank.mjs"),
  );

  await sandbox.process.executeCommand("mkdir -p tmp", undefined, undefined, 20);
  try {
    await sandbox.fs.uploadFile(script, scriptPath);
    await sandbox.fs.uploadFile(Buffer.from(JSON.stringify(input)), inputPath);
    const response = await sandbox.process.executeCommand(
      `RANKER_CLI=1 node ${scriptPath} ${inputPath}`,
      undefined,
      undefined,
      30,
    );
    if (response.exitCode !== 0) {
      throw new Error(
        `Sandbox ranker exited ${response.exitCode}: ${response.result}`.slice(0, 500),
      );
    }
    const parsed: unknown = JSON.parse(response.artifacts?.stdout || response.result);
    if (!Array.isArray(parsed) || !parsed.every(isRankedMatch)) {
      throw new Error("Sandbox ranker returned an unexpected payload.");
    }
    return parsed;
  } finally {
    await sandbox.process
      .executeCommand(`rm -f ${scriptPath} ${inputPath}`, undefined, undefined, 20)
      .catch(() => undefined);
  }
}

export const daytonaRecommendationRanker: RecommendationRanker = {
  async rank(context) {
    const input = {
      attendee: publicProfile(context.attendee),
      candidates: context.candidates.map(publicProfile),
      goal: context.goal,
    };
    try {
      return hydrateRanked(context.candidates, await executeRanker(await getSandbox(), input));
    } catch {
      // The cached sandbox may have stopped or been replaced. Reconnect once.
      sandboxPromise = null;
      return hydrateRanked(context.candidates, await executeRanker(await getSandbox(), input));
    }
  },
};
