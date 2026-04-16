// ─────────────────────────────────────────────────────────────────────────────
// lib/orchestrator/index.ts
// Agent 1 — Orchestrator. Reads the knowledge graph (not file contents),
// decides which files go to which specialist agent, attaches graph context.
// ─────────────────────────────────────────────────────────────────────────────

import { generateGraphContext } from "../graph-builder";
import type {
  KnowledgeGraph,
  FileContent,
  AgentRoute,
  RoutingManifest,
  AgentId,
  FileRiskType,
  ASTContext,
} from "../types";

// ── Routing rules — deterministic first pass (no LLM cost) ───────────────────

const DETERMINISTIC_RULES: Record<AgentId, FileRiskType[]> = {
  sleuth: ["config", "auth", "entry"],        // secrets can be in auth flows, API routes, config
  guardian: ["auth", "middleware", "entry"],   // auth bugs in entry points, middleware
  hacker: ["entry", "db", "auth"],            // injection in API routes, DB queries, auth/payment
  auditor: ["crypto", "auth"],                // crypto issues often live in auth flows
  // Operator scans all files that could have production-failure patterns:
  operator: ["entry", "db", "auth", "middleware"],
  sentinel: ["entry", "auth", "db", "middleware", "util", "config", "crypto", "unknown"],
  aggregator: [],
};

// Files above this risk score are always scanned by at least one agent
const RISK_THRESHOLD = 20;

// Max file size to send to an agent (characters)
const MAX_CONTENT_CHARS = 8000;

// ── File chunk size — max files per single agent LLM call ────────────────────
// Sending 30+ files to one agent in one prompt = giant tokens → slow + 429s.
// Splitting into chunks of MAX_FILES_PER_CHUNK keeps each call fast & cheap.
const MAX_FILES_PER_CHUNK = 15;

// ── Deterministic routing (fast, free) ───────────────────────────────────────

function routeDeterministically(
  files: FileContent[],
  graph: KnowledgeGraph
): Record<AgentId, string[]> {
  const routes: Record<AgentId, string[]> = {
    sleuth: [],
    guardian: [],
    hacker: [],
    auditor: [],
    operator: [],
    sentinel: [],
    aggregator: [],
  };

  for (const file of files) {
    const node = graph.nodes[file.filePath];
    if (!node) continue;

    // Route by file type
    for (const [agentId, types] of Object.entries(DETERMINISTIC_RULES)) {
      if (types.includes(node.type)) {
        routes[agentId as AgentId].push(file.filePath);
      }
    }

    // High-risk entry points also go to hacker AND guardian AND operator
    if (node.isEntryPoint) {
      if (!routes.hacker.includes(file.filePath))
        routes.hacker.push(file.filePath);
      if (!routes.guardian.includes(file.filePath))
        routes.guardian.push(file.filePath);
      if (!routes.operator.includes(file.filePath))
        routes.operator.push(file.filePath);
    }

    // Files on high-risk paths go to hacker
    const onRiskPath = graph.highRiskPaths.some((p) =>
      p.includes(file.filePath)
    );
    if (onRiskPath && !routes.hacker.includes(file.filePath)) {
      routes.hacker.push(file.filePath);
    }

    // Files with no type match but above risk threshold go to hacker as fallback
    if (
      node.riskScore >= RISK_THRESHOLD &&
      !Object.values(routes).flat().includes(file.filePath)
    ) {
      routes.hacker.push(file.filePath);
    }
  }

  return routes;
}

// ── LLM routing for ambiguous files ──────────────────────────────────────────

