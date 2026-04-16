// ─────────────────────────────────────────────────────────────────────────────
// lib/pipeline.ts
// THE MASTER CONNECTOR.
// Import this one function in your API route.
// It wires: upload → graph-builder → orchestrator → agents → aggregator
// ─────────────────────────────────────────────────────────────────────────────

import pLimit from "p-limit";
import { buildKnowledgeGraph } from "./graph-builder";
import { orchestrate }         from "./orchestrator";
import { runASTPipeline }      from "./ast-parser/bridge";
import { runSleuth }           from "./agents/sleuth";
import { runGuardian }         from "./agents/guardian";
import { runHacker }           from "./agents/hacker";
import { runAuditor }          from "./agents/auditor";
import { runOperator }         from "./agents/operator";
import { aggregate }           from "./aggregator";

import type {
  FileContent,
  AgentResult,
  AgentRoute,
  ScanResult,
  ScanPhase,
} from "./types";

// ── Concurrency — serialized to 1 to respect free-tier 15 RPM limit ──────────
// All 6 agents firing simultaneously causes 429/503 bursts on the free tier.
// pLimit(1) runs agents one at a time — slower but guaranteed to complete.
// Upgrade to a paid API key and raise this to 3-4 for faster parallel scans.
const limit = pLimit(2);

// ── Phase callback — lets the API route push status to Supabase ───────────────
export type OnPhaseChange = (phase: ScanPhase, progress: number) => Promise<void>;
export type OnFindingsUpdate = (result: AgentResult) => Promise<void>;

// ── Agent dispatcher ──────────────────────────────────────────────────────────
const AGENT_RUNNERS: Record<string, (route: AgentRoute) => Promise<AgentResult>> = {
  sleuth:   runSleuth,
  guardian: runGuardian,
  hacker:   runHacker,
  auditor:  runAuditor,
  operator: runOperator,
};

// ── MAIN PIPELINE FUNCTION ────────────────────────────────────────────────────
// Call this from api/scan/route.ts after parsing uploaded files.
//
// Usage:
//   const result = await runPipeline(files, scanId, onPhase, onFindings);
//
export async function runPipeline(
  files:           FileContent[],
  scanId:          string,
  onPhaseChange:   OnPhaseChange,
  onFindingsUpdate: OnFindingsUpdate
): Promise<ScanResult> {

  const start = Date.now();

  // ── PHASE 1: BUILD KNOWLEDGE GRAPH ─────────────────────────────────────────
  // Pure static analysis — zero LLM calls. Fast, free.
  // Parses imports/exports across all files, builds dependency map,
  // identifies entry points and high-risk data flow paths.

  await onPhaseChange("graph_building", 10);

  const graph = buildKnowledgeGraph(files);

  // ── PHASE 1.5: AST PARSER — INTERPROCEDURAL CHAIN ANALYSIS ─────────────────
  // Runs tree-sitter on all files to extract function-level call chains.
  // Detects: SQL injection, SSRF, RCE, null dereference, auth bypass, etc.
  // Produces per-agent ASTContext injected into every agent prompt.
  // Pure static analysis — zero LLM calls. Runs in ~100-500ms for typical repos.

  await onPhaseChange("ast_parsing", 15);

  const astResult = await runASTPipeline(files);

  console.log(
    `[Pipeline] AST done — ${
      astResult.stats.findingsProduced
    } findings, ${
      astResult.stats.chainsLinked
    } chains across ${
      astResult.stats.filesSupported
    } files in ${astResult.stats.durationMs}ms`
  );

  // ── PHASE 2: ORCHESTRATOR ROUTES FILES TO AGENTS ───────────────────────────
  // Agent 1 reads the GRAPH (not file contents) and decides:
  //   - Which files go to which specialist agent
  //   - Attaches dependency context to each agent's file batch
  //
  // Two-step routing:
  //   Step A: Deterministic rules (free — no LLM)
  //           e.g. anything in /routes → Hacker, /config → Sleuth
  //   Step B: LLM routing for ambiguous files only
  //           e.g. a util file that touches both auth and DB

  await onPhaseChange("orchestrating", 25);

  const manifest = await orchestrate(files, graph, scanId, astResult.agentContexts);

  // ── PHASE 3: SPECIALIST AGENTS SCAN IN PARALLEL ────────────────────────────
  // All 4 agents fire simultaneously via Promise.allSettled.
  // Each agent gets:
  //   a) Their specific file batch (only what's relevant to their domain)
  //   b) Graph context: which entry points feed into their files,
  //      which sinks their files connect to
  //
  // p-limit(8) prevents rate limit errors when multiple users scan at once.
  // allSettled ensures one agent failure never kills the whole scan.

  await onPhaseChange("scanning", 30);

  let completedAgents = 0;
  const totalAgents   = manifest.routes.length;

  const agentTasks = manifest.routes.map((route) =>
    limit(async () => {
      const runner = AGENT_RUNNERS[route.agentId];

      if (!runner) {
        return {
          agentId:    route.agentId as any,
          findings:   [],
          durationMs: 0,
          status:     "error" as const,
          error:      `No runner found for agent: ${route.agentId}`,
        };
      }

      const result = await runner(route);

      // Push findings to Supabase immediately after each agent completes.
      // This is what enables live streaming to the dashboard.
      await onFindingsUpdate(result);

      completedAgents++;
      const progress = 30 + Math.round((completedAgents / totalAgents) * 40);
      await onPhaseChange("scanning", progress);

      return result;
    })
  );

  const settled     = await Promise.allSettled(agentTasks);
  const agentResults: AgentResult[] = settled.map((r) =>
    r.status === "fulfilled"
      ? r.value
      : {
          agentId:    "unknown" as any,
          findings:   [],
          durationMs: 0,
          status:     "error" as const,
          error:      String((r as PromiseRejectedResult).reason),
        }
  );

  // ── PHASE 4: AGGREGATOR MERGES ALL FINDINGS ─────────────────────────────────
  // Agent 6 does three things:
  //   1. Deterministic deduplication — same file + line + vuln class = merge
  //   2. Cross-file synthesis — finds bugs that span multiple files using graph
  //   3. Deterministic scoring — pure math, never LLM (score stays consistent)

  await onPhaseChange("aggregating", 75);

  const result = await aggregate(
    agentResults,
    graph,
    scanId,
    Date.now() - start,
    files.length
  );

  await onPhaseChange("done", 100);

  return result;
}