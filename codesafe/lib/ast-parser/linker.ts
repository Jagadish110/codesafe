// ─────────────────────────────────────────────────────────────────────────────
// lib/ast-parser/linker.ts
// STEP 4 — Caller-Callee Linker
//
// PURPOSE:
// Takes the raw function list (Step 2) and call site list (Step 3) and
// connects them across files. This produces CallerCalleeChain[] —
// the exact data structure the agents need to detect interprocedural bugs.
//
// PIPELINE POSITION:
// Function Extractor → Call Extractor → [LINKER HERE] → Chain Detector
//
// WHAT THIS FILE DOES:
// 1. Builds a lookup index: functionName → FunctionNode (across all files)
// 2. For each call site, finds the matching function definition
// 3. Resolves which file the callee lives in (cross-file resolution)
// 4. Combines call site flags + function flags into one CallerCalleeChain
// 5. Scores each chain by risk level (LOW / MEDIUM / HIGH / CRITICAL)
//
// THE KEY OUTPUT — CallerCalleeChain:
// {
//   caller: "getUser",
//   callerFile: "api/user.ts",
//   callee: "fetchFromDB",
//   calleeFile: "db/queries.ts",
//   calleeCanReturnNull: true,    ← from Step 2 (function extractor)
//   returnValueChecked: false,    ← from Step 3 (call extractor)
//   returnValueUsed: true,        ← from Step 3
//   dataFromEntryPoint: true,     ← caller is HTTP handler
//   riskScore: "HIGH"
// }
//
// This is what gets injected into agent prompts as === CALLER-CALLEE CHAINS ===
// ─────────────────────────────────────────────────────────────────────────────

import type { FunctionNode } from './extractor'
import type { CallSite } from './call-extractor'

// ── Types ─────────────────────────────────────────────────────────────────────

export type ChainRisk = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export type ChainVulnType =
    | 'NULL_DEREFERENCE'          // callee returns null, caller uses without check
    | 'USER_INPUT_TO_DB'          // user input flows from entry point to DB call
    | 'USER_INPUT_TO_EXEC'        // user input flows to shell execution
    | 'USER_INPUT_TO_FETCH'       // user input flows to HTTP request (SSRF)
    | 'USER_INPUT_TO_FILESYSTEM'  // user input flows to file read/write
    | 'MISSING_AUTH_ON_ENTRY'     // entry point calls resource fetch with no auth check
    | 'SECRET_TO_RESPONSE'        // secret/config value flows back to HTTP response
    | 'UNHANDLED_ASYNC'           // async callee, caller ignores return/error
    | 'GENERAL'                   // linked chain, no specific vuln type detected

export interface CallerCalleeChain {
    // Identity
    id: string

    // Caller — the function that makes the call
    caller: string                // caller function name
    callerFile: string            // caller file path
    callerLine: number            // line where the call happens
    callerIsEntryPoint: boolean   // is the caller an HTTP handler?
    callerIsAsync: boolean

    // Callee — the function being called
    callee: string                // callee function name
    calleeFile: string            // callee file path (resolved cross-file)
    calleeStartLine: number       // where the callee is defined
    calleeIsAsync: boolean
    calleeCanReturnNull: boolean  // KEY: callee can return null/undefined
    calleeHasErrorHandling: boolean

    // The interaction — what happens at the call site
    returnValueUsed: boolean      // return value used by caller
    returnValueChecked: boolean   // null-checked before use
    returnValueIgnored: boolean   // return value thrown away
    returnValueAwaited: boolean   // await used
    argumentsFromParams: boolean  // caller passes its own params to callee (input flow)
    argumentsContainUserInput: boolean  // args contain req.body/params/query

    // Data flow context
    dataFromEntryPoint: boolean   // is data flowing from an HTTP entry point?
    crossFile: boolean            // caller and callee in different files?

    // Vulnerability classification
    vulnType: ChainVulnType
    riskScore: ChainRisk
    riskReason: string            // human readable explanation of why this risk score

    // For agent prompt injection — plain text summary
    summary: string
}

// ── Function Index Builder ────────────────────────────────────────────────────
//
// Builds a multi-key lookup so we can find a function by name quickly.
// One function name can exist in multiple files — we keep all of them.

