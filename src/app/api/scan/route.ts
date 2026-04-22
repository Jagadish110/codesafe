// ─────────────────────────────────────────────────────────────────────────────
// src/app/api/scan/route.ts
// Unified proxy for:
//   1. JSON  → Gemini generateContent  (tool-use scan + chat)
//   2. FormData → multi-agent pipeline (file upload)
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { runPipeline } from "../../../../codesafe/lib/pipeline";
import type { FileContent, AgentResult, ScanPhase, Finding } from "../../../../codesafe/lib/types";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

// ── Helper: get Supabase admin client ────────────────────────────────────────
function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// ── Helper: verify Supabase Bearer token ─────────────────────────────────────
async function getUserFromToken(token: string) {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getUser(token);
  return data?.user ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/scan
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  // ── Auth — all branches require a valid Supabase session ──────────────────
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await getUserFromToken(token);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contentType = req.headers.get("content-type") ?? "";

  // ── Branch A: multipart/form-data → multi-agent pipeline ──────────────────
  if (contentType.includes("multipart/form-data")) {
    return handlePipeline(req, user);
  }

  // ── Branch B: application/json → Gemini proxy ─────────────────────────────
  return handleGemini(req);
}

// ─────────────────────────────────────────────────────────────────────────────
// Branch A — Multi-agent pipeline (FormData file upload)
// ─────────────────────────────────────────────────────────────────────────────
async function handlePipeline(req: NextRequest, user: { id: string; [key: string]: unknown }) {

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const VALID_SCAN_TYPES = ['web', 'mobile', 'api', 'infra'] as const;
  type ScanType = typeof VALID_SCAN_TYPES[number];

  const rawScanType = (formData.get("scanType") as string) ?? "web";
  if (!VALID_SCAN_TYPES.includes(rawScanType as ScanType)) {
    return NextResponse.json({ error: "Invalid scan type" }, { status: 400 });
  }
  const scanType = rawScanType as ScanType;

  const rawFiles = formData.getAll("files") as File[];

  if (!rawFiles.length) {
    return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
  }

  // Convert browser File objects → FileContent records
  const files: FileContent[] = await Promise.all(
    rawFiles.map(async (f) => {
      const text = await f.text();
      const filePath = f.name; // relative path preserved in the file name
      const ext = filePath.split(".").pop() ?? "";
      return {
        filePath,
        content: text,
        lineCount: text.split("\n").length,
        language: ext,
      } satisfies FileContent;
    })
  );

  const scanId = crypto.randomUUID();
  const sb = getSupabase();

  // Persist initial scan_graphs row so the dashboard can poll progress
  if (sb) {
    await sb.from("scan_graphs").upsert({
      id: scanId,
      user_id: user.id,
      status: "running",
      progress: 0,
      phase: "graph_building",
    });
  }

  // Run pipeline (non-blocking — respond immediately with scanId)
  runPipeline(
    files,
    scanId,
    async (phase: ScanPhase, progress: number) => {
      if (!sb) return;
      await sb.from("scan_graphs").update({ phase, progress }).eq("id", scanId);
    },
    async (agentResult: AgentResult) => {
      if (!sb || !agentResult.findings.length) return;
      const rows = agentResult.findings.map((f: Finding) => ({
        scan_id: scanId,
        agent_id: agentResult.agentId,
        file: f.file,
        line: f.line,
        type: f.type,
        severity: f.severity,
        snippet: f.snippet,
        reasoning: f.reasoning,
        fix: f.fix,
        cwe: f.cwe,
        confidence: f.confidence,
      }));
      await sb.from("scan_findings").insert(rows);
    }
  ).catch((err: Error) => {
    console.error("[Pipeline] Fatal error:", err?.message);
    if (sb) {
      sb.from("scan_graphs")
        .update({ status: "error", phase: "done", progress: 100 })
        .eq("id", scanId)
        .then(() => { });
    }
  });

  return NextResponse.json({ scanId, status: "started" });
}

// ─────────────────────────────────────────────────────────────────────────────
// Branch B — Gemini JSON proxy (tool-use scans + chat)
// ─────────────────────────────────────────────────────────────────────────────
async function handleGemini(req: NextRequest) {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.error("GOOGLE_API_KEY is not configured");
    return NextResponse.json(
      { error: "AI service is temporarily unavailable. Please try again later." },
      { status: 500 }
    );
  }

  let body: { provider?: string; endpoint?: string; payload?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Only Gemini/Google is supported
  const provider = body.provider ?? "google";
  if (provider !== "google") {
    return NextResponse.json(
      { error: `Provider "${provider}" is not supported. Use "google".` },
      { status: 400 }
    );
  }

  // endpoint default → latest flash model generateContent
  const model = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
  const endpoint = (body.endpoint as string) ?? `models/${model}:generateContent`;
  const url = `${GEMINI_BASE}/${endpoint}?key=${apiKey}`;

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Connection": "close" // Prevent socket hang due to keep-alive issues in node fetch
      },
      body: JSON.stringify(body.payload ?? {}),
      signal: AbortSignal.timeout(120000) // 120 second timeout
    } as RequestInit);
  } catch (err: unknown) {
    console.error("Gemini API error:", err);
    return NextResponse.json(
      { error: "Failed to reach AI service. Please try again later." },
      { status: 502 }
    );
  }

  const data = await upstream.json();

  if (!upstream.ok) {
    return NextResponse.json(data, { status: upstream.status });
  }

  return NextResponse.json(data);
}
