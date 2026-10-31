import { Daytona } from "@daytona/sdk";
import { getLlmConfig, type NetworkingPayload } from "./llm";

export const networkingSkillPath = "skills/networking/SKILL.md";

// Fixed code; inputs and credentials travel as environment values, never shell
// interpolation. The model cannot execute generated code or shell tools.
const runner = `
import json, os, urllib.request, urllib.error
payload = os.environ["NETWORKING_PAYLOAD_JSON"].encode("utf-8")
request = urllib.request.Request(os.environ["NETWORKING_LLM_ENDPOINT"], data=payload,
    headers={"Authorization": "Bearer " + os.environ["NETWORKING_LLM_KEY"], "Content-Type": "application/json"})
try:
    with urllib.request.urlopen(request, timeout=35) as response:
        data = json.loads(response.read(200000).decode("utf-8"))
    print(json.dumps({"ok": True, "data": data}))
except urllib.error.HTTPError as error:
    print(json.dumps({"ok": False, "status": error.code}))
except Exception:
    print(json.dumps({"ok": False, "status": "network_or_timeout"}))
`;

export async function runNetworkingInDaytona(
  payload: NetworkingPayload,
): Promise<{ raw: unknown; sandboxId: string }> {
  const apiKey = process.env.DAYTONA_API_KEY?.trim();
  if (!apiKey)
    throw new Error(
      "Set DAYTONA_API_KEY to execute recommendations in Daytona.",
    );
  const config = getLlmConfig();
  if (!config.apiKey)
    throw new Error("Daytona execution requires ALIBABA_CLOUD_API_KEY.");
  const daytona = new Daytona({
    apiKey,
    target: process.env.DAYTONA_TARGET || undefined,
    requestTimeoutMs: 45_000,
  });
  let sandbox: Awaited<ReturnType<typeof daytona.create>> | undefined;
  try {
    sandbox = await daytona.create(
      {
        language: "python",
        ephemeral: true,
        autoStopInterval: 1,
        autoDeleteInterval: 0,
        ttlMinutes: 3,
        labels: { app: "conference-networking-demo" },
      },
      { timeout: 45 },
    );
    const output = await sandbox.process.codeRun(
      runner,
      {
        env: {
          NETWORKING_PAYLOAD_JSON: JSON.stringify(payload),
          NETWORKING_LLM_KEY: config.apiKey,
          NETWORKING_LLM_ENDPOINT: config.endpoint,
        },
      },
      45,
    );
    if (output.exitCode !== 0)
      throw new Error("Daytona recommendation runner failed.");
    let result: { ok?: boolean; status?: unknown; data?: unknown };
    try {
      result = JSON.parse(output.result.trim());
    } catch {
      throw new Error("Daytona returned an unreadable execution result.");
    }
    if (!result.ok) {
      const status =
        typeof result.status === "number"
          ? `HTTP ${result.status}`
          : "network or timeout";
      throw new Error(
        `Qwen request inside Daytona failed (${status}). Check regional key, model access, and quota.`,
      );
    }
    return { raw: result.data, sandboxId: sandbox.id };
  } catch (error) {
    // SDK exceptions can contain headers. Only our own safe errors escape.
    if (
      error instanceof Error &&
      /^(Qwen request inside Daytona|Daytona recommendation runner|Daytona returned)/.test(
        error.message,
      )
    )
      throw error;
    throw new Error(
      "Daytona sandbox execution failed. Check the API key, sandbox permissions, quota, and connectivity.",
    );
  } finally {
    if (sandbox) {
      try {
        await daytona.delete(sandbox, 10);
      } catch {
        console.warn(
          "Daytona sandbox cleanup failed; automatic deletion after stopping remains enabled.",
        );
      }
    }
  }
}