const ORCHESTRATOR_SYSTEM_PROMPT = `You are the Orchestrator agent for CodeSafe, a security scanner.

You receive a knowledge graph summary of a codebase. Your ONLY job is to produce a routing manifest — a JSON object that assigns each file to one or more specialist security agents.

THE FIVE SPECIALIST AGENTS:
- sleuth     → Finds hardcoded secrets, API keys, tokens, sensitive logging, credential exposure
- guardian   → Finds auth/authorization bugs, JWT issues, IDOR, session flaws, CORS misconfigurations
- hacker     → Finds injection flaws: SQL injection, XSS, command injection, SSRF, path traversal
- auditor    → Finds cryptographic issues: weak hashing, insecure RNG, bad TLS, weak ciphers
- sentinel   → Detects AI-generated code patterns: missing validation, insecure defaults, missing rate limiting, console.log of secrets

ROUTING RULES:
1. A file can be assigned to MULTIPLE agents if it contains multiple risk types
2. Only include files that have genuine security relevance
3. sentinel should receive ALL files with code logic (especially entry points, auth, and API routes)
4. Files in node_modules, tests, or purely type-definition files can be skipped
5. Return ONLY valid JSON — no explanation, no markdown, no code fences

OUTPUT FORMAT:
{
  "routes": {
    "sleuth":   ["path/to/file1.ts", "path/to/file2.ts"],
    "guardian": ["path/to/file3.ts"],
    "hacker":   ["path/to/file1.ts", "path/to/file4.ts"],
    "auditor":  ["path/to/file5.ts"],
    "sentinel": ["path/to/file1.ts", "path/to/file3.ts", "path/to/file6.ts"]
  },
  "reasoning": "one sentence explaining the main risks identified"
}`;

async function routeWithLLM(
  graph: KnowledgeGraph,
  ambiguousFiles: FileContent[]
): Promise<Record<AgentId, string[]>> {
  if (ambiguousFiles.length === 0) {
    return { sleuth: [], guardian: [], hacker: [], auditor: [], operator: [], sentinel: [], aggregator: [] };
  }

  // Build a compact graph summary for the orchestrator prompt
  const graphSummary = {
    entryPoints: graph.entryPoints,
    highRiskPaths: graph.highRiskPaths.slice(0, 10),
    nodes: Object.fromEntries(
      ambiguousFiles.map((f) => [
        f.filePath,
        {
          type: graph.nodes[f.filePath]?.type,
          riskScore: graph.nodes[f.filePath]?.riskScore,
          imports: graph.nodes[f.filePath]?.imports?.slice(0, 5),
          isEntryPoint: graph.nodes[f.filePath]?.isEntryPoint,
        },
      ])
    ),
  };

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.warn("[Orchestrator] GOOGLE_API_KEY not set, skipping LLM routing");
    return { sleuth: [], guardian: [], hacker: [], auditor: [], sentinel: [], operator: [], aggregator: [] };
  }

  const model = "gemini-3.1-flash-live-preview";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: ORCHESTRATOR_SYSTEM_PROMPT }],
        },
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `Route these files to the appropriate security agents.\n\nKnowledge graph:\n${JSON.stringify(graphSummary, null, 2)}`,
              },
            ],
          },
        ],
        generationConfig: {
          maxOutputTokens: 1000,
          temperature: 0.1,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Orchestrator] Gemini API error ${response.status}: ${errorText}`);
      return { sleuth: [], guardian: [], hacker: [], auditor: [], sentinel: [], operator: [], aggregator: [] };
    }

    const data = await response.json();
    const raw = (data.candidates?.[0]?.content?.parts ?? [])
      .map((p: any) => p.text ?? "")
      .join("")
      .trim()
      .replace(/^```json\s*|^```\s*|```\s*$/gm, "")
      .trim();

    const parsed = JSON.parse(raw);
    return {
      sleuth: parsed.routes?.sleuth ?? [],
      guardian: parsed.routes?.guardian ?? [],
      hacker: parsed.routes?.hacker ?? [],
      auditor: parsed.routes?.auditor ?? [],
      operator: parsed.routes?.operator ?? [],
      sentinel: parsed.routes?.sentinel ?? [],
      aggregator: [],
    };
  } catch (err: any) {
    console.error("[Orchestrator] LLM routing failed:", err?.message);
    // If LLM output can't be parsed, fall back to empty — deterministic already ran
    return { sleuth: [], guardian: [], hacker: [], auditor: [], operator: [], sentinel: [], aggregator: [] };
  }
}

