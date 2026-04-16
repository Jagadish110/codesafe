// ─────────────────────────────────────────────────────────────────────────────
// lib/ast-parser/extractor.ts
// STEP 2 — Function Extractor
//
// PURPOSE:
// Walks every parsed AST tree and extracts all function definitions.
// Each function becomes a FunctionNode — a structured object with name,
// location, parameters, return info, and security-relevant flags.
//
// PIPELINE POSITION:
// Raw Code → Graph Builder → AST Parser → [FUNCTION EXTRACTOR HERE] → ...
//
// WHAT THIS FILE DOES:
// 1. Walks the AST tree for every ParsedFile
// 2. Finds all function definitions (functions, methods, arrow functions)
// 3. Extracts name, file, line, parameters, return type
// 4. Detects security-relevant flags:
//    - hasNullCheck     → does this function check for null before using a value?
//    - hasErrorHandling → does it have try/catch?
//    - canReturnNull    → can this function return null/undefined/None?
//    - isAsync          → async functions have different error patterns
//    - isEntryPoint     → HTTP handlers, exported route functions
// 5. Returns FunctionNode[] ready for Step 3 (call extractor)
// ─────────────────────────────────────────────────────────────────────────────

import * as Parser from 'tree-sitter'
import {
    walkTree,
    getNodeText,
    getLineNumber,
    isTestFile,
    isFunctionNode,
    type ParsedFile,
    type SupportedLanguage,
} from './index'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FunctionParameter {
    name: string
    type: string | null      // TypeScript type annotation if present
    isOptional: boolean
}

export interface FunctionNode {
    // Identity
    id: string               // unique: "filePath::functionName::line"
    name: string             // function name ("anonymous" if arrow fn without name)
    filePath: string         // relative file path
    startLine: number        // 1-indexed
    endLine: number

    // Signature
    parameters: FunctionParameter[]
    returnType: string | null  // TypeScript return type annotation
    isAsync: boolean
    isExported: boolean

    // Security flags — used by chain detector in Step 5
    hasNullCheck: boolean      // checks for null/undefined before dereferencing
    hasErrorHandling: boolean  // has try/catch or .catch()
    canReturnNull: boolean     // has "return null" or "return undefined" or "return None"
    isEntryPoint: boolean      // HTTP handler / exported route function

    // Raw AST node — needed by call extractor in Step 3
    // Not serialized to JSON — only used in memory during pipeline
    _node: Parser.SyntaxNode
}

// ── Entry Point Name Patterns ─────────────────────────────────────────────────
//
// These patterns identify HTTP route handlers and entry points.
// Entry points are the highest-risk functions — they receive external input.

const ENTRY_POINT_PATTERNS = [
    // Next.js route handlers
    /^GET$/,
    /^POST$/,
    /^PUT$/,
    /^PATCH$/,
    /^DELETE$/,
    /^HEAD$/,
    /^OPTIONS$/,
    // Express handlers
    /handler/i,
    /controller/i,
    /route/i,
    /endpoint/i,
    // Common naming patterns
    /^handle[A-Z]/,      // handleLogin, handleRequest
    /^on[A-Z]/,          // onRequest, onMessage
    /Request$/i,          // loginRequest, getUserRequest
    /Action$/i,           // submitAction, deleteAction
]

// File paths that are always entry points
const ENTRY_POINT_FILE_PATTERNS = [
    /\/api\//,           // Next.js API routes
    /\/routes\//,        // Express routes
    /\/controllers\//,   // MVC controllers
    /route\.(ts|js)$/,   // route.ts files
    /handler\.(ts|js)$/, // handler.ts files
]

function detectIsEntryPoint(name: string, filePath: string, isExported: boolean): boolean {
    // check function name against patterns
    if (ENTRY_POINT_PATTERNS.some(p => p.test(name))) return true

    // check file path — if the file is a route file, exported functions are entry points
    if (isExported && ENTRY_POINT_FILE_PATTERNS.some(p => p.test(filePath))) return true

    return false
}

// ── Null Check Detection ──────────────────────────────────────────────────────
//
// Detects if a function body contains null/undefined checks.
// This tells the chain detector whether a function safely handles
// potentially-null return values from callees.

const NULL_CHECK_NODE_TYPES = new Set([
    'if_statement',
    'ternary_expression',
    'optional_chain',         // foo?.bar
    'binary_expression',      // foo !== null, foo == undefined
    'null_coalescing',        // foo ?? bar
])

const NULL_CHECK_PATTERNS = [
    /!== null/,
    /!== undefined/,
    /== null/,
    /== undefined/,
    /=== null/,
    /=== undefined/,
    /is None/,              // Python
    /is not None/,          // Python
    /\?\./,                 // optional chaining
    /\?\?/,                 // nullish coalescing
    /if \(.+\)/,            // general null guard pattern
]

