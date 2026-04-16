// ─────────────────────────────────────────────────────────────────────────────
// lib/aggregator/index.ts — Agent 6: Aggregator
// Deduplicates findings across all agents, detects cross-file vulnerabilities
// using the knowledge graph, computes deterministic score.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  Finding,
  AgentResult,
  KnowledgeGraph,
  ScanResult,
  Severity,
  AgentId,
} from "../types";

// ── Deterministic score — NEVER use LLM for this ─────────────────────────────

const SEVERITY_PENALTY: Record<Severity, number> = {
  CRITICAL: 25,
  HIGH: 12,
  MEDIUM: 5,
  LOW: 2,
};

function calculateScore(findings: Finding[]): number {
  const penalty = findings.reduce(
    (total, f) => total + (SEVERITY_PENALTY[f.severity] ?? 2),
    0
  );
  return Math.max(0, 100 - penalty);
}

function countBySeverity(findings: Finding[]): Record<Severity, number> {
  return {
    CRITICAL: findings.filter((f) => f.severity === "CRITICAL").length,
    HIGH: findings.filter((f) => f.severity === "HIGH").length,
    MEDIUM: findings.filter((f) => f.severity === "MEDIUM").length,
    LOW: findings.filter((f) => f.severity === "LOW").length,
  };
}

// ── Step 1: Deterministic deduplication ──────────────────────────────────────
// Two findings are duplicates if they share: same file + same line + same vuln class

const VULN_CLASS_MAP: Record<string, string> = {
  // Injection
  "sql injection": "injection",
  "sqli": "injection",
  "xss": "xss",
  "cross-site scripting": "xss",
  "command injection": "cmdi",
  "ssrf": "ssrf",
  "path traversal": "traversal",
  // Auth
  "idor": "idor",
  "broken access": "access",
  "jwt": "jwt",
  "session": "session",
  // Secrets
  "hardcoded": "secret",
  "api key": "secret",
  "secret": "secret",
  // Crypto
  "md5": "weak-hash",
  "sha1": "weak-hash",
  "weak hash": "weak-hash",
  "math.random": "insecure-rng",
  "insecure rng": "insecure-rng",
};

function normaliseVulnType(type: string): string {
  const lower = type.toLowerCase();
  for (const [keyword, canonical] of Object.entries(VULN_CLASS_MAP)) {
    if (lower.includes(keyword)) return canonical;
  }
  return lower;
}

function deduplicateFindings(findings: Finding[]): Finding[] {
  // Pre-pass: build per-key agent sets so every deduplicated finding knows all agents that flagged it
  const keyAgents = new Map<string, Set<AgentId>>();
  for (const f of findings) {
    const key = `${f.file}:${f.line}:${normaliseVulnType(f.type)}`;
    if (!keyAgents.has(key)) keyAgents.set(key, new Set());
    keyAgents.get(key)!.add(f.agentId);
  }

  const seen = new Map<string, Finding>();

  for (const finding of findings) {
    const key = `${finding.file}:${finding.line}:${normaliseVulnType(finding.type)}`;

    if (!seen.has(key)) {
      seen.set(key, finding);
    } else {
      // Keep the one with higher confidence, merge reasoning
      const existing = seen.get(key)!;
      if (finding.confidence > existing.confidence) {
        seen.set(key, {
          ...finding,
          reasoning: `${finding.reasoning}\n[Also detected by ${existing.agentId}]`,
        });
      }
    }
  }

  // Attach confirmedBy from the pre-pass agent sets
  return [...seen.values()].map((f) => {
    const key = `${f.file}:${f.line}:${normaliseVulnType(f.type)}`;
    const agents = [...(keyAgents.get(key) ?? new Set())] as AgentId[];
    return { ...f, confirmedBy: agents };
  });
}

// ── Step 1.5: Deterministic false-positive filter ─────────────────────────────
// Catches known-safe patterns that LLM agents sometimes misidentify.
// This runs BEFORE the LLM aggregator — it's fast, free, and 100% reliable.

interface FalsePositiveRule {
  /** Regex tested against the finding's snippet + reasoning */
  pattern: RegExp;
  /** Why this is safe */
  reason: string;
  /** Only reject if the finding type matches this pattern (optional — if omitted, matches all types) */
  typePattern?: RegExp;
}