type FunctionIndex = Map<string, FunctionNode[]>

function buildFunctionIndex(functions: FunctionNode[]): FunctionIndex {
    const index: FunctionIndex = new Map()

    for (const fn of functions) {
        // index by simple name
        const existing = index.get(fn.name) ?? []
        existing.push(fn)
        index.set(fn.name, existing)

        // also index by "file::name" for precise lookup
        const fullKey = `${fn.filePath}::${fn.name}`
        const existingFull = index.get(fullKey) ?? []
        existingFull.push(fn)
        index.set(fullKey, existingFull)
    }

    return index
}

// ── Callee Resolver ───────────────────────────────────────────────────────────
//
// Given a call site, find the most likely matching FunctionNode.
//
// Resolution priority:
// 1. Same file — highest confidence
// 2. File path suggested by import (not implemented yet — Step 4.1)
// 3. Unique name across all files — if only one function has this name
// 4. Best guess by file type (db calls likely in /db/, auth in /auth/, etc.)

function resolveCallee(
    callSite: CallSite,
    index: FunctionIndex
): FunctionNode | null {
    const name = callSite.calleeName

    // 1. Try same file first
    const sameFileKey = `${callSite.callerFile}::${name}`
    const sameFile = index.get(sameFileKey)
    if (sameFile && sameFile.length > 0) return sameFile[0]

    // 2. Get all functions with this name across all files
    const allMatches = index.get(name) ?? []
    if (allMatches.length === 0) return null

    // 3. If only one match — confident resolution
    if (allMatches.length === 1) return allMatches[0]

    // 4. Multiple matches — pick by file path heuristic
    // If callee name suggests DB operation, prefer /db/ files
    if (DB_FUNCTION_PATTERNS.some(p => p.test(name))) {
        const dbMatch = allMatches.find(f => /\/db\/|\/database\/|\/models\/|\/repositories\//.test(f.filePath))
        if (dbMatch) return dbMatch
    }

    // If callee name suggests auth operation, prefer /auth/ or /middleware/ files
    if (AUTH_FUNCTION_PATTERNS.some(p => p.test(name))) {
        const authMatch = allMatches.find(f => /\/auth\/|\/middleware\/|\/guards\//.test(f.filePath))
        if (authMatch) return authMatch
    }

    // 5. Fallback — return first match (lowest confidence)
    return allMatches[0]
}

// ── Vulnerability Type Classifier ─────────────────────────────────────────────
//
// Given a linked chain, determine what kind of vulnerability it represents.

const DB_FUNCTION_PATTERNS = [
    /find|fetch|get|query|select|search|lookup|retrieve|load|read/i,
    /user|users|account|accounts|document|documents|record|records/i,
    /db|database|repo|repository|model|store|storage/i,
]

const EXEC_FUNCTION_PATTERNS = [
    /exec|execute|spawn|run|shell|command|cmd|process/i,
]

const FETCH_FUNCTION_PATTERNS = [
    /fetch|request|http|axios|got|call|api|webhook|url/i,
]

const FILESYSTEM_FUNCTION_PATTERNS = [
    /read|write|file|path|dir|directory|upload|download|save/i,
]

const AUTH_FUNCTION_PATTERNS = [
    /auth|verify|validate|check|permission|authorize|authenticate|session|token|jwt/i,
]

const SECRET_FUNCTION_PATTERNS = [
    /config|secret|key|credential|env|setting|load/i,
]

function classifyVulnType(
    callSite: CallSite,
    callee: FunctionNode,
    callerIsEntryPoint: boolean
): ChainVulnType {
    const calleeName = callSite.calleeName

    // NULL_DEREFERENCE — callee can return null, caller doesn't check
    if (
        callee.canReturnNull &&
        callSite.returnValueUsed &&
        !callSite.returnValueChecked
    ) return 'NULL_DEREFERENCE'

    // USER_INPUT_TO_DB — input from entry point flows to DB function
    if (
        (callSite.argumentsFromParams || callSite.argumentsContainUserInput) &&
        DB_FUNCTION_PATTERNS.some(p => p.test(calleeName))
    ) return 'USER_INPUT_TO_DB'

    // USER_INPUT_TO_EXEC — input flows to execution function
    if (
        (callSite.argumentsFromParams || callSite.argumentsContainUserInput) &&
        EXEC_FUNCTION_PATTERNS.some(p => p.test(calleeName))
    ) return 'USER_INPUT_TO_EXEC'

    // USER_INPUT_TO_FETCH — input flows to HTTP request
    if (
        (callSite.argumentsFromParams || callSite.argumentsContainUserInput) &&
        FETCH_FUNCTION_PATTERNS.some(p => p.test(calleeName))
    ) return 'USER_INPUT_TO_FETCH'

    // USER_INPUT_TO_FILESYSTEM — input flows to file operations
    if (
        (callSite.argumentsFromParams || callSite.argumentsContainUserInput) &&
        FILESYSTEM_FUNCTION_PATTERNS.some(p => p.test(calleeName))
    ) return 'USER_INPUT_TO_FILESYSTEM'

    // MISSING_AUTH_ON_ENTRY — entry point calls resource fetch with no auth indicators
    if (
        callerIsEntryPoint &&
        DB_FUNCTION_PATTERNS.some(p => p.test(calleeName)) &&
        !AUTH_FUNCTION_PATTERNS.some(p => p.test(calleeName))
    ) return 'MISSING_AUTH_ON_ENTRY'

    // UNHANDLED_ASYNC — async callee, return value ignored by caller
    if (callee.isAsync && callSite.returnValueIgnored) return 'UNHANDLED_ASYNC'

    return 'GENERAL'
}

// ── Risk Scorer ───────────────────────────────────────────────────────────────

function scoreChainRisk(
    vulnType: ChainVulnType,
    callSite: CallSite,
    callee: FunctionNode,
    callerIsEntryPoint: boolean,
    crossFile: boolean
): { riskScore: ChainRisk; riskReason: string } {

    switch (vulnType) {
        case 'USER_INPUT_TO_EXEC':
            return {
                riskScore: 'CRITICAL',
                riskReason: `User input from ${callSite.callerFile} flows to execution function ${callee.name}() — potential RCE`,
            }

        case 'USER_INPUT_TO_DB':
            return {
                riskScore: callerIsEntryPoint ? 'CRITICAL' : 'HIGH',
                riskReason: `User input flows from ${callerIsEntryPoint ? 'unauthenticated entry point' : 'authenticated route'} to DB function ${callee.name}() — potential SQL injection`,
            }

        case 'USER_INPUT_TO_FETCH':
            return {
                riskScore: callerIsEntryPoint ? 'CRITICAL' : 'HIGH',
                riskReason: `User input flows to HTTP request function ${callee.name}() — potential SSRF`,
            }

        case 'USER_INPUT_TO_FILESYSTEM':
            return {
                riskScore: 'HIGH',
                riskReason: `User input flows to filesystem function ${callee.name}() — potential path traversal`,
            }

        case 'NULL_DEREFERENCE':
            return {
                riskScore: crossFile ? 'HIGH' : 'MEDIUM',
                riskReason: `${callee.name}() can return null/undefined but return value is used without null check in ${callSite.callerFile} — ${crossFile ? 'cross-file chain, harder to spot' : 'same-file issue'}`,
            }

        case 'MISSING_AUTH_ON_ENTRY':
            return {
                riskScore: 'HIGH',
                riskReason: `Entry point ${callSite.callerFunctionName}() calls ${callee.name}() with no auth check in the chain — potential unauthorized access`,
            }

        case 'UNHANDLED_ASYNC':
            return {
                riskScore: 'MEDIUM',
                riskReason: `Async function ${callee.name}() called without await or error handling — unhandled rejections can crash the server`,
            }

        default:
            return {
                riskScore: crossFile ? 'MEDIUM' : 'LOW',
                riskReason: `Cross-file function call from ${callSite.callerFile} to ${callee.filePath} — review for data flow issues`,
            }
    }
}

// ── Chain Summary Builder ─────────────────────────────────────────────────────
//
// Builds the plain-text summary injected into agent prompts.
// This is what the agent actually reads in === CALLER-CALLEE CHAINS ===

function buildChainSummary(chain: Omit<CallerCalleeChain, 'summary'>): string {
    const lines = [
        `CHAIN [${chain.riskScore}] — ${chain.vulnType}`,
        `  Caller : ${chain.caller}() in ${chain.callerFile} [line ${chain.callerLine}]`,
        `  Callee : ${chain.callee}() in ${chain.calleeFile} [line ${chain.calleeStartLine}]`,
        `  ├─ callee can return null     : ${chain.calleeCanReturnNull}`,
        `  ├─ return value checked       : ${chain.returnValueChecked}`,
        `  ├─ return value used          : ${chain.returnValueUsed}`,
        `  ├─ return value ignored       : ${chain.returnValueIgnored}`,
        `  ├─ data from entry point      : ${chain.dataFromEntryPoint}`,
        `  ├─ user input in args         : ${chain.argumentsContainUserInput}`,
        `  └─ cross-file chain           : ${chain.crossFile}`,
        `  Risk reason: ${chain.riskReason}`,
    ]
    return lines.join('\n')
}

// ── Main Linker ───────────────────────────────────────────────────────────────

export interface LinkerResult {
    chains: CallerCalleeChain[]
    unresolved: CallSite[]        // call sites where callee couldn't be found
    stats: {
        totalChains: number
        resolved: number
        unresolved: number
        crossFile: number
        bySeverity: Record<ChainRisk, number>
        byVulnType: Record<ChainVulnType, number>
    }
}

export function linkCallSites(
    callSites: CallSite[],
    functions: FunctionNode[]
): LinkerResult {
    console.log(`[Linker] Linking ${callSites.length} call sites against ${functions.length} functions`)

    const index = buildFunctionIndex(functions)
    const chains: CallerCalleeChain[] = []
    const unresolved: CallSite[] = []

    // build a quick lookup: filePath → FunctionNode for entry point detection
    const entryPointFiles = new Set(
        functions.filter(f => f.isEntryPoint).map(f => f.filePath)
    )

    for (const callSite of callSites) {
        // try to resolve the callee
        const callee = resolveCallee(callSite, index)

        if (!callee) {
            unresolved.push(callSite)
            continue
        }

        // find the caller function node
        const callerFn = functions.find(
            f => f.filePath === callSite.callerFile && f.name === callSite.callerFunctionName
        )

        const callerIsEntryPoint =
            callerFn?.isEntryPoint ?? entryPointFiles.has(callSite.callerFile)

        const crossFile = callSite.callerFile !== callee.filePath

        // skip same-file, low-risk, non-interesting chains to reduce noise
        // we only skip if: same file + not null dereference + no user input
        if (
            !crossFile &&
            !callee.canReturnNull &&
            !callSite.argumentsFromParams &&
            !callSite.argumentsContainUserInput
        ) continue

        const argumentsContainUserInput =
            callSite.arguments.some(a => a.isUserInput) || callSite.argumentsFromParams

        const dataFromEntryPoint = callerIsEntryPoint || argumentsContainUserInput

        const vulnType = classifyVulnType(callSite, callee, callerIsEntryPoint)

        // skip GENERAL chains that are same-file — too much noise
        if (vulnType === 'GENERAL' && !crossFile) continue

        const { riskScore, riskReason } = scoreChainRisk(
            vulnType,
            callSite,
            callee,
            callerIsEntryPoint,
            crossFile
        )

        const chainData: Omit<CallerCalleeChain, 'summary'> = {
            id: `${callSite.id}→${callee.id}`,
            caller: callSite.callerFunctionName,
            callerFile: callSite.callerFile,
            callerLine: callSite.line,
            callerIsEntryPoint,
            callerIsAsync: callerFn?.isAsync ?? false,
            callee: callee.name,
            calleeFile: callee.filePath,
            calleeStartLine: callee.startLine,
            calleeIsAsync: callee.isAsync,
            calleeCanReturnNull: callee.canReturnNull,
            calleeHasErrorHandling: callee.hasErrorHandling,
            returnValueUsed: callSite.returnValueUsed,
            returnValueChecked: callSite.returnValueChecked,
            returnValueIgnored: callSite.returnValueIgnored,
            returnValueAwaited: callSite.returnValueAwaited,
            argumentsFromParams: callSite.argumentsFromParams,
            argumentsContainUserInput,
            dataFromEntryPoint,
            crossFile,
            vulnType,
            riskScore,
            riskReason,
        }

        chains.push({
            ...chainData,
            summary: buildChainSummary(chainData),
        })
    }

    // sort by risk — CRITICAL first
    const riskOrder: Record<ChainRisk, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
    chains.sort((a, b) => riskOrder[a.riskScore] - riskOrder[b.riskScore])

    // build stats
    const bySeverity: Record<ChainRisk, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 }
    const byVulnType = {} as Record<ChainVulnType, number>

    for (const chain of chains) {
        bySeverity[chain.riskScore]++
        byVulnType[chain.vulnType] = (byVulnType[chain.vulnType] ?? 0) + 1
    }

    const stats = {
        totalChains: chains.length,
        resolved: chains.length,
        unresolved: unresolved.length,
        crossFile: chains.filter(c => c.crossFile).length,
        bySeverity,
        byVulnType,
    }

    console.log(`[Linker] Done:`)
    console.log(`  Total chains   : ${stats.totalChains}`)
    console.log(`  Cross-file     : ${stats.crossFile}`)
    console.log(`  Unresolved     : ${stats.unresolved}`)
    console.log(`  CRITICAL       : ${bySeverity.CRITICAL}`)
    console.log(`  HIGH           : ${bySeverity.HIGH}`)
    console.log(`  MEDIUM         : ${bySeverity.MEDIUM}`)
    console.log(`  Vuln types     :`, byVulnType)

    return { chains, unresolved, stats }
}

// ── Chain Formatter for Agent Prompts ─────────────────────────────────────────
//
// Converts chains into the === CALLER-CALLEE CHAINS === block
// that gets injected into every agent prompt in runner.ts

export function formatChainsForAgentPrompt(
    chains: CallerCalleeChain[],
    maxChains: number = 20           // cap to avoid token overflow
): string {
    if (chains.length === 0) {
        return `=== CALLER-CALLEE CHAINS ===\nNo interprocedural chains detected.\n===========================`
    }

    // take top chains by risk (already sorted)
    const topChains = chains.slice(0, maxChains)

    const chainText = topChains.map((c, i) =>
        `[${i + 1}] ${c.summary}`
    ).join('\n\n')

    const skipped = chains.length > maxChains
        ? `\n... and ${chains.length - maxChains} more chains (showing top ${maxChains} by risk)`
        : ''

    return [
        `=== CALLER-CALLEE CHAINS ===`,
        `Total chains found: ${chains.length} | Showing: ${topChains.length}`,
        `CRITICAL: ${chains.filter(c => c.riskScore === 'CRITICAL').length} | HIGH: ${chains.filter(c => c.riskScore === 'HIGH').length} | MEDIUM: ${chains.filter(c => c.riskScore === 'MEDIUM').length}`,
        ``,
        chainText,
        skipped,
        `===========================`,
    ].join('\n')
}

// ── Filter Helpers ────────────────────────────────────────────────────────────
// Helpers for each agent to get only the chains relevant to their domain

export function getChainsForHacker(chains: CallerCalleeChain[]): CallerCalleeChain[] {
    return chains.filter(c => [
        'USER_INPUT_TO_DB',
        'USER_INPUT_TO_EXEC',
        'USER_INPUT_TO_FETCH',
        'USER_INPUT_TO_FILESYSTEM',
    ].includes(c.vulnType))
}

export function getChainsForGuardian(chains: CallerCalleeChain[]): CallerCalleeChain[] {
    return chains.filter(c => [
        'MISSING_AUTH_ON_ENTRY',
        'NULL_DEREFERENCE',
    ].includes(c.vulnType))
}

export function getChainsForAuditor(chains: CallerCalleeChain[]): CallerCalleeChain[] {
    return chains.filter(c => c.vulnType === 'NULL_DEREFERENCE')
}

export function getChainsForSleuth(chains: CallerCalleeChain[]): CallerCalleeChain[] {
    return chains.filter(c => c.crossFile) // all cross-file chains
}