// ─────────────────────────────────────────────────────────────────────────────
// lib/ast-parser/chain-detector.ts
// STEP 5 — Chain Detector (Final Pipeline Step)
//
// PURPOSE:
// Takes CallerCalleeChain[] from Step 4 (Linker) and produces confirmed
// VulnerabilityFinding[] — deduplicated, confidence-scored, evidence-rich
// findings ready to be injected into agent prompts.
//
// PIPELINE POSITION:
// AST Parser → Function Extractor → Call Extractor → Linker → [CHAIN DETECTOR HERE]
//                                                                        ↓
//                                                               VulnerabilityFinding[]
//                                                                        ↓
//                                                              Agent Prompt Injection
//
// WHAT THIS FILE DOES:
// 1. Groups raw chains into candidate vulnerability clusters
// 2. Applies detection rules per vulnerability class (NULL_DEREFERENCE,
//    INJECTION, SSRF, PATH_TRAVERSAL, AUTH_BYPASS, UNHANDLED_ASYNC, etc.)
// 3. Scores each finding by confidence (LOW / MEDIUM / HIGH / CONFIRMED)
// 4. Deduplicates overlapping findings (same root cause, different call paths)
// 5. Builds a structured VulnerabilityFinding with full evidence + remediation
// 6. Produces per-agent finding slices (Hacker / Guardian / Auditor / Sleuth)
//
// WHY THIS STEP EXISTS:
// The Linker in Step 4 produces raw chain pairs — one chain per call site.
// Real vulnerabilities often span 3+ hops (entry → A → B → sink), and a single
// root cause may produce dozens of raw chains. The Chain Detector collapses
// these into one canonical finding per vulnerability instance.
//
// From the paper (Lira et al., EASE 2026):
// "Interprocedural vulnerabilities require tracking data flow across function
//  boundaries; a single finding may manifest as N caller-callee pairs in the
//  call graph." — Step 5 implements this collapsing.
// ─────────────────────────────────────────────────────────────────────────────

import type { CallerCalleeChain, ChainRisk, ChainVulnType } from './linker'

// ── Types ─────────────────────────────────────────────────────────────────────

export type ConfidenceLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CONFIRMED'

export type VulnCategory =
    | 'INJECTION'           // SQL, NoSQL, LDAP, XPath injection
    | 'NULL_DEREFERENCE'    // null/undefined dereference
    | 'SSRF'                // Server-Side Request Forgery
    | 'PATH_TRAVERSAL'      // directory traversal / arbitrary file read
    | 'RCE'                 // Remote Code Execution (command injection)
    | 'AUTH_BYPASS'         // missing/broken authentication
    | 'UNHANDLED_ASYNC'     // unhandled promise rejection
    | 'INFORMATION_LEAK'    // secrets/config data in response
    | 'UNKNOWN'

// An individual "hop" in a multi-hop call chain
export interface ChainHop {
    functionName: string
    filePath: string
    line: number
    isEntryPoint: boolean
    transfersUserInput: boolean   // does this hop pass user data downstream?
    checksReturnValue: boolean
}

// A single confirmed finding — output of the Chain Detector
export interface VulnerabilityFinding {
    // Identity
    id: string                    // deterministic: hash of root chain IDs
    category: VulnCategory
    vulnType: ChainVulnType       // finer-grained type from linker
    title: string                 // human-readable title e.g. "SQL Injection via getUser()"

    // Severity
    severity: ChainRisk           // inherited from highest-risk chain in cluster
    confidence: ConfidenceLevel   // how sure are we this is actually exploitable?

    // Location — where the vulnerability manifests
    entryPoint: string            // function where user input enters the system
    entryFile: string
    entryLine: number
    sink: string                  // function where the dangerous operation happens
    sinkFile: string
    sinkLine: number

    // Call chain — full path from entry to sink
    callChain: ChainHop[]         // ordered: entry → ... → sink
    chainDepth: number            // number of function boundaries crossed
    crossesFileCount: number      // how many file boundaries crossed

    // Evidence
    evidence: FindingEvidence
    contributingChains: CallerCalleeChain[]  // raw chains that produced this finding
    chainIds: string[]

    // Remediation
    remediation: RemediationAdvice

    // Agent prompt fields
    agentSummary: string          // injected into agent prompt
    agentContext: string[]        // bullet points for agent context window
}

export interface FindingEvidence {
    // What we know about the data flow
    userInputSource: string | null      // e.g. "req.body.id in POST /api/users"
    dataFlowDescription: string         // plain-English description of the flow
    vulnerablePattern: string           // what makes this exploitable
    missingDefense: string              // what's NOT there that should be

    // AST-derived evidence flags
    returnValueNeverChecked: boolean
    dataFlowsFromEntryPoint: boolean
    crossFileFlow: boolean
    noErrorHandling: boolean
    asyncWithoutAwait: boolean

    // Code context (file:line references for the agent)
    keyLocations: Array<{
        description: string
        file: string
        line: number
    }>
}

export interface RemediationAdvice {
    summary: string
    steps: string[]
    codeExample?: string
    references: string[]
}