const FALSE_POSITIVE_RULES: FalsePositiveRule[] = [
  // ── Environment variable references are NOT hardcoded secrets ─────────────
  {
    pattern: /process\.env\.\w+/,
    reason: "Environment variable reference — value is loaded at runtime, not hardcoded in source",
    typePattern: /hardcoded|secret|key|credential|exposed|api.*key/i,
  },
  {
    pattern: /import\.meta\.env\.\w+/,
    reason: "Vite/build-time env variable reference — not hardcoded",
    typePattern: /hardcoded|secret|key|credential|exposed/i,
  },

  // ── Supabase public keys are designed to be public ────────────────────────
  {
    pattern: /NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY|SUPABASE_ANON_KEY/,
    reason: "Supabase anon/URL key is public by design — protected by Row Level Security (RLS). This is documented Supabase best practice.",
  },
  {
    pattern: /createClient\s*\(\s*process\.env/,
    reason: "Supabase createClient with env vars is the standard safe pattern — no secrets are hardcoded",
  },

  // ── ORM/SDK queries are parameterized internally ──────────────────────────
  {
    pattern: /supabase\s*\.\s*from\s*\(/,
    reason: "Supabase SDK queries are parameterized internally — no SQL injection risk",
    typePattern: /sql.*inject|injection/i,
  },
  {
    pattern: /prisma\.\w+\.(find|create|update|delete|upsert)/,
    reason: "Prisma ORM queries are parameterized — no SQL injection risk",
    typePattern: /sql.*inject|injection/i,
  },
  {
    pattern: /\.findUnique\(|\.findMany\(|\.findFirst\(/,
    reason: "ORM find methods are parameterized — no injection risk",
    typePattern: /sql.*inject|injection/i,
  },
];

function filterFalsePositives(
  findings: Finding[]
): { clean: Finding[]; rejected: Array<{ finding: Finding; reason: string }> } {
  const clean: Finding[] = [];
  const rejected: Array<{ finding: Finding; reason: string }> = [];

  for (const finding of findings) {
    const searchText = `${finding.snippet} ${finding.reasoning} ${finding.type}`;
    let isFP = false;

    for (const rule of FALSE_POSITIVE_RULES) {
      // If rule has a typePattern, only apply it when the finding type matches
      if (rule.typePattern && !rule.typePattern.test(finding.type)) continue;

      if (rule.pattern.test(searchText)) {
        rejected.push({ finding, reason: `[Auto-filter] ${rule.reason}` });
        console.log(`[Aggregator] Auto-rejected false positive: "${finding.type}" in ${finding.file}:${finding.line} — ${rule.reason}`);
        isFP = true;
        break;
      }
    }

    if (!isFP) {
      clean.push(finding);
    }
  }

  if (rejected.length > 0) {
    console.log(`[Aggregator] False-positive filter removed ${rejected.length} finding(s)`);
  }

  return { clean, rejected };
}

// ── Step 1.7: Cross-agent validation ─────────────────────────────────────────
// Groups findings by file:line (broader than the dedup key — catches agreement across vuln types).
// Computes agentAgreement, needsReview, confidence boost, and severity promotion.

function crossValidateFindings(findings: Finding[]): Finding[] {
  // Build map: file:line → Set of all unique agents across all vuln types at that location
  // (uses the confirmedBy already set by deduplication, falling back to agentId)
  const locationAgents = new Map<string, Set<AgentId>>();
  for (const f of findings) {
    const loc = `${f.file}:${f.line}`;
    if (!locationAgents.has(loc)) locationAgents.set(loc, new Set());
    (f.confirmedBy ?? [f.agentId]).forEach((a) => locationAgents.get(loc)!.add(a));
  }

  // Build a SEPARATE map for severity promotion: file:line:vulnClass → agents
  // Severity should only be promoted when the same vuln class is confirmed by 2+ agents,
  // NOT when two unrelated vuln types happen to be at the same line.
  const vulnClassAgents = new Map<string, Set<AgentId>>();
  for (const f of findings) {
    const key = `${f.file}:${f.line}:${normaliseVulnType(f.type)}`;
    if (!vulnClassAgents.has(key)) vulnClassAgents.set(key, new Set());
    (f.confirmedBy ?? [f.agentId]).forEach((a) => vulnClassAgents.get(key)!.add(a));
  }

  // Track which file:line combos we've already emitted a log for
  const loggedLocations = new Set<string>();

  return findings.map((f) => {
    const loc = `${f.file}:${f.line}`;
    const vulnKey = `${f.file}:${f.line}:${normaliseVulnType(f.type)}`;

    // Broad location-level agreement (for metadata / confidence)
    const locationSet = locationAgents.get(loc) ?? new Set<AgentId>();
    const confirmedBy = [...locationSet] as AgentId[];
    const locationAgentCount = confirmedBy.length;

    // Narrow vuln-class-level agreement (for severity promotion)
    const vulnClassSet = vulnClassAgents.get(vulnKey) ?? new Set<AgentId>();
    const vulnClassCount = vulnClassSet.size;

    // Three-tier agreement level (based on location for broadest view)
    const agentAgreement: "confirmed" | "partial" | "single" =
      locationAgentCount >= 3 ? "confirmed" : locationAgentCount >= 2 ? "partial" : "single";

    // Only single-agent findings need manual review
    const needsReview = locationAgentCount === 1;

    // Confidence boost: more agents at location = higher certainty
    const boost = locationAgentCount >= 3 ? 20 : locationAgentCount === 2 ? 10 : 0;
    const boostedConfidence = Math.min((f.confidence ?? 80) + boost, 100);

    // Severity promotion: ONLY when the same vuln CLASS is confirmed by 2+ agents.
    // This prevents inflation from unrelated findings at the same line.
    let severity = f.severity;
    if (vulnClassCount >= 2) {
      if (severity === "HIGH") severity = "CRITICAL";
      else if (severity === "MEDIUM") severity = "HIGH";
    }

    // Log once per location to avoid duplicate log spam
    if (!loggedLocations.has(loc)) {
      loggedLocations.add(loc);
      console.log(
        `[Aggregator] Cross-validate ${loc}: ${locationAgentCount} agent(s) [${confirmedBy.join(", ")}] → ${agentAgreement}${
          vulnClassCount >= 2 ? ` | severity promoted ${f.severity}→${severity}` : ""
        }`
      );
    }

    return {
      ...f,
      severity,
      confidence: boostedConfidence,
      confirmedBy,
      agentAgreement,
      needsReview,
    };
  });
}

// ── Step 2: Cross-file vulnerability synthesis (LLM) ─────────────────────────

const AGGREGATOR_SYSTEM_PROMPT = `You are the Aggregator — the final agent in the CodeSafe security scanning pipeline.

You receive:
1. All findings from 4 specialist scanner agents (already deduplicated)
2. The knowledge graph showing how files connect
3. The original file list

YOUR JOBS:
A. CROSS-FILE SYNTHESIS: Identify if any findings, when combined with the graph's data flow paths, represent a more severe cross-file vulnerability. For example: if The Hacker found unsanitized input in api/user.ts AND the graph shows that data flows to db/queries.ts where a SQL query runs, flag this as a cross-file SQL Injection with the full path.

B. FALSE POSITIVE REMOVAL: If a finding's reasoning is clearly wrong (e.g., claims user input is uncontrolled but the code shows it's validated two lines earlier), mark it for rejection with a reason.

C. SUMMARY: Write one sentence summarising the overall security posture.

RULES:
- DO NOT add new findings about things not mentioned in the scanner findings or graph
- DO NOT re-explain what scanners already explained correctly
- Only reject a finding if you can point to specific code that disproves the scanner's reasoning
- Be conservative — when in doubt, keep the finding

OUTPUT FORMAT — raw JSON only:
{
  "summary": "One sentence security assessment",
  "crossFileFindings": [
    {
      "baseId": "hacker-api/user.ts-0",
      "crossFileNote": "User input from api/user.ts line 12 flows through middleware/validate.ts to db/queries.ts line 34 where it is interpolated into a raw SQL string",
      "affectedPath": ["api/user.ts", "middleware/validate.ts", "db/queries.ts"],
      "upgradedSeverity": "CRITICAL"
    }
  ],
  "rejections": [
    {
      "id": "guardian-api/posts.ts-1",
      "reason": "Line 45 shows req.user.id === req.params.userId check before the DB call — ownership is verified"
    }
  ]
}

If no cross-file findings and no rejections: { "summary": "...", "crossFileFindings": [], "rejections": [] }`;

interface AggregatorOutput {
  summary: string;
  crossFileFindings: Array<{
    baseId: string;
    crossFileNote: string;
    affectedPath: string[];
    upgradedSeverity?: Severity;
  }>;
  rejections: Array<{
    id: string;
    reason: string;
  }>;
}

async function runAggregatorLLM(
  findings: Finding[],
  graph: KnowledgeGraph
): Promise<AggregatorOutput> {
  const graphSummary = {
    entryPoints: graph.entryPoints,
    highRiskPaths: graph.highRiskPaths.slice(0, 15),
    edgeCount: graph.edges.length,
  };

  const findingsForAggregator = findings.map((f) => ({
    id: f.id,
    agent: f.agentId,
    file: f.file,
    line: f.line,
    type: f.type,
    severity: f.severity,
    reasoning: f.reasoning,
    snippet: f.snippet.slice(0, 200),
  }));

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.warn("[Aggregator] GOOGLE_API_KEY not set, skipping LLM aggregation");
    return { summary: "Scan complete.", crossFileFindings: [], rejections: [] };
  }

  const model = "gemini-3.1-flash-lite-preview";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const userContent = `Knowledge graph:\n${JSON.stringify(graphSummary, null, 2)}\n\nScanner findings (${findings.length} total):\n${JSON.stringify(findingsForAggregator, null, 2)}\n\nAnalyse for cross-file vulnerabilities and false positives.`;

  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: AGGREGATOR_SYSTEM_PROMPT }] },
    contents: [{ role: "user", parts: [{ text: userContent }] }],
    generationConfig: { maxOutputTokens: 1000, temperature: 0.1 },
  });

  // ── Retry on 503/429 with exponential backoff ──────────────────────────────
  const MAX_AGG_RETRIES = 4;
  let response: Response | null = null;

  for (let attempt = 0; attempt <= MAX_AGG_RETRIES; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

    if (res.ok) { response = res; break; }

    const isRetryable = res.status === 503 || res.status === 429 || res.status === 502;
    if (isRetryable && attempt < MAX_AGG_RETRIES) {
      const baseMs = res.status === 503 ? 6000 : 1000;
      const delay  = Math.min(Math.pow(2, attempt) * baseMs + Math.random() * 1000, 30_000);
      console.warn(`[Aggregator] Retryable ${res.status}, waiting ${Math.round(delay / 1000)}s (attempt ${attempt + 2}/${MAX_AGG_RETRIES + 1})`);
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }

    // Non-retryable or out of retries — degrade gracefully
    const errorText = await res.text();
    console.error(`[Aggregator] Gemini API error ${res.status}: ${errorText}`);
    return { summary: "Scan complete.", crossFileFindings: [], rejections: [] };
  }

  if (!response) return { summary: "Scan complete.", crossFileFindings: [], rejections: [] };

  const data = await response.json();
  const raw = (data.candidates?.[0]?.content?.parts ?? [])
    .map((p: any) => p.text ?? "")
    .join("")
    .trim()
    .replace(/^```json\s*|^```\s*|```\s*$/gm, "")
    .trim();

  try {
    return JSON.parse(raw);
  } catch {
    return { summary: "Scan complete.", crossFileFindings: [], rejections: [] };
  }
}

// ── Step 3: Apply aggregator output to findings ───────────────────────────────

function applyAggregatorOutput(
  findings: Finding[],
  output: AggregatorOutput
): {
  verified: Finding[];
  rejected: ScanResult["rejected"];
} {
  const rejectedIds = new Set(output.rejections.map((r) => r.id));
  const rejectionReasons = new Map(
    output.rejections.map((r) => [r.id, r.reason])
  );

  // Build cross-file upgrade map
  const crossFileMap = new Map(
    output.crossFileFindings.map((cf) => [cf.baseId, cf])
  );

  const verified: Finding[] = [];
  const rejected: ScanResult["rejected"] = [];

  for (const finding of findings) {
    if (rejectedIds.has(finding.id)) {
      rejected.push({
        finding,
        reason: rejectionReasons.get(finding.id) ?? "Flagged as false positive",
      });
      continue;
    }

    // Apply cross-file enhancements
    const crossFile = crossFileMap.get(finding.id);
    if (crossFile) {
      verified.push({
        ...finding,
        severity: crossFile.upgradedSeverity ?? finding.severity,
        crossFile: {
          originFile: crossFile.affectedPath[0] ?? finding.file,
          originLine: finding.line,
          path: crossFile.affectedPath,
        },
        reasoning:
          finding.reasoning + "\n\nCross-file context: " + crossFile.crossFileNote,
      });
    } else {
      verified.push(finding);
    }
  }

  // Sort by severity
  const severityOrder: Record<Severity, number> = {
    CRITICAL: 0,
    HIGH: 1,
    MEDIUM: 2,
    LOW: 3,
  };

  verified.sort(
    (a, b) =>
      (severityOrder[a.severity] ?? 4) - (severityOrder[b.severity] ?? 4)
  );

  return { verified, rejected };
}

// ── Compute per-agent stats ───────────────────────────────────────────────────

function buildAgentStats(
  results: AgentResult[]
): Record<AgentId, { count: number; durationMs: number; status: string }> {
  const stats: Record<string, any> = {};
  for (const result of results) {
    stats[result.agentId] = {
      count: result.findings.length,
      durationMs: result.durationMs,
      status: result.status,
    };
  }
  return stats;
}

// ── Main aggregator function ──────────────────────────────────────────────────

export async function aggregate(
  agentResults: AgentResult[],
  graph: KnowledgeGraph,
  scanId: string,
  totalDurationMs: number,
  scannedFiles: number
): Promise<ScanResult> {
  // Collect all raw findings
  const allFindings = agentResults.flatMap((r) => r.findings);

  // Step 1 — deduplicate deterministically (also builds confirmedBy per finding)
  const deduped = deduplicateFindings(allFindings);

  // Step 1.5 — deterministic false-positive filter (fast, free, 100% reliable)
  const { clean: filtered, rejected: autoRejected } = filterFalsePositives(deduped);

  // Step 1.7 — cross-agent validation
  // Groups by file:line, computes confidence/agentAgreement/needsReview, promotes severity
  const crossValidated = crossValidateFindings(filtered);
  const promotedCount = crossValidated.filter((f) => f.agentAgreement !== "single").length;
  console.log(
    `[Aggregator] Cross-validation: ${promotedCount}/${crossValidated.length} findings confirmed by 2+ agents`
  );

  // Step 2 — LLM cross-file synthesis + false positive removal
  let aggregatorOutput: AggregatorOutput = {
    summary: "Scan complete.",
    crossFileFindings: [],
    rejections: [],
  };

  if (crossValidated.length > 0) {
    try {
      aggregatorOutput = await runAggregatorLLM(crossValidated, graph);
    } catch (err) {
      // Aggregator LLM failure is non-fatal — use crossValidated findings as-is
      console.error("[Aggregator] LLM call failed:", err);
    }
  }

  // Step 3 — apply aggregator output (on crossValidated, which has enriched fields)
  const { verified, rejected: llmRejected } = applyAggregatorOutput(crossValidated, aggregatorOutput);

  // Combine auto-rejected + LLM-rejected
  const allRejected = [...autoRejected, ...llmRejected];

  // Step 4 — deterministic scoring
  const score = calculateScore(verified);

  console.log(`[Aggregator] Final: ${verified.length} verified, ${allRejected.length} rejected (${autoRejected.length} auto + ${llmRejected.length} LLM), score=${score}`);

  return {
    scanId,
    score,
    findings: verified,
    rejected: allRejected,
    summary: aggregatorOutput.summary,
    severityCounts: countBySeverity(verified),
    agentStats: buildAgentStats(agentResults),
    graph,
    durationMs: totalDurationMs,
    scannedFiles,
  };
}
