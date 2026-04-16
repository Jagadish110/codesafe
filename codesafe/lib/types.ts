// ─────────────────────────────────────────────────────────────────────────────
// lib/types.ts — Shared types for the entire CodeSafe scanning pipeline
// ─────────────────────────────────────────────────────────────────────────────

export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export type AgentId = "sleuth" | "guardian" | "hacker" | "auditor" | "sentinel" | "operator" | "aggregator";

export type FileRiskType =
  | "entry"       // routes/, api/, pages/api/
  | "middleware"  // middleware/, interceptors/
  | "db"          // db/, queries/, prisma/
  | "crypto"      // lib/crypto, utils/hash
  | "config"      // .env, config/, constants/
  | "auth"        // auth/, session/, jwt/
  | "util"        // general utilities
  | "unknown";

// ── Knowledge Graph ───────────────────────────────────────────────────────────

export interface GraphNode {
  filePath: string;
  type: FileRiskType;
  imports: string[];        // files this file imports
  exports: string[];        // named exports
  isEntryPoint: boolean;    // receives external HTTP input
  riskScore: number;        // 0–100, computed from topology
  lineCount: number;
}

export interface GraphEdge {
  from: string;
  to: string;
}

export interface KnowledgeGraph {
  nodes: Record<string, GraphNode>;
  edges: GraphEdge[];
  entryPoints: string[];
  highRiskPaths: string[][];   // e.g. ["api/user.ts", "db/queries.ts"]
}

// ── File content passed to agents ────────────────────────────────────────────

export interface FileContent {
  filePath: string;
  content: string;
  language: string;
  lineCount: number;
}

// ── Routing manifest produced by Agent 1 ─────────────────────────────────────

export interface AgentRoute {
  agentId: AgentId;
  files: FileContent[];
  graphContext: string;   // injected as plain-text summary into agent prompt
  // AST-derived interprocedural chain context — injected by the AST pipeline
  // Contains pre-formatted === VULNERABILITY FINDINGS === and === CALLER-CALLEE CHAINS === blocks
  astContext?: ASTContext;
  /** 'web' (default) | 'mobile' — controls which extensions were accepted and injects mobile prompt context */
  scanType?: string;
}

export interface ASTContext {
  findingsBlock: string;    // formatted VulnerabilityFinding[] for agent prompts
  chainsBlock: string;      // formatted CallerCalleeChain[] for agent prompts
  totalFindings: number;
  totalChains: number;
  // Per-agent slices — each agent only gets what's relevant to its domain
  agentSlice: 'hacker' | 'guardian' | 'auditor' | 'sleuth' | 'all';
}

export interface RoutingManifest {
  scanId: string;
  routes: AgentRoute[];
  skippedFiles: string[];   // binary, too large, unsupported
}

// ── Finding — output of every specialist agent ───────────────────────────────

export interface Finding {
  id: string;               // `${agentId}-${filePath}-${index}`
  agentId: AgentId;
  file: string;
  line: number;
  type: string;             // "SQL Injection", "Hardcoded API Key", etc.
  severity: Severity;
  snippet: string;          // the exact vulnerable code line(s)
  reasoning: string;        // agent's chain-of-thought explanation
  fix: string;              // concrete remediation
  cwe: string;              // "CWE-89"
  confidence: number;       // 0–100, findings below 70 are excluded
  incident?: string;        // real incident this pattern prevented (Operator agent only)
  crossFile?: {             // populated by aggregator for cross-file findings
    originFile: string;
    originLine: number;
    path: string[];         // full chain of files the data flows through
  };
  // ── Cross-validation fields (added by Aggregator) ────────────────────────
  confirmedBy?: AgentId[];                            // every agent that flagged this file:line
  agentAgreement?: 'confirmed' | 'partial' | 'single'; // confirmed=3+, partial=2, single=1
  needsReview?: boolean;                              // true when only 1 agent flagged this location
}

// ── Raw agent JSON output (before normalisation) ─────────────────────────────

export interface RawAgentFinding {
  file?: string;
  type: string;
  severity: string;
  line: number;
  snippet: string;
  reasoning: string;
  fix: string;
  cwe: string;
  confidence: number;
}

export interface RawAgentOutput {
  agent: string;
  findings: RawAgentFinding[];
}

// ── Agent run result ──────────────────────────────────────────────────────────

export interface AgentResult {
  agentId: AgentId;
  findings: Finding[];
  durationMs: number;
  status: "success" | "timeout" | "error";
  error?: string;
}

// ── Final scan result produced by Aggregator ─────────────────────────────────

export interface ScanResult {
  scanId: string;
  score: number;            // 0–100
  findings: Finding[];      // verified, deduplicated
  rejected: Array<{         // false positives removed
    finding: Finding;
    reason: string;
  }>;
  summary: string;          // one-sentence Aggregator summary
  severityCounts: Record<Severity, number>;
  agentStats: Record<AgentId, { count: number; durationMs: number; status: string }>;
  graph: KnowledgeGraph;
  durationMs: number;
  scannedFiles: number;
}

// ── Scan phases for status updates ───────────────────────────────────────────

export type ScanPhase =
  | "queued"
  | "graph_building"
  | "ast_parsing"          // new: AST + interprocedural chain analysis
  | "orchestrating"
  | "scanning"
  | "aggregating"
  | "done"
  | "error";

export interface ScanStatus {
  scanId: string;
  phase: ScanPhase;
  progress: number;         // 0–100
  partialFindings: Finding[];
  error?: string;
}
