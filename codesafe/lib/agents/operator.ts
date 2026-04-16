// lib/agents/operator.ts — The Operator (Production Failure Detector)
import { runAgent }        from "./runner";
import { OPERATOR_PROMPT } from "./operator-prompt";
import type { AgentRoute, AgentResult } from "../types";

export async function runOperator(route: AgentRoute): Promise<AgentResult> {
  return runAgent("operator", OPERATOR_PROMPT, route);
}