function detectHasNullCheck(
    funcNode: Parser.SyntaxNode,
    source: string
): boolean {
    const funcText = getNodeText(funcNode, source)
    return NULL_CHECK_PATTERNS.some(p => p.test(funcText))
}

// ── Error Handling Detection ──────────────────────────────────────────────────

function detectHasErrorHandling(
    funcNode: Parser.SyntaxNode,
    source: string
): boolean {
    const funcText = getNodeText(funcNode, source)
    return (
        funcText.includes('try {') ||
        funcText.includes('try{') ||
        funcText.includes('.catch(') ||
        funcText.includes('except ') ||      // Python
        funcText.includes('rescue ') ||      // Ruby
        funcText.includes('catch (') ||
        funcText.includes('catch(')
    )
}

// ── Can Return Null Detection ─────────────────────────────────────────────────
//
// Detects if a function has any return statement that returns null/undefined.
// If yes — callers must null-check before using the return value.
// This is the KEY flag for NULL DEREFERENCE chain detection in Step 5.

const RETURN_NULL_PATTERNS = [
    /return null/,
    /return undefined/,
    /return None/,         // Python
    /return nil/,          // Go, Ruby
    /return \[\]0/,        // Go zero value
]

function detectCanReturnNull(
    funcNode: Parser.SyntaxNode,
    source: string
): boolean {
    const funcText = getNodeText(funcNode, source)
    return RETURN_NULL_PATTERNS.some(p => p.test(funcText))
}

// ── Function Name Extraction ──────────────────────────────────────────────────
//
// Different languages and function types store the name differently in the AST.
// This function handles all cases across all supported languages.

function extractFunctionName(
    node: Parser.SyntaxNode,
    source: string,
    language: SupportedLanguage
): string {
    // Try to find the name node as a direct child
    const nameNode = node.childForFieldName('name')
    if (nameNode) return getNodeText(nameNode, source)

    // Arrow functions assigned to variables: const foo = () => {}
    // The variable declarator is the parent — look one level up
    if (node.type === 'arrow_function' || node.type === 'function_expression') {
        const parent = node.parent
        if (parent?.type === 'variable_declarator') {
            const varName = parent.childForFieldName('name')
            if (varName) return getNodeText(varName, source)
        }
        // Object method: { foo: function() {} }
        if (parent?.type === 'pair') {
            const key = parent.childForFieldName('key')
            if (key) return getNodeText(key, source)
        }
    }

    // Method definitions in classes: class Foo { bar() {} }
    if (node.type === 'method_definition') {
        const key = node.childForFieldName('name')
        if (key) return getNodeText(key, source)
    }

    // Python function_definition
    if (language === 'python' && node.type === 'function_definition') {
        const nameChild = node.children.find(c => c.type === 'identifier')
        if (nameChild) return getNodeText(nameChild, source)
    }

    return 'anonymous'
}

// ── Parameter Extraction ──────────────────────────────────────────────────────

function extractParameters(
    node: Parser.SyntaxNode,
    source: string,
    language: SupportedLanguage
): FunctionParameter[] {
    const params: FunctionParameter[] = []

    // find the parameters node
    const paramsNode =
        node.childForFieldName('parameters') ||
        node.childForFieldName('formal_parameters') ||
        node.children.find(c =>
            c.type === 'formal_parameters' ||
            c.type === 'parameters'
        )

    if (!paramsNode) return params

    for (const child of paramsNode.children) {
        // skip punctuation nodes like ( ) ,
        if (['(', ')', ',', 'comment'].includes(child.type)) continue

        // TypeScript: typed parameter — "name: Type"
        if (child.type === 'required_parameter' || child.type === 'optional_parameter') {
            const nameNode = child.childForFieldName('pattern')
            const typeNode = child.childForFieldName('type')
            params.push({
                name: nameNode ? getNodeText(nameNode, source) : getNodeText(child, source),
                type: typeNode ? getNodeText(typeNode, source) : null,
                isOptional: child.type === 'optional_parameter',
            })
            continue
        }

        // Simple identifier param
        if (child.type === 'identifier') {
            params.push({ name: getNodeText(child, source), type: null, isOptional: false })
            continue
        }

        // Rest params, destructured params — just capture the text
        if (child.type !== 'comment') {
            const text = getNodeText(child, source).trim()
            if (text && text !== ',' && text !== '(' && text !== ')') {
                params.push({ name: text, type: null, isOptional: false })
            }
        }
    }

    return params
}

// ── Export Detection ──────────────────────────────────────────────────────────

