const TOOLS = {

    /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
       SHARED INPUT SCHEMA
       Every tool takes the same 7 fields.
       The AI fills them in based on what it found.
    â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    _VULN_SCHEMA: {
        type: 'object',
        properties: {
            file: {
                type: 'string',
                description: 'Filename where the vulnerability was found. Use "configuration", "dependencies", or "environment" if not a code file.'
            },
            line: {
                type: 'number',
                description: 'The approximate line number where the issue starts. 0 if not applicable.'
            },
            evidence: {
                type: 'string',
                description: 'The exact code snippet or pattern that triggered this finding. Quote the real code â€” do not paraphrase.'
            },
            what_is_it: {
                type: 'string',
                description: '2-3 sentences explaining the vulnerability using a real-world analogy. Non-technical founders must understand this.'
            },
            why_dangerous: {
                type: 'string',
                description: '1-2 sentences: what can an attacker SPECIFICALLY do with this? Be concrete â€” "attacker can read all user emails" not "data exposure".'
            },
            business_risk: {
                type: 'string',
                description: 'Specific business consequences: data breach, dollar costs, regulatory fines, user churn, downtime.'
            },
            how_to_fix: {
                type: 'string',
                description: 'Numbered plain English steps. Concrete actions, no jargon, no CVE references.'
            },
            fixed_code: {
                type: 'string',
                description: 'Complete corrected code snippet with enough surrounding context to understand where it goes. Empty string if not applicable.'
            }
        },
        required: ['file', 'line', 'evidence', 'what_is_it', 'why_dangerous', 'business_risk', 'how_to_fix', 'fixed_code']
    },


    /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
       BUILD SCAN TOOLS
       Returns the tools array for the API call.
       detectedStack filters out irrelevant tools.

       FIX: Stack detection now also scans codeString so
       tools are never skipped just because a library
       wasn't detected in the first N badge-scanned files.
    â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    buildScanTools(detectedStack = [], codeString = '', planTier = 'plus') {
        const stack = detectedStack.map(s => s.label.toLowerCase());

        // â”€â”€ Stack detection: check BOTH badge labels AND actual code content â”€â”€
        // This prevents tools being skipped when the library isn't in the first N files
        const hasSupabase = stack.some(s => s.includes('supabase'))
            || codeString.includes('supabase')
            || codeString.includes('@supabase')
            || codeString.includes('createClient')
            || /window\.SUPABASE/i.test(codeString)
            || /SUPABASE_URL/i.test(codeString)
            || /SUPABASE_ANON_KEY/i.test(codeString)
            || /SUPABASE_SERVICE_ROLE/i.test(codeString);

        const hasStripe = stack.some(s => s.includes('stripe'))
            || codeString.includes('stripe')
            || codeString.includes('sk_live_')
            || codeString.includes('sk_test_')
            || codeString.includes('Stripe(');

        const hasNext = stack.some(s => s.includes('next'))
            || codeString.includes('next/navigation')
            || codeString.includes('next/router')
            || codeString.includes('NextResponse')
            || codeString.includes('getServerSideProps')
            || codeString.includes('NEXT_PUBLIC_');

        const hasAI = stack.some(s => s.includes('openai') || s.includes('anthropic') || s.includes('gemini') || s.includes('ai'))
            || codeString.includes('openai')
            || codeString.includes('anthropic')
            || codeString.includes('gemini')
            || codeString.includes('generativeai')
            || codeString.includes('createAI')
            || codeString.includes('/v1/messages')
            || codeString.includes('gpt-');

        const hasFirebase = stack.some(s => s.includes('firebase'))
            || codeString.includes('firebase')
            || codeString.includes('initializeApp')
            || codeString.includes('firestore')
            || codeString.includes('firestore.rules')
            || codeString.includes('storage.rules');

        const hasMongoDB = stack.some(s => s.includes('mongo'))
            || codeString.includes('mongodb')
            || codeString.includes('mongoose')
            || codeString.includes('MongoClient')
            || codeString.includes('collection(')
            || codeString.includes('findOne(');

        const hasGraphQL = stack.some(s => s.includes('graphql') || s.includes('apollo'))
            || codeString.includes('graphql')
            || codeString.includes('ApolloServer')
            || codeString.includes('typeDefs')
            || codeString.includes('resolvers');

        const hasIaC = codeString.includes('aws_')
            || codeString.includes('terraform')
            || codeString.includes('CloudFormation')
            || codeString.includes('apiVersion:')
            || codeString.includes('kind: Deployment')
            || codeString.includes('docker-compose');

        const allTools = [

            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            // ðŸ”´ P0 CRITICAL â€” 14 checks
            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

            {
                name: 'report_supabase_rls',
                _checkNumber: 1,
                _severity: 'critical',
                _skipIf: !hasSupabase,
                description: `CALL THIS TOOL when you find Supabase tables being queried with the anon/public key but with NO Row Level Security (RLS) policies enabled.
Signs to look for:
- supabase.from('tableName').select() without a user filter
- Tables that appear in queries but not in RLS policy definitions
- service_role key used client-side
- createClient() with anon key accessing user-specific data without auth filter
- window.SUPABASE_URL or window.SUPABASE_ANON_KEY set in frontend code â€” anon key exposed in browser means all tables accessible by anyone unless RLS is configured
DO NOT call if RLS policies are present and correctly configured.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_frontend_secrets',
                _checkNumber: 2,
                _severity: 'critical',
                _skipIf: false,
                description: `CALL THIS TOOL when you find hardcoded secrets or credentials in ANY client-side file (.js .jsx .tsx .vue .html .svelte .css .ts).
Patterns that MUST trigger this tool:
- OpenAI key: sk-... or sk-proj-... anywhere in client code
- Stripe secret: sk_live_... or sk_test_... in client code
- Supabase service_role key anywhere in client code
- Supabase anon key hardcoded directly in code (eyJ... JWT token assigned to a variable, const, or window property)
- Firebase private key in client code
- AWS key: AKIA... in client code
- Any Bearer token hardcoded as a string literal
- window.SUPABASE_URL = 'https://...' â€” Supabase project URL assigned to window object
- window.SUPABASE_ANON_KEY = 'eyJ...' â€” Supabase anon key assigned to window object
- window.* = 'eyJ...' â€” ANY JWT token assigned to any window property
- const SUPABASE_KEY = 'eyJ...' or let API_KEY = 'sk-...' â€” any hardcoded credential assigned to a variable
- Any JWT token (starts with eyJ) hardcoded as a string literal anywhere in source code
- Any URL containing credentials: https://user:password@host
"Client-side" means: any file that runs in the browser, is bundled to the frontend, or served as a static asset.
This includes page.tsx, layout.tsx, _app.tsx, component files, hooks, context providers, and any .ts/.tsx file NOT inside /api/ routes.
DO NOT call for server-only files (pages/api/, app/api/, server.js, route.ts inside app/api/).
DO NOT call for .env files (those are covered by report_env_git_tracking).
IMPORTANT: The Supabase ANON key (eyJ...) IS a secret when hardcoded in source code â€” it should only come from environment variables. Even though it is called "anon", embedding it directly in code exposes it permanently and makes key rotation impossible.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_next_public_prefix',
                _checkNumber: 3,
                _severity: 'critical',
                _skipIf: !hasNext,
                description: `CALL THIS TOOL when you find sensitive API keys or secrets using the NEXT_PUBLIC_ prefix in a Next.js app.
NEXT_PUBLIC_ variables are bundled INTO the browser JavaScript â€” anyone can read them.
Triggers:
- NEXT_PUBLIC_STRIPE_SECRET_KEY
- NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY
- NEXT_PUBLIC_OPENAI_API_KEY
- Any NEXT_PUBLIC_ variable whose value looks like a secret key (contains sk-, pk_live, service_role, etc.)
DO NOT call for genuinely public values like NEXT_PUBLIC_APP_URL or NEXT_PUBLIC_SUPABASE_URL (the URL is public by design).`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_env_git_tracking',
                _checkNumber: 4,
                _severity: 'critical',
                _skipIf: false,
                description: `CALL THIS TOOL when you find that .env files are not protected from being committed to Git.
Triggers (any one is sufficient):
- .gitignore file is missing entirely
- .gitignore exists but does NOT contain .env
- .gitignore exists but does NOT contain .env.local, .env.production, etc.
- An actual .env file with real values is present in the scanned files (not just .env.example)
DO NOT call if .gitignore correctly excludes all .env variants.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_auth_middleware_missing',
                _checkNumber: 5,
                _severity: 'critical',
                _skipIf: false,
                description: `CALL THIS TOOL when you find API routes or server endpoints that handle sensitive data but have NO authentication check.
Sensitive endpoints that MUST have auth: user profile data, payment info, admin functions, file uploads, user-specific queries, any mutation.
Look for: route handlers that do DB queries or mutations WITHOUT first calling getServerSession(), verifyJWT(), requireAuth(), auth(), or equivalent.
CALL ONCE PER UNPROTECTED ROUTE â€” if 3 routes are unprotected, call this tool 3 times.
DO NOT call for genuinely public endpoints like /api/health, /api/webhook (webhooks use signature verification instead).`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_stripe_webhook_missing_verification',
                _checkNumber: 6,
                _severity: 'critical',
                _skipIf: !hasStripe,
                description: `CALL THIS TOOL when you find a Stripe webhook handler that does NOT verify the webhook signature.
Required pattern: stripe.webhooks.constructEvent(rawBody, sig, webhookSecret)
Triggers:
- Webhook route that reads req.body directly without calling constructEvent()
- constructEvent() is called but webhookSecret is undefined or hardcoded as empty string
- The raw body buffer is not used (req.body is already parsed JSON â€” signature verification requires raw bytes)
DO NOT call if constructEvent() is correctly implemented with a real webhook secret.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_server_side_price',
                _checkNumber: 7,
                _severity: 'critical',
                _skipIf: !hasStripe,
                description: `CALL THIS TOOL when you find that the payment amount or price sent to Stripe comes from client-supplied input.
Triggers:
- stripe.paymentIntents.create({ amount: req.body.amount })
- stripe.charges.create({ amount: req.query.price })
- Any Stripe charge where the amount is derived from user input instead of a server-side constant
Safe pattern: amounts come from your own price lookup table (e.g. const PRICES = { pro: 900 }) never from req.body.
DO NOT call if prices are defined server-side and client input is ignored.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_custom_auth_implementation',
                _checkNumber: 30,
                _severity: 'critical',
                _skipIf: false,
                description: `CALL THIS TOOL when you find hand-rolled authentication instead of a trusted auth library.
Triggers (any one is sufficient):
- crypto.createHash('md5') or crypto.createHash('sha1') used for password hashing
- Manual JWT creation: Buffer.from(payload).toString('base64') without jsonwebtoken/jose
- Passwords stored or compared in plain text
- Hand-rolled session tokens (Math.random() as session ID)
Safe: bcrypt, argon2, scrypt for passwords. jsonwebtoken/jose for JWTs. Supabase Auth, Clerk, NextAuth, Auth0 for full auth.
DO NOT call if the app uses a recognised auth library correctly.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_upload_directory_execution',
                _checkNumber: 32,
                _severity: 'critical',
                _skipIf: false,
                description: `CALL THIS TOOL when you find file uploads being saved to a publicly accessible web directory.
Triggers:
- Uploaded files saved to ./public/, ./static/, ./www/, or any directory served directly by the web server
- No content-type validation before saving (accepts any file type)
- Saved filename comes from user input (req.file.originalname used directly as path)
Safe: uploads saved to private directory outside web root, or to cloud storage (S3, Supabase Storage, Cloudinary).
DO NOT call if uploads go directly to cloud storage with no local disk write.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_csrf_token_missing',
                _checkNumber: 36,
                _severity: 'critical',
                _skipIf: false,
                description: `CALL THIS TOOL when you find state-changing endpoints (POST/PUT/DELETE/PATCH) using cookie-based auth but with no CSRF protection.
Triggers:
- HTML forms with action="/api/..." and no hidden csrf_token input field
- POST route handlers with no csrf() middleware and no token verification
- Mutation endpoints that only check session cookies with no additional CSRF token
Note: SameSite=Strict cookies reduce risk but are NOT sufficient replacement for CSRF tokens.
DO NOT call if: csurf, next-csrf, or equivalent middleware is present; or if the API uses Authorization header (Bearer token) instead of cookies â€” Bearer token APIs are not CSRF-vulnerable.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_supply_chain_attack',
                _checkNumber: 46,
                _severity: 'critical',
                _skipIf: false,
                description: `CALL THIS TOOL when you find evidence of software supply chain vulnerabilities.
Triggers:
- "Ghost" packages: dependencies in package.json with no repository link or recently hijacked/abandoned.
- Typosquatting: e.g., 'react-domm' instead of 'react-dom', 'lodsh' instead of 'lodash'.
- CI/CD flaws: GitHub Actions/GitLab CI files with hardcoded secrets or 'pull_request_target' triggers that could leak environment variables to external contributors.
- Unsigned packages or obscure libraries lacking maintenance history.
DO NOT call for well-known, trusted, and correctly versioned dependencies.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_ssrf',
                _checkNumber: 47,
                _severity: 'critical',
                _skipIf: false,
                description: `CALL THIS TOOL when you find Server-Side Request Forgery (SSRF) vulnerabilities.
Triggers:
- User-provided URL passed directly into fetch(), axios.get(), or boto3 without validation.
- URLs that allow reaching internal IP ranges (127.0.0.1, 10.x.x.x, 192.168.x.x) or cloud/AWS metadata (169.254.169.254).
- Lack of a strict allowlist for permitted domains in outbound requests.
Safe: strictly validate URLs against a whitelist of permitted domains.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_insecure_deserialization',
                _checkNumber: 37,
                _severity: 'critical',
                _skipIf: false,
                description: `CALL THIS TOOL when you find user-controlled data being deserialized and then executed or passed to dangerous functions.
Triggers:
- Python: pickle.loads(), marshal.loads(), or unsafe yaml.load() without SafeLoader.
- Node.js: node-serialize, serialize-javascript used with user-supplied data.
- JSON.parse(req.body.data) result passed to eval() or new Function().
- Object.assign() or spread operator used to merge user input into sensitive objects (prototype pollution).
DO NOT call for safe JSON.parse() used only to access data fields (not to execute anything).`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_excessive_ai_agency',
                _checkNumber: 41,
                _severity: 'critical',
                _skipIf: !hasAI,
                description: `CALL THIS TOOL when you find AI-generated code being executed directly on the server without sandboxing.
Triggers:
- eval(aiResponse) â€” executing AI output as code
- new Function(aiGeneratedCode)() â€” same as eval
- exec() or spawn() called with AI-generated command strings
- dynamic require() or import() of an AI-generated module name
- Writing AI output to a file then immediately executing that file
DO NOT call for cases where AI output is just displayed to users or stored as text.`,
                input_schema: TOOLS._VULN_SCHEMA
            },


            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            // ðŸŸ¡ P1 HIGH â€” 17 checks
            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

            {
                name: 'report_idor_ownership',
                _checkNumber: 8,
                _severity: 'high',
                _skipIf: false,
                description: `CALL THIS TOOL when you find API endpoints that fetch user-specific data using a client-supplied ID without verifying ownership.
Triggers:
- db.query('SELECT * FROM orders WHERE id = ?', [req.params.id]) â€” no check that this order belongs to the session user
- User A can access User B's data by changing a number in the URL
- req.params.userId or req.query.userId used directly in DB query without cross-checking session.user.id
Safe: derive the user ID from the session (session.user.id) and use it as a WHERE filter, never trust client-supplied IDs for sensitive data.
CALL ONCE PER VULNERABLE ENDPOINT.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_sql_injection',
                _checkNumber: 9,
                _severity: 'high',
                _skipIf: false,
                description: `CALL THIS TOOL when you find raw SQL queries built by concatenating or interpolating user input.
Triggers:
- "SELECT * FROM users WHERE email = '" + email + "'"
- \`SELECT * FROM users WHERE name = \${req.body.name}\`
- Any template literal or string concatenation in a raw SQL query where the variable could come from user input
Safe: parameterized queries (? placeholders), ORM methods (Prisma, Drizzle, Sequelize), or query builders that escape input.
If multiple SQL injection patterns exist in the same file, call this tool ONCE and list all instances in the evidence field.
DO NOT call for queries where all values are server-side constants.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_xss_injection',
                _checkNumber: 10,
                _severity: 'high',
                _skipIf: false,
                description: `CALL THIS TOOL when you find user input rendered directly as HTML without sanitization.
Triggers:
- dangerouslySetInnerHTML={{ __html: userInput }} in React
- element.innerHTML = userContent in JavaScript
- {{{variable}}} in Handlebars/Mustache (triple braces = no escaping)
- v-html="userContent" in Vue
- document.write(userInput)
Safe: React's default JSX rendering (single braces {}), textContent instead of innerHTML, DOMPurify.sanitize() before innerHTML.
DO NOT call for server-side template rendering where user data is properly escaped.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_payment_frontend_gating',
                _checkNumber: 11,
                _severity: 'high',
                _skipIf: !hasStripe,
                description: `CALL THIS TOOL when you find subscription or feature access controlled ONLY by client-side state with no server-side verification.
Triggers:
- isPro / isSubscribed / userPlan / hasPremium stored in React state, localStorage, or cookies and used to gate features
- Subscription checks that only happen in the frontend â€” if bypassing localStorage changes access, it's vulnerable
- API routes that return premium content without checking subscription status server-side
Safe: every protected API route checks subscription status from the database, not from the client request.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_console_log_leaks_browser',
                _checkNumber: 12,
                _severity: 'high',
                _skipIf: false,
                description: `CALL THIS TOOL when you find console.log/error/debug in client-side code that prints sensitive data.
Triggers: console.log printing user objects, session data, API keys, auth tokens, passwords, payment details, or full API responses containing private fields.
"Client-side" = any .js/.jsx/.tsx/.vue file that runs in the browser.
DO NOT call for: server-side console.log, or console.log that only prints non-sensitive debug strings like "component mounted".`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_server_log_leaks',
                _checkNumber: 13,
                _severity: 'high',
                _skipIf: false,
                description: `CALL THIS TOOL when you find server-side logging that prints sensitive data.
Triggers: server-side console.log, logger.info, logger.error printing passwords, auth tokens, full error stacks with file paths, database connection strings, or private user data.
DO NOT call for server logs that only record non-sensitive events like "Server started on port 3000".`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_file_upload_validation',
                _checkNumber: 14,
                _severity: 'high',
                _skipIf: false,
                description: `CALL THIS TOOL when you find file upload endpoints that validate file type only on the client side.
Triggers:
- File type checked using req.file.mimetype (this is set by the client â€” it's completely untrusted)
- File type checked using the file extension from req.file.originalname (also untrusted)
- No server-side magic byte validation (checking actual file content bytes)
Safe: use file-type npm package or mmmagic to inspect actual file bytes server-side.
DO NOT call if server-side magic byte validation is present.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_ai_endpoint_cost_abuse',
                _checkNumber: 15,
                _severity: 'high',
                _skipIf: !hasAI,
                description: `CALL THIS TOOL when you find AI API endpoints (/api/ai, /api/chat, /api/generate, /api/completion or similar) that lack BOTH authentication AND rate limiting.
Trigger conditions â€” any of:
- AI endpoint has no auth check (unauthenticated users can call it)
- AI endpoint has no rate limiter (authenticated users can make unlimited calls)
- AI endpoint accepts unlimited prompt length (no input size cap)
The risk: a single attacker or bot can generate a $10,000+ bill overnight.
CALL THIS TOOL if either auth OR rate limiting is missing â€” both are required.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_session_configuration',
                _checkNumber: 16,
                _severity: 'high',
                _skipIf: false,
                description: `CALL THIS TOOL when you find insecure session or cookie configuration.
Triggers (any one is sufficient):
- httpOnly: false on session cookies (JavaScript can read the token)
- secure: false on session cookies (token sent over HTTP)
- No maxAge or excessively long expiry like 999999999 (sessions never expire)
- JWT secret that is 'secret', 'password', 'jwt', 'test', or any short/obvious string
- JWT signed with HS256 and a weak or hardcoded secret
DO NOT call if session is managed by a trusted auth provider (Supabase Auth, Clerk, Auth0) â€” they handle this correctly.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_api_versioning_forgotten_routes',
                _checkNumber: 29,
                _severity: 'high',
                _skipIf: false,
                description: `CALL THIS TOOL when you find evidence of old, unversioned API routes that may have weaker security than newer versioned ones.
Triggers:
- /api/user AND /api/v1/user both exist â€” one may have been left insecure
- Comments like "// TODO: add auth" on older routes
- Duplicate endpoints where one has auth middleware and one does not
- Routes that match old patterns suggesting they predate the auth layer
DO NOT call just because routes are unversioned â€” only call if there's evidence the old route has different/weaker security.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_malicious_ai_config_files',
                _checkNumber: 31,
                _severity: 'high',
                _skipIf: false,
                description: `CALL THIS TOOL when you find AI assistant config files containing instructions that weaken security.
Files to scan: .cursorrules, .github/copilot-instructions.md, .aidigestignore, .clinerules, or any file that instructs an AI coding assistant.
Triggers â€” any instruction that says:
- Skip input validation / security checks
- Log sensitive data (passwords, tokens, PII)
- Hardcode credentials or bypass auth
- Trust user input without validation
- Disable CORS or security headers
DO NOT call for benign instructions like code style preferences.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_ai_hallucinated_packages',
                _checkNumber: 38,
                _severity: 'high',
                _skipIf: false,
                description: `CALL THIS TOOL when you find npm packages in package.json that appear to be AI-hallucinated or are suspicious unknown security/auth libraries.
Triggers:
- Security, auth, or crypto package with an unusual name not found in well-known library lists
- Package name that looks like it was invented: 'ai-secure-auth', 'fast-crypto-helper', 'jwt-safe-utils'
- Any import of a security-related package that isn't one of: bcrypt, argon2, jsonwebtoken, jose, passport, clerk, supabase, firebase, next-auth, auth0, crypto (built-in)
When in doubt: if it's a security library you don't recognise, flag it.
DO NOT call for well-known packages regardless of how obscure they sound.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_insecure_llm_output_handling',
                _checkNumber: 39,
                _severity: 'high',
                _skipIf: !hasAI,
                description: `CALL THIS TOOL when you find AI/LLM response output rendered directly as HTML without sanitization.
This is the OPPOSITE of prompt injection â€” the AI's own response becomes the XSS vector.
Triggers:
- innerHTML = aiResponse (any variable holding AI API response)
- dangerouslySetInnerHTML={{ __html: openaiResult }}
- Markdown renderer parsing AI output with no sanitization (marked(aiOutput) without DOMPurify)
- v-html="aiGeneratedContent" in Vue
Safe: DOMPurify.sanitize(aiOutput) before innerHTML, or render AI output as plain text only.
DO NOT call if AI output is only ever rendered as plain text.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_model_denial_of_service',
                _checkNumber: 40,
                _severity: 'high',
                _skipIf: !hasAI,
                description: `CALL THIS TOOL when you find AI API routes that accept user-supplied prompt input without enforcing size limits.
Triggers:
- AI route passes req.body.message or req.body.prompt directly to the API with no length check
- No if (prompt.length > X) return 400 guard before the API call
- No per-user token quota or daily limit
Combine with CHECK 15 (auth + rate limiting) â€” both are needed.
Safe: hard cap on input length (4,000â€“8,000 chars max), per-user quota tracked in Redis/Upstash.
DO NOT call if both a length cap and rate limiting are already present.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_prompt_injection_ai',
                _checkNumber: 24,
                _severity: 'high',
                _skipIf: !hasAI,
                description: `CALL THIS TOOL when you find Instruction Hijacking or raw user input concatenated directly into AI prompts.
Triggers:
- prompt = "Summarize this: " + user_input â€” lacks delimiters or sanitization.
- System instructions built by string concatenation with user data.
- No separation between system instructions and user content in the messages array.
- "Ignore previous instructions" risks due to lack of output handling or input isolation.
Safe: user input should go in the messages array with role: 'user', or use XML-style delimiters for isolation.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_mass_assignment',
                _checkNumber: 48,
                _severity: 'high',
                _skipIf: false,
                description: `CALL THIS TOOL when you find Broken Object Level Authorization (Mass Assignment) where user input is bound directly to a DB model.
Triggers:
- User.update(req.body) or db.create(req.body) â€” allows attacker to add fields like "isAdmin: true".
- Any ORM update call that does not use a strict whitelist of allowed fields.
- Spread operator used to merge req.body into a database object update.
Safe: explicitly pick fields: User.update({ name: req.body.name, bio: req.body.bio }).`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_backup_data_exposure',
                _checkNumber: 42,
                _severity: 'high',
                _skipIf: false,
                description: `CALL THIS TOOL when you find database backups or storage buckets that are publicly accessible.
Triggers:
- S3 bucket policy with "Principal": "*" or "Effect": "Allow" for all users
- Supabase storage bucket created without RLS policies
- Backup files (*.sql, *.dump, *.bak, *.tar.gz, *.zip) found in the public/ directory
- Backup files committed to the repository (present in scanned files)
- Backup scripts that write to a publicly accessible path
DO NOT call if backups are encrypted and stored in private buckets.`,
                input_schema: TOOLS._VULN_SCHEMA
            },


            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            // ðŸŸ¢ P2 MEDIUM â€” 17 checks
            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

            {
                name: 'report_security_headers_missing',
                _checkNumber: 17,
                _severity: 'medium',
                _skipIf: false,
                description: `CALL THIS TOOL when you find that important HTTP security headers are not configured.
Check next.config.js headers array (Next.js) or helmet() middleware (Express).
Call this tool if ANY of these are missing:
- Content-Security-Policy (prevents XSS)
- X-Frame-Options (prevents clickjacking)
- X-Content-Type-Options: nosniff (prevents MIME sniffing)
- Strict-Transport-Security (enforces HTTPS)
- Referrer-Policy (controls URL leakage)
List all missing headers in the evidence field.
DO NOT call if all 5 headers are present and correctly configured.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_cors_wildcard_credentials',
                _checkNumber: 18,
                _severity: 'medium',
                _skipIf: false,
                description: `CALL THIS TOOL when you find the dangerous combination of wildcard CORS origin AND credentials enabled.
Trigger: Access-Control-Allow-Origin: * (or origin: '*') AND Access-Control-Allow-Credentials: true (or credentials: true) set together.
Either one alone is acceptable in some contexts. Together they are always wrong.
DO NOT call for: wildcard origin without credentials, or specific origin whitelist with credentials.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_rate_limiting_missing',
                _checkNumber: 19,
                _severity: 'medium',
                _skipIf: false,
                description: `CALL THIS TOOL when you find authentication-related endpoints with no rate limiting middleware.
Endpoints that MUST have rate limiting: /api/auth/login, /api/auth/signup, /api/auth/reset-password, /api/auth/forgot-password, /api/contact.
Trigger: any of the above routes found without express-rate-limit, Upstash Ratelimit, or equivalent before the handler.
DO NOT call if rate limiting is applied globally to all routes, or if the route already has per-IP limiting.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_dependency_vulnerabilities',
                _checkNumber: 20,
                _severity: 'medium',
                _skipIf: false,
                description: `CALL THIS TOOL when you find risky dependency patterns in package.json or requirements.txt.
Triggers (any one):
- Wildcard versions: "lodash": "*" or "express": "latest"
- Known historically compromised packages: event-stream, node-ipc, ua-parser-js, colors (post-2022), faker (post-2022)
- Packages with clearly abandoned maintenance (check publish date if visible in context)
List all problematic packages in the evidence field.
DO NOT call for minor version ranges like "^4.0.0" â€” those are normal and safe.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_sensitive_data_in_urls',
                _checkNumber: 21,
                _severity: 'medium',
                _skipIf: false,
                description: `CALL THIS TOOL when you find API keys, tokens, passwords, or session IDs passed as URL query parameters.
Triggers:
- /api/callback?token=eyJhbGc... in route definitions or fetch calls
- /download?key=sk-... 
- res.redirect('/page?sessionId=' + sessionId)
- fetch('/api/data?apiKey=' + key)
Safe: pass sensitive values in request headers (Authorization: Bearer ...) or POST body, never in URLs.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_error_message_verbosity',
                _checkNumber: 22,
                _severity: 'medium',
                _skipIf: false,
                description: `CALL THIS TOOL when you find "Schema Exposure" or API routes returning internal details to clients.
Triggers:
- Stack traces in production: res.json({ error: err.stack }) â€” reveals internal file paths or framework info.
- Schema Leak: res.json({ error: err.message }) where err contains DB table names, column names, or keys.
- Sensitive Data in Logs: logging req.body (capturing passwords) or raw error objects in shared logs.
Safe: return generic messages ("Internal Error") and log specifics server-side only.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_command_injection',
                _checkNumber: 23,
                _severity: 'medium',
                _skipIf: false,
                description: `CALL THIS TOOL when you find shell commands or code evaluation using user-controlled input.
Triggers:
- exec(userInput), exec('convert ' + filename), exec(\`ffmpeg \${req.body.options}\`)
- spawn() with arguments derived from user input
- eval(userInput) on the server
- execSync() with user-controlled strings
The filename/option/command doesn't have to come directly from req.body â€” trace the data flow.
Safe: use libraries that don't shell out, or whitelist-validate all inputs before any exec call.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_path_traversal',
                _checkNumber: 25,
                _severity: 'medium',
                _skipIf: false,
                description: `CALL THIS TOOL when you find file system operations using user-supplied paths without validation.
Triggers:
- path.join(uploadDir, req.params.filename) â€” attacker uses ../../.env as filename
- fs.readFile(req.query.file) without sanitization
- res.sendFile(req.params.path) without path validation
Safe: use path.basename() to strip directory components, validate against an allowlist of files, or use a mapping (ID â†’ filename) instead of user-supplied paths.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_missing_input_validation',
                _checkNumber: 26,
                _severity: 'medium',
                _skipIf: false,
                description: `CALL THIS TOOL when you find API route handlers that accept request body/query data with no schema validation.
Triggers:
- Route handler uses req.body.* fields directly with no Zod, Joi, Yup, or similar schema check
- No validation of data types, required fields, or string length limits
- Accepts arbitrary fields in the body that get passed to a DB query
DO NOT call if Zod/Joi/Yup schema validation is present at the top of the handler.
CALL ONCE for each group of unprotected routes, not once per field.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_weak_password_policy',
                _checkNumber: 27,
                _severity: 'medium',
                _skipIf: false,
                description: `CALL THIS TOOL when you find weak password hashing or no password strength requirements.
Triggers:
- crypto.createHash('md5'), crypto.createHash('sha1'), or crypto.createHash('sha256') for passwords (wrong tool â€” use bcrypt/argon2)
- No minimum length check on password fields (accepting 1-character passwords)
- No protection against common passwords
Safe: bcrypt with cost factor 12+, argon2id, or scrypt. Minimum 8 characters. Use a library, never roll your own.
DO NOT call if bcrypt, argon2, or scrypt is used correctly.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_open_redirect',
                _checkNumber: 28,
                _severity: 'medium',
                _skipIf: false,
                description: `CALL THIS TOOL when you find redirect() calls using user-supplied URLs without validation.
Triggers:
- res.redirect(req.query.redirect) â€” attacker uses ?redirect=https://evil.com
- router.push(searchParams.get('next')) without origin validation
- window.location = req.body.url
Safe: validate that redirect URLs are relative paths only (start with /), or check against a whitelist of allowed domains.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_dependency_bloat_dev_prod_mix',
                _checkNumber: 33,
                _severity: 'medium',
                _skipIf: false,
                description: `CALL THIS TOOL when you find development-only packages in the production dependencies section.
Triggers in package.json "dependencies" (not "devDependencies"):
- nodemon, ts-node, jest, mocha, chai, webpack, esbuild, vite (as build tool)
- These tools have no business in production and increase attack surface
Also trigger if these packages are imported in server-side production files.
DO NOT call if they are correctly listed under devDependencies.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_env_validation_on_startup',
                _checkNumber: 34,
                _severity: 'medium',
                _skipIf: false,
                description: `CALL THIS TOOL when you find that the app does not validate required environment variables at startup.
Triggers:
- process.env.STRIPE_SECRET_KEY used directly without any check that it's defined
- No startup validation function that throws if required env vars are missing
- App can start and partially function with undefined API keys
Safe: a validation block at app startup like: if (!process.env.STRIPE_SECRET_KEY) throw new Error('Missing STRIPE_SECRET_KEY')
Or using a library like envalid or zod for env validation.
DO NOT call if env validation is present at startup.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_http_instead_of_https',
                _checkNumber: 35,
                _severity: 'medium',
                _skipIf: false,
                description: `CALL THIS TOOL when you find hardcoded HTTP URLs in production code, or missing HTTPS enforcement config.
Triggers:
- const API_URL = 'http://...' (not https)
- fetch('http://...') in production code
- No Strict-Transport-Security header (covered also by CHECK 17 â€” still flag here if http:// URLs found)
- Mixed content: HTTPS page loading HTTP sub-resources
DO NOT call for: localhost URLs (http://localhost is correct), or http:// inside comments.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_incident_logging_gaps',
                _checkNumber: 45,
                _severity: 'medium',
                _skipIf: false,
                description: `CALL THIS TOOL when you find that the app has no structured security event logging.
Triggers â€” absence of logging for:
- Authentication failures (failed login attempts not recorded)
- Authorization failures (access denied events not recorded)
- Payment failures or anomalies
- Admin actions (role changes, deletions)
- Rate limit triggers
Look for: no winston, pino, Sentry, Datadog, or equivalent. Or these events exist but aren't logged.
DO NOT call if structured logging is present and covers at least auth failures and 4xx/5xx responses.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_weak_randomness',
                _checkNumber: 49,
                _severity: 'medium',
                _skipIf: false,
                description: `CALL THIS TOOL when you find Math.random() or similar PRNGs used for security purposes.
Triggers:
- Generating session tokens, password reset links, or salts using Math.random() (JS) or random module (Python).
- Use of non-cryptographic random generators for sensitive identifiers.
Safe: use CSPRNGs like crypto.randomBytes() (Node.js) or secrets module (Python).`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_race_condition',
                _checkNumber: 50,
                _severity: 'medium',
                _skipIf: false,
                description: `CALL THIS TOOL when you find logic where a value is checked and then updated in separate steps (TOCTOU).
Triggers:
- Financial/Inventory logic: check balance, then deduct credits without a DB lock or atomic operation.
- Code lacking 'SELECT FOR UPDATE' or atomic updates in high-volume environments.
- Use of non-atomic counters or flags that are susceptible to race conditions.`,
                input_schema: TOOLS._VULN_SCHEMA
            },


            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            // ðŸŸ¡ P1 HIGH â€” NEW CHECKS #36â€“#71
            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

            {
                name: 'report_insecure_client_side_storage',
                _checkNumber: 52,
                _severity: 'high',
                _skipIf: false,
                description: `CALL THIS TOOL when JWT tokens, auth tokens, API keys, or sensitive user data are stored via localStorage.setItem() or sessionStorage.setItem().
Triggers: storing values named authToken, token, jwt, accessToken, userInfo, apiKey in browser storage.
Do NOT trigger for non-sensitive UI preferences like theme, language, or pagination settings.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_missing_security_logging',
                _checkNumber: 53,
                _severity: 'medium',
                _skipIf: false,
                description: `CALL THIS TOOL when authentication routes (login, register, password reset) have no logging of failed attempts, successful logins, or suspicious activity.
Triggers: auth endpoints that return 401/403 with no log statement, login handlers with zero security-relevant logging (failed attempts, lockouts, unusual IPs).
Do NOT trigger for general application logging â€” only flag when security-specific events like auth failures are completely untracked.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_insecure_pickle_deserialization',
                _checkNumber: 54,
                _severity: 'critical',
                _skipIf: false,
                description: `CALL THIS TOOL when pickle.loads(), pickle.load(), or any pickle deserialization is applied to data received from the network, user input, file uploads, or any external source.
Triggers: pickle.loads(data) where data originates from a socket, request body, queue, or file.
Do NOT trigger when pickle is used exclusively on internally generated, trusted data that never crosses a trust boundary.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_missing_payload_size_limits',
                _checkNumber: 55,
                _severity: 'medium',
                _skipIf: false,
                description: `CALL THIS TOOL when network data receivers, API route handlers, or file upload endpoints accept incoming data with no size validation before processing.
Triggers: socket recv() with no maximum byte cap enforced before deserialization, express routes with no body size limit set (no limit option in bodyParser or express.json()), file upload handlers with no maxSize check.
Do NOT trigger when a framework-level global size limit is already configured and applies to the endpoint in question.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_ssrf_vulnerability',
                _checkNumber: 56,
                _severity: 'high',
                _skipIf: false,
                description: `CALL THIS TOOL when a server-side function accepts a URL from user input and fetches it directly without allowlist validation.
Triggers: fetch(), axios.get(), http.get(), or requests.get() called with req.body.url, req.query.url, or any user-supplied URL parameter. Also trigger when webhook callback URLs or link preview features accept arbitrary URLs.
Do NOT trigger when the URL is fully hardcoded server-side with no user input.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_missing_csrf_protection',
                _checkNumber: 57,
                _severity: 'high',
                _skipIf: false,
                description: `CALL THIS TOOL when state-changing API routes (POST, PUT, DELETE, PATCH) that use cookie-based session authentication have no CSRF token validation.
Triggers: Express routes with no csurf middleware or equivalent, form submission handlers with no X-CSRF-Token header check, and cookie sessions with SameSite not set to strict or lax.
Do NOT trigger for stateless JWT Bearer token auth where CSRF is not applicable.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_inverted_auth_logic',
                _checkNumber: 58,
                _severity: 'critical',
                _skipIf: false,
                description: `CALL THIS TOOL when an authentication guard or middleware uses a negated condition that grants access to unauthenticated users instead of blocking them.
Triggers: if (!user) { next() } patterns that should be if (!user) { return res.status(401) }, isAuthenticated checks where the truthy branch returns an error instead of the falsy branch, or middleware that calls next() inside the unauthenticated condition block.
Do NOT trigger for intentionally public routes.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_negative_value_manipulation',
                _checkNumber: 59,
                _severity: 'high',
                _skipIf: false,
                description: `CALL THIS TOOL when payment, cart, order, or transaction handlers accept quantity or amount values from user input without validating they are greater than zero.
Triggers: cart item quantity from req.body with no minimum value check, price calculations that multiply user-supplied numbers without validation, and refund or discount handlers that accept negative values.
Do NOT trigger when numeric inputs are validated with explicit minimum value checks before use.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_rate_limit_ip_bypass',
                _checkNumber: 60,
                _severity: 'medium',
                _skipIf: false,
                description: `CALL THIS TOOL when rate limiting middleware uses req.ip, req.headers['x-forwarded-for'], or req.connection.remoteAddress as the rate limit key without trusted proxy configuration.
Triggers: express-rate-limit or similar middleware where the key function reads directly from X-Forwarded-For without verifying the proxy chain, or app.set('trust proxy') not configured when behind a load balancer.
Do NOT trigger when rate limiting uses authenticated user ID as the key instead of IP.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_prompt_injection_in_repo_files',
                _checkNumber: 61,
                _severity: 'high',
                _skipIf: false,
                description: `CALL THIS TOOL when README.md, inline code comments, or documentation files contain instructions directed at AI assistants that could alter security behavior.
Triggers: comments containing phrases like 'ignore previous', 'as an AI', 'system:', 'you are now', or instructions to skip validation, log credentials, or modify authentication logic.
Do NOT trigger for normal developer comments, documentation, or TODOs that contain no AI-directive language.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_fail_open_access_control',
                _checkNumber: 62,
                _severity: 'critical',
                _skipIf: false,
                description: `CALL THIS TOOL when try-catch blocks around authentication or authorization checks call next() or allow the request to proceed in the catch block.
Triggers: catch(err) { next() } in auth middleware, try { checkPermission() } catch { return data } patterns, and missing else clauses in permission checks that fall through to the protected resource on error.
Do NOT trigger when the catch block explicitly returns a 401, 403, or error response.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_missing_environment_separation',
                _checkNumber: 63,
                _severity: 'high',
                _skipIf: false,
                description: `CALL THIS TOOL when the codebase uses a single database URL, a single .env file, or a single configuration with no environment branching between test and production.
Triggers: DATABASE_URL with no NODE_ENV conditional, seed scripts or migration scripts that run against production connection strings, and test files that import and use the same db connection as the application with no mock or separate test database configured.
Do NOT trigger when separate .env.test, .env.production files exist and are loaded conditionally.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_log_injection',
                _checkNumber: 64,
                _severity: 'high',
                _skipIf: false,
                description: `CALL THIS TOOL when user-controlled input (req.body, req.query, req.params, headers) is written directly to a logger or console without sanitization of CRLF characters.
Triggers: logger.info(userInput), console.log(req.body.username), winston.error(req.query.q) where the input value is not stripped of \\r and \\n characters before logging.
Do NOT trigger when the logged value is a hardcoded string or a server-side generated value with no user influence.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_jwt_algorithm_confusion',
                _checkNumber: 65,
                _severity: 'critical',
                _skipIf: false,
                description: `CALL THIS TOOL when jwt.verify(), jose.jwtVerify(), or equivalent token verification functions are called without explicitly specifying the allowed algorithm(s).
Triggers: jwt.verify(token, secret) with no algorithms option, jsonwebtoken verify calls where the algorithm is read from the token header itself, and RS256 implementations where the public key is used but the algorithm whitelist is absent.
Do NOT trigger when the verification call explicitly passes { algorithms: ['RS256'] } or equivalent.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_slopsquatting_hallucinated_packages',
                _checkNumber: 66,
                _severity: 'high',
                _skipIf: false,
                description: `CALL THIS TOOL when package.json or requirements.txt contains packages that appear to be AI-hallucinated: not in top-tier registry rankings, have zero/low download counts, were recently published (< 6 months), have no GitHub repository, or whose names closely resemble common packages with subtle misspellings or extra words.
Triggers: packages matching known AI hallucination patterns (e.g. 'secure-jwt-handler', 'express-auth-middleware', 'react-safe-input').
Do NOT trigger for well-established packages with long publication histories and high download counts.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_api_docs_exposed_production',
                _checkNumber: 67,
                _severity: 'high',
                _skipIf: false,
                description: `CALL THIS TOOL when Swagger UI (/api-docs, /swagger, /swagger-ui.html), GraphQL Playground (/graphql with introspection enabled), or Redoc endpoints are accessible without authentication in production configuration.
Triggers: swagger-ui-express mounted with no auth middleware, Apollo Server with introspection: true and no NODE_ENV check, and /api-docs routes reachable by unauthenticated requests.
Do NOT trigger when these endpoints are explicitly gated behind admin authentication middleware.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_missing_token_expiry',
                _checkNumber: 68,
                _severity: 'high',
                _skipIf: false,
                description: `CALL THIS TOOL when JWT tokens are signed without an expiresIn option, or when session cookies are set with no maxAge or expires value.
Triggers: jwt.sign(payload, secret) with no expiresIn option, jwt.sign(payload, secret, {}) with empty options object, and cookie sessions with no maxAge set.
Do NOT trigger when expiresIn or maxAge is explicitly set to any value, even a long one.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_weak_cryptography',
                _checkNumber: 69,
                _severity: 'high',
                _skipIf: false,
                description: `CALL THIS TOOL when MD5, SHA-1, SHA1, DES, RC4, or other known-broken cryptographic algorithms are used for purposes beyond non-security checksums.
Triggers: crypto.createHash('md5') or crypto.createHash('sha1') for token generation, signature verification, or data integrity; crypto.createCipher() (deprecated) for data encryption; and any use of DES, 3DES, or RC4 for encryption.
Do NOT trigger when MD5 is used exclusively for non-security purposes like cache keys or content-addressed file naming with no security implication.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_ai_agent_overpermissioned_db',
                _checkNumber: 70,
                _severity: 'critical',
                _skipIf: false,
                description: `CALL THIS TOOL when database connection strings grant superuser or admin-level credentials to application code that does not require DDL permissions, when AI agent config files show database URLs with admin/root credentials, or when a single DATABASE_URL is used by both the application and migration/admin tools.
Triggers: DATABASE_URL with username=postgres, user=root, or user=admin in application config.
Do NOT trigger when the connection user is explicitly a restricted application user with only the minimum required permissions.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_nosql_injection',
                _checkNumber: 71,
                _severity: 'critical',
                _skipIf: !hasMongoDB,
                description: `CALL THIS TOOL when user-supplied req.body, req.query, or req.params values are passed directly into MongoDB find(), findOne(), or updateOne() calls without type validation ensuring they are strings or primitives.
Triggers: db.collection.findOne({ username: req.body.username, password: req.body.password }) with no typeof check, Mongoose queries using req.body fields without sanitizeFilter or schema validation, and GraphQL resolvers forwarding args.filter directly into collection.find().
Do NOT trigger when all user-supplied fields are validated as strings or primitives before use in queries.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_ssti_vulnerability',
                _checkNumber: 72,
                _severity: 'critical',
                _skipIf: false,
                description: `CALL THIS TOOL when user-supplied input is passed as data INTO a template string that is then rendered/compiled, or when user input is concatenated directly into a template string before rendering.
Triggers: res.render() with user data injected into the template string itself (not just the data object), ejs.render(templateString + userInput), Jinja2 render_template_string(userInput), and Nunjucks or Handlebars template compilation from user-supplied strings.
Do NOT trigger when user data is passed only as the data context object to a fixed template file.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_redos_vulnerability',
                _checkNumber: 73,
                _severity: 'medium',
                _skipIf: false,
                description: `CALL THIS TOOL when regex patterns used for user input validation contain nested quantifiers, overlapping character classes, or repetition groups that can cause catastrophic backtracking.
Triggers: patterns like /^([a-zA-Z0-9]+.)+$/, /^(a+)+$/, email validation with multiple nested groups on unsanitized input, and any user-supplied string tested against a complex regex without a length cap enforced first.
Do NOT trigger for simple, non-nested patterns like /^[0-9]{4}$/.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_account_enumeration',
                _checkNumber: 74,
                _severity: 'medium',
                _skipIf: false,
                description: `CALL THIS TOOL when login, registration, or password reset endpoints return different response messages or status codes depending on whether the account exists vs the credential is wrong.
Triggers: 'User not found' for unknown username vs 'Incorrect password' for wrong password on the same endpoint, password reset returning 'No account found' for unregistered emails, and timing differences where DB lookup + password hash check takes longer for valid users than invalid ones.
Do NOT trigger when all auth failure paths return identical generic messages like 'Invalid credentials'.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_graphql_batching_dos',
                _checkNumber: 75,
                _severity: 'high',
                _skipIf: !hasGraphQL,
                description: `CALL THIS TOOL when a GraphQL server is configured without query depth limiting, query complexity limits, or batch request size caps.
Triggers: Apollo Server or graphql-js with no depthLimit plugin, no graphql-query-complexity configuration, array-based batching enabled with no max batch size, and mutation aliases allowed without rate limiting per alias.
Do NOT trigger when graphql-depth-limit or equivalent depth/complexity limiting middleware is explicitly configured.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_integer_overflow',
                _checkNumber: 76,
                _severity: 'medium',
                _skipIf: false,
                description: `CALL THIS TOOL when arithmetic operations (multiplication, addition, exponentiation) are performed on user-supplied integers without validating that the result stays within safe bounds.
Triggers: quantity * price with no MAX_SAFE_INTEGER check, total calculations in cart/billing logic using unvalidated user inputs, and bit-shift or bitmask permission operations on user-controlled values.
Do NOT trigger when arithmetic is performed exclusively on server-side constants with no user input involved.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_hidden_unicode_in_rule_files',
                _checkNumber: 77,
                _severity: 'critical',
                _skipIf: false,
                description: `CALL THIS TOOL when AI rule files (.cursorrules, .windsurfrules, .clinerules, .mdc, .github/copilot-instructions.md) or any markdown/config file contains Unicode characters in the zero-width range (U+200Bâ€“U+200F), bidirectional control characters (U+202Aâ€“U+202E), or Unicode tag block characters (U+E0000â€“U+E007F).
Any occurrence of these characters in a rule or config file is suspicious â€” they serve no legitimate display purpose in code configuration files.
Do NOT trigger for source code files that legitimately require international character support.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_insecure_randomness',
                _checkNumber: 78,
                _severity: 'high',
                _skipIf: false,
                description: `CALL THIS TOOL when Math.random(), random.randint(), random.random(), rand(), java.util.Random, or any non-cryptographic PRNG is used to generate values used for security purposes.
Triggers: password reset tokens, session identifiers, API keys, CSRF tokens, OTP codes, email verification tokens, or any value sent to a user for authentication purposes generated with non-cryptographic randomness.
Do NOT trigger when crypto.randomBytes(), secrets.token_hex(), SecureRandom, or equivalent CSPRNG functions are used.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_crlf_header_injection',
                _checkNumber: 79,
                _severity: 'high',
                _skipIf: false,
                description: `CALL THIS TOOL when user-controlled input (req.query, req.body, req.params) is placed into HTTP response headers without stripping \\r and \\n characters.
Triggers: res.redirect() called with unsanitized user-supplied URL parameters, res.setHeader() or res.cookie() with values derived from user input, and Location header construction via string concatenation with unvalidated input.
Do NOT trigger when the header value is fully server-side generated with no user input component.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_malicious_postinstall_script',
                _checkNumber: 80,
                _severity: 'critical',
                _skipIf: false,
                description: `CALL THIS TOOL when package.json contains a scripts.postinstall, scripts.preinstall, scripts.install, or scripts.prepare entry that executes a shell command, downloads a remote resource (curl, wget, fetch), executes a binary, or runs any script from a path outside the project's own source tree.
Triggers: postinstall entries that call node scripts from remotely downloaded files, shell commands that pipe to sh or bash, and any postinstall that performs network requests.
Do NOT trigger for postinstall scripts that only compile native addons (node-gyp rebuild) or generate local type definitions with no network access.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_firebase_open_security_rules',
                _checkNumber: 81,
                _severity: 'critical',
                _skipIf: !hasFirebase,
                description: `CALL THIS TOOL when firestore.rules or storage.rules files contain allow read, write: if true, allow read: if true, or are missing from the project entirely while Firebase is configured.
Also trigger when firebase.json deploys Firestore without a rules file reference, or when Firestore collection access is not scoped to request.auth != null at minimum.
Do NOT trigger when all collections have explicit rules validating request.auth.uid against document ownership.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_overprivileged_cloud_iac',
                _checkNumber: 82,
                _severity: 'high',
                _skipIf: !hasIaC,
                description: `CALL THIS TOOL when IaC files (*.tf, *.yaml, *.json CloudFormation templates, k8s manifests) contain wildcard IAM actions (Action: '*'), public S3 bucket ACLs (PublicRead or PublicReadWrite), security groups with port range 0-65535 open to 0.0.0.0/0, Kubernetes Pods with privileged: true or securityContext.runAsUser: 0, or IAM roles with AdministratorAccess attached to application services.
Do NOT trigger when least-privilege policies are in use with specific action and resource scopes.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_trusted_client_security_headers',
                _checkNumber: 83,
                _severity: 'critical',
                _skipIf: false,
                description: `CALL THIS TOOL when HTTP request headers supplied by clients are used to make security decisions without server-side verification.
Triggers: req.headers['x-user-id'] used to identify the authenticated user instead of a server-issued session token, req.headers['x-admin'] or req.headers['x-role'] used for authorization without cryptographic validation, req.headers['x-forwarded-user'] trusted without verifying it comes from a trusted proxy, and any custom header value used to bypass authentication or grant elevated permissions.
Do NOT trigger when headers are verified against a server-side session, signed JWT, or trusted proxy chain before being acted upon.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_negative_price_injection',
                _checkNumber: 84,
                _severity: 'high',
                _skipIf: false,
                description: `CALL THIS TOOL when product creation, listing, or price update API endpoints accept price, amount, or cost values from seller/creator input without validating they are strictly positive numbers greater than zero.
Triggers: product create/update routes where req.body.price has no minimum value validation, price fields passed directly to database create calls without positivity check, and auction or dynamic pricing endpoints accepting user-supplied numeric values with no floor.
Do NOT trigger when price values are exclusively fetched from a server-side price catalogue and never accepted from user input.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_container_running_as_root',
                _checkNumber: 85,
                _severity: 'medium',
                _skipIf: false,
                description: `CALL THIS TOOL when Dockerfile files have no USER directive before the CMD/ENTRYPOINT instruction (defaulting to root), Kubernetes Pod or Deployment specs have no securityContext with runAsNonRoot: true or a specific runAsUser > 0, or docker-compose.yml files have no user field defined.
Do NOT trigger when a non-root USER is explicitly set in the Dockerfile or runAsUser is explicitly set to a UID greater than 0 in the Kubernetes manifest.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

            {
                name: 'report_pii_stored_unencrypted',
                _checkNumber: 86,
                _severity: 'high',
                _skipIf: false,
                description: `CALL THIS TOOL when database schema definitions (Prisma schema, Sequelize models, SQL CREATE TABLE, Mongoose schemas, Supabase migrations) contain fields storing sensitive personal data as plain string/text/varchar columns with no encryption annotation.
Triggers: fields named ssn, socialSecurityNumber, creditCard, cardNumber, medicalRecord, passport, nationalId, dateOfBirth, iban, bankAccount stored as String, TEXT, or VARCHAR without an @encrypted decorator or equivalent.
Do NOT trigger when the field name suggests sensitive data but the schema uses encrypted types, the application applies field-level encryption before storage, or the data is clearly non-sensitive.`,
                input_schema: TOOLS._VULN_SCHEMA
            },

        ];

        // ── Plan-tier gating ─────────────────────────
        // Resolve which check numbers are allowed for this plan
        const planCheckNumbers = (typeof PLAN_LIMITS !== 'undefined' && planTier !== 'plus')
            ? PLAN_LIMITS[planTier]?.checkNumbers
            : 'all';
        // Convert array to Set for O(1) lookup (arrays don't have .has())
        const planChecksSet = (planCheckNumbers && planCheckNumbers !== 'all')
            ? new Set(planCheckNumbers)
            : null;
        const isCheckAllowed = (checkNum) =>
            !planChecksSet || planChecksSet.has(checkNum);

        return allTools
            .filter(t => !t._skipIf && isCheckAllowed(t._checkNumber))
            .map(({ name, description, input_schema, _checkNumber, _severity }) => ({
                name,
                description,
                input_schema,
                _meta: { checkNumber: _checkNumber, severity: _severity }
            }));
    },


    buildScanMessages(bizType, detectedStack, codeString, planTier = 'plus') {
        let system;
        if (typeof PROMPTS !== 'undefined' && PROMPTS.buildSystemPrompt) {
            system = PROMPTS.buildSystemPrompt(bizType, detectedStack, codeString);
        } else {
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
                : 'Stack unknown â€” audit everything.';
            system = `You are a senior security engineer auditing a founder's codebase before launch.
Think like an attacker. Trace every entry point, every data flow, every gap between user input and database.

This is a ${BIZ[bizType] || BIZ.saas}.
${stackCtx}

You have ${TOOLS.buildScanTools(detectedStack, codeString, planTier).length} security check tools available.
For each vulnerability you find in the code, call the matching tool.
If you find nothing wrong for a check â€” do NOT call that tool.
If a check is not applicable to this stack â€” do NOT call that tool.

RULES:
- Call a tool only when you have CLEAR EVIDENCE in the code. Never invent vulnerabilities.
- Use plain English in all fields. No CVE numbers, no CVSS scores, no jargon.
- Use real-world analogies in what_is_it (e.g. "like leaving your front door unlocked").
- Quote real code in the evidence field â€” exact snippets, not paraphrases.
- You may call the same tool multiple times for different files if the same issue appears in multiple places.`;
        }

        const user = `Audit this codebase for security vulnerabilities:\n\n${codeString}`;
        return { system, user };
    },


    async runScanClaude(apiKey, model = 'claude-sonnet-4-6', bizType, detectedStack, codeString, planTier = 'plus') {
        const tools = TOOLS.buildScanTools(detectedStack, codeString, planTier);
        const { system, user } = TOOLS.buildScanMessages(bizType, detectedStack, codeString, planTier);

        const toolMeta = {};
        tools.forEach(t => { toolMeta[t.name] = t._meta; });

        const apiTools = tools.map(({ name, description, input_schema }) => ({ name, description, input_schema }));

        let token = '';
        if (typeof window !== 'undefined' && typeof window.getSupabase === 'function') {
            const sb = window.getSupabase();
            if (sb) {
                const { data } = await sb.auth.getSession();
                token = data?.session?.access_token || '';
            }
        }

        const response = await fetch('/api/scan', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                provider: 'anthropic',
                payload: {
                    model,
                    max_tokens: 8000,
                    temperature: 0,
                    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
                    tools: apiTools,
                    tool_choice: { type: 'auto' },
                    messages: [{ role: 'user', content: user }]
                }
            })
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(`Claude API error ${response.status}: ${err.error || response.statusText}`);
        }

        const responseData = await response.json();

        // Track usage
        if (typeof UsageTracker !== 'undefined' && responseData.usage) {
            UsageTracker.track('anthropic', model, responseData.usage.input_tokens, responseData.usage.output_tokens);
        }

        return { data: responseData, toolMeta };
    },


    async runScanGemini(apiKey, model = 'gemini-2.5-flash-lite', bizType, detectedStack, codeString, planTier = 'plus') {
        const tools = TOOLS.buildScanTools(detectedStack, codeString, planTier);
        const { system, user } = TOOLS.buildScanMessages(bizType, detectedStack, codeString, planTier);

        const toolMeta = {};
        tools.forEach(t => { toolMeta[t.name] = t._meta; });

        const geminiTools = [{
            functionDeclarations: tools.map(({ name, description, input_schema }) => ({
                name, description, parameters: input_schema
            }))
        }];

        let token = '';
        if (typeof window !== 'undefined' && typeof window.getSupabase === 'function') {
            const sb = window.getSupabase();
            if (sb) {
                const { data } = await sb.auth.getSession();
                token = data?.session?.access_token || '';
            }
        }

        const response = await fetch('/api/scan', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                provider: 'google',
                // Removing endpoint from here so the backend dynamically fetches it from process.env.GEMINI_MODEL (.env.local)
                payload: {
                    systemInstruction: { parts: [{ text: system }] },
                    contents: [{ role: 'user', parts: [{ text: user }] }],
                    tools: geminiTools,
                    generationConfig: { temperature: 0 }
                }
            })
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(`Gemini API error ${response.status}: ${JSON.stringify(err)}`);
        }

        const responseData = await response.json();

        // Track usage
        if (typeof UsageTracker !== 'undefined' && responseData.usageMetadata) {
            UsageTracker.track('google', model, responseData.usageMetadata.promptTokenCount, responseData.usageMetadata.candidatesTokenCount);
        }

        return { data: responseData, toolMeta, isGemini: true };
    },


    async runScan(apiKey, model, bizType, detectedStack, codeString, planTier = 'plus') {
        const isGemini = model.startsWith('gemini');
        if (isGemini) return TOOLS.runScanGemini(apiKey, model, bizType, detectedStack, codeString, planTier);
        return TOOLS.runScanClaude(apiKey, model, bizType, detectedStack, codeString, planTier);
    },


    parseToolResults({ data, toolMeta, isGemini = false }) {
        const toolCalls = [];

        if (isGemini) {
            const parts = data?.candidates?.[0]?.content?.parts || [];
            for (const part of parts) {
                if (part.functionCall) {
                    toolCalls.push({ name: part.functionCall.name, input: part.functionCall.args });
                }
            }
        } else {
            const content = data?.content || [];
            for (const block of content) {
                if (block.type === 'tool_use') {
                    toolCalls.push({ name: block.name, input: block.input });
                }
            }
        }

        const vulnerabilities = toolCalls.map((call, index) => {
            const meta = toolMeta[call.name] || { checkNumber: 0, severity: 'medium' };
            const input = call.input || {};
            return {
                id: `${call.name}-${index}`,
                title: TOOLS._toolNameToTitle(call.name),
                severity: meta.severity,
                check_number: meta.checkNumber,
                vibe_category: TOOLS._toolNameToCategory(call.name),
                file: input.file || 'unknown',
                line: input.line || 0,
                evidence: input.evidence || '',
                what_is_it: input.what_is_it || '',
                why_dangerous: input.why_dangerous || '',
                business_risk: input.business_risk || '',
                how_to_fix: input.how_to_fix || '',
                fixed_code: input.fixed_code || '',
                code_language: TOOLS._inferLanguage(input.file || ''),
            };
        });

        const order = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
        vulnerabilities.sort((a, b) => (order[a.severity] || 4) - (order[b.severity] || 4));
        return vulnerabilities;
    },


    calcScore(vulnerabilities) {
        let score = 100;
        for (const v of vulnerabilities) {
            switch (v.severity) {
                case 'critical': score -= 25; break;
                case 'high': score -= 10; break;
                case 'medium': score -= 4; break;
                case 'low': score -= 1; break;
            }
        }
        return Math.max(0, score);
    },

    scoreToVerdict(score) {
        if (score >= 80) return 'deploy';
        if (score >= 50) return 'deploy_with_caution';
        return 'do_not_deploy';
    },

    calcCounts(vulnerabilities) {
        return {
            critical: vulnerabilities.filter(v => v.severity === 'critical').length,
            high: vulnerabilities.filter(v => v.severity === 'high').length,
            medium: vulnerabilities.filter(v => v.severity === 'medium').length,
            low: vulnerabilities.filter(v => v.severity === 'low').length,
        };
    },


    _toolNameToTitle(toolName) {
        return toolName
            .replace('report_', '')
            .split('_')
            .map(w => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ');
    },

    _toolNameToCategory(toolName) {
        const MAP = {
            report_supabase_rls: 'supabase_rls',
            report_frontend_secrets: 'frontend_secret',
            report_next_public_prefix: 'next_public',
            report_env_git_tracking: 'env_tracking',
            report_auth_middleware_missing: 'auth_missing',
            report_stripe_webhook_missing_verification: 'stripe_webhook',
            report_server_side_price: 'payment_bypass',
            report_custom_auth_implementation: 'custom_auth',
            report_upload_directory_execution: 'upload_directory',
            report_csrf_token_missing: 'csrf',
            report_insecure_deserialization: 'deserialization',
            report_excessive_ai_agency: 'ai_agency',
            report_idor_ownership: 'idor',
            report_sql_injection: 'sql_injection',
            report_xss_injection: 'xss',
            report_payment_frontend_gating: 'payment_gating',
            report_console_log_leaks_browser: 'console_log',
            report_server_log_leaks: 'server_log',
            report_file_upload_validation: 'file_upload',
            report_ai_endpoint_cost_abuse: 'ai_abuse',
            report_session_configuration: 'session',
            report_api_versioning_forgotten_routes: 'api_versioning',
            report_malicious_ai_config_files: 'ai_config',
            report_ai_hallucinated_packages: 'ai_packages',
            report_insecure_llm_output_handling: 'llm_output',
            report_model_denial_of_service: 'model_dos',
            report_backup_data_exposure: 'backup_exposure',
            report_security_headers_missing: 'security_headers',
            report_cors_wildcard_credentials: 'cors',
            report_rate_limiting_missing: 'rate_limiting',
            report_dependency_vulnerabilities: 'dependency',
            report_sensitive_data_in_urls: 'sensitive_url',
            report_error_message_verbosity: 'error_leak',
            report_command_injection: 'command_injection',
            report_prompt_injection_ai: 'prompt_injection',
            report_mass_assignment: 'bola',
            report_path_traversal: 'path_traversal',
            report_missing_input_validation: 'input_validation',
            report_weak_password_policy: 'password_policy',
            report_open_redirect: 'open_redirect',
            report_dependency_bloat_dev_prod_mix: 'dependency_bloat',
            report_env_validation_on_startup: 'env_validation',
            report_http_instead_of_https: 'http_https',
            report_incident_logging_gaps: 'incident_logging',
            report_supply_chain_attack: 'supply_chain',
            report_ssrf: 'ssrf',
            report_weak_randomness: 'weak_random',
            report_race_condition: 'race_condition',
            // New checks #52–#86
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
        };
        return MAP[toolName] || 'general';
    },

    _inferLanguage(filename) {
        const ext = filename.split('.').pop().toLowerCase();
        const MAP = {
            js: 'js', jsx: 'jsx', ts: 'ts', tsx: 'tsx', py: 'python',
            php: 'php', rb: 'ruby', go: 'go', java: 'java', cs: 'csharp',
            yaml: 'yaml', yml: 'yaml', json: 'json', env: 'bash', sh: 'bash'
        };
        return MAP[ext] || 'js';
    }

};

/* â”€â”€â”€ Export (Node / bundler)  Compiling /api/scan ...
 POST /api/scan 502 in 5.1min (compile: 3.6s, proxy.ts: 20ms, render: 5.1min)
 */
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TOOLS;
}