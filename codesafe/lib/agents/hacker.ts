// lib/agents/hacker.ts
import { runAgent }      from "./runner";
import { HACKER_PROMPT } from "./prompt";
import type { AgentRoute, AgentResult } from "../types";

export async function runHacker(route: AgentRoute): Promise<AgentResult> {
  return runAgent("hacker", HACKER_PROMPT, route);
}