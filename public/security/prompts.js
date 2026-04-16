const PROMPTS = {

  /* ─────────────────────────────────────────────────
     BUILD SYSTEM PROMPT
     The SHORT system prompt sent with every scan.
     All check logic now lives in tool descriptions
     in tools.js — not here.

     Call: PROMPTS.buildSystemPrompt(bizType, detectedStack)
  ───────────────────────────────────────────────── */
  buildSystemPrompt(bizType, detectedStack, codeString = '') {
    const BIZ = {
      saas: 'SaaS web application (subscription-based, user accounts, dashboard)',
      ecommerce: 'E-commerce store (products, cart, checkout, payments)',
      marketplace: 'Two-sided marketplace (buyers and sellers, listings)',
      fintech: 'Fintech / payments app (financial data, transactions, KYC)',
      healthcare: 'Healthcare app (patient data, PHI, HIPAA-regulated)',
      agency: 'Agency / freelance client project',
      mobile: 'Mobile app (React Native / Flutter / Expo)',
      api: 'API / backend service (REST or GraphQL)',
      blog: 'Blog / CMS (content management, public-facing)',
    };

    const stackCtx = detectedStack && detectedStack.length
      ? 'Detected stack: ' + detectedStack.map(s => s.label).join(', ')
      : 'Stack unknown — audit everything.';

    const toolCount = typeof TOOLS !== 'undefined'
      ? TOOLS.buildScanTools(detectedStack, codeString).length
      : 43;

    return `You are a senior security engineer auditing a founder's codebase before launch.
Think like an attacker — trace every entry point, every data flow, every gap between user input and database.

This is a ${BIZ[bizType] || BIZ.saas}.
${stackCtx}

You have ${toolCount} security check tools available. Each tool represents one specific vulnerability class.

HOW TO USE THE TOOLS:
- Read the codebase carefully.
- For each vulnerability you find, call the matching tool with the evidence from the code.
- If you find nothing wrong for a check — do NOT call that tool.
- If a check is not applicable to this stack — do NOT call that tool.
- You may call the same tool multiple times if the same issue appears in multiple files.

RULES — follow these exactly:
1. Only call a tool when you have CLEAR EVIDENCE in the actual code. Never invent vulnerabilities.
2. Quote real code in the evidence field — exact snippets, not paraphrases.
3. Plain English only in all text fields. No CVE numbers, no CVSS scores, no jargon.
4. Use real-world analogies in what_is_it (e.g. "like leaving your front door unlocked").
5. Be specific in why_dangerous — "attacker can read all user emails" not "data exposure".

CRITICAL RED FLAGS — Prioritize finding these:
- Hardcoded Supabase credentials: window.SUPABASE_URL or window.SUPABASE_ANON_KEY assigned as string literals in frontend code.
- Exposed JWTs: Any string starting with "eyJ" hardcoded in source files (excluding .env).
- Modern API Keys: sk-proj-... (OpenAI), sk_live_... (Stripe), etc. in any file that runs in the browser.
- Missing RLS: Queries to Supabase tables where Row Level Security (RLS) is not documented or bypassed via service_role.`;
  },


  /* ─────────────────────────────────────────────────
     BUILD SUMMARY PROMPT
     After tool calls complete, call this to ask the
     AI for a plain English summary of what it found.
     Send as a follow-up user message in the same
     conversation (after tool results are returned).

     Call: PROMPTS.buildSummaryPrompt(vulnCount, score)
  ───────────────────────────────────────────────── */
  buildSummaryPrompt(vulnCount, score) {
    return `You have finished scanning the codebase and reported ${vulnCount} vulnerabilities. The safety score is ${score}/100.

Write a 2-sentence plain English summary for a non-technical founder:
- Sentence 1: what is the overall security situation right now?
- Sentence 2: what is the single most important thing to fix first?

Rules:
- No CVEs, no jargon, no scary language.
- Be honest but practical.
- If score >= 80: reassure them and mention the minor issues.
- If score 50–79: be clear they have real work to do before launch.
- If score < 50: be direct that this is not ready to launch.

Reply with ONLY the 2-sentence summary. No preamble, no bullet points.`;
  },


  /* ─────────────────────────────────────────────────
     CHAT SYSTEM PROMPT
     Used for the "Chat with your report" feature.
     The report JSON is injected via getChatContextMessage().

     Call: PROMPTS.getChatSystemPrompt()
  ───────────────────────────────────────────────── */
  getChatSystemPrompt() {
    return `You are a friendly security expert helping a non-technical founder understand their security report.

Rules:
- Plain English only. Zero CVEs, zero CVSS scores, zero jargon.
- Be warm, practical, and encouraging — not scary.
- Give specific, actionable answers. Never be vague.
- When explaining a fix, give the founder the exact code or steps they need.
- Keep responses concise — 3–5 sentences unless a detailed explanation is needed.
- If asked about priority: always start with Critical issues, then High.
- If asked "can I launch with X issues?" — be honest but practical:
  Critical = no, fix today.
  High = probably not, fix this week.
  Medium = yes, but fix before you scale.`;
  },


  /* ─────────────────────────────────────────────────
     CHAT CONTEXT MESSAGE
     Injects the scan report into the first user message
     so the AI has full context about what was found.

     Call: PROMPTS.getChatContextMessage(report)
     Where report = { score, verdict, counts, vulnerabilities }
  ───────────────────────────────────────────────── */
  getChatContextMessage(report) {
    // Send a compact version — only what the AI needs to answer questions
    const compact = {
      score: report.score,
      verdict: report.verdict,
      counts: report.counts,
      vulnerabilities: (report.vulnerabilities || []).map(v => ({
        title: v.title,
        severity: v.severity,
        file: v.file,
        what_is_it: v.what_is_it,
        why_dangerous: v.why_dangerous,
        how_to_fix: v.how_to_fix,
        check_number: v.check_number,
      }))
    };

    return `Here is the security report for my codebase:

${JSON.stringify(compact, null, 2)}

I am a non-technical founder. Please answer my questions about this report in plain English only. No CVEs, no CVSS scores, no jargon.`;
  },


  /* ─────────────────────────────────────────────────
     FIX FOR ME PROMPT
     Generates complete corrected files for all
     vulnerabilities that have a fixed_code snippet.

     Call: PROMPTS.getFixForMePrompt(vulnerabilities, codeSnapshot)
  ───────────────────────────────────────────────── */
  getFixForMePrompt(vulnerabilities, codeSnapshot) {
    const fixable = vulnerabilities.filter(v => v.fixed_code && v.fixed_code.trim());

    if (fixable.length === 0) {
      return null; // caller should handle — nothing to fix
    }

    return `You are a security engineer generating complete corrected files for a founder's codebase.

For each vulnerability below, produce the COMPLETE corrected file — not just the snippet, but a full working file the founder can copy and paste directly into their project.

If the original file content is in the code context below, use it as the base and apply the fix on top. If not, construct a complete working file from the snippet.

Return ONLY raw JSON (no markdown, no backticks, no preamble):
{
  "fixes": [
    {
      "file":     "<filename.ext>",
      "language": "<js | ts | python | php | yaml | etc>",
      "summary":  "<one sentence: what was fixed and why it matters>",
      "content":  "<complete corrected file content — ready to paste>"
    }
  ]
}

Vulnerabilities to fix (${fixable.length} total):
${JSON.stringify(
      fixable.map(v => ({
        check_number: v.check_number,
        title: v.title,
        severity: v.severity,
        file: v.file,
        how_to_fix: v.how_to_fix,
        fixed_code: v.fixed_code,
      })),
      null, 2
    )}

Original code context (for reference — use as base for complete files):
${codeSnapshot.slice(0, 30000)}`;
  },

  // Backwards-compatible alias
  getFixPrompt(fixableVulns, codeSnapshot) {
    return this.getFixForMePrompt(fixableVulns, codeSnapshot);
  },


  /* ─────────────────────────────────────────────────
     BUSINESS TYPE LABELS
     Used to render the business type selector in the UI.
  ───────────────────────────────────────────────── */
  BIZ_LABELS: {
    saas: { icon: '🖥️', label: 'SaaS App' },
    ecommerce: { icon: '🛒', label: 'E-commerce' },
    marketplace: { icon: '🏪', label: 'Marketplace' },
    fintech: { icon: '💳', label: 'Fintech' },
    healthcare: { icon: '🏥', label: 'Healthcare' },
    agency: { icon: '🎨', label: 'Agency / Client' },
    mobile: { icon: '📱', label: 'Mobile App' },
    api: { icon: '⚡', label: 'API / Backend' },
    blog: { icon: '📝', label: 'Blog / CMS' },
  },


  /* ─────────────────────────────────────────────────
     VIBE CHECK METADATA  — 43 checks
     Keys match the vibe_checks keys returned by the
     AI (old prompt flow) AND the tool names in tools.js.

     priority: 0 = Critical  1 = High  2 = Medium
     Used to render the check grid / pass-fail panel.
  ───────────────────────────────────────────────── */
  VIBE_CHECK_META: {

    // ── P0 Critical — 12 checks ──────────────────
    supabase_rls: { icon: '⚡', label: 'Supabase RLS', priority: 0 },
    frontend_secrets: { icon: '🔑', label: 'Frontend Secrets', priority: 0 },
    next_public_prefix: { icon: '▲', label: 'NEXT_PUBLIC Keys', priority: 0 },
    env_git_tracking: { icon: '📁', label: '.env in Git', priority: 0 },
    auth_middleware: { icon: '🔐', label: 'Auth Middleware', priority: 0 },
    stripe_webhook: { icon: '🪝', label: 'Webhook Verify', priority: 0 },
    server_side_price: { icon: '💰', label: 'Server-Side Price', priority: 0 },
    custom_auth: { icon: '🔒', label: 'Custom Auth Risk', priority: 0 },
    upload_directory: { icon: '📂', label: 'Upload Directory', priority: 0 },
    csrf_token: { icon: '🛡️', label: 'CSRF Token', priority: 0 },
    insecure_deserialization: { icon: '📦', label: 'Deserialization', priority: 0 },
    excessive_ai_agency: { icon: '🤖', label: 'AI Code Exec', priority: 0 },
    supply_chain: { icon: '📦', label: 'Supply Chain', priority: 0 },
    ssrf: { icon: '🔗', label: 'SSRF Attack', priority: 0 },

    // ── P1 High — 15 checks ──────────────────────
    idor_ownership: { icon: '👤', label: 'IDOR Check', priority: 1 },
    sql_injection: { icon: '💉', label: 'SQL Injection', priority: 1 },
    xss_injection: { icon: '🖥️', label: 'XSS Injection', priority: 1 },
    payment_frontend_gating: { icon: '💳', label: 'Payment Gating', priority: 1 },
    console_log_leaks: { icon: '📋', label: 'Browser Logs', priority: 1 },
    server_log_leaks: { icon: '🖧', label: 'Server Logs', priority: 1 },
    file_upload_validation: { icon: '📎', label: 'File Upload', priority: 1 },
    ai_endpoint_abuse: { icon: '🤖', label: 'AI Cost Abuse', priority: 1 },
    session_config: { icon: '🍪', label: 'Session Config', priority: 1 },
    api_versioning: { icon: '🔢', label: 'API Versioning', priority: 1 },
    ai_config_files: { icon: '🧠', label: 'AI Config Files', priority: 1 },
    ai_hallucinated_packages: { icon: '👻', label: 'Fake AI Packages', priority: 1 },
    insecure_llm_output: { icon: '💬', label: 'LLM Output XSS', priority: 1 },
    model_dos: { icon: '💸', label: 'Model DoS', priority: 1 },
    backup_exposure: { icon: '🗄️', label: 'Backup Exposure', priority: 1 },
    prompt_injection: { icon: '🧩', label: 'Prompt Injection', priority: 1 },
    bola: { icon: '📦', label: 'Mass Assignment', priority: 1 },

    // ── P2 Medium — 16 checks ────────────────────
    security_headers: { icon: '🛡️', label: 'Sec Headers', priority: 2 },
    cors_wildcard: { icon: '🌐', label: 'CORS Config', priority: 2 },
    rate_limiting: { icon: '🚦', label: 'Rate Limiting', priority: 2 },
    dependency_risks: { icon: '📦', label: 'Dependencies', priority: 2 },
    sensitive_urls: { icon: '🔗', label: 'Sensitive URLs', priority: 2 },
    error_verbosity: { icon: '⚠️', label: 'Error Leakage', priority: 2 },
    command_injection: { icon: '💻', label: 'Cmd Injection', priority: 2 },
    path_traversal: { icon: '🗂️', label: 'Path Traversal', priority: 2 },
    input_validation: { icon: '✏️', label: 'Input Validation', priority: 2 },
    password_policy: { icon: '🔏', label: 'Password Policy', priority: 2 },
    open_redirect: { icon: '↩️', label: 'Open Redirect', priority: 2 },
    dependency_bloat: { icon: '🗃️', label: 'Dep Bloat', priority: 2 },
    env_validation: { icon: '🌿', label: 'Env Validation', priority: 2 },
    http_vs_https: { icon: '🔓', label: 'HTTP vs HTTPS', priority: 2 },
    incident_logging: { icon: '📜', label: 'Incident Logging', priority: 2 },
    weak_random: { icon: '🎲', label: 'Weak Random', priority: 2 },
    race_condition: { icon: '🏎️', label: 'Race Condition', priority: 2 },

    // ── NEW: Checks #36–#71 ──────────────────────
    // P1 High (new)
    insecure_client_storage: { icon: '💾', label: 'Client Storage', priority: 1 },
    ssrf_vulnerability: { icon: '🔗', label: 'SSRF (new)', priority: 1 },
    missing_csrf_protection: { icon: '🛡️', label: 'Missing CSRF', priority: 1 },
    negative_value_manipulation: { icon: '💸', label: 'Negative Values', priority: 1 },
    prompt_injection_repo: { icon: '🧩', label: 'Repo Injection', priority: 1 },
    missing_env_separation: { icon: '🌿', label: 'Env Separation', priority: 1 },
    log_injection: { icon: '📋', label: 'Log Injection', priority: 1 },
    slopsquatting: { icon: '👻', label: 'Slopsquatting', priority: 1 },
    api_docs_exposed: { icon: '📖', label: 'API Docs Exposed', priority: 1 },
    missing_token_expiry: { icon: '⏰', label: 'Token Expiry', priority: 1 },
    weak_cryptography: { icon: '🔓', label: 'Weak Crypto', priority: 1 },
    graphql_batching_dos: { icon: '📊', label: 'GraphQL DoS', priority: 1 },
    insecure_randomness: { icon: '🎲', label: 'Insecure Random', priority: 1 },
    crlf_injection: { icon: '↩️', label: 'CRLF Injection', priority: 1 },
    negative_price_injection: { icon: '💸', label: 'Negative Price', priority: 1 },
    pii_unencrypted: { icon: '👤', label: 'PII Unencrypted', priority: 1 },
    overprivileged_iac: { icon: '☁️', label: 'IaC Privileges', priority: 1 },
    // P0 Critical (new)
    insecure_pickle_deserialization: { icon: '🐍', label: 'Pickle RCE', priority: 0 },
    inverted_auth_logic: { icon: '🔐', label: 'Auth Inverted', priority: 0 },
    fail_open_access: { icon: '🚪', label: 'Fail-Open Auth', priority: 0 },
    jwt_algorithm_confusion: { icon: '🔑', label: 'JWT Alg Confusion', priority: 0 },
    ai_agent_db_overperm: { icon: '🤖', label: 'DB Overperm Agent', priority: 0 },
    nosql_injection: { icon: '💉', label: 'NoSQL Injection', priority: 0 },
    ssti_vulnerability: { icon: '🖥️', label: 'SSTI', priority: 0 },
    hidden_unicode_rules: { icon: '🕵️', label: 'Hidden Unicode', priority: 0 },
    malicious_postinstall: { icon: '📦', label: 'Postinstall Attack', priority: 0 },
    firebase_open_rules: { icon: '🔥', label: 'Firebase Open Rules', priority: 0 },
    trusted_client_headers: { icon: '📨', label: 'Client Headers', priority: 0 },
    // P2 Medium (new)
    missing_security_logging: { icon: '📜', label: 'No Security Log', priority: 2 },
    missing_payload_limits: { icon: '📏', label: 'Payload Size', priority: 2 },
    rate_limit_ip_bypass: { icon: '🚦', label: 'IP Bypass', priority: 2 },
    redos_vulnerability: { icon: '⏳', label: 'ReDoS Regex', priority: 2 },
    account_enumeration: { icon: '👥', label: 'Acct Enumeration', priority: 2 },
    integer_overflow: { icon: '🔢', label: 'Integer Overflow', priority: 2 },
    container_as_root: { icon: '🐳', label: 'Container Root', priority: 2 },
  },


  /* ─────────────────────────────────────────────────
     VIBE CHECK KEY MAP
     Maps tool names (from tools.js) → vibe_check keys
     (used to update the pass/fail grid from tool calls).

     When a tool is called → mark its check as "fail".
     When a tool is NOT called → mark as "pass" or "skip".
  ───────────────────────────────────────────────── */
  TOOL_TO_VIBE_KEY: {
    report_supabase_rls: 'supabase_rls',
    report_frontend_secrets: 'frontend_secrets',
    report_next_public_prefix: 'next_public_prefix',
    report_env_git_tracking: 'env_git_tracking',
    report_auth_middleware_missing: 'auth_middleware',
    report_stripe_webhook_missing_verification: 'stripe_webhook',
    report_server_side_price: 'server_side_price',
    report_custom_auth_implementation: 'custom_auth',
    report_upload_directory_execution: 'upload_directory',
    report_csrf_token_missing: 'csrf_token',
    report_insecure_deserialization: 'insecure_deserialization',
    report_excessive_ai_agency: 'excessive_ai_agency',
    report_idor_ownership: 'idor_ownership',
    report_sql_injection: 'sql_injection',
    report_xss_injection: 'xss_injection',
    report_payment_frontend_gating: 'payment_frontend_gating',
    report_console_log_leaks_browser: 'console_log_leaks',
    report_server_log_leaks: 'server_log_leaks',
    report_file_upload_validation: 'file_upload_validation',
    report_ai_endpoint_cost_abuse: 'ai_endpoint_abuse',
    report_session_configuration: 'session_config',
    report_api_versioning_forgotten_routes: 'api_versioning',
    report_malicious_ai_config_files: 'ai_config_files',
    report_ai_hallucinated_packages: 'ai_hallucinated_packages',
    report_insecure_llm_output_handling: 'insecure_llm_output',
    report_model_denial_of_service: 'model_dos',
    report_backup_data_exposure: 'backup_exposure',
    report_security_headers_missing: 'security_headers',
    report_cors_wildcard_credentials: 'cors_wildcard',
    report_rate_limiting_missing: 'rate_limiting',
    report_dependency_vulnerabilities: 'dependency_risks',
    report_sensitive_data_in_urls: 'sensitive_urls',
    report_error_message_verbosity: 'error_verbosity',
    report_command_injection: 'command_injection',
    report_prompt_injection_ai: 'prompt_injection',
    report_path_traversal: 'path_traversal',
    report_missing_input_validation: 'input_validation',
    report_weak_password_policy: 'password_policy',
    report_open_redirect: 'open_redirect',
    report_dependency_bloat_dev_prod_mix: 'dependency_bloat',
    report_env_validation_on_startup: 'env_validation',
    report_http_instead_of_https: 'http_vs_https',
    report_incident_logging_gaps: 'incident_logging',
    report_supply_chain_attack: 'supply_chain',
    report_ssrf: 'ssrf',
    report_mass_assignment: 'bola',
    report_weak_randomness: 'weak_random',
    report_race_condition: 'race_condition',
    // NEW checks #36–#71
    report_insecure_client_side_storage: 'insecure_client_storage',
    report_missing_security_logging: 'missing_security_logging',
    report_insecure_pickle_deserialization: 'insecure_pickle_deserialization',
    report_missing_payload_size_limits: 'missing_payload_limits',
    report_ssrf_vulnerability: 'ssrf_vulnerability',
    report_missing_csrf_protection: 'missing_csrf_protection',
    report_inverted_auth_logic: 'inverted_auth_logic',
    report_negative_value_manipulation: 'negative_value_manipulation',
    report_rate_limit_ip_bypass: 'rate_limit_ip_bypass',
    report_prompt_injection_in_repo_files: 'prompt_injection_repo',
    report_fail_open_access_control: 'fail_open_access',
    report_missing_environment_separation: 'missing_env_separation',
    report_log_injection: 'log_injection',
    report_jwt_algorithm_confusion: 'jwt_algorithm_confusion',
    report_slopsquatting_hallucinated_packages: 'slopsquatting',
    report_api_docs_exposed_production: 'api_docs_exposed',
    report_missing_token_expiry: 'missing_token_expiry',
    report_weak_cryptography: 'weak_cryptography',
    report_ai_agent_overpermissioned_db: 'ai_agent_db_overperm',
    report_nosql_injection: 'nosql_injection',
    report_ssti_vulnerability: 'ssti_vulnerability',
    report_redos_vulnerability: 'redos_vulnerability',
    report_account_enumeration: 'account_enumeration',
    report_graphql_batching_dos: 'graphql_batching_dos',
    report_integer_overflow: 'integer_overflow',
    report_hidden_unicode_in_rule_files: 'hidden_unicode_rules',
    report_insecure_randomness: 'insecure_randomness',
    report_crlf_header_injection: 'crlf_injection',
    report_malicious_postinstall_script: 'malicious_postinstall',
    report_firebase_open_security_rules: 'firebase_open_rules',
    report_overprivileged_cloud_iac: 'overprivileged_iac',
    report_trusted_client_security_headers: 'trusted_client_headers',
    report_negative_price_injection: 'negative_price_injection',
    report_container_running_as_root: 'container_as_root',
    report_pii_stored_unencrypted: 'pii_unencrypted',
  },


  /* ─────────────────────────────────────────────────
     BUILD VIBE CHECKS RESULT
     Call this after parseToolResults() to generate
     the pass/fail/skip map for the UI check grid.

     toolsUsed = array of tool names that were called
     toolsAvailable = array of tool names that were sent to API
     All available but not called = "pass"
     All not available (skipped by stack filter) = "skip"

     Call: PROMPTS.buildVibeChecks(toolsUsed, toolsAvailable)
  ───────────────────────────────────────────────── */
  buildVibeChecks(toolsUsed, toolsAvailable) {
    const used = new Set(toolsUsed);
    const available = new Set(toolsAvailable);
    const result = {};

    for (const [toolName, vibeKey] of Object.entries(PROMPTS.TOOL_TO_VIBE_KEY)) {
      if (used.has(toolName)) {
        result[vibeKey] = 'fail';          // AI called this tool → vulnerability found
      } else if (available.has(toolName)) {
        result[vibeKey] = 'pass';          // Tool was available but AI didn't call it → clean
      } else {
        result[vibeKey] = 'skip';          // Tool was filtered out (not relevant to stack)
      }
    }

    return result;
  },


  /* ─────────────────────────────────────────────────
     VULNERABILITY TAGS  — badges on vuln cards
     Key = vibe_category from tools.js _toolNameToCategory()
  ───────────────────────────────────────────────── */
  VULN_TAGS: {
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
    // NEW checks #36–#71
    insecure_client_storage: '💾 Client Storage',
    missing_security_logging: '📜 No Sec Logging',
    insecure_pickle_deserialization: '🐍 Pickle RCE',
    missing_payload_limits: '📏 No Size Limit',
    ssrf_vulnerability: '🔗 SSRF',
    missing_csrf_protection: '🛡️ CSRF Missing',
    inverted_auth_logic: '🔐 Inverted Auth',
    negative_value_manipulation: '💸 Neg Values',
    rate_limit_ip_bypass: '🚦 IP Bypass',
    prompt_injection_repo: '🧩 Repo Injection',
    fail_open_access: '🚪 Fail-Open',
    missing_env_separation: '🌿 No Env Sep.',
    log_injection: '📋 Log Injection',
    jwt_algorithm_confusion: '🔑 JWT Alg Bypass',
    slopsquatting: '👻 Slopsquatting',
    api_docs_exposed: '📖 API Docs Exposed',
    missing_token_expiry: '⏰ No Token Expiry',
    weak_cryptography: '🔓 Weak Crypto',
    ai_agent_db_overperm: '🤖 AI DB Overpriv',
    nosql_injection: '💉 NoSQL Injection',
    ssti_vulnerability: '🖥️ SSTI',
    redos_vulnerability: '⏳ ReDoS',
    account_enumeration: '👥 Acct Enum.',
    graphql_batching_dos: '📊 GraphQL DoS',
    integer_overflow: '🔢 Int Overflow',
    hidden_unicode_rules: '🕵️ Hidden Unicode',
    insecure_randomness: '🎲 Insecure Random',
    crlf_injection: '↩️ CRLF Injection',
    malicious_postinstall: '📦 Postinstall Atk',
    firebase_open_rules: '🔥 Firebase Open',
    overprivileged_iac: '☁️ IaC Overpriv',
    trusted_client_headers: '📨 Client Headers',
    negative_price_injection: '💸 Neg Price',
    container_as_root: '🐳 Container Root',
    pii_unencrypted: '👤 PII Unencrypted',
  },

};

/* ─── Export (Node / bundler) ───────────────────── */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PROMPTS;
}