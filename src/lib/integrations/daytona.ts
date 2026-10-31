import type { RankingContext } from "./contracts";

// Future execution boundary: run the networking skill in a Daytona sandbox.
// The skill owner supplies content; sandbox setup and execution are not wired yet.
export const networkingSkillPath = "skills/networking/SKILL.md";

export async function runNetworkingInDaytona(
  context: RankingContext,
): Promise<never> {
  void context;
  throw new Error(
    "Daytona execution is not implemented. No sandbox has been created.",
  );
}
