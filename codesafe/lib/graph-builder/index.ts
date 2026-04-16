// ─────────────────────────────────────────────────────────────────────────────
// lib/graph-builder/index.ts
// Static parser — zero LLM calls. Reads file structure, extracts imports/
// exports, builds knowledge graph, scores files by topology.
// ─────────────────────────────────────────────────────────────────────────────

import * as fs from "fs";
import * as path from "path";
import type {
  KnowledgeGraph,
  GraphNode,
  GraphEdge,
  FileContent,
  FileRiskType,
} from "../types";

// ── Supported extensions ──────────────────────────────────────────────────────

const SUPPORTED_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx",
  ".py", ".go", ".java", ".php",
  ".rb", ".cs", ".swift", ".kt", ".dart",
]);

const MAX_FILE_SIZE_KB = 500;

// ── Path-based risk classification ───────────────────────────────────────────

function classifyFile(filePath: string): FileRiskType {
  const normalized = filePath.toLowerCase().replace(/\\/g, "/");

  // ── Pass 1: Directory-path based classification ──────────────────────────
  if (
    normalized.includes("/routes/") ||
    normalized.includes("/api/") ||
    normalized.includes("/pages/api/") ||
    normalized.includes("/controllers/") ||
    normalized.includes("/endpoints/")
  ) return "entry";

  if (
    normalized.includes("/middleware/") ||
    normalized.includes("/interceptor")
  ) return "middleware";

  if (
    normalized.includes("/db/") ||
    normalized.includes("/database/") ||
    normalized.includes("/queries/") ||
    normalized.includes("/prisma/") ||
    normalized.includes("/models/") ||
    normalized.includes("repository")
  ) return "db";

  if (
    normalized.includes("auth") ||
    normalized.includes("session") ||
    normalized.includes("jwt") ||
    normalized.includes("oauth") ||
    normalized.includes("token") ||
    normalized.includes("permission") ||
    normalized.includes("rbac")
  ) return "auth";

  if (
    normalized.includes("crypto") ||
    normalized.includes("cipher") ||
    normalized.includes("hash") ||
    normalized.includes("encrypt") ||
    normalized.includes("bcrypt") ||
    normalized.includes("argon")
  ) return "crypto";

  if (
    normalized.includes("config") ||
    normalized.includes("constants") ||
    normalized.includes("keys") ||
    normalized.includes("secrets") ||
    normalized.includes(".env") ||
    normalized.endsWith("pubspec.yaml") ||
    normalized.endsWith("pubspec.yml")
  ) return "config";

  // Dart/Flutter specific patterns
  if (
    normalized.includes("/routes/") ||
    normalized.includes("/screens/") ||
    normalized.includes("/pages/") ||
    normalized.includes("/views/") ||
    normalized.includes("main.dart")
  ) return "entry";

  if (
    normalized.includes("/services/") ||
    normalized.includes("/repository") ||
    normalized.includes("/data/") ||
    normalized.includes("_repository") ||
    normalized.includes("_service")
  ) return "db";

  if (
    normalized.includes("/providers/") ||
    normalized.includes("/bloc/") ||
    normalized.includes("/cubit/")
  ) return "middleware";

  // ── Pass 2: Filename-stem based classification ───────────────────────────
  // Catches flat uploads where files aren't in conventional directories.
  const basename = normalized.split("/").pop() ?? "";
  const stem = basename.replace(/\.(ts|tsx|js|jsx|dart|swift|kt|java|py|go|rb|cs|php)$/, "");

  // Payment / billing / financial flows → "auth" (payment = auth-critical)
  if (/\b(payment|billing|checkout|stripe|subscription|invoice|wallet|purchase|order)\b/.test(stem))
    return "auth";

  // User-facing screens / dashboards → "entry"
  if (/\b(dashboard|admin|panel|settings|account|profile|onboard|signup|register|login|home)\b/.test(stem))
    return "entry";

  // Notification / communication / webhooks → "entry" (external I/O)
  if (/\b(notification|webhook|email|sms|push|callback|handler|listener|worker|cron|job)\b/.test(stem))
    return "entry";

  // Data / storage / upload handling → "db"
  if (/\b(upload|storage|s3|file|image|media|cache|store|sync|migration|seed|schema)\b/.test(stem))
    return "db";

  // Network / API client / HTTP service → "entry"
  if (/\b(api|client|http|fetch|request|service|network|socket|graphql|grpc)\b/.test(stem))
    return "entry";

  // Validation / sanitization → "middleware"
  if (/\b(validate|sanitize|guard|filter|interceptor|pipe|middleware)\b/.test(stem))
    return "middleware";

  return "util";
}

