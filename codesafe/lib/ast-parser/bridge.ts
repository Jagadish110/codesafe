// ─────────────────────────────────────────────────────────────────────────────
// lib/ast-parser/bridge.ts
// AST PIPELINE BRIDGE
//
// This is the single integration point between:
//   Graph Builder  →  [THIS FILE]  →  Orchestrator  →  Agents
//
// Runs all 5 AST steps and returns ASTContext per agent-domain.
// Called from pipeline.ts between graph_building and orchestrating phases.
// ─────────────────────────────────────────────────────────────────────────────

import type { FileContent, ASTContext } from '../types'

// Step 1 — AST Parser
import { runASTParser }           from './index'
// Step 2 — Function Extractor
import { extractAllFunctions }    from './extractor'
// Step 3 — Call Extractor
import { extractAllCallSites }    from './call-extractor'
// Step 4 — Linker
import { linkCallSites, formatChainsForAgentPrompt, getChainsForHacker, getChainsForGuardian, getChainsForAuditor, getChainsForSleuth } from './linker'
// Step 5 — Chain Detector
import { runChainDetector, formatFindingsForAgentPrompt } from './chain-detector'

// ── Per-agent slice mapping ───────────────────────────────────────────────────

type AgentSliceKey = ASTContext['agentSlice']

// Maps each agent to the slice of findings it cares about
const AGENT_SLICE_MAP: Record<string, AgentSliceKey> = {
    hacker:   'hacker',    // injection, SSRF, RCE, path traversal
    guardian: 'guardian',  // auth bypass, null dereference
    auditor:  'auditor',   // null dereference, unhandled async
    sleuth:   'sleuth',    // all cross-file findings
    operator: 'all',       // production failures — all findings
    sentinel: 'all',       // AI-coding patterns — all findings
}

// ── Result type ───────────────────────────────────────────────────────────────

export interface ASTPipelineResult {
    // Per-agent contexts — key is agentId
    agentContexts: Record<string, ASTContext>

    // Global stats for logging / phase reporting
    stats: {
        filesAnalyzed: number
        filesSupported: number
        functionsFound: number
        callSitesFound: number
        chainsLinked: number
        findingsProduced: number
        durationMs: number
    }
}

// ── Main bridge function ──────────────────────────────────────────────────────
//
// Called ONCE per scan from pipeline.ts.
// Returns per-agent ASTContext objects — the orchestrator attaches the right
// one to each AgentRoute based on agentId.

export async function runASTPipeline(
    files: FileContent[]
): Promise<ASTPipelineResult> {
    const start = Date.now()
    console.log(`[AST Bridge] Starting pipeline — ${files.length} files`)

    // Guard: don't crash the scan if AST pipeline fails
    try {
        return await _runASTPipeline(files, start)
    } catch (err: any) {
        console.error(`[AST Bridge] Pipeline failed — returning empty context:`, err?.message)
        return buildEmptyResult(files.length, Date.now() - start)
    }
}

async function _runASTPipeline(
    files: FileContent[],
    start: number
): Promise<ASTPipelineResult> {

    // ── Step 1: Parse all files into ASTs ────────────────────────────────────
    // Convert FileContent[] → ParsedFile[] (tree-sitter AST per file)
    const rawFiles = files.map(f => ({
        path: f.filePath,
        content: f.content,
    }))

    const parseResult = await runASTParser(rawFiles)
    console.log(`[AST Bridge] Step 1 done — ${parseResult.stats.supported} / ${parseResult.stats.total} files parsed`)

    if (parseResult.stats.supported === 0) {
        console.warn('[AST Bridge] No supported files — skipping remaining steps')
        return buildEmptyResult(files.length, Date.now() - start)
    }

    // ── Step 2: Extract functions ─────────────────────────────────────────────
    const { functions, stats: fnStats } = extractAllFunctions(parseResult.parsed)
    console.log(`[AST Bridge] Step 2 done — ${fnStats.totalFunctions} functions, ${fnStats.entryPoints} entry points`)

    // ── Step 3: Extract call sites ────────────────────────────────────────────
    const { callSites, stats: callStats } = extractAllCallSites(parseResult.parsed, functions)
    console.log(`[AST Bridge] Step 3 done — ${callStats.totalCalls} call sites`)

    // ── Step 4: Link caller-callee chains ─────────────────────────────────────
    const { chains, stats: linkerStats } = linkCallSites(callSites, functions)
    console.log(`[AST Bridge] Step 4 done — ${linkerStats.totalChains} chains, ${linkerStats.crossFile} cross-file`)

    // ── Step 5: Detect vulnerability patterns ─────────────────────────────────
    const { findings, agentSlices, stats: detectorStats } = runChainDetector(chains)
    console.log(`[AST Bridge] Step 5 done — ${detectorStats.totalFindings} findings (${detectorStats.confirmedFindings} CONFIRMED)`)

    // ── Build per-agent contexts ───────────────────────────────────────────────
    // Each agent gets only the findings + chains relevant to its domain.
    // This keeps the context window lean and the signal-to-noise high.

    const agentContexts: Record<string, ASTContext> = {}

    for (const [agentId, sliceKey] of Object.entries(AGENT_SLICE_MAP)) {
        // Get domain-specific findings slice
        const sliceFindings = sliceKey === 'all'
            ? findings
            : agentSlices[sliceKey as keyof typeof agentSlices]

        // Get domain-specific chains slice
        const sliceChains = (() => {
            switch (sliceKey) {
                case 'hacker':   return getChainsForHacker(chains)
                case 'guardian': return getChainsForGuardian(chains)
                case 'auditor':  return getChainsForAuditor(chains)
                case 'sleuth':   return getChainsForSleuth(chains)
                default:         return chains
            }
        })()

        agentContexts[agentId] = {
            findingsBlock: formatFindingsForAgentPrompt(sliceFindings, 10),
            chainsBlock:   formatChainsForAgentPrompt(sliceChains, 15),
            totalFindings: sliceFindings.length,
            totalChains:   sliceChains.length,
            agentSlice:    sliceKey,
        }
    }

    const durationMs = Date.now() - start
    console.log(`[AST Bridge] Complete in ${durationMs}ms`)

    return {
        agentContexts,
        stats: {
            filesAnalyzed:    parseResult.stats.total,
            filesSupported:   parseResult.stats.supported,
            functionsFound:   fnStats.totalFunctions,
            callSitesFound:   callStats.totalCalls,
            chainsLinked:     linkerStats.totalChains,
            findingsProduced: detectorStats.totalFindings,
            durationMs,
        },
    }
}

// ── Empty result — returned on error or unsupported-only repos ────────────────

function buildEmptyResult(filesAnalyzed: number, durationMs: number): ASTPipelineResult {
    const emptyContext: ASTContext = {
        findingsBlock: '=== VULNERABILITY FINDINGS ===\nAST analysis not available for this codebase.\n==============================',
        chainsBlock:   '=== CALLER-CALLEE CHAINS ===\nAST analysis not available for this codebase.\n===========================',
        totalFindings: 0,
        totalChains:   0,
        agentSlice:    'all',
    }

    const agentContexts: Record<string, ASTContext> = {}
    for (const agentId of Object.keys(AGENT_SLICE_MAP)) {
        agentContexts[agentId] = emptyContext
    }

    return {
        agentContexts,
        stats: {
            filesAnalyzed,
            filesSupported:   0,
            functionsFound:   0,
            callSitesFound:   0,
            chainsLinked:     0,
            findingsProduced: 0,
            durationMs,
        },
    }
}
