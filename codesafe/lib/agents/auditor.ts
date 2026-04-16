// lib/agents/auditor.ts
import { runAgent }       from "./runner";
import { AUDITOR_PROMPT } from "./prompt";
import type { AgentRoute, AgentResult } from "../types";

export async function runAuditor(route: AgentRoute): Promise<AgentResult> {
  return runAgent("auditor", AUDITOR_PROMPT, route);
}