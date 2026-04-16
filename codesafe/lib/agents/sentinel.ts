// lib/agents/sentinel.ts — The Sentinel (AI Pattern Detector)
import { runAgent }        from "./runner";
import { SENTINEL_PROMPT } from "./sentinel-prompt";
import type { AgentRoute, AgentResult } from "../types";

export async function runSentinel(route: AgentRoute): Promise<AgentResult> {
  return runAgent("sentinel", SENTINEL_PROMPT, route);
}
