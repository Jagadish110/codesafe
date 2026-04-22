'use server';

import { createClient } from '@supabase/supabase-js';
import { headers } from 'next/headers';

// ── Supabase client (anon key — auth enforced via JWT passed in header) ────────
function getSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase environment variables are not configured.');
  }

  return createClient(supabaseUrl, supabaseAnonKey);
}

// ── Resolve the calling user from the Authorization header ────────────────────
// Server Actions don't have req/res — we read the header directly via next/headers.
async function getAuthenticatedUserId(): Promise<string | null> {
  try {
    const headersList = await headers();
    const authHeader = headersList.get('authorization') ?? '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) return null;

    const supabase = getSupabaseClient();
    const { data } = await supabase.auth.getUser(token);
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Fetch the knowledge graph row for a scan — REQUIRES ownership check.
 * userId is mandatory so this function can never be called without auth context.
 */
async function findGraphRow(supabase: any, scanId: string, userId: string) {
  const { data, error } = await supabase
    .from('scan_graphs')
    .select('graph_json, created_at')
    .eq('scan_id', scanId)
    .eq('user_id', userId)          // ← IDOR fix: only return rows owned by this user
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    // Log the real error server-side only — never expose DB error details to client
    console.error('[graph.ts] findGraphRow error:', error);
    throw new Error('Failed to fetch graph. Please try again later.');
  }

  return data;
}

/**
 * Fetch the knowledge graph for a specific scan.
 * Auth check runs first — unauthenticated calls are rejected immediately.
 */
export async function fetchScanGraph(scanId: string) {
  // ── Auth: verify caller identity before any DB access ──────────────────────
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return { error: 'Unauthorized' };
  }

  try {
    const supabase = getSupabaseClient();
    let graphRow = await findGraphRow(supabase, scanId, userId);

    if (!graphRow) {
      // Fallback: look up by scan_history row — also scoped to this user
      const { data: historyRow, error: historyError } = await supabase
        .from('scan_history')
        .select('report_data')
        .eq('id', scanId)
        .eq('user_id', userId)      // ← ownership check on fallback query too
        .maybeSingle();

      if (historyError) {
        console.error('[graph.ts] scan_history lookup error:', historyError);
      }

      if (!historyError && historyRow) {
        const reportData = typeof historyRow.report_data === 'string'
          ? JSON.parse(historyRow.report_data)
          : historyRow.report_data;

        const fallbackScanId = reportData?.scanId;
        if (fallbackScanId) {
          graphRow = await findGraphRow(supabase, fallbackScanId, userId);
        }
      }
    }

    if (!graphRow) {
      return { error: 'No knowledge graph found for this scan' };
    }

    // Parse the graph JSON
    const graph = typeof graphRow.graph_json === 'string'
      ? JSON.parse(graphRow.graph_json)
      : graphRow.graph_json;

    return {
      success: true,
      graph,
      createdAt: graphRow.created_at,
    };
  } catch (err: any) {
    // Log full error server-side, return generic message to client
    console.error('[graph.ts] fetchScanGraph exception:', err);
    return {
      error: 'Failed to load knowledge graph. Please try again later.',
    };
  }
}

/**
 * Get summary statistics about the knowledge graph.
 */
export async function getGraphStats(scanId: string) {
  console.log(`[getGraphStats] Fetching graph for scanId: ${scanId}`);
  try {
    const result = await fetchScanGraph(scanId);

    if (result.error) {
      console.log(`[getGraphStats] Error fetching graph: ${result.error}`);
      return result;
    }

    const graph = result.graph;
    const nodeValues = Object.values(graph.nodes || {}) as any[];
    const stats = {
      totalFiles: nodeValues.length,
      entryPoints: nodeValues.filter((node) => node.isEntryPoint).length,
      dependencies: (graph.edges || []).length,
      highRiskPaths: (graph.highRiskPaths || []).length,
      averageRiskScore: nodeValues.length > 0
        ? nodeValues.reduce((sum, node) => sum + (node?.riskScore || 0), 0) / nodeValues.length
        : 0,
    };

    console.log(`[getGraphStats] Stats:`, stats);

    return {
      success: true,
      stats,
      graph: result.graph,
    };
  } catch (err: any) {
    console.error('[getGraphStats] Exception:', err);
    return {
      error: 'Failed to calculate graph stats. Please try again later.',
    };
  }
}
