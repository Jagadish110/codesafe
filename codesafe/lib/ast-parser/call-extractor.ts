// ─────────────────────────────────────────────────────────────────────────────
// lib/ast-parser/call-extractor.ts
// STEP 3 — Call Site Extractor
//
// PURPOSE:
// Walks every parsed AST tree and finds ALL function call sites.
// Each call site becomes a CallSite — a structured object that captures
// exactly where a function is called, what arguments are passed, and
// critically — whether the return value is actually checked or just used blindly.
//
// PIPELINE POSITION:
// AST Parser → Function Extractor → [CALL EXTRACTOR HERE] → Linker → Chain Detector
//
// WHAT THIS FILE DOES:
// 1. Walks AST trees to find every function call expression
// 2. Extracts: caller context, callee name, arguments, line number
// 3. Detects security-critical flags:
//    - returnValueChecked  → is the return value null-checked before use?
//    - returnValueUsed     → is the return value used at all?
//    - returnValueIgnored  → fire-and-forget call (no await, no assignment)
//    - argumentsFromParams → are the arguments coming from the parent function's params?
//                            (i.e. is user input being passed through?)
// 4. Returns CallSite[] ready for Step 4 (Linker)
//
// WHY THIS MATTERS:
// From the paper (Lira et al., EASE 2026):
// "The vulnerability arises solely from the interprocedural interaction
//  between caller and callee" — you cannot find it by looking at one file.
// This extractor is what makes cross-file chain detection possible.
// ─────────────────────────────────────────────────────────────────────────────

import * as Parser from 'tree-sitter'
import {
    walkTree,
    getNodeText,
    getLineNumber,
    isCallNode,
    type ParsedFile,
    type SupportedLanguage,
} from './index'
import type { FunctionNode } from './extractor'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CallArgument {
    text: string           // raw argument text
    isLiteral: boolean     // is it a hardcoded value? (string, number, bool)
    isUserInput: boolean   // does it look like it came from req.body/params/query?
}

export interface CallSite {
    // Identity
    id: string                    // unique: "filePath::calleeName::line"
    calleeName: string            // name of function being called
    calleeFile: string | null     // resolved file path (null until Step 4 links it)
    callerFile: string            // file where this call happens
    callerFunctionName: string    // function that contains this call ("module" if top-level)
    line: number                  // line number of the call

    // Arguments
    arguments: CallArgument[]
    argumentCount: number

    // Return value handling — KEY for chain detection
    returnValueUsed: boolean      // assigned to variable or used in expression
    returnValueChecked: boolean   // null/undefined checked before use
    returnValueAwaited: boolean   // has await keyword
    returnValueIgnored: boolean   // call result completely discarded

    // Data flow flags
    argumentsFromParams: boolean  // args include parent function params (user input passthrough)
    argumentsContainUserInput: boolean  // args contain req.body/params/query patterns
    isChained: boolean            // foo().bar() — chained call, harder to track

    // Raw node
    _node: Parser.SyntaxNode
}

// ── Return Value Analysis ─────────────────────────────────────────────────────
//
// This is the most important part of the call extractor.
// Determines how the return value of a function call is handled.
//
// Patterns we detect:
//
// returnValueIgnored:
//   someFunction()          ← no assignment, no await
//
// returnValueUsed + not checked:
//   const user = getUser(id)
//   return user.email       ← user used without null check
//
// returnValueUsed + checked:
//   const user = getUser(id)
//   if (!user) return null  ← null check present before use
//   return user.email
//
// returnValueAwaited:
//   const user = await getUser(id)  ← async call

