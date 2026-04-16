// ─────────────────────────────────────────────────────────────────────────────
// lib/agents/runner.ts
// Shared agent runner — one function, reused by all four specialist agents.
// Uses Google Gemini API for inference.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  AgentId,
  AgentResult,
  AgentRoute,
  Finding,
  RawAgentOutput,
  RawAgentFinding,
  Severity,
} from "../types";

const AGENT_TIMEOUT_MS = 120_000;    // 2 min — 503s can take time to resolve
const MIN_CONFIDENCE_DEFAULT = 70;    // findings below this are discarded
const AGENT_CONFIDENCE_OVERRIDES: Partial<Record<AgentId, number>> = {
  sentinel: 55,   // lower threshold for sentinel — it catches borderline AI patterns that are worth surfacing
};
const MAX_RETRIES = 3;   // 3 retries ≈ 42s of backoff (6+12+24), leaves ~78s for actual call

// ── Mobile scan context — appended to every agent prompt for mobile scans ────────
// Informs agents of mobile-specific vulnerability patterns without duplicating
// the full prompt. Agents apply this on top of their web domain knowledge.

const MOBILE_CONTEXT_ADDENDUM = `

=== MOBILE APP SCAN CONTEXT ===
These files are from a MOBILE application (Flutter/Dart, Android/Kotlin/Java, iOS/Swift, or React Native).
In addition to your standard domain checks, also look for these mobile-specific patterns within your domain:

For ALL agents:
- Insecure local data storage: sensitive data (tokens, PII, passwords) stored in SharedPreferences, NSUserDefaults, AsyncStorage, or plain files instead of Keystore/Keychain/FlutterSecureStorage
- Cleartext traffic: HTTP (not HTTPS) URLs in production code, android:usesCleartextTraffic="true" in AndroidManifest.xml, NSAppTransportSecurity exceptions in Info.plist
- Debug builds / flags committed: BuildConfig.DEBUG checks bypassed, android:debuggable="true" in manifest, release builds with debug symbols

For SLEUTH (secrets in mobile):
- Hardcoded API keys/tokens in Dart/Kotlin/Swift source or strings.xml / .plist files
- Google Maps API keys or Firebase config keys hardcoded in source rather than build-time injection
- Private keys embedded in the app bundle

For GUARDIAN (auth in mobile):
- Deep link / URI scheme hijacking: intent filters or URL scheme handlers that process external data without origin validation
- Exported Android components (Activity, Service, BroadcastReceiver) with android:exported="true" and no permission check
- Biometric auth bypassable with fallback PIN that is not rate-limited
- Missing certificate pinning on production API calls

For HACKER (injection in mobile):
- WebView with JavaScript enabled loading untrusted URLs (addJavascriptInterface exposure)
- SQL injection in local SQLite queries using string concatenation
- Intent injection: user-controlled data placed into Intent extras without validation

For AUDITOR (crypto in mobile):
- Symmetric keys stored alongside encrypted data in SharedPreferences
- IV reuse in AES-CBC encryption in local databases
- Weak random used for UUID generation or session tokens on mobile

Apply your normal confidence thresholds. Mobile findings must still pass the 4-question chain-of-thought gate.
=== END MOBILE CONTEXT ===`;


// ── Build the user message sent to every specialist agent ─────────────────────

function buildUserMessage(route: AgentRoute): string {
  const fileBlocks = route.files
    .map(
      (f) =>
        `=== FILE: ${f.filePath} (${f.lineCount} lines, ${f.language}) ===\n\`\`\`${f.language}\n${f.content}\n\`\`\``
    )
    .join("\n\n");

  let message = `${route.graphContext}\n\n${fileBlocks}`;

  if (route.astContext) {
    message += `\n\n${route.astContext.findingsBlock}\n\n${route.astContext.chainsBlock}`;
  }

  message += `\n\nScan the files above for vulnerabilities in YOUR domain only.`;
  return message;
}

// ── Validate and normalise severity ──────────────────────────────────────────

function normaliseSeverity(raw: string): Severity {
  const upper = (raw ?? "").toUpperCase();
  if (["CRITICAL", "HIGH", "MEDIUM", "LOW"].includes(upper))
    return upper as Severity;
  return "LOW";
}

// ── Parse raw agent JSON output into Finding[] ────────────────────────────────