// ── Merge deterministic + LLM routing, deduplicate ───────────────────────────

function mergeRoutes(
  deterministic: Record<AgentId, string[]>,
  llm: Record<AgentId, string[]>
): Record<AgentId, string[]> {
  const merged: Record<AgentId, string[]> = {
    sleuth: [],
    guardian: [],
    hacker: [],
    auditor: [],
    operator: [],
    sentinel: [],
    aggregator: [],
  };

  for (const agentId of Object.keys(merged) as AgentId[]) {
    const combined = [
      ...(deterministic[agentId] ?? []),
      ...(llm[agentId] ?? []),
    ];
    merged[agentId] = [...new Set(combined)];
  }

  return merged;
}

// ── Truncate file content to fit in agent context ─────────────────────────────

function truncateContent(content: string): string {
  if (content.length <= MAX_CONTENT_CHARS) return content;

  // Keep the first 6000 chars (top of file — imports, constants, class defs)
  // and last 2000 chars (often where interesting sinks live)
  return (
    content.slice(0, 6000) +
    "\n\n// ... [content truncated by CodeSafe for context window] ...\n\n" +
    content.slice(-2000)
  );
}

// ── Build final AgentRoute objects ────────────────────────────────────────────
// Each agent gets ONE route per chunk of MAX_FILES_PER_CHUNK files.
// Chunking keeps LLM prompts lean, avoids rate limits, and speeds up large scans.

function buildAgentRoutes(
  mergedRoutes: Record<AgentId, string[]>,
  files: FileContent[],
  graph: KnowledgeGraph,
  scanId: string,
  astAgentContexts: Record<string, ASTContext>,
  scanType: string = "web"
): AgentRoute[] {
  const fileMap = new Map(files.map((f) => [f.filePath, f]));
  const routes: AgentRoute[] = [];

  for (const agentId of ["sleuth", "guardian", "hacker", "auditor", "operator", "sentinel"] as AgentId[]) {
    const filePaths = mergedRoutes[agentId] ?? [];
    if (filePaths.length === 0) {
      console.log(`[Orchestrator] Agent ${agentId}: 0 files routed — skipping`);
      continue;
    }

    const agentFiles: FileContent[] = filePaths
      .map((fp) => fileMap.get(fp))
      .filter(Boolean)
      .map((f) => ({
        ...f!,
        content: truncateContent(f!.content),
      }));

    if (agentFiles.length === 0) {
      console.log(`[Orchestrator] Agent ${agentId}: ${filePaths.length} paths routed but 0 matched fileMap — skipping`);
      continue;
    }

    // ── CHUNKING: split large file batches into smaller parallel sub-routes ───
    // Each chunk becomes a separate agent dispatch so no single LLM call
    // receives an enormous prompt. Chunks run in parallel via Promise.allSettled.
    const chunks: FileContent[][] = [];
    for (let i = 0; i < agentFiles.length; i += MAX_FILES_PER_CHUNK) {
      chunks.push(agentFiles.slice(i, i + MAX_FILES_PER_CHUNK));
    }

    if (chunks.length > 1) {
      console.log(`[Orchestrator] Agent ${agentId}: ${agentFiles.length} files → ${chunks.length} chunks of ≤${MAX_FILES_PER_CHUNK}`);
    } else {
      console.log(`[Orchestrator] Agent ${agentId}: ${agentFiles.length} files routed (single chunk)`);
    }

    const astContext = astAgentContexts[agentId];

    for (let ci = 0; ci < chunks.length; ci++) {
      const chunkFiles = chunks[ci];
      const chunkPaths = chunkFiles.map(f => f.filePath);
      const graphContext = generateGraphContext(graph, chunkPaths);

      routes.push({
        agentId,
        files: chunkFiles,
        graphContext,
        astContext,
        scanType,   // 'web' | 'mobile' — agents use this for prompt context injection
      });
    }
  }

  return routes;
}

// ── Main orchestrator function ────────────────────────────────────────────────