function analyzeReturnValue(
    callNode: Parser.SyntaxNode,
    source: string
): Pick<CallSite, 'returnValueUsed' | 'returnValueChecked' | 'returnValueAwaited' | 'returnValueIgnored'> {
    const parent = callNode.parent
    const grandParent = parent?.parent

    // await expression wrapping the call
    const isAwaited =
        parent?.type === 'await_expression' ||
        getNodeText(callNode, source).startsWith('await ')

    // check if return value is assigned to something
    const isAssigned =
        parent?.type === 'variable_declarator' ||
        parent?.type === 'assignment_expression' ||
        parent?.type === 'assignment' ||
        grandParent?.type === 'variable_declarator' ||
        grandParent?.type === 'assignment_expression'

    // check if used directly in an expression (return foo(), if (foo()), etc.)
    const isUsedInExpression =
        parent?.type === 'return_statement' ||
        parent?.type === 'if_statement' ||
        parent?.type === 'binary_expression' ||
        parent?.type === 'argument_list' ||
        parent?.type === 'arguments' ||
        parent?.type === 'member_expression' ||    // foo().bar
        parent?.type === 'subscript_expression'    // foo()[0]

    const returnValueUsed = isAssigned || isUsedInExpression || isAwaited
    const returnValueIgnored = !returnValueUsed

    // for null check detection, we look at the surrounding context
    // get the text of the enclosing block to check for null guards
    let returnValueChecked = false

    if (isAssigned && parent) {
        // find the variable name that holds the return value
        const varNameNode =
            parent.type === 'variable_declarator'
                ? parent.childForFieldName('name')
                : grandParent?.childForFieldName('name')

        if (varNameNode) {
            const varName = getNodeText(varNameNode, source)

            // look at the enclosing function body for null checks on this variable
            let scope = callNode.parent
            while (scope && scope.type !== 'statement_block' && scope.type !== 'function_body' && scope.type !== 'block') {
                scope = scope.parent
            }

            if (scope) {
                const scopeText = getNodeText(scope, source)
                // check if variable name appears near null check patterns
                const nullCheckPatterns = [
                    new RegExp(`if\\s*\\(!?\\s*${varName}\\s*\\)`),  // if (!user) or if (user)
                    new RegExp(`${varName}\\s*!==\\s*(null|undefined)`),
                    new RegExp(`${varName}\\s*===\\s*(null|undefined)`),
                    new RegExp(`${varName}\\s*==\\s*(null|undefined)`),
                    new RegExp(`${varName}\\s*!=\\s*(null|undefined)`),
                    new RegExp(`${varName}\\?\\.`),                   // optional chaining
                    new RegExp(`${varName}\\s*\\?\\?`),               // nullish coalescing
                    new RegExp(`if\\s+${varName}\\s+is\\s+(None|not)`), // Python
                ]
                returnValueChecked = nullCheckPatterns.some(p => p.test(scopeText))
            }
        }
    }

    // if used directly in if statement — it IS being checked
    if (parent?.type === 'if_statement') {
        returnValueChecked = true
    }

    return {
        returnValueUsed,
        returnValueChecked,
        returnValueAwaited: isAwaited,
        returnValueIgnored,
    }
}

// ── Callee Name Extraction ────────────────────────────────────────────────────
//
// Handles all call patterns:
// - foo()              → "foo"
// - foo.bar()          → "bar" (method call)
// - foo?.bar()         → "bar" (optional chaining)
// - new Foo()          → "Foo"
// - await foo()        → "foo"