// ── Detection Rules ───────────────────────────────────────────────────────────
//
// Each rule takes a cluster of related chains and decides:
// 1. Is this a real finding? (or just noise)
// 2. What is the confidence level?
// 3. What evidence supports this finding?
//
// Rules are applied in priority order — highest severity first.

interface DetectionRule {
    name: string
    appliesTo: ChainVulnType[]
    detect(chains: CallerCalleeChain[]): DetectionResult | null
}

interface DetectionResult {
    category: VulnCategory
    confidence: ConfidenceLevel
    evidence: Partial<FindingEvidence>
    title: string
}

// ── Rule: RCE via User Input to Exec ─────────────────────────────────────────

const RCE_RULE: DetectionRule = {
    name: 'RCE_USER_INPUT_TO_EXEC',
    appliesTo: ['USER_INPUT_TO_EXEC'],

    detect(chains): DetectionResult | null {
        const execChains = chains.filter(c => c.vulnType === 'USER_INPUT_TO_EXEC')
        if (execChains.length === 0) return null

        // any chain with user input reaching exec is CONFIRMED — too dangerous not to flag
        const hasDirectFlow = execChains.some(c => c.dataFromEntryPoint)
        const confidence: ConfidenceLevel = hasDirectFlow ? 'CONFIRMED' : 'HIGH'

        const representative = execChains[0]
        return {
            category: 'RCE',
            confidence,
            title: `Command Injection via ${representative.callee}()`,
            evidence: {
                vulnerablePattern: `User-controlled input reaches ${representative.callee}() without sanitization`,
                missingDefense: 'No input validation, allow-list, or escaping before shell execution',
                dataFlowsFromEntryPoint: representative.dataFromEntryPoint,
                crossFileFlow: representative.crossFile,
            },
        }
    },
}

// ── Rule: SQL/NoSQL Injection ─────────────────────────────────────────────────

const INJECTION_RULE: DetectionRule = {
    name: 'INJECTION_USER_INPUT_TO_DB',
    appliesTo: ['USER_INPUT_TO_DB'],

    detect(chains): DetectionResult | null {
        const dbChains = chains.filter(c => c.vulnType === 'USER_INPUT_TO_DB')
        if (dbChains.length === 0) return null

        // Higher confidence when: originates at entry point + cross-file
        const fromEntry = dbChains.some(c => c.callerIsEntryPoint)
        const crossFile = dbChains.some(c => c.crossFile)

        const confidence: ConfidenceLevel =
            fromEntry && crossFile ? 'CONFIRMED'
            : fromEntry            ? 'HIGH'
            : crossFile            ? 'HIGH'
            :                        'MEDIUM'

        const representative = dbChains[0]
        return {
            category: 'INJECTION',
            confidence,
            title: `SQL/NoSQL Injection via ${representative.callee}()`,
            evidence: {
                vulnerablePattern: `Unsanitized user input passed directly to database function ${representative.callee}()`,
                missingDefense: 'No parameterized queries, ORM binding, or input validation before DB call',
                dataFlowsFromEntryPoint: fromEntry,
                crossFileFlow: crossFile,
            },
        }
    },
}

// ── Rule: SSRF ────────────────────────────────────────────────────────────────

const SSRF_RULE: DetectionRule = {
    name: 'SSRF_USER_INPUT_TO_FETCH',
    appliesTo: ['USER_INPUT_TO_FETCH'],

    detect(chains): DetectionResult | null {
        const fetchChains = chains.filter(c => c.vulnType === 'USER_INPUT_TO_FETCH')
        if (fetchChains.length === 0) return null

        const fromEntry = fetchChains.some(c => c.callerIsEntryPoint)
        const confidence: ConfidenceLevel = fromEntry ? 'CONFIRMED' : 'HIGH'

        const representative = fetchChains[0]
        return {
            category: 'SSRF',
            confidence,
            title: `SSRF via ${representative.callee}()`,
            evidence: {
                vulnerablePattern: `User-controlled URL or host parameter flows to HTTP request function ${representative.callee}()`,
                missingDefense: 'No URL validation, allow-list of permitted hosts, or SSRF protection middleware',
                dataFlowsFromEntryPoint: fromEntry,
                crossFileFlow: fetchChains.some(c => c.crossFile),
            },
        }
    },
}

// ── Rule: Path Traversal ──────────────────────────────────────────────────────

const PATH_TRAVERSAL_RULE: DetectionRule = {
    name: 'PATH_TRAVERSAL_USER_INPUT_TO_FS',
    appliesTo: ['USER_INPUT_TO_FILESYSTEM'],

    detect(chains): DetectionResult | null {
        const fsChains = chains.filter(c => c.vulnType === 'USER_INPUT_TO_FILESYSTEM')
        if (fsChains.length === 0) return null

        const fromEntry = fsChains.some(c => c.callerIsEntryPoint)
        const confidence: ConfidenceLevel = fromEntry ? 'HIGH' : 'MEDIUM'

        const representative = fsChains[0]
        return {
            category: 'PATH_TRAVERSAL',
            confidence,
            title: `Path Traversal via ${representative.callee}()`,
            evidence: {
                vulnerablePattern: `User-controlled path value flows to filesystem operation ${representative.callee}()`,
                missingDefense: 'No path canonicalization, jail-root validation, or extension allow-list',
                dataFlowsFromEntryPoint: fromEntry,
                crossFileFlow: fsChains.some(c => c.crossFile),
            },
        }
    },
}

