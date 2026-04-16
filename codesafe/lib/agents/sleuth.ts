// lib/agents/sleuth.ts
import { runAgent }      from "./runner";
import { SLEUTH_PROMPT } from "./prompt";
import type { AgentRoute, AgentResult } from "../types";

export async function runSleuth(route: AgentRoute): Promise<AgentResult> {
  return runAgent("sleuth", SLEUTH_PROMPT, route);
}