// ── Import extraction per language ───────────────────────────────────────────

function extractImports(content: string, filePath: string): string[] {
  const ext = path.extname(filePath);
  const imports: string[] = [];

  if ([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".vue", ".svelte"].includes(ext)) {
    // ES modules: import ... from '...'
    const esImports = content.matchAll(
      /import\s+(?:.*?\s+from\s+)?['"]([^'"]+)['"]/g
    );
    for (const match of esImports) imports.push(match[1]);

    // CommonJS: require('...')
    const cjsImports = content.matchAll(/require\(['"]([^'"]+)['"]\)/g);
    for (const match of cjsImports) imports.push(match[1]);

    // Dynamic imports: import('...')
    const dynImports = content.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g);
    for (const match of dynImports) imports.push(match[1]);

    // Re-exports: export ... from '...'
    const reExportFrom = content.matchAll(/export\s+.*?\s+from\s+['"]([^'"]+)['"]/g);
    for (const match of reExportFrom) imports.push(match[1]);
  }

  if (ext === ".py") {
    const pyImports = content.matchAll(/^(?:from|import)\s+([\w.]+)/gm);
    for (const match of pyImports) imports.push(match[1]);
  }

  if (ext === ".go") {
    const goImports = content.matchAll(/"([^"]+)"/g);
    for (const match of goImports) imports.push(match[1]);
  }

  if (ext === ".java" || ext === ".kt") {
    const jvmImports = content.matchAll(/^import\s+([\w.]+);/gm);
    for (const match of jvmImports) imports.push(match[1]);
  }

  if (ext === ".dart") {
    const dartImports = content.matchAll(/^import\s+['"]([^'"]+)['"]/gm);
    for (const match of dartImports) imports.push(match[1]);
    const dartExports = content.matchAll(/^export\s+['"]([^'"]+)['"]/gm);
    for (const match of dartExports) imports.push(match[1]);
    const dartParts = content.matchAll(/^part\s+['"]([^'"]+)['"]/gm);
    for (const match of dartParts) imports.push(match[1]);
  }

  if (ext === ".php") {
    const phpImports = content.matchAll(
      /(?:require|include)(?:_once)?\s*\(?['"]([^'"]+)['"]\)?/g
    );
    for (const match of phpImports) imports.push(match[1]);
  }

  if ([".css", ".scss", ".sass"].includes(ext)) {
    const cssImports = content.matchAll(/@import\s+['"]([^'"]+)['"]/g);
    for (const match of cssImports) imports.push(match[1]);
  }

  if ([".html", ".htm"].includes(ext)) {
    // <script src="..."> and <link href="...">
    const scriptSrc = content.matchAll(/src=['"]([^'"]+\.(?:js|ts|jsx|tsx))['"]/g);
    for (const match of scriptSrc) imports.push(match[1]);
  }

  return [...new Set(imports)];
}

function extractExports(content: string, filePath: string): string[] {
  const ext = path.extname(filePath);
  const exports: string[] = [];

  if ([".ts", ".tsx", ".js", ".jsx"].includes(ext)) {
    const named = content.matchAll(/export\s+(?:const|function|class|type|interface)\s+(\w+)/g);
    for (const match of named) exports.push(match[1]);

    const reExports = content.matchAll(/export\s*\{([^}]+)\}/g);
    for (const match of reExports) {
      match[1].split(",").forEach((e) => exports.push(e.trim().split(/\s+as\s+/)[0]));
    }
  }

  return [...new Set(exports)];
}

// ── Detect if a file is an HTTP entry point ───────────────────────────────────