// ── Rule: Null Dereference ────────────────────────────────────────────────────

const NULL_DEREF_RULE: DetectionRule = {
    name: 'NULL_DEREFERENCE',
    appliesTo: ['NULL_DEREFERENCE'],

    detect(chains): DetectionResult | null {
        const nullChains = chains.filter(c =>
            c.vulnType === 'NULL_DEREFERENCE' &&
            c.calleeCanReturnNull &&
            c.returnValueUsed &&
            !c.returnValueChecked
        )
        if (nullChains.length === 0) return null

        // Confidence rises when: cross-file + used in entry point
        const crossFile = nullChains.some(c => c.crossFile)
        const fromEntry = nullChains.some(c => c.callerIsEntryPoint)

        const confidence: ConfidenceLevel =
            crossFile && fromEntry ? 'HIGH'
            : crossFile            ? 'MEDIUM'
            :                        'LOW'

        const representative = nullChains[0]
        return {
            category: 'NULL_DEREFERENCE',
            confidence,
            title: `Null Dereference: ${representative.callee}() return value unchecked`,
            evidence: {
                vulnerablePattern: `${representative.callee}() can return null/undefined but the return value is used without a null check in ${representative.caller}()`,
                missingDefense: 'No null guard, optional chaining, or early-return before dereferencing return value',
                returnValueNeverChecked: true,
                crossFileFlow: crossFile,
                dataFlowsFromEntryPoint: fromEntry,
            },
        }
    },
}

// ── Rule: Auth Bypass ─────────────────────────────────────────────────────────

const AUTH_BYPASS_RULE: DetectionRule = {
    name: 'MISSING_AUTH_ON_ENTRY',
    appliesTo: ['MISSING_AUTH_ON_ENTRY'],

    detect(chains): DetectionResult | null {
        const authChains = chains.filter(c => c.vulnType === 'MISSING_AUTH_ON_ENTRY')
        if (authChains.length === 0) return null

        // Auth bypass from a real entry point is CONFIRMED — we have AST proof
        const fromRealEntry = authChains.some(c => c.callerIsEntryPoint)
        const confidence: ConfidenceLevel = fromRealEntry ? 'CONFIRMED' : 'HIGH'

        const representative = authChains[0]
        return {
            category: 'AUTH_BYPASS',
            confidence,
            title: `Missing Auth Check Before ${representative.callee}()`,
            evidence: {
                vulnerablePattern: `Entry point ${representative.caller}() calls ${representative.callee}() with no authentication or authorization check in the call path`,
                missingDefense: 'No auth middleware, session validation, or permission check before sensitive operation',
                dataFlowsFromEntryPoint: true,
                crossFileFlow: representative.crossFile,
            },
        }
    },
}

// ── Rule: Unhandled Async ─────────────────────────────────────────────────────

const ASYNC_RULE: DetectionRule = {
    name: 'UNHANDLED_ASYNC',
    appliesTo: ['UNHANDLED_ASYNC'],

    detect(chains): DetectionResult | null {
        const asyncChains = chains.filter(c =>
            c.vulnType === 'UNHANDLED_ASYNC' &&
            c.calleeIsAsync &&
            c.returnValueIgnored &&
            !c.calleeHasErrorHandling
        )
        if (asyncChains.length === 0) return null

        const representative = asyncChains[0]
        return {
            category: 'UNHANDLED_ASYNC',
            confidence: 'MEDIUM',
            title: `Unhandled Async Rejection in ${representative.callee}()`,
            evidence: {
                vulnerablePattern: `Async function ${representative.callee}() called without await — errors silently swallowed, can crash Node.js process`,
                missingDefense: 'No await, no .catch(), no try/catch wrapping the async call',
                asyncWithoutAwait: true,
                noErrorHandling: !representative.calleeHasErrorHandling,
                crossFileFlow: representative.crossFile,
            },
        }
    },
}

// All rules, applied in priority order (most severe first)
const DETECTION_RULES: DetectionRule[] = [
    RCE_RULE,
    INJECTION_RULE,
    SSRF_RULE,
    PATH_TRAVERSAL_RULE,
    AUTH_BYPASS_RULE,
    NULL_DEREF_RULE,
    ASYNC_RULE,
]

// ── Chain Clustering ──────────────────────────────────────────────────────────
//
// Groups chains that share the same root cause.
// Two chains belong to the same cluster if they share:
// - The same callee (sink function)
// - The same vuln type
// - The same callee file
//
// This prevents reporting 10 "SQL injection in getUserById()" findings
// when they all stem from the same function.

