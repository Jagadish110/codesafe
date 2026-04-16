/* ═══════════════════════════════════════════════════
   CONFIG.JS — API Keys & Configuration
   ═══════════════════════════════════════════════════
   
   🔑 Put your API keys and configuration here.
   This file is the ONLY place you need to update
   when changing API keys, models, or endpoints.
   
   ⚠️  In production, NEVER expose API keys in 
       frontend code. Use a backend proxy instead.
═══════════════════════════════════════════════════ */

const CONFIG = {
    // ── Active Provider ───────────────────────────
    // Set to 'google' or 'anthropic'
    ACTIVE_PROVIDER: 'google',

    // ── Google Gemini API ─────────────────────────
    GOOGLE_API_KEY: '', // MIGRATED TO BACKEND PROXY! Security fix
    GOOGLE_MODEL: 'gemini-3-flash-preview',
    GOOGLE_API_URL: 'https://generativelanguage.googleapis.com/v1beta/models/',

    // ── Anthropic API (kept for reference) ────────
    ANTHROPIC_API_URL: 'https://api.anthropic.com/v1/messages',
    ANTHROPIC_API_KEY: '', // MIGRATED TO BACKEND PROXY! Security fix
    ANTHROPIC_MODEL: 'claude-3-7-sonnet-20250219',

    // ── Scan Settings ─────────────────────────────
    SCAN_MAX_TOKENS: 24000,
    SCAN_MAX_FILES: 40,
    SCAN_MAX_CHARS: 75000,
    SCAN_FILE_CHAR_LIMIT: 4000,

    // ── Chat Settings ─────────────────────────────
    CHAT_MAX_TOKENS: 800,

    // ── Supported File Extensions ─────────────────
    CODE_EXTENSIONS: new Set([
        'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs',
        'html', 'htm', 'css', 'scss', 'sass',
        'php', 'py', 'rb', 'go', 'java', 'cs', 'cpp', 'c', 'rs', 'swift', 'kt',
        'vue', 'svelte',
        'json', 'yaml', 'yml', 'env', 'toml', 'ini', 'config',
        'sh', 'bash', 'sql', 'md', 'txt', 'prisma', 'graphql'
    ]),

    // ── GitHub Scan Extensions ────────────────────
    GITHUB_EXTENSIONS: new Set([
        'js', 'jsx', 'ts', 'tsx', 'html', 'htm', 'php', 'py', 'rb', 'go', 'java',
        'css', 'scss', 'vue', 'svelte', 'json', 'yaml', 'yml', 'toml', 'prisma',
        'sql', 'env', 'config', 'mjs', 'cjs', 'graphql'
    ]),

    // ── GitHub Skip Dirs ──────────────────────────
    GITHUB_SKIP_DIRS: new Set([
        'node_modules', '.git', 'dist', 'build', '.next', '__pycache__', 'vendor', 'coverage'
    ]),

    // ── Directories to Skip ───────────────────────
    SKIP_DIRECTORIES: new Set([
        'node_modules', '.git', 'dist', 'build', '.next', '__pycache__',
        '.cache', 'vendor', 'coverage', '.venv', 'venv', 'env', 'out',
        '.svelte-kit', 'target', '.turbo'
    ]),

    // ── Priority Keywords (for file ordering) ─────
    PRIORITY_KEYWORDS: [
        'env', 'config', 'auth', 'route', 'api', 'server', 'app', 'index', 'main',
        'middleware', 'db', 'database', 'login', 'signup', 'user', 'admin',
        'prisma', 'sql', 'secret', 'stripe', 'supabase', 'firebase'
    ],

    // ── Business Types ────────────────────────────
    BUSINESS_TYPES: {
        saas: 'SaaS app. Prioritise: auth bypass, broken access control, API key exposure, multi-tenant data leakage, missing rate limiting.',
        ecommerce: 'E-commerce store. Prioritise: payment data exposure, order manipulation, price tampering, customer PII leakage.',
        fintech: 'Fintech app. Prioritise: financial data exposure, transaction manipulation, missing encryption, PCI-DSS issues.',
        healthcare: 'Healthcare app. Prioritise: patient data (PHI) exposure, HIPAA issues, missing encryption, access control.',
        blog: 'Blog/CMS. Prioritise: admin panel exposure, file upload vulns, XSS in content, weak auth.',
        api: 'API/Backend. Prioritise: missing auth on endpoints, IDOR, rate limiting, injection, over-exposed data.',
    },

    // ── Stack Detection Signatures ────────────────
    STACKS: [
        { key: 'supabase', label: 'Supabase', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="#3ECF8E" style="vertical-align:middle;margin-right:2px;"><path d="M21.362 9.354H12V.396a.396.396 0 00-.714-.247l-8.648 11.621a.396.396 0 00.317.63h9.362v8.958a.396.396 0 00.714.247l8.651-11.621a.396.396 0 00-.32-.63z"/></svg>', sigs: ['supabase', 'createclient', '@supabase'] },
        { key: 'nextjs', label: 'Next.js', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:middle;margin-right:2px;"><path d="M12 0c-6.627 0-12 5.373-12 12s5.373 12 12 12 12-5.373 12-12-5.373-12-12-12zm6 17l-5.312-6.987c-.183-.241-.444-.313-.627-.313s-.431.104-.431.313v6.987h-1.231v-8.151c0-.522.425-.947.947-.947.378 0 .729.157.947.431l5.483 7.218v-7.649h1.229v9.101h-.005zM12 3.4c.331 0 .6.269.6.6v8.4c0 .331-.269.6-.6.6s-.6-.269-.6-.6v-8.4c0-.331.269-.6.6-.6z"/></svg>', sigs: ['next/', '\"next\"', 'pages/api', 'app/api', '/app/page'] },
        { key: 'firebase', label: 'Firebase', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="#FFCA28" style="vertical-align:middle;margin-right:2px;"><path d="M3.89 15.672L6.255.462a.366.366 0 01.688-.04l1.83 3.442L3.89 15.672zm.215.17l4.896-9.143L12.394 13.04l.112-.556L8.761 4.706l-1.07 2.01 6.551 10.963a.35.35 0 01-.137.491.367.367 0 01-.42-.036L3.13 21.056a.365.365 0 01-.06-.51.35.35 0 01.078-.07l.957-.634zm16.76.66l-1.89-3.535-1.92-1.07V11.23l2.88 5.41a.34.34 0 01-.137.45.367.367 0 01-.408-.035L12.394 21.056a.365.365 0 01-.51-.06.35.35 0 01-.07-.078L6.44 15.672 12.394 4.54l1.355 2.54 1.152-2.16-2.507-4.706a.366.366 0 00-.693.003L3.13 15.672l.483.91 8.781 5.341a.367.367 0 00.37-.001l8.729-5.309a.367.367 0 00.042-.644z"/></svg>', sigs: ['firebase', 'initializeapp', 'firestore', '@firebase'] },
        { key: 'stripe', label: 'Stripe', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="#635BFF" style="vertical-align:middle;margin-right:2px;"><path d="M13.966 9.755c-1.127-.514-1.776-.872-1.776-1.503 0-.549.492-.937 1.285-.937 1.467 0 2.946.549 3.012 1.832h1.492c-.075-2.022-1.636-3.134-3.543-3.134-1.896 0-3.23.957-3.23 2.584 0 1.944 1.583 2.656 3.193 3.31 1.21.486 1.859.878 1.859 1.572 0 .696-.6 1.054-1.467 1.054-1.626 0-3.321-.77-3.414-2.213H9.885c.108 2.213 1.896 3.4 4.093 3.4 2.15 0 3.551-1.078 3.551-2.736a2.8 2.8 0 00-3.563-2.229zM19.349 2h-14.7C3.193 2 2 3.193 2 4.651v14.7C2 20.807 3.193 22 4.649 22h14.7c1.458 0 2.651-1.193 2.651-2.649v-14.7C22 3.193 20.807 2 19.349 2z"/></svg>', sigs: ['stripe', 'loadstripe', '@stripe'] },
        { key: 'prisma', label: 'Prisma', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:middle;margin-right:2px;"><path d="M12 0L2.14 19.72l9.86 4.28 9.86-4.28L12 0zm0 2.82l7.74 15.48L12 21.64V2.82z"/></svg>', sigs: ['prisma', '@prisma/client'] },
        { key: 'react', label: 'React', icon: '<svg width="14" height="14" viewBox="-11.5 -10.23174 23 20.46348" fill="none" style="vertical-align:middle;margin-right:4px;"><circle cx="0" cy="0" r="2.05" fill="#61dafb"/><g stroke="#61dafb" stroke-width="1"><ellipse rx="11" ry="4.2"/><ellipse rx="11" ry="4.2" transform="rotate(60)"/><ellipse rx="11" ry="4.2" transform="rotate(120)"/></g></svg>', sigs: ["from 'react'", 'from "react"', 'usestate', 'useeffect'] },
        { key: 'vue', label: 'Vue', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="#41B883" style="vertical-align:middle;margin-right:2px;"><path d="M24,1.6L12,22.4L0,1.6h4.8l7.2,12.5l7.2-12.5H24z M17,1.6l-5,8.7l-5-8.7H2.2L12,18.6L21.8,1.6H17z"/></svg>', sigs: ["from 'vue'", 'createapp', '.vue'] },
        { key: 'express', label: 'Express', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:middle;margin-right:2px;"><path d="M24 10.635c0-1.575-1.035-3.045-2.775-4.215L12 0 2.775 6.42C1.035 7.59 0 9.06 0 10.635V13.5c0 1.575 1.035 3.045 2.775 4.215L12 24l9.225-6.285c1.74-1.17 2.775-2.64 2.775-4.215v-2.865zm-1.5 0c0 .945-.63 1.83-1.68 2.535L12 19.365l-8.82-5.985C2.13 12.675 1.5 11.79 1.5 10.845V13.5c0 .945.63 1.83 1.68 2.535L12 22.02l8.82-5.985c1.05-.705 1.68-1.59 1.68-2.535v-2.865z"/></svg>', sigs: ["require('express')", '\"express\"', 'app.get(', 'app.post('] },
        { key: 'lovable', label: 'Lovable/Bolt', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="#ff4d4d" style="vertical-align:middle;margin-right:2px;"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>', sigs: ['lovable', 'bolt.new', 'stackblitz', 'sb.ai'] },
    ],

    // ── Vibe Check Metadata ───────────────────────
    VIBE_META: {
        supabase_rls: { icon: '⚡', label: 'Supabase RLS' },
        frontend_secrets: { icon: '🔑', label: 'Frontend Secrets' },
        payment_logic: { icon: '💳', label: 'Payment Logic' },
        console_log_leaks: { icon: '📋', label: 'Console Logs' },
        auth_middleware: { icon: '🔐', label: 'Auth Middleware' },
        security_headers: { icon: '🛡️', label: 'Sec Headers' },
        ssrf: { icon: '🔗', label: 'SSRF Attack' },
        bola: { icon: '📦', label: 'Mass Assignment' },
        weak_random: { icon: '🎲', label: 'Weak Random' },
        race_condition: { icon: '🏎️', label: 'Race Condition' },
    },

    // ── Vibe Category Tags (for vuln cards) ───────
    VIBE_TAGS: {
        // P0 Critical
        supabase_rls: '⚡ Supabase RLS',
        frontend_secret: '🔑 DevTools Key',
        next_public: '▲ NEXT_PUBLIC',
        env_tracking: '📁 .env in Git',
        auth_missing: '🔐 No Auth',
        stripe_webhook: '🪝 Webhook',
        payment_bypass: '💰 Price Bypass',
        custom_auth: '🔒 Custom Auth',
        upload_directory: '📂 Upload Dir',
        csrf: '🛡️ CSRF',
        deserialization: '📦 Deserializ.',
        ai_agency: '🤖 AI Exec',
        // P1 High
        idor: '👤 IDOR',
        sql_injection: '💉 SQL Inject',
        xss: '🖥️ XSS',
        payment_gating: '💳 Plan Bypass',
        console_log: '📋 Browser Log',
        server_log: '🖧 Server Log',
        file_upload: '📎 File Upload',
        ai_abuse: '🤖 AI Cost',
        session: '🍪 Session',
        api_versioning: '🔢 Old Route',
        ai_config: '🧠 AI Config',
        ai_packages: '👻 Fake Package',
        llm_output: '💬 LLM Output',
        model_dos: '💸 Model DoS',
        backup_exposure: '🗄️ Backup Leak',
        supply_chain: '📦 Supply Chain',
        ssrf: '🔗 SSRF Attack',
        bola: '📦 Mass Assign',
        // P2 Medium
        security_headers: '🛡️ Headers',
        cors: '🌐 CORS',
        rate_limiting: '🚦 Rate Limit',
        dependency: '📦 Dependency',
        sensitive_url: '🔗 URL Leak',
        error_leak: '⚠️ Error Leak',
        command_injection: '💻 Cmd Inject',
        prompt_injection: '🧩 Prompt Inject',
        path_traversal: '🗂️ Path Traversal',
        input_validation: '✏️ No Validation',
        password_policy: '🔏 Weak Password',
        open_redirect: '↩️ Open Redirect',
        dependency_bloat: '🗃️ Dep Bloat',
        env_validation: '🌿 Env Missing',
        http_https: '🔓 HTTP Risk',
        incident_logging: '📜 No Logging',
        weak_random: '🎲 Weak Random',
        race_condition: '🏎️ Race Cond.',
        general: '🔍 General',
    }
};

// ── Plan Enforcement Limits ───────────────────────────────
// Used by app.js to gate scans, code size, and active checks
// per the user's subscription tier.
const PLAN_LIMITS = {
    free: {
        scansPerMonth: 1,
        maxCodeMB: 50,
        label: 'Starter',
        // 20 checks: most visible, most beginner-critical
        checkNumbers: [
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10,    // P0+P1 core
            17, 18, 19, 22, 23,                 // P2 essentials
            25, 26, 27, 28, 35                  // P2 code hygiene
        ],
    },
    starter: {
        scansPerMonth: 1,
        maxCodeMB: 50,
        label: 'Starter',
        checkNumbers: [
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10,    // P0+P1 core
            17, 18, 19, 22, 23,                 // P2 essentials
            25, 26, 27, 28, 35                  // P2 code hygiene
        ],
    },
    pro: {
        scansPerMonth: 3,
        maxCodeMB: 2048,
        label: 'Pro',
        // 51 checks: all Free + AI-era + advanced original checks
        checkNumbers: [
            // Free tier (20)
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
            17, 18, 19, 22, 23, 25, 26, 27, 28, 35,
            // Pro original (20)
            11, 12, 13, 14, 15, 16, 20, 21, 24,
            29, 30, 31, 32, 33, 34, 36, 37, 38,
            39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 50,
            // Pro new checks (11)
            52, 53, 56, 57, 60, 62, 63, 65, 66, 67, 68, 70,
        ],
    },
    plus: {
        scansPerMonth: 10,
        maxCodeMB: 5120,
        label: 'Plus',
        checkNumbers: 'all',   // All 90 checks
    },
};

