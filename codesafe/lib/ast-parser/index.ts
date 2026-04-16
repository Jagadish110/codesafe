// ─────────────────────────────────────────────────────────────────────────────
// lib/ast-parser/index.ts
// STEP 1 — Tree-sitter Setup + Language Detection
//
// PURPOSE:
// This is the foundation of the interprocedural chain analysis system.
// It takes raw file content, detects the language, parses it into an AST
// (Abstract Syntax Tree), and prepares it for function + call extraction.
//
// PIPELINE POSITION:
// Raw Code → Graph Builder → [AST PARSER HERE] → Orchestrator → Agents
//
// WHAT THIS FILE DOES:
// 1. Detects language from file extension
// 2. Loads the correct Tree-sitter grammar
// 3. Parses each file into a syntax tree
// 4. Returns a ParsedFile[] ready for Step 2 (function extractor)
//
// SUPPORTED LANGUAGES:
// TypeScript, JavaScript, TSX, JSX, Python, Go, Java, PHP, Ruby, C, C++
// (Dart/Flutter — Tree-sitter grammar available but optional, add in v1.1)
// ─────────────────────────────────────────────────────────────────────────────

import type * as Parser from 'tree-sitter'
// tree-sitter uses CommonJS export= — cast required for ESM constructor call
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ParserCtor = require('tree-sitter') as typeof Parser

// ── Types ─────────────────────────────────────────────────────────────────────

export type SupportedLanguage =
    | 'typescript'
    | 'javascript'
    | 'tsx'
    | 'jsx'
    | 'python'
    | 'go'
    | 'java'
    | 'php'
    | 'ruby'
    | 'c'
    | 'cpp'
    | 'unknown'

export interface RawFile {
    path: string       // relative file path e.g. "api/user.ts"
    content: string    // raw source code as string
}

export interface ParsedFile {
    path: string
    language: SupportedLanguage
    content: string
    tree: Parser.Tree        // full AST tree from Tree-sitter
    rootNode: Parser.SyntaxNode  // root node — pass to extractors in Step 2/3
    lineCount: number
    isSupported: boolean     // false if language couldn't be parsed
    parseError: string | null
}

// ── Language Detection ────────────────────────────────────────────────────────

// Maps file extensions to language identifiers
const EXTENSION_MAP: Record<string, SupportedLanguage> = {
    '.ts': 'typescript',
    '.tsx': 'tsx',
    '.js': 'javascript',
    '.jsx': 'jsx',
    '.mjs': 'javascript',
    '.cjs': 'javascript',
    '.py': 'python',
    '.go': 'go',
    '.java': 'java',
    '.php': 'php',
    '.rb': 'ruby',
    '.c': 'c',
    '.cpp': 'cpp',
    '.cc': 'cpp',
    '.cxx': 'cpp',
}

export function detectLanguage(filePath: string): SupportedLanguage {
    const lower = filePath.toLowerCase()

    // find the extension — handles multi-dot filenames like "route.test.ts"
    const lastDot = lower.lastIndexOf('.')
    if (lastDot === -1) return 'unknown'

    const ext = lower.slice(lastDot)
    return EXTENSION_MAP[ext] ?? 'unknown'
}

// ── Grammar Loader ────────────────────────────────────────────────────────────
//
// Lazy-loads Tree-sitter grammars only when needed.
// This avoids loading all grammars on startup — only load what's in the codebase.
//
// INSTALL REQUIRED (add to package.json):
// npm install tree-sitter tree-sitter-typescript tree-sitter-javascript
// npm install tree-sitter-python tree-sitter-go tree-sitter-java
// npm install tree-sitter-php tree-sitter-ruby tree-sitter-c tree-sitter-cpp

const grammarCache: Partial<Record<SupportedLanguage, any>> = {}

async function loadGrammar(language: SupportedLanguage): Promise<any | null> {
    // return cached grammar if already loaded
    if (grammarCache[language]) return grammarCache[language]

    try {
        let grammar: any

        switch (language) {
            case 'typescript':
            case 'tsx':
                // tree-sitter-typescript exports { typescript, tsx }
                const ts = await import('tree-sitter-typescript')
                grammar = language === 'tsx' ? ts.tsx : ts.typescript
                break

            case 'javascript':
            case 'jsx':
                grammar = require('tree-sitter-javascript')
                break

            case 'python':
                grammar = require('tree-sitter-python')
                break

            case 'go':
                grammar = require('tree-sitter-go')
                break

            case 'java':
                grammar = require('tree-sitter-java')
                break

            case 'php': {
                const phpMod = require('tree-sitter-php')
                grammar = phpMod.php ?? phpMod
                break
            }

            case 'ruby':
                grammar = require('tree-sitter-ruby')
                break

            case 'c':
                grammar = require('tree-sitter-c')
                break

            case 'cpp':
                grammar = require('tree-sitter-cpp')
                break

            default:
                return null
        }

        grammarCache[language] = grammar
        return grammar

    } catch (err) {
        // grammar package not installed — skip this language
        console.warn(`[AST Parser] Grammar not available for: ${language}. Install tree-sitter-${language}`)
        return null
    }
}

// ── Core Parser ───────────────────────────────────────────────────────────────

// One parser instance per language — Tree-sitter is not thread-safe
// but we run sequentially so this is fine
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const parserInstance = new (ParserCtor as any)() as any