function clusterChains(chains: CallerCalleeChain[]): Map<string, CallerCalleeChain[]> {
    const clusters = new Map<string, CallerCalleeChain[]>()

    for (const chain of chains) {
        // cluster key: vulnType + callee name + callee file
        const key = `${chain.vulnType}::${chain.callee}::${chain.calleeFile}`
        const existing = clusters.get(key) ?? []
        existing.push(chain)
        clusters.set(key, existing)
    }

    return clusters
}

// ── Call Chain Reconstruction ─────────────────────────────────────────────────
//
// Reconstructs the ordered hop-by-hop call chain from a cluster of raw chains.
// We merge overlapping chains into a single path: entry → A → B → sink

function buildCallChain(chains: CallerCalleeChain[]): ChainHop[] {
    if (chains.length === 0) return []

    // Sort chains: entry points first, then by cross-file (longer chains first)
    const sorted = [...chains].sort((a, b) => {
        if (a.callerIsEntryPoint && !b.callerIsEntryPoint) return -1
        if (!a.callerIsEntryPoint && b.callerIsEntryPoint) return 1
        if (a.crossFile && !b.crossFile) return -1
        return 0
    })

    const hops: ChainHop[] = []
    const seen = new Set<string>()

    for (const chain of sorted) {
        // Add caller hop if not already in chain
        const callerKey = `${chain.callerFile}::${chain.caller}::${chain.callerLine}`
        if (!seen.has(callerKey)) {
            seen.add(callerKey)
            hops.push({
                functionName: chain.caller,
                filePath: chain.callerFile,
                line: chain.callerLine,
                isEntryPoint: chain.callerIsEntryPoint,
                transfersUserInput: chain.argumentsContainUserInput || chain.argumentsFromParams,
                checksReturnValue: chain.returnValueChecked,
            })
        }

        // Add callee hop (the sink)
        const calleeKey = `${chain.calleeFile}::${chain.callee}::${chain.calleeStartLine}`
        if (!seen.has(calleeKey)) {
            seen.add(calleeKey)
            hops.push({
                functionName: chain.callee,
                filePath: chain.calleeFile,
                line: chain.calleeStartLine,
                isEntryPoint: false,
                transfersUserInput: false,   // sink — data arrives here
                checksReturnValue: chain.returnValueChecked,
            })
        }
    }

    return hops
}

// ── Key Location Extractor ─────────────────────────────────────────────────────

function buildKeyLocations(
    chains: CallerCalleeChain[],
    hops: ChainHop[]
): FindingEvidence['keyLocations'] {
    const locations: FindingEvidence['keyLocations'] = []

    // Entry point
    const entryHop = hops.find(h => h.isEntryPoint) ?? hops[0]
    if (entryHop) {
        locations.push({
            description: 'Entry point — user input enters here',
            file: entryHop.filePath,
            line: entryHop.line,
        })
    }

    // Any cross-file boundaries
    for (const chain of chains) {
        if (chain.crossFile) {
            locations.push({
                description: `Cross-file call: ${chain.caller}() → ${chain.callee}()`,
                file: chain.callerFile,
                line: chain.callerLine,
            })
            break // one example is enough
        }
    }

    // Sink
    const sinkChain = chains[chains.length - 1]
    if (sinkChain) {
        locations.push({
            description: `Sink — dangerous operation: ${sinkChain.callee}()`,
            file: sinkChain.calleeFile,
            line: sinkChain.calleeStartLine,
        })
    }

    return locations
}

// ── Remediation Builder ───────────────────────────────────────────────────────
//
// Produces concrete, category-specific remediation advice.