function parseFindings(
  raw: string,
  agentId: AgentId,
  route: AgentRoute
): Finding[] {
  const cleaned = raw
    .trim()
    .replace(/^```json\s*|^```\s*|```\s*$/gm, "")
    .trim();

  let parsed: RawAgentOutput;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Try to extract JSON from the response
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch {
        console.error(`[Agent ${agentId}] Could not parse JSON output`);
        return [];
      }
    } else {
      console.error(`[Agent ${agentId}] No JSON found in output`);
      return [];
    }
  }

  if (!Array.isArray(parsed.findings)) return [];

  // Log findings dropped by confidence filter for debugging
  const minConfidence = AGENT_CONFIDENCE_OVERRIDES[agentId] ?? MIN_CONFIDENCE_DEFAULT;
  const validFindings = parsed.findings.filter(
    (f: RawAgentFinding) => f.type && f.severity && f.reasoning
  );
  const droppedByConfidence = validFindings.filter(
    (f: RawAgentFinding) => (f.confidence ?? 100) < minConfidence
  );
  if (droppedByConfidence.length > 0) {
    console.log(
      `[Agent ${agentId}] Dropped ${droppedByConfidence.length} finding(s) below confidence threshold (${minConfidence}):`,
      droppedByConfidence.map((f: RawAgentFinding) => `${f.type} (confidence: ${f.confidence})`)
    );
  }

  return validFindings
    .filter(
      (f: RawAgentFinding) =>
        (f.confidence ?? 100) >= minConfidence
    )
    .map((f: RawAgentFinding & { incident?: string }, index: number) => ({
      id: `${agentId}-${route.files[0]?.filePath ?? "unknown"}-${index}`,
      agentId,
      file: f.file ?? route.files[0]?.filePath ?? "unknown",
      line: f.line ?? 0,
      type: f.type,
      severity: normaliseSeverity(f.severity),
      snippet: f.snippet ?? "",
      reasoning: f.reasoning,
      fix: f.fix ?? "",
      cwe: f.cwe ?? "",
      confidence: f.confidence ?? 80,
      // Operator-specific: real incident this pattern prevented
      ...(f.incident ? { incident: f.incident } : {}),
    }));
}

// ── Timeout wrapper ───────────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Agent timed out after ${ms}ms`)), ms)
    ),
  ]);
}

// ── Retry with exponential backoff for rate limit / overload errors ───────────
// Retries on: 429 (rate limit), 503 (model overloaded), 502 (bad gateway)
// Backoff: 2^attempt * 1000ms + jitter, capped at 30s per wait

async function callWithRetry(
  fn: () => Promise<any>,
  retries = MAX_RETRIES
): Promise<any> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const msg = err?.message ?? "";

      const isRetryable =
        // Explicit status codes attached by callGemini
        err?.statusCode === 429 ||
        err?.statusCode === 503 ||
        err?.statusCode === 502 ||
        // Fall back to parsing the message string
        msg.includes("429") ||
        msg.includes("503") ||
        msg.includes("502") ||
        msg.includes("RESOURCE_EXHAUSTED") ||
        msg.includes("UNAVAILABLE") ||
        msg.includes("high demand") ||
        msg.includes("overloaded");

      if (isRetryable && attempt < retries) {
        // Longer base for 503 (model busy) vs 429 (quota)
        const is503 = msg.includes("503") || msg.includes("UNAVAILABLE") || msg.includes("high demand");
        const baseMs = is503 ? 6000 : 1000;
        const delay = Math.min(Math.pow(2, attempt) * baseMs + Math.random() * 1000, 30_000);
        console.log(
          `[Agent] Retryable error (${err?.statusCode ?? msg.slice(0, 40)}), ` +
          `waiting ${Math.round(delay / 1000)}s before attempt ${attempt + 2}/${retries + 1}`
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }

  throw lastError;
}

// ── Call Gemini API ───────────────────────────────────────────────────────────
// model is passed in by each agent (resolved from its own env var or the shared default)

async function callGemini(
  systemPrompt: string,
  userMessage: string,
  model: string
): Promise<string> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_API_KEY is not set");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
      contents: [
        { role: "user", parts: [{ text: userMessage }] },
      ],
      generationConfig: {
        maxOutputTokens: 4096,
        temperature: 0.1,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    // Attach numeric status code to error so callWithRetry can pattern-match without string parsing
    const err = new Error(`Gemini API error ${response.status}: ${errorText}`) as any;
    err.statusCode = response.status;
    throw err;
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts
    ?.map((p: any) => p.text)
    .join("") || "";

  return text.trim();
}

// ── Core agent runner ─────────────────────────────────────────────────────────
// All agents share one model defined by GEMINI_MODEL in .env.
// Falls back to gemini-2.0-flash if the env var is not set.

const GEMINI_FALLBACK_MODEL = "gemini-2.0-flash";

export async function runAgent(
  agentId: AgentId,
  systemPrompt: string,
  route: AgentRoute
): Promise<AgentResult> {
  const start = Date.now();

  // Read shared model from env — change GEMINI_MODEL in .env to switch all agents at once
  const model = process.env.GEMINI_MODEL ?? GEMINI_FALLBACK_MODEL;

  if (route.files.length === 0) {
    return {
      agentId,
      findings: [],
      durationMs: 0,
      status: "success",
    };
  }

  // Inject mobile context addendum when scanning mobile projects
  const effectivePrompt = route.scanType === "mobile"
    ? systemPrompt + MOBILE_CONTEXT_ADDENDUM
    : systemPrompt;

  console.log(`[Agent ${agentId}] Starting scan of ${route.files.length} files (model=${model}, scanType=${route.scanType ?? 'web'})`);

  try {
    const rawText = await withTimeout(
      callWithRetry(() =>
        callGemini(effectivePrompt, buildUserMessage(route), model)
      ),
      AGENT_TIMEOUT_MS
    );

    const findings = parseFindings(rawText, agentId, route);
    console.log(`[Agent ${agentId}] Completed: ${findings.length} findings in ${Date.now() - start}ms`);

    return {
      agentId,
      findings,
      durationMs: Date.now() - start,
      status: "success",
    };
  } catch (err: any) {
    const isTimeout = err?.message?.includes("timed out");
    console.error(`[Agent ${agentId}] ${isTimeout ? "Timed out" : "Error"}: ${err?.message}`);

    return {
      agentId,
      findings: [],
      durationMs: Date.now() - start,
      status: isTimeout ? "timeout" : "error",
      error: err?.message ?? "Unknown error",
    };
  }
}
