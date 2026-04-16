// ─────────────────────────────────────────────────────────────────────────────
// hooks/useScan.ts
// Central hook — manages the entire scan lifecycle:
// upload → POST /api/scan → Supabase Realtime subscription → live findings
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@supabase/supabase-js";
import type { Finding, ScanPhase, Severity } from "../../codesafe/lib/types";

// ── Supabase browser client ───────────────────────────────────────────────────

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RoutingManifest {
  route_count: number;
  agent_distributions: {
    sleuth?: number;
    guardian?: number;
    hacker?: number;
    auditor?: number;
  };
  skipped_files?: string[];
  orchestration_time_ms?: number;
}

export interface ScanState {
  scanId:              string | null;
  phase:               ScanPhase;
  progress:            number;
  score:               number | null;
  findings:            Finding[];
  severityCounts:      Record<Severity, number>;
  summary:             string;
  fileCount:           number;
  scannedFiles:        number;
  durationMs:          number | null;
  error:               string | null;
  routingManifest:     RoutingManifest | null;
}

export interface UseScanReturn {
  state:       ScanState;
  isScanning:  boolean;
  isDone:      boolean;
  startScan:   (files: File[]) => Promise<void>;
  reset:       () => void;
}

const PHASE_LABELS: Record<ScanPhase, string> = {
  queued:        "Queued…",
  graph_building:"Building knowledge graph…",
  ast_parsing:   "Extracting data flows…",
  orchestrating: "Orchestrator routing files…",
  scanning:      "Agents scanning in parallel…",
  aggregating:   "Aggregator merging findings…",
  done:          "Scan complete",
  error:         "Scan failed",
};

export { PHASE_LABELS };

const INITIAL_STATE: ScanState = {
  scanId:          null,
  phase:           "queued",
  progress:        0,
  score:           null,
  findings:        [],
  severityCounts:  { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 },
  summary:         "",
  fileCount:       0,
  scannedFiles:    0,
  durationMs:      null,
  error:           null,
  routingManifest: null,
};

const SEVERITY_ORDER: Record<Severity, number> = {
  CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3,
};

// ── Main hook ─────────────────────────────────────────────────────────────────

export function useScan(authToken: string | null): UseScanReturn {
  const [state, setState]   = useState<ScanState>(INITIAL_STATE);
  const channelRef           = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const scanIdRef            = useRef<string | null>(null);

  // ── Cleanup Realtime subscription ──────────────────────────────────────────
  const unsubscribe = useCallback(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  }, []);

  useEffect(() => () => unsubscribe(), [unsubscribe]);

  // ── Subscribe to Supabase Realtime for this scan ───────────────────────────
  const subscribeToScan = useCallback((scanId: string) => {
    unsubscribe();

    const channel = supabase
      .channel(`scan:${scanId}`)

      // Listen for scan row updates (phase, progress, score, routing_manifest)
      .on(
        "postgres_changes",
        {
          event:  "UPDATE",
          schema: "public",
          table:  "scans",
          filter: `id=eq.${scanId}`,
        },
        (payload) => {
          const row = payload.new as any;
          setState((prev) => ({
            ...prev,
            phase:            row.phase              ?? prev.phase,
            progress:         row.progress           ?? prev.progress,
            score:            row.score              ?? prev.score,
            summary:          row.summary            ?? prev.summary,
            scannedFiles:     row.scanned_files      ?? prev.scannedFiles,
            durationMs:       row.duration_ms        ?? prev.durationMs,
            severityCounts:   row.severity_counts    ?? prev.severityCounts,
            error:            row.error_message      ?? prev.error,
            routingManifest:  row.routing_manifest   ?? prev.routingManifest,
          }));
        }
      )

      // Listen for new findings streaming in as agents complete
      .on(
        "postgres_changes",
        {
          event:  "INSERT",
          schema: "public",
          table:  "scan_findings",
          filter: `scan_id=eq.${scanId}`,
        },
        (payload) => {
          const row = payload.new as any;
          if (row.rejected) return;

          const finding: Finding = {
            id:         row.id,
            agentId:    row.agent_id,
            file:       row.file,
            line:       row.line,
            type:       row.type,
            severity:   row.severity,
            snippet:    row.snippet,
            reasoning:  row.reasoning,
            fix:        row.fix,
            cwe:        row.cwe,
            confidence: row.confidence,
            crossFile:  row.cross_file ?? undefined,
          };

          setState((prev) => {
            // Deduplicate on client side too
            const exists = prev.findings.some((f) => f.id === finding.id);
            if (exists) return prev;

            const updated = [...prev.findings, finding].sort(
              (a, b) =>
                (SEVERITY_ORDER[a.severity] ?? 4) -
                (SEVERITY_ORDER[b.severity] ?? 4)
            );

            const counts = { ...prev.severityCounts };
            counts[finding.severity] = (counts[finding.severity] ?? 0) + 1;

            return { ...prev, findings: updated, severityCounts: counts };
          });
        }
      )

      // Listen for finding updates (aggregator cross-file enrichment)
      .on(
        "postgres_changes",
        {
          event:  "UPDATE",
          schema: "public",
          table:  "scan_findings",
          filter: `scan_id=eq.${scanId}`,
        },
        (payload) => {
          const row = payload.new as any;

          // If aggregator rejected this finding, remove it from UI
          if (row.rejected) {
            setState((prev) => ({
              ...prev,
              findings: prev.findings.filter((f) => f.id !== row.id),
            }));
            return;
          }

          // Apply cross-file enrichment from aggregator
          setState((prev) => ({
            ...prev,
            findings: prev.findings.map((f) =>
              f.id === row.id
                ? {
                    ...f,
                    severity:  row.severity,
                    reasoning: row.reasoning,
                    crossFile: row.cross_file ?? f.crossFile,
                  }
                : f
            ),
          }));
        }
      )

      .subscribe();

    channelRef.current = channel;
  }, [unsubscribe]);

  // ── Start scan ────────────────────────────────────────────────────────────
  const startScan = useCallback(async (files: File[]) => {
    // Reset state
    setState({ ...INITIAL_STATE, fileCount: files.length });

    // Build form data
    const formData = new FormData();
    for (const file of files) {
      formData.append("files", file);
    }

    try {
      const res = await fetch("/api/scan", {
        method:  "POST",
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
        body:    formData,
      });

      if (!res.ok) {
        const err = await res.json();
        setState((prev) => ({
          ...prev,
          phase: "error",
          error: err.error ?? "Scan failed to start",
        }));
        return;
      }

      const { scanId } = await res.json();
      scanIdRef.current = scanId;

      setState((prev) => ({
        ...prev,
        scanId,
        phase:    "queued",
        progress: 5,
      }));

      // Subscribe to Realtime — findings stream in as agents complete
      subscribeToScan(scanId);

    } catch (err: any) {
      setState((prev) => ({
        ...prev,
        phase: "error",
        error: err?.message ?? "Network error",
      }));
    }
  }, [authToken, subscribeToScan]);

  // ── Reset ─────────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    unsubscribe();
    scanIdRef.current = null;
    setState(INITIAL_STATE);
  }, [unsubscribe]);

  return {
    state,
    isScanning: ["queued","graph_building","ast_parsing","orchestrating","scanning","aggregating"].includes(state.phase),
    isDone:     state.phase === "done",
    startScan,
    reset,
  };
}