function buildRemediation(
    category: VulnCategory,
    finding: Omit<VulnerabilityFinding, 'remediation' | 'agentSummary' | 'agentContext'>
): RemediationAdvice {
    const sink = finding.sink

    switch (category) {
        case 'INJECTION':
            return {
                summary: 'Use parameterized queries or a safe ORM API — never interpolate user input into query strings',
                steps: [
                    `In ${finding.sinkFile}: replace string-concatenated queries in ${sink}() with parameterized statements`,
                    `Validate and sanitize all inputs before they reach ${sink}() — apply an allow-list or type coercion`,
                    `Add an integration test that sends a SQL meta-character (e.g. \`' OR 1=1--\`) via the entry point and asserts it is rejected`,
                    `Consider using an ORM (Prisma, TypeORM, SQLAlchemy) which parameterizes by default`,
                ],
                codeExample: `// ❌ Vulnerable\ndb.query(\`SELECT * FROM users WHERE id = '\${userId}'\`)\n\n// ✅ Safe\ndb.query('SELECT * FROM users WHERE id = $1', [userId])`,
                references: [
                    'https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html',
                    'https://cwe.mitre.org/data/definitions/89.html',
                ],
            }

        case 'RCE':
            return {
                summary: 'Never pass user input to shell execution functions — use safe APIs that avoid spawning a shell',
                steps: [
                    `In ${finding.sinkFile}: replace ${sink}() with a no-shell API (e.g. \`execFile\` instead of \`exec\`, \`subprocess.run([...])\` instead of shell=True)`,
                    `Validate input against a strict allow-list before any process invocation`,
                    `Consider if shell execution is necessary at all — most tasks can be done in-process`,
                    `Run the process with minimum required privileges (principle of least privilege)`,
                ],
                codeExample: `// ❌ Vulnerable\nexec(\`convert \${userFile} output.png\`)\n\n// ✅ Safe\nexecFile('convert', [userFile, 'output.png'])`,
                references: [
                    'https://cheatsheetseries.owasp.org/cheatsheets/OS_Command_Injection_Defense_Cheat_Sheet.html',
                    'https://cwe.mitre.org/data/definitions/78.html',
                ],
            }

        case 'SSRF':
            return {
                summary: 'Validate and restrict outbound URLs — use an allow-list of permitted hosts and block internal addresses',
                steps: [
                    `In ${finding.sinkFile}: validate the URL before passing to ${sink}()`,
                    `Implement an allow-list of permitted external hosts/domains`,
                    `Block requests to private IP ranges (127.0.0.1, 10.x, 172.16.x, 169.254.x, ::1)`,
                    `Use a dedicated SSRF-prevention library or proxy for all outbound requests`,
                ],
                codeExample: `// ❌ Vulnerable\nawait fetch(req.body.url)\n\n// ✅ Safe\nconst url = new URL(req.body.url)\nif (!ALLOWED_HOSTS.includes(url.hostname)) throw new Error('Blocked')\nawait fetch(url.toString())`,
                references: [
                    'https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html',
                    'https://cwe.mitre.org/data/definitions/918.html',
                ],
            }

        case 'PATH_TRAVERSAL':
            return {
                summary: 'Canonicalize paths and verify they remain inside the intended root directory before any filesystem operation',
                steps: [
                    `In ${finding.sinkFile}: call \`path.resolve()\` on all user-provided paths before passing to ${sink}()`,
                    `Assert that the resolved path starts with the expected base directory`,
                    `Use an allow-list of permitted file extensions`,
                    `Strip \`../\` sequences and null bytes from user input`,
                ],
                codeExample: `// ❌ Vulnerable\nfs.readFile(path.join(BASE, req.params.file))\n\n// ✅ Safe\nconst resolved = path.resolve(BASE, req.params.file)\nif (!resolved.startsWith(BASE)) throw new Error('Path traversal blocked')\nfs.readFile(resolved)`,
                references: [
                    'https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html',
                    'https://cwe.mitre.org/data/definitions/22.html',
                ],
            }

        case 'NULL_DEREFERENCE':
            return {
                summary: `Add a null check on the return value of ${sink}() before using it`,
                steps: [
                    `In ${finding.entryFile} line ${finding.entryLine}: check the return value of ${sink}() for null/undefined before accessing its properties`,
                    `Use optional chaining (\`?.\`) for simple property access`,
                    `Use a nullish coalescing guard (\`??\`) to provide a safe fallback`,
                    `If null is a caller error, throw an explicit error with a descriptive message`,
                ],
                codeExample: `// ❌ Vulnerable\nconst user = getUser(id)\nreturn user.email  // crashes if user is null\n\n// ✅ Safe\nconst user = getUser(id)\nif (!user) return null  // or throw new NotFoundError()\nreturn user.email`,
                references: [
                    'https://cwe.mitre.org/data/definitions/476.html',
                ],
            }

        case 'AUTH_BYPASS':
            return {
                summary: `Add authentication and authorization checks before ${sink}() is called from ${finding.entryPoint}()`,
                steps: [
                    `In ${finding.entryFile}: add an auth middleware or guard before any data-fetching logic`,
                    `Verify the session/token is valid and belongs to a user with permission to access this resource`,
                    `Apply RBAC or ABAC — don't rely on security by obscurity`,
                    `Write a test that asserts unauthenticated requests to this endpoint are rejected with 401/403`,
                ],
                references: [
                    'https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html',
                    'https://cwe.mitre.org/data/definitions/306.html',
                ],
            }

        case 'UNHANDLED_ASYNC':
            return {
                summary: `Await ${sink}() and wrap in try/catch to prevent unhandled promise rejections from crashing the server`,
                steps: [
                    `In ${finding.entryFile}: add \`await\` before the call to ${sink}()`,
                    `Wrap the call in \`try/catch\` and handle errors explicitly`,
                    `If intentionally fire-and-forget, add a \`.catch(err => logger.error(err))\` to suppress unhandled rejections`,
                    `Enable Node.js \`unhandledRejection\` global handler as a safety net`,
                ],
                codeExample: `// ❌ Vulnerable\nsendEmail(user)  // unhandled rejection crashes process\n\n// ✅ Safe\ntry {\n  await sendEmail(user)\n} catch (err) {\n  logger.error('Email failed', err)\n}`,
                references: [
                    'https://nodejs.org/api/process.html#event-unhandledrejection',
                    'https://cwe.mitre.org/data/definitions/755.html',
                ],
            }

        default:
            return {
                summary: 'Review the cross-file data flow for security issues',
                steps: [
                    `Review the call chain from ${finding.entryPoint}() to ${sink}() for missing input validation`,
                    `Check that all data crossing file boundaries is validated at the receiving end`,
                ],
                references: ['https://owasp.org/www-project-top-ten/'],
            }
    }
}