export async function orchestrate(
  files: FileContent[],
  graph: KnowledgeGraph,
  scanId: string,
  astAgentContexts: Record<string, ASTContext> = {},
  scanType: string = "web"   // 'web' | 'mobile'
): Promise<RoutingManifest> {

  // Step 1 — deterministic routing (free, instant)
  const deterministicRoutes = routeDeterministically(files, graph);

  // Step 2 — find files not yet routed (ambiguous files)
  const routedFiles = new Set(Object.values(deterministicRoutes).flat());
  const ambiguousFiles = files.filter(
    (f) =>
      !routedFiles.has(f.filePath) &&
      graph.nodes[f.filePath]?.riskScore >= RISK_THRESHOLD
  );

  // Step 3 — LLM routing for ambiguous files only
  const llmRoutes = await routeWithLLM(graph, ambiguousFiles);

  // Step 4 — merge and deduplicate
  const merged = mergeRoutes(deterministicRoutes, llmRoutes);

  // Step 4.5 — Small project boost: ensure adequate multi-agent coverage.
  // For small projects (≤15 files), every file should be seen by at least 2
  // specialist agents so cross-validation can confirm findings. If coverage
  // is thin, broadcast remaining under-covered files to core agents.
  const coreAgents: AgentId[] = ["sleuth", "guardian", "hacker"];
  const allPaths = files.map(f => f.filePath);

  // Count how many agents see each file
  const fileCoverage: Record<string, number> = {};
  for (const fp of allPaths) fileCoverage[fp] = 0;
  for (const [agentId, paths] of Object.entries(merged)) {
    if (agentId === "aggregator" || agentId === "sentinel") continue;
    for (const fp of paths) {
      fileCoverage[fp] = (fileCoverage[fp] ?? 0) + 1;
    }
  }

  // Files covered by 0 or 1 specialist agents (excluding sentinel)
  const underCoveredFiles = allPaths.filter(fp => (fileCoverage[fp] ?? 0) < 2);

  if (underCoveredFiles.length > 0 && files.length <= 15) {
    console.log(`[Orchestrator] Small-project boost: ${underCoveredFiles.length}/${allPaths.length} files covered by <2 agents — broadcasting to core agents`);
    for (const agentId of coreAgents) {
      for (const fp of underCoveredFiles) {
        if (!merged[agentId].includes(fp)) {
          merged[agentId].push(fp);
        }
      }
    }
  } else if (underCoveredFiles.length > 0 && files.length > 15) {
    // For larger projects, only boost files with ZERO specialist coverage
    const zeroCovered = allPaths.filter(fp => (fileCoverage[fp] ?? 0) === 0);
    if (zeroCovered.length > 0) {
      console.log(`[Orchestrator] Coverage gap: ${zeroCovered.length} files with 0 agent coverage — adding to hacker + guardian`);
      for (const fp of zeroCovered) {
        if (!merged.hacker.includes(fp)) merged.hacker.push(fp);
        if (!merged.guardian.includes(fp)) merged.guardian.push(fp);
      }
    }
  }

  const totalRouted = new Set(
    Object.entries(merged)
      .filter(([k]) => k !== "aggregator")
      .flatMap(([, v]) => v)
  ).size;

  if (totalRouted === 0 && files.length > 0) {
    console.log(`[Orchestrator] WARNING: 0 files routed. Activating fallback — sending all ${files.length} files to all core agents + operator`);
    merged.hacker = allPaths;
    merged.guardian = allPaths;
    merged.sleuth = allPaths;
    merged.operator = allPaths;
  }

  // Step 5 — find skipped files
  const allRouted = new Set(Object.values(merged).flat());
  const skippedFiles = files
    .filter((f) => !allRouted.has(f.filePath))
    .map((f) => f.filePath);

  // Step 6 — build final route objects (stamp scanType onto every route)
  const routes = buildAgentRoutes(merged, files, graph, scanId, astAgentContexts, scanType);

  return {
    scanId,
    routes,
    skippedFiles,
  };
}