function extractCalleeName(
    callNode: Parser.SyntaxNode,
    source: string
): string {
    // new expression: new Foo()
    if (callNode.type === 'new_expression') {
        const constructor = callNode.childForFieldName('constructor')
        if (constructor) return getNodeText(constructor, source)
    }

    // get the function/method being called
    const funcNode =
        callNode.childForFieldName('function') ||
        callNode.childForFieldName('method') ||
        callNode.children[0]

    if (!funcNode) return 'unknown'

    const funcText = getNodeText(funcNode, source)

    // member expression: foo.bar → return "bar"
    if (funcNode.type === 'member_expression' || funcNode.type === 'field_expression') {
        const property = funcNode.childForFieldName('property')
        if (property) return getNodeText(property, source)
        // fallback: take last part after dot
        const parts = funcText.split('.')
        return parts[parts.length - 1]
    }

    // optional chain: foo?.bar → return "bar"
    if (funcNode.type === 'optional_chain' || funcText.includes('?.')) {
        const parts = funcText.split('?.')
        return parts[parts.length - 1].replace(/\(.*/, '')
    }

    // simple identifier: foo()
    return funcText.replace(/\(.*/, '').trim()
}

// ── Argument Analysis ─────────────────────────────────────────────────────────

// Patterns that suggest user input / external data
const USER_INPUT_PATTERNS = [
    /req\.(body|params|query|headers)/,
    /request\.(body|params|query|headers)/,
    /event\.(body|pathParameters|queryStringParameters)/,
    /ctx\.(body|params|query)/,
    /c\.(param|query|body)/,       // Go Gin
    /r\.FormValue/,                 // Go stdlib
    /input\./,
    /payload\./,
    /data\./,
]

function analyzeArguments(
    callNode: Parser.SyntaxNode,
    source: string,
    parentFunctionParams: string[]
): CallArgument[] {
    const args: CallArgument[] = []

    const argsNode =
        callNode.childForFieldName('arguments') ||
        callNode.children.find(c => c.type === 'arguments' || c.type === 'argument_list')

    if (!argsNode) return args

    for (const child of argsNode.children) {
        if (['(', ')', ',', 'comment'].includes(child.type)) continue

        const text = getNodeText(child, source).trim()
        if (!text) continue

        const isLiteral = [
            'string',
            'number',
            'integer',
            'float',
            'true',
            'false',
            'null',
            'undefined',
            'string_literal',
            'integer_literal',
            'float_literal',
            'boolean_literal',
        ].includes(child.type)

        // check if argument is user input
        const isUserInput =
            USER_INPUT_PATTERNS.some(p => p.test(text)) ||
            parentFunctionParams.some(param =>
                param.length > 1 && text.includes(param)  // param name appears in argument
            )

        args.push({ text, isLiteral, isUserInput })
    }

    return args
}

// ── Caller Function Context ───────────────────────────────────────────────────
//
// Find which function contains this call site.
// Walk up the AST tree until we hit a function node.

function findParentFunction(
    callNode: Parser.SyntaxNode,
    functions: FunctionNode[]
): FunctionNode | null {
    let current = callNode.parent

    while (current) {
        // check if this node is a function
        if ([
            'function_declaration',
            'function_expression',
            'arrow_function',
            'method_definition',
            'function_definition',
            'async_function_definition',
            'method_declaration',
        ].includes(current.type)) {
            // find the matching FunctionNode by line number
            const startLine = current.startPosition.row + 1
            return functions.find(f => f.startLine === startLine) ?? null
        }
        current = current.parent
    }

    return null // top-level call
}

// ── Main Call Site Extractor ──────────────────────────────────────────────────

export function extractCallSites(
    parsedFile: ParsedFile,
    functionsInFile: FunctionNode[]
): CallSite[] {
    if (!parsedFile.isSupported || !parsedFile.rootNode) return []

    const callSites: CallSite[] = []
    const seen = new Set<string>()

    for (const node of walkTree(parsedFile.rootNode)) {
        if (!isCallNode(node.type)) continue

        const calleeName = extractCalleeName(node, parsedFile.content)
        if (!calleeName || calleeName === 'unknown') continue

        // skip common non-security calls to reduce noise
        if (NOISE_CALLS.has(calleeName)) continue

        const line = getLineNumber(node)
        const id = `${parsedFile.path}::${calleeName}::${line}`

        if (seen.has(id)) continue
        seen.add(id)

        // find which function contains this call
        const parentFunc = findParentFunction(node, functionsInFile)
        const callerFunctionName = parentFunc?.name ?? 'module'
        const parentParams = parentFunc?.parameters.map(p => p.name) ?? []

        // analyze return value handling
        const returnValueInfo = analyzeReturnValue(node, parsedFile.content)

        // analyze arguments
        const callArguments = analyzeArguments(node, parsedFile.content, parentParams)

        // check if any argument contains user input (passthrough detection)
        const argumentsFromParams =
            callArguments.some(a => a.isUserInput) ||
            callArguments.some(a =>
                parentParams.some(p => p.length > 1 && a.text.includes(p))
            )

        // check if any argument contains user input patterns directly
        const argumentsContainUserInput = callArguments.some(a => a.isUserInput)

        // detect chained calls: foo().bar()
        const isChained =
            node.parent?.type === 'member_expression' ||
            node.parent?.type === 'call_expression'

        callSites.push({
            id,
            calleeName,
            calleeFile: null,       // resolved in Step 4 (Linker)
            callerFile: parsedFile.path,
            callerFunctionName,
            line,
            arguments: callArguments,
            argumentCount: callArguments.length,
            ...returnValueInfo,
            argumentsFromParams,
            argumentsContainUserInput,
            isChained,
            _node: node,
        })
    }

    return callSites
}

// ── Noise Filter ──────────────────────────────────────────────────────────────
//
// Skip built-in and utility calls that are never security relevant.
// Keeps the call graph clean and focused on application-level calls.

const NOISE_CALLS = new Set([
    // console
    'log', 'warn', 'error', 'info', 'debug', 'trace',
    // array methods
    'map', 'filter', 'reduce', 'forEach', 'find', 'findIndex',
    'some', 'every', 'flat', 'flatMap', 'includes', 'indexOf',
    'push', 'pop', 'shift', 'unshift', 'splice', 'slice', 'concat',
    'join', 'sort', 'reverse', 'fill', 'copyWithin', 'entries',
    'keys', 'values',
    // string methods
    'toString', 'toUpperCase', 'toLowerCase', 'trim', 'trimStart',
    'trimEnd', 'split', 'replace', 'replaceAll', 'startsWith',
    'endsWith', 'padStart', 'padEnd', 'charAt', 'charCodeAt',
    'substring', 'slice', 'indexOf', 'lastIndexOf', 'match',
    // object methods
    'assign', 'keys', 'values', 'entries', 'freeze', 'create',
    'hasOwnProperty', 'defineProperty',
    // math
    'Math', 'parseInt', 'parseFloat', 'isNaN', 'isFinite',
    'Number', 'String', 'Boolean', 'Array', 'Object',
    // react hooks — not security relevant
    'useState', 'useEffect', 'useCallback', 'useMemo', 'useRef',
    'useContext', 'useReducer', 'useLayoutEffect',
    // json
    'stringify', 'parse',
])

// ── Batch Extractor ───────────────────────────────────────────────────────────

export interface CallExtractorResult {
    callSites: CallSite[]
    stats: {
        totalCalls: number
        returnValueIgnored: number
        returnValueUsedUnchecked: number
        userInputPassthrough: number
        byFile: Record<string, number>
    }
}

export function extractAllCallSites(
    parsedFiles: ParsedFile[],
    allFunctions: FunctionNode[]
): CallExtractorResult {
    console.log(`[Call Extractor] Processing ${parsedFiles.length} files`)

    const allCallSites: CallSite[] = []
    const byFile: Record<string, number> = {}

    for (const file of parsedFiles) {
        if (!file.isSupported) continue

        // get functions that belong to this file
        const fileFunctions = allFunctions.filter(f => f.filePath === file.path)

        const calls = extractCallSites(file, fileFunctions)
        allCallSites.push(...calls)
        byFile[file.path] = calls.length

        if (calls.length > 0) {
            console.log(`[Call Extractor] ${file.path}: ${calls.length} call sites found`)
        }
    }

    const stats = {
        totalCalls: allCallSites.length,
        returnValueIgnored: allCallSites.filter(c => c.returnValueIgnored).length,
        returnValueUsedUnchecked: allCallSites.filter(
            c => c.returnValueUsed && !c.returnValueChecked
        ).length,
        userInputPassthrough: allCallSites.filter(c => c.argumentsFromParams).length,
        byFile,
    }

    console.log(`[Call Extractor] Done:`)
    console.log(`  Total call sites          : ${stats.totalCalls}`)
    console.log(`  Return value ignored      : ${stats.returnValueIgnored}`)
    console.log(`  Used without null check   : ${stats.returnValueUsedUnchecked}`)
    console.log(`  User input passthrough    : ${stats.userInputPassthrough}`)

    return { callSites: allCallSites, stats }
}