// ── Deterministic ID Builder ──────────────────────────────────────────────────
//
// Produces a stable ID for deduplication across runs.
// Same vulnerability = same ID, even if new chains were added.

function buildFindingId(
    vulnType: ChainVulnType,
    callee: string,
    calleeFile: string
): string {
    // Simple stable hash: combine type + sink name + sink file
    const raw = `${vulnType}:${callee}:${calleeFile}`
    let hash = 0
    for (let i = 0; i < raw.length; i++) {
        hash = (Math.imul(31, hash) + raw.charCodeAt(i)) | 0
    }
    const hex = Math.abs(hash).toString(16).padStart(8, '0')
    return `VULN-${hex.toUpperCase()}`
}

// ── Agent Summary Builder ─────────────────────────────────────────────────────
//
// Produces the text injected into agent prompts.
// Agents read this to know what to look for and where.

function buildAgentSummary(finding: Omit<VulnerabilityFinding, 'agentSummary' | 'agentContext'>): string {
    const lines = [
        `[${finding.severity}/${finding.confidence}] ${finding.title}`,
        `ID: ${finding.id} | Category: ${finding.category}`,
        ``,
        `ENTRY POINT : ${finding.entryPoint}() @ ${finding.entryFile}:${finding.entryLine}`,
        `SINK        : ${finding.sink}() @ ${finding.sinkFile}:${finding.sinkLine}`,
        `CHAIN DEPTH : ${finding.chainDepth} hops | Cross-file: ${finding.crossesFileCount} boundaries`,
        ``,
        `CALL PATH:`,
        ...finding.callChain.map((hop, i) =>
            `  ${'  '.repeat(i)}→ ${hop.functionName}() [${hop.filePath}:${hop.line}]${hop.isEntryPoint ? ' ⚠ ENTRY' : ''}`
        ),
        ``,
        `EVIDENCE:`,
        `  ${finding.evidence.dataFlowDescription}`,
        `  Pattern   : ${finding.evidence.vulnerablePattern}`,
        `  Missing   : ${finding.evidence.missingDefense}`,
        ``,
        `REMEDIATION: ${finding.remediation.summary}`,
    ]
    return lines.join('\n')
}

function buildAgentContext(finding: Omit<VulnerabilityFinding, 'agentSummary' | 'agentContext'>): string[] {
    return [
        `Vulnerability type: ${finding.category} (${finding.vulnType})`,
        `Severity: ${finding.severity} | Confidence: ${finding.confidence}`,
        `Entry: ${finding.entryPoint}() in ${finding.entryFile}`,
        `Sink: ${finding.sink}() in ${finding.sinkFile}`,
        `Chain depth: ${finding.chainDepth} function boundaries`,
        `Cross-file: ${finding.crossesFileCount > 0}`,
        finding.evidence.returnValueNeverChecked
            ? `Return value of ${finding.sink}() is NEVER null-checked before use`
            : '',
        finding.evidence.dataFlowsFromEntryPoint
            ? `Data flow originates from HTTP entry point — user-controlled input`
            : '',
        finding.evidence.asyncWithoutAwait
            ? `Async call without await — unhandled rejection risk`
            : '',
        `Fix: ${finding.remediation.summary}`,
    ].filter(Boolean)
}

// ── Main Chain Detector ───────────────────────────────────────────────────────

export interface ChainDetectorResult {
    findings: VulnerabilityFinding[]
    stats: ChainDetectorStats
    agentSlices: AgentSlices
}

export interface ChainDetectorStats {
    totalFindings: number
    bySeverity: Record<ChainRisk, number>
    byCategory: Partial<Record<VulnCategory, number>>
    byConfidence: Record<ConfidenceLevel, number>
    confirmedFindings: number
    crossFileFindings: number
    chainsAnalyzed: number
    clustersFormed: number
    noiseFiltered: number
}

// Per-agent finding subsets — each agent only sees what's relevant to it
export interface AgentSlices {
    hacker: VulnerabilityFinding[]     // injection, SSRF, RCE, path traversal
    guardian: VulnerabilityFinding[]   // auth bypass, null dereference
    auditor: VulnerabilityFinding[]    // null dereference, unhandled async
    sleuth: VulnerabilityFinding[]     // all cross-file findings
}