function isEntryPoint(content: string, filePath: string): boolean {
  const type = classifyFile(filePath);
  if (type === "entry") return true;

  // Pattern matching for route handlers
  const entryPatterns = [
    /app\.(get|post|put|delete|patch)\s*\(/,
    /router\.(get|post|put|delete|patch)\s*\(/,
    /export\s+(?:default\s+)?(?:async\s+)?function\s+(?:GET|POST|PUT|DELETE|PATCH)/,
    /@(Get|Post|Put|Delete|Patch|RequestMapping)\s*\(/,  // Java Spring / NestJS
    /def\s+(?:get|post|put|delete|patch)_/,             // Python Flask
    /\[HttpGet\]|\[HttpPost\]/,                          // C# ASP.NET
    /void\s+main\s*\(\s*\)/,                             // Dart entry point
    /class\s+\w+\s+extends\s+StatefulWidget/,           // Flutter widget
    /class\s+\w+\s+extends\s+StatelessWidget/,          // Flutter widget
  ];

  return entryPatterns.some((p) => p.test(content));
}

// ── Hardcoded secret detection for risk scoring ───────────────────────────────

const SECRET_PATTERNS = [
  /['"][A-Za-z0-9_\-]{20,}['"]/,          // high-entropy string
  /(?:api|secret|key|token|password)\s*=\s*['"][^'"]{8,}['"]/i,
  /sk-[a-zA-Z0-9]{20,}/,                   // OpenAI-style keys
  /AKIA[0-9A-Z]{16}/,                       // AWS access key
];

function containsHardcodedSecrets(content: string): boolean {
  return SECRET_PATTERNS.some((p) => p.test(content));
}

// ── Compute topology-based risk score ────────────────────────────────────────

function computeRiskScore(
  node: Omit<GraphNode, "riskScore">,
  graph: Partial<KnowledgeGraph>
): number {
  let score = 0;

  // Base score from file type
  const typeScores: Record<FileRiskType, number> = {
    entry: 40,
    middleware: 30,
    db: 35,
    auth: 35,
    crypto: 25,
    config: 45,
    util: 10,
    unknown: 5,
  };
  score += typeScores[node.type] ?? 5;

  // Bonus for being an entry point
  if (node.isEntryPoint) score += 20;

  // Bonus for incoming edges (many files depend on this)
  const incomingEdges = (graph.edges ?? []).filter(
    (e) => e.to === node.filePath
  ).length;
  score += Math.min(incomingEdges * 5, 20);

  // Bonus for outgoing edges to DB files
  const outgoingToDb = (graph.edges ?? []).filter(
    (e) =>
      e.from === node.filePath &&
      classifyFile(e.to) === "db"
  ).length;
  score += outgoingToDb * 10;

  return Math.min(score, 100);
}

// ── Resolve relative import to absolute path ─────────────────────────────────

function resolveImport(fromFile: string, importPath: string, knownPaths: Set<string>): string | null {
  // Skip node_modules and absolute packages
  if (!importPath.startsWith(".")) return null;

  // Normalize fromFile to forward slashes
  const normalFrom = fromFile.replace(/\\/g, "/");
  const dir = normalFrom.substring(0, normalFrom.lastIndexOf("/")) || ".";

  // Normalize the import path using simple string joining (NOT path.resolve which makes absolute)
  let parts = (dir + "/" + importPath).split("/");
  let resolved: string[] = [];
  for (const part of parts) {
    if (part === "..") resolved.pop();
    else if (part !== "." && part !== "") resolved.push(part);
  }
  const resolvedPath = resolved.join("/");

  // Try with common extensions against the known file set
  const extensions = ["", ".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.js", "/index.tsx"];
  for (const ext of extensions) {
    const candidate = resolvedPath + ext;
    if (knownPaths.has(candidate)) {
      return candidate;
    }
  }

  // Also try without the first directory segment (e.g., uploaded files may have "project/" prefix or not)
  const withoutFirst = resolved.slice(1).join("/");
  if (withoutFirst) {
    for (const ext of extensions) {
      const candidate = withoutFirst + ext;
      if (knownPaths.has(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

// ── Find high-risk paths using DFS ───────────────────────────────────────────

function findHighRiskPaths(graph: KnowledgeGraph): string[][] {
  const paths: string[][] = [];

  // Build adjacency list
  const adj: Record<string, string[]> = {};
  for (const edge of graph.edges) {
    if (!adj[edge.from]) adj[edge.from] = [];
    adj[edge.from].push(edge.to);
  }

  // DFS from each entry point to find paths ending at DB/crypto/config
  function dfs(current: string, visited: Set<string>, currentPath: string[]) {
    if (visited.has(current)) return;
    visited.add(current);
    currentPath.push(current);

    const node = graph.nodes[current];
    const isHighValueSink =
      node && ["db", "crypto", "config"].includes(node.type);

    if (isHighValueSink && currentPath.length > 1) {
      paths.push([...currentPath]);
    }

    for (const neighbor of adj[current] ?? []) {
      dfs(neighbor, new Set(visited), [...currentPath]);
    }
  }

  for (const entryPoint of graph.entryPoints) {
    dfs(entryPoint, new Set(), []);
  }

  // Deduplicate and keep only paths length >= 2
  return paths
    .filter((p) => p.length >= 2)
    .slice(0, 20); // cap at 20 paths for prompt size
}

// ── Read files from disk ─────────────────────────────────────────────────────

export function readFilesFromDisk(rootDir: string): FileContent[] {
  const files: FileContent[] = [];

  function walk(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      // Skip common non-code directories
      if (
        entry.isDirectory() &&
        !["node_modules", ".git", ".next", "dist", "build", ".turbo"].includes(
          entry.name
        )
      ) {
        walk(fullPath);
        continue;
      }

      if (!entry.isFile()) continue;

      const ext = path.extname(entry.name);
      if (!SUPPORTED_EXTENSIONS.has(ext)) continue;

      const stat = fs.statSync(fullPath);
      if (stat.size > MAX_FILE_SIZE_KB * 1024) continue;

      const content = fs.readFileSync(fullPath, "utf-8");
      const relativePath = path.relative(rootDir, fullPath).replace(/\\/g, "/");

      files.push({
        filePath: relativePath,
        content,
        language: ext.replace(".", ""),
        lineCount: content.split("\n").length,
      });
    }
  }

  walk(rootDir);
  return files;
}

// ── Main graph builder ────────────────────────────────────────────────────────

export function buildKnowledgeGraph(files: FileContent[]): KnowledgeGraph {
  const nodes: Record<string, GraphNode> = {};
  const edges: GraphEdge[] = [];

  // Build file path set for resolving relative imports
  const filePathSet = new Set(files.map((f) => f.filePath));

  // Debug: log what file paths look like
  console.log(`[Graph] Building graph from ${files.length} files`);
  console.log(`[Graph] Sample file paths:`, files.slice(0, 5).map(f => f.filePath));

  // First pass — build all nodes
  for (const file of files) {
    const imports = extractImports(file.content, file.filePath);
    const exports = extractExports(file.content, file.filePath);
    const type = classifyFile(file.filePath);
    const entryPoint = isEntryPoint(file.content, file.filePath);

    nodes[file.filePath] = {
      filePath: file.filePath,
      type,
      imports,
      exports,
      isEntryPoint: entryPoint,
      riskScore: 0,     // computed in second pass
      lineCount: file.lineCount,
    };
  }

  // Debug: log import counts per file
  const filesWithImports = Object.values(nodes).filter(n => n.imports.length > 0);
  console.log(`[Graph] Files with imports: ${filesWithImports.length}/${files.length}`);
  if (filesWithImports.length > 0) {
    const sample = filesWithImports[0];
    console.log(`[Graph] Sample: ${sample.filePath} imports: [${sample.imports.slice(0, 5).join(', ')}]`);
  }

  // Second pass — build edges from resolved imports
  let totalImports = 0;
  let resolvedCount = 0;
  let fuzzyCount = 0;
  let skippedExternal = 0;
  const unresolvedSamples: string[] = [];

  // Helper: try to fuzzy match an import path against known files
  function fuzzyResolve(importPath: string): string | null {
    // Strip leading alias prefixes: @/, ~/, #/, src/
    const stripped = importPath
      .replace(/^@\//, "")
      .replace(/^~\//, "")
      .replace(/^#\//, "")
      .replace(/^src\//, "");

    const candidates = [importPath, stripped];
    const extensions = ["", ".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx", "/index.js"];

    for (const candidate of candidates) {
      for (const ext of extensions) {
        const target = candidate + ext;
        // Direct match
        if (filePathSet.has(target)) return target;
        // Ends-with match (handles project-name/ prefix)
        const match = [...filePathSet].find(p =>
          p.endsWith("/" + target) || p === target
        );
        if (match) return match;
      }
    }

    // Last resort: match on just the filename
    const basename = importPath.split("/").pop();
    if (basename) {
      for (const ext of extensions) {
        const target = basename + ext;
        const match = [...filePathSet].find(p => p.endsWith("/" + target));
        if (match) return match;
      }
    }

    return null;
  }

  for (const file of files) {
    const imports = nodes[file.filePath].imports;
    for (const imp of imports) {
      totalImports++;

      // Skip obvious external packages (node_modules, built-ins)
      if (!imp.startsWith(".") && !imp.startsWith("@/") && !imp.startsWith("~/") && !imp.startsWith("#/") && !imp.startsWith("src/")) {
        // Could be a package like "react", "next/server", "express", etc.
        skippedExternal++;
        continue;
      }

      // Try resolving relative imports to known files
      let resolved: string | null = null;

      if (imp.startsWith(".")) {
        resolved = resolveImport(file.filePath, imp, filePathSet);
      }

      // If relative resolution fails or it's an alias, try fuzzy
      if (!resolved) {
        const aliasPath = imp.startsWith(".")
          ? imp  // already tried relative, now try fuzzy
          : imp; // alias like @/lib/auth
        resolved = fuzzyResolve(aliasPath);
      }

      if (resolved) {
        edges.push({ from: file.filePath, to: resolved });
        if (imp.startsWith(".")) resolvedCount++;
        else fuzzyCount++;
      } else if (unresolvedSamples.length < 5) {
        unresolvedSamples.push(`${file.filePath} → ${imp}`);
      }
    }
  }
  console.log(`[Graph] Import resolution: ${totalImports} total, ${skippedExternal} external, ${resolvedCount} resolved, ${fuzzyCount} fuzzy = ${edges.length} edges`);
  if (unresolvedSamples.length > 0) {
    console.log(`[Graph] Unresolved samples:`, unresolvedSamples);
  }

  const partialGraph: Partial<KnowledgeGraph> = { edges };

  // Third pass — compute risk scores with topology context
  for (const filePath of Object.keys(nodes)) {
    nodes[filePath].riskScore = computeRiskScore(nodes[filePath], partialGraph);
  }

  const entryPoints = Object.values(nodes)
    .filter((n) => n.isEntryPoint)
    .map((n) => n.filePath);

  const graph: KnowledgeGraph = {
    nodes,
    edges,
    entryPoints,
    highRiskPaths: [],
  };

  graph.highRiskPaths = findHighRiskPaths(graph);

  return graph;
}

// ── Generate a human-readable graph context summary for agent prompts ─────────

export function generateGraphContext(
  graph: KnowledgeGraph,
  relevantFiles: string[]
): string {
  const lines: string[] = ["=== KNOWLEDGE GRAPH CONTEXT ===\n"];

  // Entry points
  if (graph.entryPoints.length > 0) {
    lines.push(`Entry points (receive external HTTP input):`);
    graph.entryPoints.forEach((ep) => lines.push(`  → ${ep}`));
    lines.push("");
  }

  // High-risk paths involving relevant files
  const relevantPaths = graph.highRiskPaths.filter((path) =>
    path.some((f) => relevantFiles.includes(f))
  );

  if (relevantPaths.length > 0) {
    lines.push(`High-risk data flow paths:`);
    relevantPaths.forEach((p) => {
      lines.push(`  ${p.join(" → ")}`);
    });
    lines.push("");
  }

  // Incoming connections to relevant files
  lines.push(`File connections for your assigned files:`);
  for (const filePath of relevantFiles) {
    const incoming = graph.edges
      .filter((e) => e.to === filePath)
      .map((e) => e.from);
    const outgoing = graph.edges
      .filter((e) => e.from === filePath)
      .map((e) => e.to);

    if (incoming.length > 0 || outgoing.length > 0) {
      lines.push(`  ${filePath}:`);
      if (incoming.length > 0)
        lines.push(`    ← receives data from: ${incoming.join(", ")}`);
      if (outgoing.length > 0)
        lines.push(`    → sends data to: ${outgoing.join(", ")}`);
    }
  }

  lines.push("\n=== END CONTEXT ===");
  return lines.join("\n");
}
