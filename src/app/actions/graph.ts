'use server';

import { createClient } from '@supabase/supabase-js';

function getSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Supabase environment variables are required for Knowledge Graph actions. ' +
      'Set SUPABASE_URL and SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY) in your environment.'
    );
  }

  return createClient(supabaseUrl, supabaseAnonKey);
}

/**
 * Fetch the knowledge graph for a specific scan
 * Shows codebase structure, dependencies, and risk analysis
 */
async function findGraphRow(supabase: any, scanId: string) {
  const { data, error } = await supabase
    .from('scan_graphs')
    .select('graph_json, created_at')
    .eq('scan_id', scanId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch graph: ${error.message}`);
  }

  return data;
}

export async function fetchScanGraph(scanId: string) {
  try {
    const supabase = getSupabaseClient();
    let graphRow = await findGraphRow(supabase, scanId);

    if (!graphRow) {
      const { data: historyRow, error: historyError } = await supabase
        .from('scan_history')
        .select('report_data')
        .eq('id', scanId)
        .maybeSingle();

      if (!historyError && historyRow) {
        const reportData = typeof historyRow.report_data === 'string'
          ? JSON.parse(historyRow.report_data)
          : historyRow.report_data;

        const fallbackScanId = reportData?.scanId;
        if (fallbackScanId) {
          graphRow = await findGraphRow(supabase, fallbackScanId);
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
    return {
      error: `Error fetching graph: ${err?.message ?? 'Unknown error'}`,
    };
  }
}

/**
 * Get summary statistics about the knowledge graph
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
    console.log(`[getGraphStats] Graph loaded with ${Object.keys(graph.nodes || {}).length} nodes and ${(graph.edges || []).length} edges`);

    // Calculate statistics
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

    console.log(`[getGraphStats] Stats calculated:`, stats);

    return {
      success: true,
      stats,
      graph: result.graph,
    };
  } catch (err: any) {
    console.log(`[getGraphStats] Exception: ${err?.message}`);
    return {
      error: `Error calculating stats: ${err?.message ?? 'Unknown error'}`,
    };
  }
}