function detectIsExported(node: Parser.SyntaxNode, source: string): boolean {
    const parent = node.parent
    if (!parent) return false

    // export function foo() {}
    if (parent.type === 'export_statement') return true

    // export default function() {}
    if (parent.type === 'export_default_declaration') return true

    // const foo = () => {} where the variable is exported
    if (parent.type === 'variable_declarator') {
        const varDecl = parent.parent
        const exportStmt = varDecl?.parent
        if (exportStmt?.type === 'export_statement') return true
    }

    // Check source text as fallback
    const funcText = getNodeText(node, source)
    const lineStart = source.lastIndexOf('\n', node.startIndex) + 1
    const lineText = source.slice(lineStart, node.startIndex + 10)
    return lineText.trimStart().startsWith('export')
}

// ── Return Type Extraction ────────────────────────────────────────────────────

function extractReturnType(node: Parser.SyntaxNode, source: string): string | null {
    const returnTypeNode = node.childForFieldName('return_type')
    if (returnTypeNode) return getNodeText(returnTypeNode, source)
    return null
}

// ── Async Detection ───────────────────────────────────────────────────────────

function detectIsAsync(node: Parser.SyntaxNode, source: string): boolean {
    // Check for async keyword in children
    for (const child of node.children) {
        if (child.type === 'async' || getNodeText(child, source) === 'async') return true
    }
    // Python async def
    if (node.type === 'async_function_definition') return true
    return false
}

// ── Main Extractor ────────────────────────────────────────────────────────────

export function extractFunctions(parsedFile: ParsedFile): FunctionNode[] {
    if (!parsedFile.isSupported || !parsedFile.rootNode) return []

    const functions: FunctionNode[] = []
    const seen = new Set<string>() // deduplicate by id

    for (const node of walkTree(parsedFile.rootNode)) {
        // only process function nodes
        if (!isFunctionNode(node.type)) continue

        const name = extractFunctionName(node, parsedFile.content, parsedFile.language)
        const startLine = getLineNumber(node)
        const endLine = node.endPosition.row + 1
        const isExported = detectIsExported(node, parsedFile.content)
        const isAsync = detectIsAsync(node, parsedFile.content)
        const isEntryPoint = detectIsEntryPoint(name, parsedFile.path, isExported)

        // build unique ID
        const id = `${parsedFile.path}::${name}::${startLine}`

        // skip duplicates (e.g. same function matched by multiple node types)
        if (seen.has(id)) continue
        seen.add(id)

        // skip anonymous functions in test files — not security relevant
        if (name === 'anonymous' && isTestFile(parsedFile.path)) continue

        const funcNode: FunctionNode = {
            id,
            name,
            filePath: parsedFile.path,
            startLine,
            endLine,
            parameters: extractParameters(node, parsedFile.content, parsedFile.language),
            returnType: extractReturnType(node, parsedFile.content),
            isAsync,
            isExported,
            hasNullCheck: detectHasNullCheck(node, parsedFile.content),
            hasErrorHandling: detectHasErrorHandling(node, parsedFile.content),
            canReturnNull: detectCanReturnNull(node, parsedFile.content),
            isEntryPoint,
            _node: node,
        }

        functions.push(funcNode)
    }

    return functions
}

// ── Batch Extractor ───────────────────────────────────────────────────────────
// Processes all parsed files and returns a flat list of all functions

export interface ExtractorResult {
    functions: FunctionNode[]
    stats: {
        totalFunctions: number
        entryPoints: number
        asyncFunctions: number
        canReturnNull: number
        withoutNullCheck: number
        byFile: Record<string, number>
    }
}

export function extractAllFunctions(parsedFiles: ParsedFile[]): ExtractorResult {
    console.log(`[Function Extractor] Processing ${parsedFiles.length} files`)

    const allFunctions: FunctionNode[] = []
    const byFile: Record<string, number> = {}

    for (const file of parsedFiles) {
        if (!file.isSupported) continue

        const funcs = extractFunctions(file)
        allFunctions.push(...funcs)
        byFile[file.path] = funcs.length

        if (funcs.length > 0) {
            console.log(`[Function Extractor] ${file.path}: ${funcs.length} functions found`)
        }
    }

    const stats = {
        totalFunctions: allFunctions.length,
        entryPoints: allFunctions.filter(f => f.isEntryPoint).length,
        asyncFunctions: allFunctions.filter(f => f.isAsync).length,
        canReturnNull: allFunctions.filter(f => f.canReturnNull).length,
        withoutNullCheck: allFunctions.filter(f => !f.hasNullCheck).length,
        byFile,
    }

    console.log(`[Function Extractor] Done:`)
    console.log(`  Total functions : ${stats.totalFunctions}`)
    console.log(`  Entry points    : ${stats.entryPoints}`)
    console.log(`  Can return null : ${stats.canReturnNull}`)
    console.log(`  No null check   : ${stats.withoutNullCheck}`)

    return { functions: allFunctions, stats }
}