// lib/agents/guardian.ts
import { runAgent }        from "./runner";
import { GUARDIAN_PROMPT } from "./prompt";
import type { AgentRoute, AgentResult } from "../types";

export async function runGuardian(route: AgentRoute): Promise<AgentResult> {
  return runAgent("guardian", GUARDIAN_PROMPT, route);
}