export function runChainDetector(chains: CallerCalleeChain[]): ChainDetectorResult {
    console.log(`[Chain Detector] Starting — ${chains.length} chains to analyze`)

    // ── Phase 1: Cluster chains by root cause ─────────────────────────────────
    const clusters = clusterChains(chains)
    console.log(`[Chain Detector] Formed ${clusters.size} clusters from ${chains.length} chains`)

    const findings: VulnerabilityFinding[] = []
    let noiseFiltered = 0

    // ── Phase 2: Apply detection rules to each cluster ────────────────────────
    for (const [clusterKey, clusterChains] of Array.from(clusters.entries())) {
        // Determine which rules apply to this cluster's vuln types
        const clusterVulnTypes = new Set(clusterChains.map(c => c.vulnType))

        let detectionResult: DetectionResult | null = null
        let matchedRule: DetectionRule | null = null

        // Apply rules in priority order — stop at first match
        for (const rule of DETECTION_RULES) {
            if (rule.appliesTo.some(t => clusterVulnTypes.has(t))) {
                detectionResult = rule.detect(clusterChains)
                if (detectionResult) {
                    matchedRule = rule
                    break
                }
            }
        }

        // No rule fired — filter as noise
        if (!detectionResult) {
            noiseFiltered++
            continue
        }

        // LOW confidence same-file findings — filter unless caller is entry point
        if (
            detectionResult.confidence === 'LOW' &&
            clusterChains.every(c => !c.crossFile) &&
            clusterChains.every(c => !c.callerIsEntryPoint)
        ) {
            noiseFiltered++
            continue
        }

        // ── Phase 3: Build full VulnerabilityFinding ──────────────────────────

        // Find the best representative chain for location info
        const representative = clusterChains.find(c => c.callerIsEntryPoint) ?? clusterChains[0]

        // Reconstruct full call chain
        const callChain = buildCallChain(clusterChains)
        const entryHop = callChain.find(h => h.isEntryPoint) ?? callChain[0]
        const sinkHop = callChain[callChain.length - 1]

        // Determine severity: take highest severity from contributing chains
        const riskOrder: Record<ChainRisk, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
        let severity: ChainRisk = 'LOW'
        for (const c of clusterChains) {
            if (riskOrder[c.riskScore] < riskOrder[severity]) {
                severity = c.riskScore
            }
        }

        // Count cross-file boundaries
        const crossesFileCount = new Set(
            clusterChains
                .filter(c => c.crossFile)
                .flatMap(c => [c.callerFile, c.calleeFile])
        ).size

        // Build evidence
        const userInputSources = clusterChains
            .filter(c => c.argumentsContainUserInput)
            .map(c => c.callerFile + ':' + c.callerLine)
            .filter(Boolean)

        const evidence: FindingEvidence = {
            userInputSource: userInputSources[0] ?? null,
            dataFlowDescription: `${callChain.length}-hop call chain from ${entryHop?.functionName ?? 'unknown'}() to ${sinkHop?.functionName ?? 'unknown'}()`,
            vulnerablePattern: detectionResult.evidence.vulnerablePattern ?? '',
            missingDefense: detectionResult.evidence.missingDefense ?? '',
            returnValueNeverChecked: detectionResult.evidence.returnValueNeverChecked ?? false,
            dataFlowsFromEntryPoint: detectionResult.evidence.dataFlowsFromEntryPoint ?? representative.dataFromEntryPoint,
            crossFileFlow: crossesFileCount > 0,
            noErrorHandling: detectionResult.evidence.noErrorHandling ?? false,
            asyncWithoutAwait: detectionResult.evidence.asyncWithoutAwait ?? false,
            keyLocations: buildKeyLocations(clusterChains, callChain),
        }

        const findingId = buildFindingId(
            representative.vulnType,
            representative.callee,
            representative.calleeFile
        )

        const partialFinding: Omit<VulnerabilityFinding, 'remediation' | 'agentSummary' | 'agentContext'> = {
            id: findingId,
            category: detectionResult.category,
            vulnType: representative.vulnType,
            title: detectionResult.title,
            severity,
            confidence: detectionResult.confidence,
            entryPoint: entryHop?.functionName ?? representative.caller,
            entryFile: entryHop?.filePath ?? representative.callerFile,
            entryLine: entryHop?.line ?? representative.callerLine,
            sink: sinkHop?.functionName ?? representative.callee,
            sinkFile: sinkHop?.filePath ?? representative.calleeFile,
            sinkLine: sinkHop?.line ?? representative.calleeStartLine,
            callChain,
            chainDepth: callChain.length,
            crossesFileCount,
            evidence,
            contributingChains: clusterChains,
            chainIds: clusterChains.map(c => c.id),
        }

        const remediation = buildRemediation(detectionResult.category, partialFinding)

        const finding: VulnerabilityFinding = {
            ...partialFinding,
            remediation,
            agentSummary: buildAgentSummary({ ...partialFinding, remediation }),
            agentContext: buildAgentContext({ ...partialFinding, remediation }),
        }

        findings.push(finding)
    }

    // ── Phase 4: Deduplicate ──────────────────────────────────────────────────
    // Same finding ID = same root cause — keep the highest confidence/severity one
    const deduped = deduplicateFindings(findings)

    // ── Phase 5: Sort by priority ─────────────────────────────────────────────
    const riskOrder: Record<ChainRisk, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
    const confOrder: Record<ConfidenceLevel, number> = { CONFIRMED: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }

    deduped.sort((a, b) => {
        const sev = riskOrder[a.severity] - riskOrder[b.severity]
        if (sev !== 0) return sev
        return confOrder[a.confidence] - confOrder[b.confidence]
    })

    // ── Phase 6: Build stats ──────────────────────────────────────────────────
    const stats = buildStats(deduped, chains.length, clusters.size, noiseFiltered)

    // ── Phase 7: Slice per agent ──────────────────────────────────────────────
    const agentSlices = buildAgentSlices(deduped)

    // Log summary
    console.log(`[Chain Detector] Done:`)
    console.log(`  Clusters formed   : ${clusters.size}`)
    console.log(`  Findings produced : ${deduped.length}`)
    console.log(`  Noise filtered    : ${noiseFiltered}`)
    console.log(`  CRITICAL          : ${stats.bySeverity.CRITICAL}`)
    console.log(`  HIGH              : ${stats.bySeverity.HIGH}`)
    console.log(`  CONFIRMED         : ${stats.byConfidence.CONFIRMED}`)
    console.log(`  Cross-file        : ${stats.crossFileFindings}`)

    return { findings: deduped, stats, agentSlices }
}