async function parseFile(file: RawFile): Promise<ParsedFile> {
    const language = detectLanguage(file.path)
    const lineCount = file.content.split('\n').length

    // base result for unsupported languages
    const base: ParsedFile = {
        path: file.path,
        language,
        content: file.content,
        tree: null as any,
        rootNode: null as any,
        lineCount,
        isSupported: false,
        parseError: null,
    }

    if (language === 'unknown') {
        return { ...base, parseError: 'Unknown file extension — skipped' }
    }

    const grammar = await loadGrammar(language)
    if (!grammar) {
        return { ...base, parseError: `Grammar not installed for ${language}` }
    }

    try {
        parserInstance.setLanguage(grammar)
        const tree = parserInstance.parse(file.content)

        // check if Tree-sitter hit parse errors
        // hasError is true if the file has syntax errors — still parse, but note it
        const hasError = tree.rootNode.hasError

        return {
            ...base,
            tree,
            rootNode: tree.rootNode,
            isSupported: true,
            parseError: hasError ? 'File has syntax errors — AST may be incomplete' : null,
        }

    } catch (err) {
        return {
            ...base,
            parseError: `Parse failed: ${err instanceof Error ? err.message : String(err)}`,
        }
    }
}

// ── Main Entry Point ──────────────────────────────────────────────────────────

export interface ASTParserResult {
    parsed: ParsedFile[]
    stats: {
        total: number
        supported: number
        skipped: number
        withErrors: number
        byLanguage: Record<string, number>
    }
}

export async function runASTParser(files: RawFile[]): Promise<ASTParserResult> {
    console.log(`[AST Parser] Starting — ${files.length} files`)

    const parsed: ParsedFile[] = []
    const byLanguage: Record<string, number> = {}

    // parse files sequentially — Tree-sitter parser is not thread-safe
    for (const file of files) {
        // skip files that are too large (>500KB) — prevents memory issues
        if (Buffer.byteLength(file.content, 'utf8') > 500_000) {
            console.warn(`[AST Parser] Skipping large file: ${file.path}`)
            parsed.push({
                path: file.path,
                language: detectLanguage(file.path),
                content: file.content,
                tree: null as any,
                rootNode: null as any,
                lineCount: file.content.split('\n').length,
                isSupported: false,
                parseError: 'File too large (>500KB) — skipped for performance',
            })
            continue
        }

        const result = await parseFile(file)
        parsed.push(result)

        // track language stats
        const lang = result.language
        byLanguage[lang] = (byLanguage[lang] ?? 0) + 1

        if (result.parseError) {
            console.warn(`[AST Parser] ${file.path}: ${result.parseError}`)
        }
    }

    const supported = parsed.filter(f => f.isSupported).length
    const skipped = parsed.filter(f => !f.isSupported).length
    const withErrors = parsed.filter(f => f.parseError && f.isSupported).length

    const stats = { total: files.length, supported, skipped, withErrors, byLanguage }

    console.log(`[AST Parser] Done — ${supported}/${files.length} parsed successfully`)
    console.log(`[AST Parser] By language:`, byLanguage)

    return { parsed, stats }
}

// ── Utility Helpers ───────────────────────────────────────────────────────────
// Used by Step 2 (function extractor) and Step 3 (call extractor)

// Walk all nodes in the AST tree — DFS traversal
export function walkTree(node: Parser.SyntaxNode): Parser.SyntaxNode[] {
    const result: Parser.SyntaxNode[] = [node]
    for (const child of node.children) {
        const childNodes = walkTree(child)
        for (let i = 0; i < childNodes.length; i++) {
            result.push(childNodes[i])
        }
    }
    return result
}

// Get the text content of a node from the raw source
export function getNodeText(node: Parser.SyntaxNode, source: string): string {
    return source.slice(node.startIndex, node.endIndex)
}

// Get line number (1-indexed) from a node
export function getLineNumber(node: Parser.SyntaxNode): number {
    return node.startPosition.row + 1
}

// Check if a node is inside a test file
export function isTestFile(filePath: string): boolean {
    return (
        filePath.includes('.test.') ||
        filePath.includes('.spec.') ||
        filePath.includes('__tests__') ||
        filePath.includes('/test/') ||
        filePath.includes('/tests/')
    )
}

// Check if a node type represents a function definition
// across all supported languages
export function isFunctionNode(nodeType: string): boolean {
    return [
        // JavaScript / TypeScript
        'function_declaration',
        'function_expression',
        'arrow_function',
        'method_definition',
        'generator_function_declaration',
        // Python
        'function_definition',
        'async_function_definition',
        // Go
        'function_declaration',
        'method_declaration',
        // Java
        'method_declaration',
        'constructor_declaration',
        // PHP
        'function_definition',
        'method_declaration',
        // Ruby
        'method',
        'singleton_method',
        // C / C++
        'function_definition',
    ].includes(nodeType)
}

// Check if a node type represents a function call
export function isCallNode(nodeType: string): boolean {
    return [
        // JavaScript / TypeScript
        'call_expression',
        'new_expression',
        // Python
        'call',
        // Go
        'call_expression',
        // Java
        'method_invocation',
        'object_creation_expression',
        // PHP
        'function_call_expression',
        'member_call_expression',
        // Ruby
        'call',
        'method_call',
        // C / C++
        'call_expression',
    ].includes(nodeType)
}