// ── Deduplication ─────────────────────────────────────────────────────────────

function deduplicateFindings(findings: VulnerabilityFinding[]): VulnerabilityFinding[] {
    const seen = new Map<string, VulnerabilityFinding>()
    const confOrder: Record<ConfidenceLevel, number> = { CONFIRMED: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
    const riskOrder: Record<ChainRisk, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }

    for (const finding of findings) {
        const existing = seen.get(finding.id)
        if (!existing) {
            seen.set(finding.id, finding)
            continue
        }

        // Keep whichever is higher confidence + severity
        const isBetter =
            confOrder[finding.confidence] < confOrder[existing.confidence] ||
            (confOrder[finding.confidence] === confOrder[existing.confidence] &&
                riskOrder[finding.severity] < riskOrder[existing.severity])

        if (isBetter) {
            // Merge contributing chains from both
            const merged: VulnerabilityFinding = {
                ...finding,
                contributingChains: [...finding.contributingChains, ...existing.contributingChains],
                chainIds: Array.from(new Set(finding.chainIds.concat(existing.chainIds))),
            }
            seen.set(finding.id, merged)
        }
    }

    return Array.from(seen.values())
}

// ── Stats Builder ─────────────────────────────────────────────────────────────

function buildStats(
    findings: VulnerabilityFinding[],
    chainsAnalyzed: number,
    clustersFormed: number,
    noiseFiltered: number,
): ChainDetectorStats {
    const bySeverity: Record<ChainRisk, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 }
    const byCategory: Partial<Record<VulnCategory, number>> = {}
    const byConfidence: Record<ConfidenceLevel, number> = { CONFIRMED: 0, HIGH: 0, MEDIUM: 0, LOW: 0 }

    for (const f of findings) {
        bySeverity[f.severity]++
        byCategory[f.category] = (byCategory[f.category] ?? 0) + 1
        byConfidence[f.confidence]++
    }

    return {
        totalFindings: findings.length,
        bySeverity,
        byCategory,
        byConfidence,
        confirmedFindings: byConfidence.CONFIRMED,
        crossFileFindings: findings.filter(f => f.crossesFileCount > 0).length,
        chainsAnalyzed,
        clustersFormed,
        noiseFiltered,
    }
}

// ── Agent Slices ──────────────────────────────────────────────────────────────

function buildAgentSlices(findings: VulnerabilityFinding[]): AgentSlices {
    return {
        hacker: findings.filter(f =>
            ['INJECTION', 'RCE', 'SSRF', 'PATH_TRAVERSAL'].includes(f.category)
        ),
        guardian: findings.filter(f =>
            ['AUTH_BYPASS', 'NULL_DEREFERENCE'].includes(f.category)
        ),
        auditor: findings.filter(f =>
            ['NULL_DEREFERENCE', 'UNHANDLED_ASYNC'].includes(f.category)
        ),
        sleuth: findings.filter(f => f.crossesFileCount > 0),
    }
}

// ── Agent Prompt Formatters ───────────────────────────────────────────────────
//
// Formats findings into the === VULNERABILITY FINDINGS === block
// injected into agent prompts in runner.ts

export function formatFindingsForAgentPrompt(
    findings: VulnerabilityFinding[],
    maxFindings: number = 15
): string {
    if (findings.length === 0) {
        return `=== VULNERABILITY FINDINGS ===\nNo confirmed findings.\n==============================`
    }

    const top = findings.slice(0, maxFindings)
    const findingText = top.map((f, i) =>
        `[${i + 1}] ${f.agentSummary}`
    ).join('\n\n' + '─'.repeat(60) + '\n\n')

    const skipped = findings.length > maxFindings
        ? `\n... and ${findings.length - maxFindings} more findings`
        : ''

    return [
        `=== VULNERABILITY FINDINGS ===`,
        `Total: ${findings.length} | CRITICAL: ${findings.filter(f => f.severity === 'CRITICAL').length} | HIGH: ${findings.filter(f => f.severity === 'HIGH').length} | CONFIRMED: ${findings.filter(f => f.confidence === 'CONFIRMED').length}`,
        ``,
        findingText,
        skipped,
        `==============================`,
    ].join('\n')
}

// Compact format for context-window-constrained agents
export function formatFindingsCompact(findings: VulnerabilityFinding[]): string {
    return findings.map(f =>
        `• [${f.severity}/${f.confidence}] ${f.title} — ${f.entryPoint}()→${f.sink}() (${f.entryFile})`
    ).join('\n')
}