/* ═══════════════════════════════════════════════════
   APP.JS — Main Application Logic
   ═══════════════════════════════════════════════════
   Dependencies (loaded before this file):
     - config.js  (CONFIG object)
     - prompts.js (PROMPTS object)
═══════════════════════════════════════════════════ */

const $ = id => document.getElementById(id);

// ── Supabase Client Init ────────────────────── */
let sbClient = null;
function getSupabase() {
    if (!sbClient && window.supabase) {
        sbClient = window.supabase.createClient(
            window.SUPABASE_URL,
            window.SUPABASE_ANON_KEY
        );
        // Expose globally so React components (Pricing.tsx) can reuse the same client
        window._sbClient = sbClient;
    }
    return sbClient;
}

// ── Auth State ──────────────────────────────── */
let isUserAuthed = false;
let currentAuthMode = 'signup';
let currentUser = null;
let currentUserPlan = null;

/* ── Global State ────────────────────────────── */
let folderFiles = [], folderName = '', codeSnapshot = '', reportData = null, prevReport = null;
let chatHistory = [], isChatting = false, bizType = 'saas', detectedStack = [], inputMode = 'folder';
let isViewingSharedReport = false;
let githubProviderToken = null;

// Share state with React
window.CODESAFE_STATE = {
    get reportData() { return reportData; },
    get scanId() { return reportData?.scanId ?? null; },
    get isScanning() { return loadSec?.classList.contains('show'); },
    get bizType() { return bizType; },
    get userPlan() { return currentUserPlan; }
};

async function fetchUserPlan() {
    if (!currentUser) return;
    const sb = getSupabase();
    if (!sb) return;
    const { data, error } = await sb.from('user_plans').select('*').eq('user_id', currentUser.id).single();
    if (data && !error) {
        currentUserPlan = data;
        window.currentUserPlan = data;  // expose globally for React
        window.currentUser = currentUser; // expose for input page account widget
        window.dispatchEvent(new CustomEvent('codesafe:plan_updated')); // notify React
        updateNavForAuth(); // re-render UI with actual plan
    } else if (error && error.code === 'PGRST116') {
        // If trigger hasn't fired yet, retry once
        setTimeout(fetchUserPlan, 1000);
    }
}

async function fetchScanHistory() {
    if (!currentUser) return;
    const sb = getSupabase();
    if (!sb) return;
    const { data, error } = await sb.from('scan_history')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false })
        .limit(10);
    if (!error && data) {
        window.CODESAFE_HISTORY = data;
        window.dispatchEvent(new CustomEvent('codesafe:history_updated', { detail: data }));
    }
}


window.switchPlanForTesting = async function (newTier, btn) {
    if (!currentUser) { showAuthModal('signin'); return; }

    const origText = btn?.innerText || btn?.textContent;
    if (btn) {
        btn.innerText = 'Initializing...';
        btn.disabled = true;
        btn.style.opacity = '0.6';
    }

    try {
        // Enforce proper casing for the API (Starter, Pro, Plus)
        const formattedTier = newTier.charAt(0).toUpperCase() + newTier.slice(1).toLowerCase();

        // Get access token from the CDN Supabase session
        let accessToken = '';
        const sb = getSupabase();
        if (sb) {
            const { data } = await sb.auth.getSession();
            accessToken = data?.session?.access_token || '';
        }
        if (!accessToken) {
            showToast('⚠ Please sign in to continue');
            if (btn) { btn.innerText = origText; btn.disabled = false; btn.style.opacity = '1'; }
            return;
        }

        const response = await fetch('/api/checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tier: formattedTier,
                accessToken: accessToken,
            }),
        });

        const data = await response.json();

        if (data.checkoutUrl) {
            window.location.href = data.checkoutUrl;
        } else {
            throw new Error(data.error || 'Failed to create checkout session');
        }
    } catch (err) {
        console.error("Checkout error:", err);
        showToast('⚠ Error: ' + err.message);
        if (btn) {
            btn.innerText = origText;
            btn.disabled = false;
            btn.style.opacity = '1';
        }
    }
};




let githubRepos = [];
function updateGithubUI() {
    const connectView = $('githubConnectView');
    const repoView = $('githubSelectorWrap');
    if (!connectView || !repoView) return;

    const hasGithubProvider = currentUser?.app_metadata?.providers?.includes('github');

    if (hasGithubProvider && githubProviderToken) {
        connectView.style.display = 'none';
        repoView.style.display = 'block';
        if (currentUser && currentUser.user_metadata) {
            const meta = currentUser.user_metadata;
            const nameEl = $('githubUserName');
            if (nameEl) nameEl.textContent = meta.user_name || meta.full_name || currentUser.email;
            const avatarEl = $('githubUserAvatar');
            if (avatarEl && meta.avatar_url) {
                avatarEl.style.backgroundImage = `url(${meta.avatar_url})`;
                avatarEl.style.backgroundSize = 'cover';
            }
            saveGithubConnectionToSupabase(meta);
        }
        fetchUserRepos();
    } else if (hasGithubProvider && !githubProviderToken) {
        // Linked but token missing (after refresh)
        connectView.style.display = 'block';
        repoView.style.display = 'none';
        const msg = connectView.querySelector('p');
        if (msg) msg.textContent = "Sync your GitHub account to preview repositories";
        const btn = $('githubLoginBtn');
        if (btn) {
            btn.innerHTML = btn.innerHTML.replace('Connect to GitHub', 'Sync Repositories');
        }
    } else {
        connectView.style.display = 'block';
        repoView.style.display = 'none';
        const msg = connectView.querySelector('p');
        if (msg) msg.textContent = "Connect your GitHub account to scan repositories";
    }
}

async function saveGithubConnectionToSupabase(meta) {
    const sb = getSupabase();
    if (!sb || !currentUser) return;
    try {
        await sb.from('profiles').update({
            github_username: meta.user_name || meta.full_name,
            github_avatar: meta.avatar_url
        }).eq('id', currentUser.id);
    } catch (e) {
        console.error("Error saving GitHub connection:", e);
    }
}


async function fetchUserRepos() {
    if (!githubProviderToken) {
        const select = $('githubRepoSelect');
        if (select) select.innerHTML = '<option value="">Please connect GitHub first</option>';
        return;
    }
    const select = $('githubRepoSelect');
    if (!select) return;

    select.innerHTML = '<option value="">Loading your repositories...</option>';

    try {
        const res = await fetch('https://api.github.com/user/repos?sort=updated&per_page=100&type=owner', {
            headers: { 'Authorization': `token ${githubProviderToken}` }
        });

        if (res.status === 401) {
            select.innerHTML = '<option value="">Connection expired. Please reconnect.</option>';
            const reconBtn = $('githubReconnectBtnWrap');
            if (reconBtn) reconBtn.style.display = 'block';
            const selectBtn = $('githubSelectBtn');
            if (selectBtn) selectBtn.style.display = 'none';
            showErr('GitHub session expired. Please reconnect.');
            return;
        }

        if (!res.ok) throw new Error(`Failed to fetch repositories (${res.status})`);
        githubRepos = await res.json();

        if (githubRepos.length === 0) {
            select.innerHTML = '<option value="">No repositories found</option>';
            return;
        }

        select.innerHTML = '<option value="">-- Select a Repository --</option>';
        githubRepos.forEach(r => {
            const opt = document.createElement('option');
            opt.value = r.html_url;
            opt.textContent = `${r.private ? '🔒' : '🌐'} ${r.full_name}`;
            select.appendChild(opt);
        });
    } catch (e) {
        select.innerHTML = '<option value="">Error loading repositories</option>';
        console.error('Fetch repos error:', e);
    }
}


// Initialize auth — check session + listen for changes
function initAuth() {
    const sb = getSupabase();
    if (!sb) {
        // CDN not loaded yet, retry
        setTimeout(initAuth, 300);
        return;
    }

    // Check for auth errors in URL (handles identity linking conflicts)
    const hash = window.location.hash || '';
    if (hash.includes('error=')) {
        const hashParams = new URLSearchParams(hash.substring(1));
        const errorDesc = hashParams.get('error_description') || hashParams.get('error');
        if (errorDesc) {
            const rawMsg = decodeURIComponent(errorDesc.replace(/\+/g, ' '));
            let finalMsg = "Auth Error: " + rawMsg;
            if (rawMsg.toLowerCase().includes('already linked') || rawMsg.toLowerCase().includes('identity_already_linked')) {
                finalMsg = "⚠️ This GitHub account is already connected to another CodeSafe user. Please disconnect it from your other account first.";
            }
            showToast(finalMsg, 5000); // Use notification style instead of browser alert
            if (window.showErr) window.showErr(finalMsg);
            // Clear error from hash
            history.replaceState(null, '', window.location.pathname + window.location.search);
        }
    }

    // Listen for auth state changes (handles OAuth redirects too)
    try {
        sb.auth.onAuthStateChange((event, session) => {
            console.log('Auth event:', event);
            if (session) {
                isUserAuthed = true;
                currentUser = session.user;
                if (session.provider_token) {
                    githubProviderToken = session.provider_token;
                    localStorage.setItem('github_token', githubProviderToken);
                } else {
                    githubProviderToken = localStorage.getItem('github_token');
                }
                updateNavForAuth();
                updateGithubUI();
                fetchUserPlan(); // fetch plan
                fetchScanHistory(); // fetch history
            } else {
                isUserAuthed = false;
                currentUser = null;
                githubProviderToken = null;
                localStorage.removeItem('github_token');
                updateNavForAuth();
                updateGithubUI();
            }
        });
    } catch (e) {
        console.warn('Supabase auth listener failed:', e);
    }

    // Check existing session with robustness
    try {
        sb.auth.getSession().then(({ data, error }) => {
            if (error) {
                console.warn('Supabase auth check error:', error.message || error);
                return;
            }
            if (data && data.session) {
                isUserAuthed = true;
                currentUser = data.session.user;
                githubProviderToken = data.session.provider_token || localStorage.getItem('github_token');
                if (data.session.provider_token) localStorage.setItem('github_token', data.session.provider_token);
                updateNavForAuth();
                updateGithubUI();
                fetchUserPlan(); // fetch plan
                fetchScanHistory(); // fetch history
            }
        }).catch(err => {
            // This is the "Failed to fetch" handler
            console.warn('Supabase getSession failed to fetch (likely network/blocked):', err);
        });
    } catch (e) {
        console.warn('Supabase session catch failed:', e);
    }
}
setTimeout(initAuth, 300);

// ── Update Nav based on auth state ──────────── */
function updateNavForAuth() {
    const signupBtn = document.querySelector('.nav-signup-btn');
    const appView = document.getElementById('appView');

    // Hide signup button on landing page if authenticated
    if (signupBtn) {
        signupBtn.style.display = (isUserAuthed) ? 'none' : '';
        if (!isUserAuthed) document.documentElement.classList.remove('hide-signup');
    }

    // Handle Landing Page Nav Profile Dot
    const navActions = document.querySelector('.nav-actions');
    if (isUserAuthed && currentUser) {
        const name = currentUser.user_metadata?.full_name || currentUser.user_metadata?.name || currentUser.email;
        let landingNavAvatar = document.getElementById('landingNavAvatar');

        if (!landingNavAvatar && navActions) {
            landingNavAvatar = document.createElement('div');
            landingNavAvatar.id = 'landingNavAvatar';
            landingNavAvatar.style.cssText = "position:relative; margin-left:12px;";
            // Append after CTA button
            navActions.appendChild(landingNavAvatar);

            // Add document click listener to close landing menu if clicking outside
            if (!window._landingProfileMenuListenerAdded) {
                document.addEventListener('click', (e) => {
                    const menu = document.getElementById('landingProfileMenu');
                    const widgetEl = document.getElementById('landingNavAvatar');
                    if (menu && menu.classList.contains('show') && widgetEl && !widgetEl.contains(e.target)) {
                        menu.classList.remove('show');
                    }
                });
                window._landingProfileMenuListenerAdded = true;
            }
        }
        if (landingNavAvatar) {
            landingNavAvatar.innerHTML = `
                <div class="landing-avatar-container" style="position: relative; display: inline-block;">
                    <div class="hover-email-trigger" style="width:34px;height:34px;border-radius:50%;background:var(--red);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:14px;cursor:pointer;border: 1px solid var(--border);">
                        ${name.charAt(0).toUpperCase()}
                    </div>

                    <!-- Email Only Tooltip -->
                    <div class="email-only-tooltip" style="position: absolute; bottom: auto; top: calc(100% + 12px); right: 0; left: auto; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 10px 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); white-space: nowrap; font-size: 13px; color: var(--text); font-weight: 500; opacity: 0; visibility: hidden; transition: all 0.2s ease; z-index: 100;">
                        ${currentUser.email}
                    </div>
                </div>
            `;

            const trigger = landingNavAvatar.querySelector('.hover-email-trigger');
            const tooltip = landingNavAvatar.querySelector('.email-only-tooltip');

            if (trigger && tooltip) {
                // Show on hover
                trigger.addEventListener('mouseenter', () => {
                    tooltip.style.opacity = '1';
                    tooltip.style.visibility = 'visible';
                });
                trigger.addEventListener('mouseleave', () => {
                    tooltip.style.opacity = '0';
                    tooltip.style.visibility = 'hidden';
                });

                // Toggle on click just in case
                trigger.addEventListener('click', () => {
                    const isShowing = tooltip.style.opacity === '1';
                    tooltip.style.opacity = isShowing ? '0' : '1';
                    tooltip.style.visibility = isShowing ? 'hidden' : 'visible';
                });
            }
        }
    } else {
        const landingNavAvatar = document.getElementById('landingNavAvatar');
        if (landingNavAvatar) landingNavAvatar.remove();
    }

    if (isUserAuthed && currentUser && appView) {
        // Build bottom-left profile widget for appView
        let widget = document.getElementById('userProfileWidget');
        if (!widget) {
            widget = document.createElement('div');
            widget.id = 'userProfileWidget';
            widget.className = 'app-bottom-left';
            appView.appendChild(widget);
        }

        const name = currentUser.user_metadata?.full_name || currentUser.user_metadata?.name || currentUser.email;

        const currentTier = currentUserPlan?.plan_tier || 'free';
        const tierName = currentTier === 'plus' ? 'Plus Tier' : currentTier === 'pro' ? 'Pro Tier' : 'Free Tier';
        const limitInfo = PLAN_LIMITS[currentTier] || PLAN_LIMITS['free'];
        const scansUsed = currentUserPlan?.scans_used || 0;
        const scansLimit = limitInfo.scansPerMonth;
        const scansPct = Math.min((scansUsed / scansLimit) * 100, 100);

        widget.innerHTML = `
            <div class="user-profile-menu" id="userProfileMenu">
                <div class="up-menu-header">
                    <span class="up-menu-name">Account Settings</span>
                    <span class="up-menu-email">${currentUser.email}</span>
                </div>
                
                <div class="up-menu-credits">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px;">
                        <span style="font-size:12px; font-weight:700; color:var(--text);">${tierName}</span>
                        <button onclick="window.showPricingModal(); return false;" style="background:none; border:none; color:var(--red); font-size:10px; font-weight:800; padding:0; cursor:pointer; text-transform:uppercase; letter-spacing:0.5px;">Change</button>
                    </div>
                    
                    <div style="background:rgba(0,0,0,0.03); border-radius:12px; padding:12px; margin-bottom:12px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 6px;">
                            <span style="font-size:11px; color:var(--muted); font-weight:600;">Scan Usage</span>
                            <span style="font-size:11px; color:var(--muted); font-weight:600;"><span style="color:var(--text); font-weight:700;">${scansUsed}</span> / ${scansLimit}</span>
                        </div>
                        <div style="width:100%; height:6px; background:rgba(0,0,0,0.05); border-radius:4px; overflow:hidden;">
                            <div style="width:${scansPct}%; height:100%; background:var(--red); border-radius:4px;"></div>
                        </div>
                    </div>
                    <a href="#" class="up-menu-upgrade-text" onclick="window.showPricingModal(); return false;" style="font-size:11px; color:var(--muted); text-decoration:none; font-weight:500; display:block; text-align:center;">View plan benefits &rarr;</a>
                </div>

                <div class="up-menu-divider"></div>
                <a href="#" class="up-menu-item"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>Profile Settings</a>
                <a href="#" class="up-menu-item" onclick="window.showPricingModal(); return false;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>Pricing</a>
                <div class="up-menu-divider"></div>
                <a href="#" class="up-menu-item sign-out" onclick="window.handleSignOut(); return false;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>Sign out</a>
            </div>
            <div class="user-profile-button" onclick="window.toggleProfileMenu(event)">
                <div style="width:28px;height:28px;border-radius:50%;background:var(--red);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:12px;">${name.charAt(0).toUpperCase()}</div>
                <span class="user-profile-name-btn">${name}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--muted); margin-left: auto;"><path d="M18 15l-6-6-6 6"/></svg>
            </div>
        `;

        // Add document click listener to close menu if clicking outside
        if (!window._profileMenuListenerAdded) {
            document.addEventListener('click', (e) => {
                const menu = document.getElementById('userProfileMenu');
                const widgetEl = document.getElementById('userProfileWidget');
                if (menu && menu.classList.contains('show') && widgetEl && !widgetEl.contains(e.target)) {
                    menu.classList.remove('show');
                }
            });
            window._profileMenuListenerAdded = true;

            window.toggleProfileMenu = function (e) {
                const menu = document.getElementById('userProfileMenu');
                if (menu) menu.classList.toggle('show');
            };
        }

        window.showPricingModal = function (isLimitTriggered = false) {
            const menu = document.getElementById('userProfileMenu');
            if (menu) menu.classList.remove('show');

            const overlay = document.createElement('div');
            overlay.className = 'quick-tour-overlay';
            overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(3,3,3,0.85);backdrop-filter:blur(10px);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;';

            const activeTier = (currentUserPlan?.plan_tier || 'free').toLowerCase();
            const scansUsedModal = currentUserPlan?.scans_used || 0;
            const tierOrder = ['free', 'starter', 'pro', 'plus'];

            const plans = window.PRICING_DATA || [];
            const currentPlanLimits = window.PLAN_LIMITS || {};
            const limit = currentPlanLimits[activeTier]?.scansPerMonth || 1;

            overlay.innerHTML = `
                <div style="font-family:'Inter', sans-serif; max-width:950px; width:98%; text-align:left; padding:28px; position:relative; border-radius:32px; background:#ffffff; border:1px solid rgba(0,0,0,0.06); box-shadow: 0 40px 100px rgba(0,0,0,0.2); animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1);">
                    <!-- Close -->
                    <button onclick="this.parentElement.parentElement.remove()" style="position:absolute;top:24px;right:24px;background:rgba(0,0,0,0.04); border:none; color:#64748b; cursor:pointer; width:36px; height:36px; border-radius:50%; font-size:18px; display:flex; align-items:center; justify-content:center; transition:all 0.2s;" onmouseover="this.style.background='rgba(0,0,0,0.1)'" onmouseout="this.style.background='rgba(0,0,0,0.04)'">✕</button>

                    <div style="text-align:center; margin-bottom:28px;">
                        ${isLimitTriggered ? `
                            <div style="display:inline-flex;align-items:center;gap:6px;background:#fef9ee;border:1px solid #fde68a;border-radius:100px;padding:5px 14px;font-size:10px;font-weight:800;color:#d97706;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:12px;">🏆 Trial Mission Complete</div>
                            <h2 style="font-size:26px; font-weight:900; color:#0f172a; margin:0 0 6px; letter-spacing:-0.03em;">You've hit the scan limit</h2>
                            <p style="font-size:14.5px; color:#64748b; margin:0; font-weight:500;">Usage: ${scansUsedModal} / ${limit} scans used. Upgrade to continue.</p>
                        ` : `
                            <h2 style="font-size:26px; font-weight:900; color:#0f172a; margin:0 0 6px; letter-spacing:-0.03em;">Upgrade your coverage</h2>
                            <p style="font-size:14.5px; color:#64748b; margin:0; font-weight:500;">Choose a plan that fits your launch pace. Cancel anytime.</p>
                        `}
                    </div>

                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:16px;">
                        ${plans.map((plan, idx) => {
                const planTier = plan.tier.toLowerCase();
                const isCurrent = planTier === activeTier;
                const pct = Math.round((plan.checks / plan.totalChecks) * 100);

                return `
                            <div style="
                                border: ${plan.featured ? '2px' : '1px'} solid ${plan.featured ? plan.accentColor : 'rgba(0,0,0,0.08)'};
                                border-radius: 20px; padding: 24px; 
                                background: ${plan.gradient};
                                display: flex; flex-direction: column; gap: 16px;
                                position: relative;
                                transition: transform 0.3s cubic-bezier(0.23, 1, 0.32, 1);
                                box-shadow: ${plan.featured ? `0 20px 48px ${plan.accentGlow}` : '0 4px 20px rgba(0,0,0,0.04)'};
                            ">
                                ${plan.popular ? `<div style="position:absolute; top:-12px; left:50%; transform:translateX(-50%); background:${plan.accentColor}; color:#fff; font-size:10px; font-weight:800; padding:4px 14px; border-radius:100px; text-transform:uppercase; letter-spacing:0.05em; z-index:10; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">${plan.popular}</div>` : ''}

                                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                                    <div>
                                        <div style="font-size:13px; font-weight:800; text-transform:uppercase; letter-spacing:0.08em; color:${plan.accentColor};">${plan.tier}</div>
                                        <div style="font-size:11px; color:#94a3b8; font-weight:500;">${plan.subPeriod || ''}</div>
                                    </div>
                                    <div style="display:flex; align-items:baseline; gap:1px; text-align:right;">
                                        <span style="font-size:32px; font-weight:900; color:#0f172a; line-height:1;">${plan.price}</span>
                                        <span style="font-size:12px; color:#94a3b8; font-weight:500;">${plan.period}</span>
                                    </div>
                                </div>

                                <p style="font-size:13.5px; color:#64748b; line-height:1.55; margin:0;">${plan.desc}</p>
                                
                                <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:8px; text-align:center;">
                                    ${[{ l: 'Checks', v: plan.checks }, { l: 'Scans', v: plan.scans }, { l: 'Limit', v: plan.codeLimit }].map(item => `
                                        <div style="background:rgba(255,255,255,0.7); border:1px solid rgba(0,0,0,0.06); border-radius:12px; padding:10px 4px;">
                                            <div style="font-size:15px; font-weight:800; color:#1e293b;">${item.v}</div>
                                            <div style="font-size:9px; color:#94a3b8; text-transform:uppercase; letter-spacing:0.05em; margin-top:2px;">${item.l}</div>
                                        </div>
                                    `).join('')}
                                </div>

                                <div style="display:flex; align-items:center; gap:10px;">
                                    <span style="border-radius:20px; padding:3px 12px; font-size:11px; font-weight:700; background:rgba(255,255,255,0.8); border:1.5px solid ${plan.accentColor}; color:${plan.accentColor};">${pct}% coverage</span>
                                    <div style="flex:1; height:5px; background:rgba(0,0,0,0.06); border-radius:10px; overflow:hidden;">
                                        <div style="height:100%; width:${pct}%; background:${plan.accentColor}; border-radius:10px; transition:width 1s ease;"></div>
                                    </div>
                                </div>

                                <ul style="list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:8px;">
                                    ${plan.highlights.map(h => `
                                        <li style="display:flex; align-items:flex-start; gap:9px; font-size:12.5px; color:#475569; line-height:1.45;">
                                            <span style="flex-shrink:0; margin-top:2px; width:14px; height:14px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:8px; color:#fff; background:${plan.accentColor};">✓</span>
                                            ${h}
                                        </li>
                                    `).join('')}
                                </ul>

                                <button 
                                    onclick="${isCurrent ? '' : `window.switchPlanForTesting('${plan.tier}', this)`}"

                                    ${isCurrent ? 'disabled' : ''}
                                    style="
                                        margin-top:auto; width:100%; padding:14px; border-radius:14px; font-size:14px; font-weight:700; cursor:${isCurrent ? 'default' : 'pointer'};
                                        ${isCurrent ? 'background:rgba(0,0,0,0.06); color:#94a3b8;' : `background:${plan.featured ? plan.accentColor : '#fff'}; color:${plan.featured ? '#fff' : plan.accentColor}; border:${plan.featured ? 'none' : `1.5px solid ${plan.accentColor}`};`}
                                        transition: all 0.2s;
                                    ">
                                    ${isCurrent ? 'Current Plan' : (plan.buttonText || `Get ${plan.tier} →`)}
                                </button>
                            </div>`;
            }).join('')}
                    </div>

                    <p style="text-align:center; font-size:13px; color:#94a3b8; margin-top:32px; font-weight:500;">
                        Full AI remediation included in all paid plans
                    </p>
                </div>

                <style>
                    @keyframes slideUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
                </style>
            `;
            document.body.appendChild(overlay);

            overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
        };

        // Also clean up old top-right nav item if it exists
        const oldNavEl = document.getElementById('navUserInfo');
        if (oldNavEl) oldNavEl.remove();

        // Trigger Quick Tour for new users (created within the last 5 mins)
        if (currentUser.created_at) {
            const ageMs = new Date().getTime() - new Date(currentUser.created_at).getTime();
            const tourKey = `tour_seen_${currentUser.id}`;
            if (ageMs < 5 * 60 * 1000 && !localStorage.getItem(tourKey)) {
                localStorage.setItem(tourKey, 'true');
                showQuickTour();
            }
        }
    } else {
        // Not authed: remove bottom-left widget
        const widget = document.getElementById('userProfileWidget');
        if (widget) widget.remove();
        const oldNavEl = document.getElementById('navUserInfo');
        if (oldNavEl) oldNavEl.remove();
    }
}

// ── Quick Tour Feature ──────────────────────── */
function showQuickTour() {
    const overlay = document.createElement('div');
    overlay.className = 'quick-tour-overlay';
    // Removed direct style on overlay to use CSS class
    overlay.innerHTML = `
        <div class="quick-tour-modal" style="background:#ffffff; max-width:440px; width:90%; border-radius:32px; padding:36px; position:relative; box-shadow: 0 40px 80px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05); text-align:center; font-family:'Inter', sans-serif;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                <h3 style="font-size:24px; color:#0f172a; margin:0; font-weight:800; letter-spacing:-0.03em;">Welcome to CodeSafe! 🛡️</h3>
                <button style="background:transparent; border:none; color:#94a3b8; font-size:20px; cursor:pointer; width:32px; height:32px; display:flex; align-items:center; justify-content:center; border-radius:50%; transition:background 0.2s;" onmouseover="this.style.background='rgba(0,0,0,0.05)'" onmouseout="this.style.background='transparent'" onclick="this.parentElement.parentElement.parentElement.remove()">✕</button>
            </div>
            
            <p style="color:#64748b; font-size:15px; margin-bottom:32px; line-height:1.6; margin-top:0; font-weight:500;">Secure your AI-generated code in seconds. Let's get you set up.</p>
            
            <ul style="text-align:left; font-size:14.5px; margin:24px 0; padding-left:0; color:#1e293b; list-style:none; display:flex; flex-direction:column; gap:20px;">
                <li style="display:flex; gap:14px; align-items:flex-start;">
                    <span style="color:#10b981; font-weight:800; background:rgba(16,185,129,0.15); padding:4px; border-radius:50%; display:flex; align-items:center; justify-content:center; width:24px; height:24px; font-size:12px; flex-shrink:0;">✓</span> 
                    <div style="line-height:1.5;"><strong>Choose business type</strong> to calibrate AI severity to your actual risk.</div>
                </li>
                <li style="display:flex; gap:14px; align-items:flex-start;">
                    <span style="color:#10b981; font-weight:800; background:rgba(16,185,129,0.15); padding:4px; border-radius:50%; display:flex; align-items:center; justify-content:center; width:24px; height:24px; font-size:12px; flex-shrink:0;">✓</span> 
                    <div style="line-height:1.5;"><strong>Drop a folder</strong> or paste a GitHub link to instantly scan.</div>
                </li>
            </ul>

            <div style="background:#f8fafc; border:1px solid rgba(0,0,0,0.06); border-radius:24px; padding:24px; margin-top:32px; margin-bottom: 32px; text-align:left;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                    <h4 style="font-size:12px; margin:0; color:#0f172a; font-weight:800; text-transform:uppercase; letter-spacing:0.08em;">Your Plan & Limits</h4>
                    <a href="#" onclick="window.showPricingModal(); return false;" style="color:#6366f1; font-size:11px; font-weight:800; text-decoration:none; text-transform:uppercase; letter-spacing:0.05em; transition:color 0.2s;" onmouseover="this.style.color='#4f46e5'" onmouseout="this.style.color='#6366f1'">All Plans &rarr;</a>
                </div>
                
                <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:20px;">
                    <div style="font-size:18px; font-weight:800; color:#0f172a;">${window.currentUserPlan?.plan_tier === 'pro' ? 'Pro Tier' : window.currentUserPlan?.plan_tier === 'plus' ? 'Plus Tier' : '1-Scan Trial'}</div>
                    <div style="font-size:10px; color:#10b981; font-weight:800; background:rgba(16,185,129,0.15); padding:6px 12px; border-radius:100px; letter-spacing:0.05em;">ACTIVE</div>
                </div>

                <div style="background:#ffffff; border:1px solid rgba(0,0,0,0.05); border-radius:16px; padding:16px; margin-bottom:20px; box-shadow:0 4px 12px rgba(0,0,0,0.02);">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                        <span style="font-size:13px; color:#64748b; font-weight:600;">Scans Used</span>
                        <span style="font-size:14px; color:#0f172a; font-weight:800;">${window.currentUserPlan?.scans_used || 0} / ${PLAN_LIMITS[window.currentUserPlan?.plan_tier || 'free']?.scansPerMonth || 3}</span>
                    </div>
                    <div style="width:100%; height:8px; background:#e2e8f0; border-radius:4px; overflow:hidden;">
                        <div style="width:${Math.min(((window.currentUserPlan?.scans_used || 0) / (PLAN_LIMITS[window.currentUserPlan?.plan_tier || 'free']?.scansPerMonth || 3)) * 100, 100)}%; height:100%; background:${window.currentUserPlan?.plan_tier !== 'free' && window.currentUserPlan?.plan_tier !== undefined ? '#10b981' : '#6366f1'}; border-radius:4px; transition:width 1s cubic-bezier(0.4, 0, 0.2, 1);"></div>
                    </div>
                </div>

                <ul style="list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:12px;">
                    ${(window.PRICING_DATA?.[0]?.highlights || ["50/90 basic security checks", "1-scan trial limit"]).map(feat => `
                        <li style="font-size:13px; color:#475569; display:flex; gap:12px; font-weight:600; line-height:1.4; align-items:flex-start;">
                            <span style="color:#6366f1; font-weight:900; font-size:12px; margin-top:2px;">✓</span> ${feat}
                        </li>
                    `).join('')}
                </ul>
            </div>

            <button style="width:100%; padding:16px 0; font-size:15px; font-weight:800; justify-content:center; border-radius:16px; background:#0f172a; color:#ffffff; box-shadow: 0 10px 25px rgba(15,23,42,0.25); border:none; cursor:pointer; transition: transform 0.2s, box-shadow: 0.2s;" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 12px 30px rgba(15,23,42,0.35)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 10px 25px rgba(15,23,42,0.25)'" onclick="this.parentElement.parentElement.remove()">Continue &rarr;</button>
        </div>
    `;
    document.body.appendChild(overlay);
}

// ── Auth Modal ──────────────────────────────── */
function showAuthModal(mode = 'signup') {
    const modal = document.getElementById('authModal');
    if (modal) {
        currentAuthMode = mode;
        // Clear form fields
        const emailInput = document.querySelector('.auth-form input[type="email"]');
        const pwInput = document.querySelector('.auth-form input[type="password"]');
        if (emailInput) emailInput.value = '';
        if (pwInput) pwInput.value = '';
        updateAuthUI();
        modal.classList.add('show');
    }
}

function hideAuthModal() {
    const modal = document.getElementById('authModal');
    if (modal) modal.classList.remove('show');
}

function updateAuthUI() {
    const title = document.getElementById('authTitle');
    const sub = document.getElementById('authSub');
    const btn = document.getElementById('authSubmitBtn');
    const footer = document.getElementById('authFooter');
    const errEl = document.getElementById('authError');
    if (errEl) errEl.style.display = 'none';

    if (currentAuthMode === 'signin') {
        if (title) title.innerText = "Welcome back";
        if (sub) sub.innerText = "Enter your credentials to access your security dashboard.";
        if (btn) btn.innerText = "Sign in";
        if (footer) footer.innerHTML = `Don't have an account? <a href="#" onclick="event.preventDefault(); window.toggleAuthMode();">Sign Up</a><br/><a href="#" style="display:inline-block; margin-top:8px; font-size:12px;" onclick="event.preventDefault(); window.handleResendEmail();">Resend verification email?</a>`;
    } else {
        if (title) title.innerText = "Create your account";
        if (sub) sub.innerText = "Join 2,000+ developers securing their AI code in seconds.";
        if (btn) btn.innerText = "Create Account";
        if (footer) footer.innerHTML = `Already have an account? <a href="#" onclick="event.preventDefault(); window.toggleAuthMode();">Sign in</a>`;
    }
}

function toggleAuthMode() {
    currentAuthMode = currentAuthMode === 'signup' ? 'signin' : 'signup';
    updateAuthUI();
}

// ── Auth Error Display ──────────────────────── */
function showAuthError(msg, isInfo = false) {
    let errEl = document.getElementById('authError');
    if (!errEl) {
        const form = document.querySelector('.auth-form');
        if (form) {
            errEl = document.createElement('div');
            errEl.id = 'authError';
            errEl.style.cssText = 'color:#e53935;font-size:13px;margin:0 0 12px;text-align:center;line-height:1.4;';
            form.insertBefore(errEl, form.firstChild);
        }
    }
    if (errEl) {
        errEl.style.color = isInfo ? 'var(--text)' : '#e53935';
        if (msg.toLowerCase().includes('email not confirmed')) {
            errEl.innerHTML = `${msg}<br/><a href="#" style="color:var(--red); text-decoration:underline; font-weight:600; cursor:pointer;" onclick="event.preventDefault(); window.handleResendEmail();">Resend verification email?</a>`;
        } else {
            errEl.innerHTML = msg;
        }
        errEl.style.display = 'block';
    }
}

// ── Email/Password Auth ─────────────────────── */
async function handleEmailAuth() {
    const sb = getSupabase();
    if (!sb) {
        showAuthError('Auth service is loading. Please try again.');
        return;
    }
    const emailInput = document.querySelector('.auth-form input[type="email"]');
    const pwInput = document.querySelector('.auth-form input[type="password"]');
    const email = emailInput?.value?.trim();
    const password = pwInput?.value;
    const btn = document.getElementById('authSubmitBtn');

    if (!email || !password) {
        showAuthError('Please enter both email and password.');
        return;
    }
    if (password.length < 6) {
        showAuthError('Password must be at least 6 characters.');
        return;
    }

    const origText = btn?.innerText || (currentAuthMode === 'signup' ? 'Create Account' : 'Sign in');
    if (btn) {
        btn.innerText = '...';
        btn.disabled = true;
        btn.style.opacity = '0.7';
    }

    try {
        let result;
        if (currentAuthMode === 'signup') {
            result = await sb.auth.signUp({ email, password });
        } else {
            result = await sb.auth.signInWithPassword({ email, password });
        }

        if (result.error) {
            let msg = result.error.message;
            if (msg.includes('Email confirmation') || msg.includes('Error sending confirmation email')) {
                msg = "<b>Verification needed.</b><br/>We couldn't send the email automatically, but your account is active. Please try signing in.";
            }
            showAuthError(msg);
            return;
        }

        const { user, session } = result.data;

        if (currentAuthMode === 'signup') {
            if (!session) {
                hideAuthModal();
                showVerificationSentModal(email);
                return;
            }
            showToast('✓ Account created successfully!');
        } else {
            showToast('✓ Welcome back!');
        }

        isUserAuthed = true;
        currentUser = user;
        hideAuthModal();
        updateNavForAuth();
        showApp();
    } catch (err) {
        console.error("Auth error:", err);
        showAuthError("An unexpected error occurred. Please try again.");
    } finally {
        if (btn) {
            btn.innerText = origText;
            btn.disabled = false;
            btn.style.opacity = '1';
        }
    }
}

// ── Trial Exhausted Upgrade Modal ─────────────── */
function showTrialExhaustedModal(scansUsed, limit, tier) {
    if (window.showPricingModal) {
        window.showPricingModal(true);
    } else {
        // Simple fallback if for some reason showPricingModal isn't loaded
        alert(`You've hit the scan limit (${scansUsed}/${limit}). Please upgrade to continue.`);
    }
}

// ── Verification Sent Modal ────────────────────── */
function showVerificationSentModal(email) {
    const overlay = document.createElement('div');
    overlay.className = 'quick-tour-overlay';
    overlay.style.cssText = "position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.35); z-index:99999; display:flex; padding:20px; box-sizing:border-box;";
    overlay.innerHTML = `
        <div class="quick-tour-modal" style="background:#ffffff !important; padding:40px; border-radius:24px; box-shadow:0 32px 64px rgba(0,0,0,0.18); width:100%; max-width:440px; margin:auto; border:1px solid #e5e7eb !important; box-sizing:border-box; text-align:center;">
            <button onclick="this.parentElement.parentElement.remove()" style="position:absolute; top:16px; right:16px; background:#f1f5f9; border:none; width:32px; height:32px; border-radius:50%; cursor:pointer; font-size:14px; display:flex; align-items:center; justify-content:center; color:#64748b; transition:all 0.2s;">&#10005;</button>
            <div style="width:64px; height:64px; background:rgba(239,68,68,0.08); border-radius:50%; display:flex; align-items:center; justify-content:center; margin: 0 auto 24px;">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
                </svg>
            </div>
            
            <h3 style="font-size:24px; color:#0f172a; margin:0 0 12px 0; font-weight:800;">Verify your email</h3>
            <p style="color:#64748b; font-size:15px; margin-bottom:24px; line-height:1.6;">
                We've sent a verification link to <strong style="color:#0f172a;">${email}</strong>.<br/>Please check your inbox (and spam folder) to confirm your account.
            </p>
            
            <button style="width:100%; padding:16px 0; font-size:15px; font-weight:800; background:#ef4444; color:#ffffff; border:none; border-radius:12px; margin-bottom:16px; cursor:pointer; box-shadow: 0 4px 12px rgba(239,68,68,0.25); display:block;" onclick="this.parentElement.parentElement.remove()">Got it!</button>
            <p style="font-size:13px; color:#64748b; margin:0;">
                Didn't get the mail? <a href="#" onclick="event.preventDefault(); window.handleResendEmail('${email}'); this.innerText='Sending...'; setTimeout(()=>this.innerText='Resend', 2000);" style="color:#ef4444; font-weight:600; text-decoration:none;">Resend link</a>
            </p>
        </div>
    `;
    document.body.appendChild(overlay);
}

async function handleResendEmail(passedEmail) {
    const sb = getSupabase();
    if (!sb) return;

    const emailInput = document.querySelector('.auth-modal input[type="email"]');
    const email = passedEmail || (emailInput ? emailInput.value.trim() : "");

    if (!email) {
        showAuthError("Please enter your email address first.");
        return;
    }

    showToast("Sending verification email...");
    const { error } = await sb.auth.resend({
        type: 'signup',
        email: email,
    });

    if (error) {
        showAuthError(error.message);
    } else {
        showToast("✓ Verification email sent!");
        // If no modal open, maybe show the popup again
        showVerificationSentModal(email);
    }
}

// ── Google OAuth ────────────────────────────── */
async function handleGoogleAuth() {
    const sb = getSupabase();
    if (!sb) {
        showAuthError('Auth service is loading. Please try again.');
        return;
    }
    showToast('Connecting to Google...');

    // ✅ If already signed in, sign out first
    // so we don't accidentally link a new Google account
    // to the existing user instead of creating a new session
    if (isUserAuthed) {
        await sb.auth.signOut();
        isUserAuthed = false;
        currentUser = null;
        githubProviderToken = null;
    }

    const { data, error } = await sb.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: window.location.origin,
            queryParams: { prompt: 'select_account consent' }
        }
    });
    if (error) showAuthError(error.message);
}
// ── Sign Out ────────────────────────────────── */
async function handleSignOut() {
    const sb = getSupabase();
    if (!sb) return;

    const { error } = await sb.auth.signOut();
    if (error) {
        showToast('Error signing out: ' + error.message);
        return;
    }

    isUserAuthed = false;
    currentUser = null;
    document.documentElement.classList.remove('hide-signup');
    updateNavForAuth();
    showLanding();
    showToast('✓ Signed out successfully');
}

// ── Scan Button Handler ─────────────────────── */
function handleStartScan() {
    if (isUserAuthed) {
        showApp();
    } else {
        showAuthModal();
    }
}

// Make them global
window.showAuthModal = showAuthModal;
window.hideAuthModal = hideAuthModal;
window.handleStartScan = handleStartScan;
window.handleGoogleAuth = handleGoogleAuth;
window.handleEmailAuth = handleEmailAuth;
window.handleSignOut = handleSignOut;
window.toggleAuthMode = toggleAuthMode;
window.handleResendEmail = handleResendEmail;
window.fetchScanHistory = fetchScanHistory;

// Synchronize global reportData when React loads an old scan
window.addEventListener('codesafe:load_report', (e) => {
    const data = e.detail;
    if (data) {
        reportData = data;
        if (typeof initChat === 'function') initChat(reportData);
    }
});

// ── View routing ────────────────────────────── */
// Helper: toggle nav buttons based on whether reportData exists
function setNavBtnsVisibility(show) {
    const returnBtn = document.getElementById('returnToReportBtn');
    const scanNewBtn = document.getElementById('scanNewProjectBtn');
    if (returnBtn) returnBtn.classList.toggle('btn-nav-hidden', !show);
    if (scanNewBtn) scanNewBtn.classList.toggle('btn-nav-hidden', !show);
    window.dispatchEvent(new CustomEvent('codesafe:nav_btns', { detail: { visible: !!show } }));
}

function showLanding() {
    document.getElementById('landingView').classList.add('active');
    document.getElementById('appView').classList.remove('active');
    document.querySelector('.nav').style.display = '';
    // Reset screens
    const inp = document.getElementById('inputScreen');
    const dash = document.getElementById('dashScreen');
    if (inp) { inp.classList.remove('slide-out'); }
    if (dash) { dash.classList.remove('slide-in'); }
    setNavBtnsVisibility(false);
    window.scrollTo(0, 0);
}

function showApp() {
    document.getElementById('appView').classList.add('active');
    document.getElementById('landingView').classList.remove('active');
    document.querySelector('.nav').style.display = 'none';
    // Show input screen, hide dashboard
    const inp = document.getElementById('inputScreen');
    const dash = document.getElementById('dashScreen');
    if (inp) { inp.classList.remove('slide-out'); }
    if (dash) { dash.classList.remove('slide-in'); }
    setNavBtnsVisibility(!!reportData);
    window.scrollTo(0, 0);
}

function showDashboard() {
    const inp = document.getElementById('inputScreen');
    const dash = document.getElementById('dashScreen');
    if (inp) inp.classList.add('slide-out');
    if (dash) {
        dash.style.zIndex = '3';
        requestAnimationFrame(() => {
            requestAnimationFrame(() => dash.classList.add('slide-in'));
        });
    }
    setNavBtnsVisibility(false);

    // Notify React Dashboard
    window.dispatchEvent(new CustomEvent('codesafe:report', {
        detail: { visible: true, data: reportData }
    }));
}

function backToInput() {
    const inp = document.getElementById('inputScreen');
    const dash = document.getElementById('dashScreen');
    if (inp) inp.classList.remove('slide-out');
    if (dash) {
        dash.classList.remove('slide-in');
        setTimeout(() => { dash.style.zIndex = '1'; }, 500);
    }
    setNavBtnsVisibility(!!reportData);

    // Notify React Dashboard
    window.dispatchEvent(new CustomEvent('codesafe:report', {
        detail: { visible: false }
    }));
}



/* ── DOM Helper ── */
// (Moved to top)


// We avoid top-level caching of variables that React might re-render.
// Instead, we fetch them on demand.

/* ── Business type sync (input screen + sidebar) */
document.addEventListener('click', e => {
    const b = e.target.closest('.inp-biz-btn');
    if (b) {
        document.querySelectorAll('.inp-biz-btn').forEach(x => x.classList.remove('active'));
        document.querySelectorAll('.biz-btn').forEach(x => x.classList.toggle('active', x.dataset.biz === b.dataset.biz));
        b.classList.add('active');
        bizType = b.dataset.biz;
        // Also notify React
        window.dispatchEvent(new CustomEvent('codesafe:biz_type_changed', { detail: bizType }));
    }
});

/* Sidebar re-scan button */
document.addEventListener('click', e => {
    const rescanBtn = e.target.closest('#rescanSideBtn');
    if (rescanBtn) {
        const primaryScan = $('scanBtn');
        if (primaryScan) primaryScan.click();
    }
});

/* ═══ GITHUB OAUTH UI ════════════════════════ */
document.addEventListener('click', async (e) => {
    const loginBtn = e.target.closest('#githubLoginBtn') || e.target.closest('#githubReconnectBtn');
    if (loginBtn) {
        const sb = getSupabase();
        if (!sb) return;
        showErr('Connecting to GitHub...');

        if (isUserAuthed && currentUser) {
            // Check if already linked to THIS user
            const identities = currentUser.identities || [];
            const alreadyLinked = identities.some(id => id.provider === 'github');

            if (alreadyLinked) {
                // If already linked, just use signInWithOAuth to refresh tokens/session
                // linkIdentity often errors if the identity already exists for the same user
                await sb.auth.signInWithOAuth({
                    provider: 'github',
                    options: {
                        scopes: 'repo',
                        redirectTo: window.location.origin + window.location.pathname,
                    }
                });
                return;
            }

            // Not yet linked — link GitHub to existing account
            if (typeof sb.auth.linkIdentity !== 'function') {
                showErr('Your Supabase client version is too old to support linking.');
                return;
            }
            const { error } = await sb.auth.linkIdentity({
                provider: 'github',
                options: {
                    scopes: 'repo',
                    redirectTo: window.location.origin + window.location.pathname,
                }
            });
            if (error) {
                console.error("linkIdentity error:", error);
                const msg = error.message || "Unknown error";
                if (msg.includes('already linked')) {
                    showToast("⚠️ This GitHub account is already connected to another user. Please disconnect it from your other account first.", 5000);
                } else {
                    showToast("GitHub linking failed: " + msg, 5000);
                }
                showErr("GitHub linking failed: " + msg);
            }
        } else {
            // Not signed in — normal GitHub sign in
            const { error } = await sb.auth.signInWithOAuth({
                provider: 'github',
                options: {
                    scopes: 'repo',
                    redirectTo: window.location.origin + window.location.pathname,
                    queryParams: { prompt: 'consent' }
                }
            });
            if (error) {
                console.error("signInWithOAuth error:", error);
                showErr("GitHub sign in failed: " + error.message);
            }
        }
        return;
    }

    const disBtn = e.target.closest('#githubDisconnect');
    if (disBtn) {
        e.preventDefault();
        const sb = getSupabase();
        if (sb) {
            // ✅ Only unlink GitHub identity, don't sign the user out entirely
            const identities = currentUser?.identities || [];
            const githubIdentity = identities.find(i => i.provider === 'github');
            if (githubIdentity) {
                const { error } = await sb.auth.unlinkIdentity(githubIdentity);
                if (!error) {
                    githubProviderToken = null;
                    localStorage.removeItem(`github_token_${currentUser?.id}`);
                    updateGithubUI();
                    showToast('✓ GitHub disconnected');
                } else {
                    showToast('Error disconnecting: ' + error.message);
                }
            } else {
                showToast('No GitHub account connected');
            }
        }
        return;
    }

    const selBtn = e.target.closest('#githubSelectBtn');
    if (selBtn) {
        const select = $('githubRepoSelect');
        const url = select ? select.value : '';
        if (!url) { showToast('Please select a repository first'); return; }
        const gUrl = $('githubUrl');
        if (gUrl) gUrl.value = url;
        fetchGithub();
        return;
    }

    const manBtn = e.target.closest('#toggleGithubManual');
    if (manBtn) {
        e.preventDefault();
        const sWrap = $('githubSelectorWrap');
        const mWrap = $('githubManualWrap');
        if (sWrap) sWrap.style.display = 'none';
        if (mWrap) mWrap.style.display = 'block';
        return;
    }

    const backBtn = e.target.closest('#toggleGithubSelect');
    if (backBtn) {
        e.preventDefault();
        const sWrap = $('githubSelectorWrap');
        const mWrap = $('githubManualWrap');
        if (sWrap) sWrap.style.display = 'block';
        if (mWrap) mWrap.style.display = 'none';
        return;
    }

    const gFetchBtn = e.target.closest('#githubBtn');
    if (gFetchBtn) {
        fetchGithub();
        return;
    }

    // Return to Report & New Project
    if (e.target.closest('#returnToReportBtn')) {
        showDashboard();
        return;
    }
    if (e.target.closest('#scanNewProjectBtn')) {
        backToInput();
        return;
    }
});


/* ─── INPUT TABS ────────────────────────────── */
window.switchTab = function (mode) {
    inputMode = mode;
    const tabFolder = $('tabFolder'), tabGithub = $('tabGithub'), uploadZone = $('uploadZone'), githubWrap = $('githubWrap');
    if (tabFolder) tabFolder.classList.toggle('active', mode === 'folder');
    if (tabGithub) tabGithub.classList.toggle('active', mode === 'github');
    if (uploadZone) uploadZone.style.display = mode === 'folder' ? 'block' : 'none';
    if (githubWrap) githubWrap.style.display = mode === 'github' ? 'block' : 'none';
    if (mode === 'folder') clearFiles();
    if (mode === 'github') updateGithubUI();
}


/* ═══ GITHUB FETCH ═══════════════════════════ */
document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.id === 'githubUrl') fetchGithub();
});


async function fetchGithub() {
    const url = $('githubUrl').value.trim();
    if (!url) { showErr('Please enter a GitHub URL'); return; }
    const m = url.match(/github\.com\/([^/]+)\/([^/\s#?]+)/);
    if (!m) { showErr('Enter a valid GitHub URL: https://github.com/user/repo'); return; }

    const [, owner, repo] = m, cleanRepo = repo.replace(/\.git$/, '');
    showErr('Fetching from GitHub...');
    const scanBtn = $('scanBtn');
    if (scanBtn) scanBtn.disabled = true;

    const headers = {};
    if (githubProviderToken) headers['Authorization'] = `token ${githubProviderToken}`;

    try {
        const tRes = await fetch(`https://api.github.com/repos/${owner}/${cleanRepo}/git/trees/HEAD?recursive=1`, { headers });
        if (!tRes.ok) {
            if (tRes.status === 404) throw new Error("Repo not found or private. Make sure you've connected GitHub.");
            if (tRes.status === 403) throw new Error("GitHub API rate limit exceeded. Try reconnecting your account.");
            throw new Error(`GitHub API Error (${tRes.status})`);
        }
        const tree = await tRes.json();
        let files = (tree.tree || []).filter(f => {
            const ext = f.path.split('.').pop().toLowerCase();
            return f.type === 'blob' && CONFIG.GITHUB_EXTENSIONS.has(ext) &&
                !f.path.split('/').some(p => CONFIG.GITHUB_SKIP_DIRS.has(p)) && (f.size || 0) < 120000;
        });
        files.sort((a, b) => {
            const sa = CONFIG.PRIORITY_KEYWORDS.reduce((acc, kw) => acc + (a.path.toLowerCase().includes(kw) ? 2 : 0), 0);
            const sb = CONFIG.PRIORITY_KEYWORDS.reduce((acc, kw) => acc + (b.path.toLowerCase().includes(kw) ? 2 : 0), 0);
            return sb - sa;
        });

        let code = `Project: ${owner}/${cleanRepo} (GitHub)\nBusiness type: ${bizType}\n`;
        let fetched = 0;
        for (const f of files.slice(0, 40)) {
            if (code.length > 75000) break;
            try {
                const br = await fetch(`https://api.github.com/repos/${owner}/${cleanRepo}/contents/${f.path}`, { headers });
                const bd = await br.json();
                const txt = atob((bd.content || '').replace(/\n/g, ''));
                if (txt.trim()) { code += `\n\n### FILE: ${f.path}\n${txt.slice(0, 4000)}`; fetched++; }
            } catch (e) { }
        }
        hideErr(); codeSnapshot = code; folderName = `${owner}/${cleanRepo}`;
        folderFiles = files; // Ensure folderFiles is populated for accurate stats
        const fName = $('fName'), fSizeEl = $('fSize'), fileRow = $('fileRow'), scanBtn = $('scanBtn');
        if (fName) fName.textContent = `🔗 ${owner}/${cleanRepo}`;
        if (fSizeEl) fSizeEl.textContent = `${fetched} files fetched from GitHub`;
        if (fileRow) fileRow.style.display = 'flex';
        if (scanBtn) {
            scanBtn.disabled = false;
            scanBtn.classList.add('show');
        }
        detectStack(code); showToast(`✓ Fetched ${fetched} files from GitHub`);
    } catch (e) {
        hideErr(); showErr('GitHub fetch failed: ' + e.message);
        const scanBtn = $('scanBtn');
        if (scanBtn) scanBtn.disabled = false;
    }
}


/* ── Sidebar business type sync */
document.addEventListener('click', e => {
    const b = e.target.closest('.biz-btn');
    if (b) {
        document.querySelectorAll('.biz-btn').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        bizType = b.dataset.biz;
        // Sync with primary input screen buttons
        document.querySelectorAll('.inp-biz-btn').forEach(x => x.classList.toggle('active', x.dataset.biz === b.dataset.biz));
        window.dispatchEvent(new CustomEvent('codesafe:biz_type_changed', { detail: bizType }));
    }
});

/* ═══ FILE HANDLING ══════════════════════════ */
async function getFilesFromDirHandle(dirHandle, basePath = '') {
    const files = [];
    for await (const [name, handle] of dirHandle.entries()) {
        const path = basePath ? `${basePath}/${name}` : name;
        if (handle.kind === 'directory') {
            if (!CONFIG.SKIP_DIRECTORIES.has(name)) {
                files.push(...await getFilesFromDirHandle(handle, path));
            }
        } else if (handle.kind === 'file') {
            const ext = name.split('.').pop().toLowerCase();
            if (CONFIG.CODE_EXTENSIONS.has(ext)) {
                const file = await handle.getFile();
                Object.defineProperty(file, '_relPath', { value: path, writable: false });
                files.push(file);
            }
        }
    }
    return files;
}

document.addEventListener('click', async e => {
    const uz = e.target.closest('#uploadZone');
    if (uz) {
        if ('showDirectoryPicker' in window) {
            try {
                const dirHandle = await window.showDirectoryPicker();
                showErr('Scanning folder structure quickly...');
                const files = await getFilesFromDirHandle(dirHandle);
                hideErr();
                handleFiles(files, dirHandle.name || 'Project');
            } catch (err) {
                if (err.name !== 'AbortError') {
                    console.error(err);
                    showErr('Could not read folder. ' + err.message);
                }
            }
        } else {
            const fi = $('fileInput');
            if (fi) fi.click();
        }
    }
});

document.addEventListener('change', e => {
    if (e.target.id === 'fileInput') {
        const files = Array.from(e.target.files);
        if (files.length > 0) {
            handleFiles(files, files[0].webkitRelativePath.split('/')[0] || 'Project');
        }
    }
});

document.addEventListener('dragover', e => {
    const uz = e.target.closest('#uploadZone');
    if (uz) {
        e.preventDefault();
        uz.classList.add('drag');
    }
});

document.addEventListener('dragleave', e => {
    const uz = e.target.closest('#uploadZone');
    if (uz) uz.classList.remove('drag');
});

document.addEventListener('drop', async e => {
    const uz = e.target.closest('#uploadZone');
    if (uz) {
        e.preventDefault();
        uz.classList.remove('drag');
        hideErr();
        const items = Array.from(e.dataTransfer.items || []);
        const dir = items.find(i => i.kind === 'file' && i.webkitGetAsEntry?.()?.isDirectory);
        if (dir) {
            const entry = dir.webkitGetAsEntry();
            showErr('Reading folder...');
            try { const files = await readDir(entry); hideErr(); handleFiles(files, entry.name); }
            catch (err) { showErr('Could not read: ' + err.message); }
        } else {
            const files = Array.from(e.dataTransfer.files);
            if (files.length) handleFiles(files, 'Dropped Files');
            else showErr('Please drop a project folder.');
        }
    }
});

async function readDir(dirEntry, base = '') {
    return new Promise((resolve, reject) => {
        const reader = dirEntry.createReader(), results = [];
        const batch = () => {
            reader.readEntries(async entries => {
                if (!entries.length) { resolve(results); return; }
                for (const entry of entries) {
                    const relPath = base ? `${base}/${entry.name}` : entry.name;
                    if (entry.isDirectory) {
                        if (!CONFIG.SKIP_DIRECTORIES.has(entry.name)) {
                            const sub = await readDir(entry, relPath).catch(() => []);
                            results.push(...sub);
                        }
                    } else {
                        const ext = entry.name.split('.').pop().toLowerCase();
                        if (CONFIG.CODE_EXTENSIONS.has(ext)) {
                            await new Promise(res => {
                                entry.file(f => {
                                    Object.defineProperty(f, '_relPath', { value: relPath, writable: false });
                                    results.push(f); res();
                                }, () => res());
                            });
                        }
                    }
                }
                batch();
            }, reject);
        }; batch();
    });
}

function handleFiles(files, name) {
    const filtered = files.filter(f => {
        const ext = f.name.split('.').pop().toLowerCase();
        const path = f.webkitRelativePath || f._relPath || f.name;
        return CONFIG.CODE_EXTENSIONS.has(ext) && !path.split('/').some(p => CONFIG.SKIP_DIRECTORIES.has(p));
    });
    if (!filtered.length) { showErr("No code files found. Select your project folder (not node_modules)."); return; }

    // ── Plan-based file size limit ──────────────────
    const tier = currentUserPlan?.plan_tier || 'free';
    const planLimit = PLAN_LIMITS[tier] || PLAN_LIMITS['free'];
    const maxMB = planLimit.maxCodeMB;
    const totalBytes = filtered.reduce((sum, f) => sum + (f.size || 0), 0);
    const totalMB = totalBytes / (1024 * 1024);

    if (totalMB > maxMB) {
        const tierLabel = tier === 'plus' ? 'Plus' : tier === 'pro' ? 'Pro' : 'Free';
        showErr(`⚠️ Project size ${totalMB.toFixed(1)}MB exceeds your ${tierLabel} plan limit of ${maxMB}MB. Please upgrade or select fewer files.`);
        setTimeout(() => { if (window.showPricingModal) window.showPricingModal(); }, 1800);
        return;
    }

    folderFiles = filtered; folderName = name;
    const fName = $('fName'), fSizeEl = $('fSize'), fileRow = $('fileRow'), uploadZone = $('uploadZone'), scanBtn = $('scanBtn');
    if (fName) fName.textContent = `📁 ${name}`;
    if (fSizeEl) fSizeEl.textContent = `${filtered.length} files · ${totalMB < 1 ? (totalBytes / 1024).toFixed(0) + 'KB' : totalMB.toFixed(1) + 'MB'}`;
    if (fileRow) fileRow.style.display = 'flex';
    if (uploadZone) uploadZone.style.display = 'none';
    if (scanBtn) {
        scanBtn.disabled = false;
        scanBtn.classList.add('show');
    }
    hideErr();

    // ── Large-file-count performance warning ─────────────────────────────────
    // When the user uploads many files, the 6-agent pipeline takes noticeably
    // longer (more tokens per agent, more LLM calls). Show a friendly heads-up.
    const existingWarn = document.getElementById('largeFileCountWarn');
    if (existingWarn) existingWarn.remove();

    if (filtered.length >= 30) {
        const estMin = filtered.length >= 100 ? '6–10' :
            filtered.length >= 60 ? '4–6' :
                filtered.length >= 30 ? '2–4' : null;

        const warn = document.createElement('div');
        warn.id = 'largeFileCountWarn';
        warn.style.cssText = [
            'display:flex', 'align-items:flex-start', 'gap:10px',
            'background:linear-gradient(135deg,rgba(245,158,11,0.08),rgba(251,191,36,0.05))',
            'border:1px solid rgba(245,158,11,0.3)', 'border-radius:12px',
            'padding:12px 14px', 'margin-top:10px',
            'font-family:Inter,sans-serif', 'font-size:12.5px', 'line-height:1.5',
            'color:#92400e', 'animation:fadeIn 0.35s ease',
            'max-width:100%', 'box-sizing:border-box'
        ].join(';');

        warn.innerHTML = `
            <span style="font-size:18px;flex-shrink:0;margin-top:1px;">⏱️</span>
            <div>
                <strong style="display:block;font-size:13px;color:#78350f;margin-bottom:3px;">
                    Large project detected — ${filtered.length} files
                </strong>
                Scans with many files take longer because each of the 6 AI agents
                processes its file batch sequentially to avoid rate limits.
                <br/>
                <span style="font-weight:700;color:#d97706;">
                    Estimated scan time: ~${estMin} minutes.
                </span>
                The dashboard will stream findings live as each agent completes.
            </div>
            <button onclick="document.getElementById('largeFileCountWarn').remove()"
                style="background:none;border:none;cursor:pointer;color:#d97706;
                       font-size:16px;flex-shrink:0;margin-left:auto;padding:0;
                       line-height:1;opacity:0.7;" title="Dismiss">✕</button>
        `;

        // Insert after the file row (fSize display)
        const insertTarget = fSizeEl?.closest('.file-row, #fileRow') || fSizeEl?.parentElement;
        if (insertTarget && insertTarget.parentNode) {
            insertTarget.parentNode.insertBefore(warn, insertTarget.nextSibling);
        } else {
            // Fallback: append to upload zone parent
            const uz = $('uploadZone');
            if (uz && uz.parentNode) uz.parentNode.appendChild(warn);
        }
    }

    readSampleForStack(filtered);
    checkScanTypeWarning(filtered);
}

// ── Scan-type mismatch warning ─────────────────────────────────
// Runs after file selection. Compares file paths to selected biz type

const MOBILE_SIGNAL_EXTS = new Set(['.dart', '.swift', '.kt', '.kts', '.m', '.mm', '.gradle', '.plist', '.pbxproj', '.xcconfig']);
const MOBILE_SIGNAL_FILES = new Set(['app.json', 'eas.json', 'podfile', 'androidmanifest.xml']);

const WEB_SIGNAL_EXTS = new Set(['.html', '.htm', '.css', '.scss', '.sass', '.vue', '.svelte', '.astro']);
const WEB_SIGNAL_FILES = new Set(['next.config.js', 'next.config.ts', 'next.config.mjs', 'vite.config.js', 'vite.config.ts', 'vite.config.mjs', 'nuxt.config.js', 'nuxt.config.ts', 'svelte.config.js', 'remix.config.js', 'gatsby-config.js', 'webpack.config.js']);

let currentMismatchError = null;

function checkScanTypeWarning(files) {
    const warn = document.getElementById('scanTypeWarn');
    const msgEl = document.getElementById('scanTypeWarnMsg');
    const titleEl = document.getElementById('scanTypeWarnTitle');
    const switchBtn = document.getElementById('scanTypeWarnSwitch');
    currentMismatchError = null;

    if (!warn || !files || files.length === 0) return null;

    let mobileCount = 0, webCount = 0;

    files.forEach(f => {
        const path = (f.webkitRelativePath || f._relPath || f.name).toLowerCase();
        const ext = path.slice(path.lastIndexOf('.'));
        const name = path.split('/').pop();

        if (MOBILE_SIGNAL_EXTS.has(ext) || MOBILE_SIGNAL_FILES.has(name)) mobileCount++;
        if (WEB_SIGNAL_EXTS.has(ext) || WEB_SIGNAL_FILES.has(name)) webCount++;
    });

    const currentBiz = bizType;

    let showIt = false, title = '', msg = '', switchLabel = '', switchTarget = '';

    if (currentBiz === 'mobile' && webCount > 0 && mobileCount === 0) {
        showIt = true;
        title = '\uD83D\uDDA5\uFE0F Looks like a web project';
        msg = `Found ${webCount} web-specific files (HTML/CSS, Next.js, Vite, etc.) but no mobile files. Did you mean Web App? Scanning with the incorrect project type will affect your security results.`;
        switchLabel = 'Switch to Web App \u2192';
        switchTarget = 'saas';
        currentMismatchError = "These look like web files, but you selected Mobile App. Please switch the scan type or upload a mobile project.";
    } else if ((currentBiz === 'saas' || currentBiz === 'api' || currentBiz === 'ecommerce' || currentBiz === 'fintech') && mobileCount > 0 && webCount === 0) {
        showIt = true;
        title = '\uD83D\uDCF1 Looks like a mobile project';
        msg = `Found ${mobileCount} mobile-specific files (.dart/.swift/build.gradle etc.) but no web files. Did you mean Mobile App? Scanning with the incorrect project type will affect your security results.`;
        switchLabel = 'Switch to Mobile App \u2192';
        switchTarget = 'mobile';
        currentMismatchError = "These look like mobile files, but you selected a Web/API App. Please switch the scan type or upload a web project.";
    }

    if (showIt) {
        if (titleEl) titleEl.textContent = title;
        if (msgEl) msgEl.textContent = msg;
        if (switchBtn) {
            switchBtn.textContent = switchLabel;
            const fresh = switchBtn.cloneNode(true);
            switchBtn.parentNode.replaceChild(fresh, switchBtn);
            fresh.addEventListener('click', () => {
                const btn = document.querySelector(`.biz-btn[data-biz="${switchTarget}"], .inp-biz-btn[data-biz="${switchTarget}"]`);
                if (btn) btn.click();
                warn.style.display = 'none';
                currentMismatchError = null;
            });
        }
        warn.style.animation = 'none';
        warn.style.display = 'flex';
        requestAnimationFrame(() => { warn.style.animation = ''; });
    } else {
        warn.style.display = 'none';
    }
    return currentMismatchError;
}

window.addEventListener('codesafe:biz_type_changed', () => {
    if (folderFiles && folderFiles.length > 0) checkScanTypeWarning(folderFiles);
});


function clearFiles() {
    folderFiles = []; folderName = ''; codeSnapshot = '';
    const fileInput = $('fileInput'), fileRow = $('fileRow'), uploadZone = $('uploadZone'), scanBtn = $('scanBtn'), stackBar = $('stackBar'), stackBadges = $('stackBadges');
    if (fileInput) fileInput.value = '';
    if (fileRow) fileRow.style.display = 'none';
    const warnEl = document.getElementById('scanTypeWarn');
    if (warnEl) warnEl.style.display = 'none';
    // Also remove the large-file-count performance warning if present
    const largeWarn = document.getElementById('largeFileCountWarn');
    if (largeWarn) largeWarn.remove();
    if (uploadZone) uploadZone.style.display = 'block';
    if (scanBtn) {
        scanBtn.disabled = true;
        scanBtn.classList.remove('show');
    }
    if (stackBar) stackBar.classList.remove('show');
    if (stackBadges) stackBadges.innerHTML = '';
    detectedStack = [];
}

window.clearProjectData = function () {
    clearFiles();
    reportData = null;
    prevReport = null;
    setNavBtnsVisibility(false);
};

window.askAboutReport = function (data, focusVuln = null) {
    if (data) {
        // If it's a new report, or chat hasn't been initialized, or we are focusing a specific vuln
        if (reportData !== data || chatHistory.length === 0 || focusVuln) {
            console.log('[AI Assistant] Syncing chat context' + (focusVuln ? ' with focus on ' + focusVuln.title : '') + '...');
            reportData = data;
            initChat(reportData, focusVuln);
        }
    }

    console.log('[AI Assistant] Showing chat widget...');
    const widget = $('chatWidget'), overlay = $('chatOverlay');
    if (widget) widget.classList.add('show');
    if (overlay) overlay.classList.add('show');
};

document.addEventListener('click', e => {
    if (e.target.id === 'rmBtn' || e.target.closest('#rmBtn')) clearFiles();
    if (e.target.id === 'resetBtn' || e.target.closest('#resetBtn')) {
        clearFiles();
        const resSec = $('resSec'), loadSec = $('loadSec'), fixPanel = $('fixPanel'), chatMsgs = $('chatMsgs'), vibePanel = $('vibePanel'), scoreCard = $('scoreCard');
        if (resSec) resSec.classList.remove('show');
        if (loadSec) loadSec.classList.remove('show');
        if (fixPanel) fixPanel.classList.remove('show');
        reportData = null; chatHistory = [];
        if (chatMsgs) chatMsgs.innerHTML = '';
        if (vibePanel) vibePanel.style.display = 'none';
        if (scoreCard) scoreCard.style.display = 'none';
        backToInput();
    }
    if (e.target.id === 'askReportBtn' || e.target.closest('#askReportBtn')) window.askAboutReport();
    if (e.target.id === 'closeChatBtn' || e.target.closest('#closeChatBtn') || e.target.id === 'chatOverlay') {
        const cw = $('chatWidget'), co = $('chatOverlay');
        if (cw) cw.classList.remove('show');
        if (co) co.classList.remove('show');
    }
});


function showErr(m) {
    const el = $('errBox');
    if (el) { el.textContent = m; el.classList.add('show'); }
}
function hideErr() {
    const el = $('errBox');
    if (el) el.classList.remove('show');
}

/* ═══ STACK DETECTION ════════════════════════ */
async function readSampleForStack(files) {
    let sample = '';
    for (const f of files.slice(0, 15)) {
        try {
            const t = await readText(f);
            const p = f.webkitRelativePath || f._relPath || f.name;
            sample += `${p}\n${t.slice(0, 400)}\n`;
        } catch (e) { }
    }
    detectStack(sample);
}

function detectStack(code) {
    const lower = code.toLowerCase();
    const found = CONFIG.STACKS.filter(s => s.sigs.some(sig => lower.includes(sig.toLowerCase())));
    detectedStack = found;
    const stackBar = $('stackBar'), stackBadges = $('stackBadges');
    if (!found.length) { if (stackBar) stackBar.classList.remove('show'); return; }
    if (stackBadges) stackBadges.innerHTML = found.map(s => `<span class="stack-badge ${s.key}">${s.icon} ${s.label}</span>`).join('');
    if (stackBar) stackBar.classList.add('show');
}

/* ═══ READ CODE ══════════════════════════════ */
async function readText(file) {
    return new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = e => res(e.target.result);
        r.onerror = () => rej(new Error('Failed: ' + file.name));
        r.readAsText(file);
    });
}

async function buildCodeString() {
    if (codeSnapshot && inputMode === 'github') return codeSnapshot;
    const scored = folderFiles.map(f => {
        const lower = (f.webkitRelativePath || f._relPath || f.name).toLowerCase();
        return { f, s: CONFIG.PRIORITY_KEYWORDS.reduce((a, kw) => a + (lower.includes(kw) ? 2 : 0), 0) };
    });
    scored.sort((a, b) => b.s - a.s);
    let out = `Project: ${folderName}\nBusiness type: ${bizType}\nStack: ${detectedStack.map(s => s.label).join(', ') || 'unknown'}\nFiles: ${scored.length}\n`;
    for (const { f } of scored.slice(0, CONFIG.SCAN_MAX_FILES)) {
        try {
            const txt = await readText(f);
            if (!txt.trim()) continue;
            const path = f.webkitRelativePath || f._relPath || f.name;
            out += `\n\n### FILE: ${path}\n${txt.slice(0, CONFIG.SCAN_FILE_CHAR_LIMIT)}`;
            if (out.length > CONFIG.SCAN_MAX_CHARS) break;
        } catch (e) { }
    }
    if (inputMode === 'github') codeSnapshot = out; // Only cache for Github mode since it doesn't upload actual Files
    return out;
}

/* ═══ LOADING STEPS ══════════════════════════ */
function addStep(text, cls = '') {
    // Notify React Dashboard
    window.dispatchEvent(new CustomEvent('codesafe:report', {
        detail: { scanStep: text }
    }));

    const stepsList = $('stepsList');
    if (!stepsList) return;
    const delay = stepsList.children.length * 0.35;
    const el = document.createElement('div');
    el.className = `step-item ${cls}`; el.style.animationDelay = delay + 's';
    el.innerHTML = `<span>${cls === 'active' ? '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="icon-anim-pulse" style="vertical-align: middle;"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>' : '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="icon-anim-spin" style="vertical-align: middle;"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21v-5h5"/></svg>'}</span>${text}`;
    stepsList.appendChild(el);
}

/* ═══ AI API HELPER ══════════════════════════ */
async function callAI({ messages, systemPrompt = '', maxTokens = CONFIG.SCAN_MAX_TOKENS }) {
    if (CONFIG.ACTIVE_PROVIDER === 'google') {
        const contents = [];
        if (systemPrompt) {
            contents.push({ role: 'user', parts: [{ text: systemPrompt }] });
            contents.push({ role: 'model', parts: [{ text: 'Understood.' }] });
        }
        messages.forEach(m => {
            contents.push({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] });
        });

        const res = await fetch('/api/scan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                provider: 'google',
                endpoint: `models/${CONFIG.GOOGLE_MODEL}:generateContent`,
                payload: {
                    contents,
                    generationConfig: { maxOutputTokens: maxTokens, temperature: 0.2 }
                }
            })
        });
        if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `API ${res.status}`); }
        const data = await res.json();

        // Track usage
        if (typeof UsageTracker !== 'undefined' && data.usageMetadata) {
            UsageTracker.track('google', CONFIG.GOOGLE_MODEL, data.usageMetadata.promptTokenCount, data.usageMetadata.candidatesTokenCount);
        }

        return data.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
    } else {
        const body = { model: CONFIG.ANTHROPIC_MODEL, max_tokens: maxTokens, messages };
        if (systemPrompt) body.system = systemPrompt;

        const res = await fetch('/api/scan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                provider: 'anthropic',
                payload: body
            })
        });
        if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `API ${res.status}`); }
        const data = await res.json();

        // Track usage
        if (typeof UsageTracker !== 'undefined' && data.usage) {
            UsageTracker.track('anthropic', CONFIG.ANTHROPIC_MODEL, data.usage.input_tokens, data.usage.output_tokens);
        }

        return data.content.filter(b => b.type === 'text').map(b => b.text).join('');
    }
}

/* ═══ SCAN ═══════════════════════════════════ */
window.performCodeSafeScan = async () => {
    const scanBtn = $('scanBtn');
    if (!folderFiles.length && !codeSnapshot) return;

    if (currentMismatchError) {
        showErr(currentMismatchError);
        return;
    }

    // Check limits
    if (isUserAuthed && currentUserPlan) {
        const tier = currentUserPlan.plan_tier || 'free';
        const limit = PLAN_LIMITS[tier]?.scansPerMonth || 3;
        if (currentUserPlan.scans_used >= limit) {
            showTrialExhaustedModal(currentUserPlan.scans_used, limit, tier);
            return;
        }
    }

    hideErr(); scanBtn.disabled = true;
    // Animate into dashboard
    showDashboard();
    // Notify React Dashboard — clear previous report data so old score doesn't bleed through
    window.dispatchEvent(new CustomEvent('codesafe:report', {
        detail: { scanning: true, visible: true, clearData: true }
    }));

    const eds = $('emptyDashState'); if (eds) eds.style.display = 'none';
    const loadSec = $('loadSec'), resSec = $('resSec'), fixPanel = $('fixPanel'), stepsList = $('stepsList');
    if (loadSec) loadSec.classList.add('show');
    if (resSec) resSec.classList.remove('show');
    if (fixPanel) fixPanel.classList.remove('show');
    if (stepsList) stepsList.innerHTML = '';

    let code = '';
    try {
        addStep(inputMode === 'github' ? `Using ${folderName} from GitHub...` : `Reading project files from "${folderName}"...`);
        code = await buildCodeString();
        addStep(`Analyzing ${folderFiles.length} files with AI...`, 'active');

        // Parallel progress hints
        setTimeout(() => addStep('Running vibe-coding checks (Supabase RLS, frontend secrets)...'), 500);
        setTimeout(() => addStep('Scanning supply chain, SSRF, and injection risks...'), 1200);
        setTimeout(() => addStep('Checking for prompt injection and error handler leaks...'), 2000);
        setTimeout(() => addStep('Generating your plain English report...', 'active'), 2800);
    } catch (e) {
        // Notify React Dashboard
        window.dispatchEvent(new CustomEvent('codesafe:report', {
            detail: { scanning: false }
        }));
        if (loadSec) loadSec.classList.remove('show');
        if (scanBtn) scanBtn.disabled = false;
        console.error(e);
        showErr('Could not read code: ' + e.message); return;
    }

    try {
        // ── Use tool-use architecture (same format for Gemini & Claude) ──
        const isGemini = CONFIG.ACTIVE_PROVIDER === 'google';
        const apiKey = isGemini ? CONFIG.GOOGLE_API_KEY : CONFIG.ANTHROPIC_API_KEY;
        const model = isGemini ? CONFIG.GOOGLE_MODEL : CONFIG.ANTHROPIC_MODEL;

        // TOOLS.runScan handles tool definitions + API call for both providers
        const scanTier = currentUserPlan?.plan_tier || 'free';
        const result = await TOOLS.runScan(apiKey, model, bizType, detectedStack, code, scanTier);

        // Parse structured tool calls → vulnerability list
        const vulnerabilities = TOOLS.parseToolResults(result);

        // Deterministic score, verdict, counts (never trust AI for these)
        const score = TOOLS.calcScore(vulnerabilities);
        const verdict = TOOLS.scoreToVerdict(score);
        const counts = TOOLS.calcCounts(vulnerabilities);

        // Build vibe checks pass/fail/skip using PROMPTS helper
        const toolsAvailable = TOOLS.buildScanTools(detectedStack, code, scanTier).map(t => t.name);
        const toolsUsed = vulnerabilities.map(v => {
            // Reverse-map vibe_category back to tool name
            for (const [toolName, vibeKey] of Object.entries(PROMPTS.TOOL_TO_VIBE_KEY)) {
                if (vibeKey === v.vibe_category || TOOLS._toolNameToCategory(toolName) === v.vibe_category) {
                    return toolName;
                }
            }
            return null;
        }).filter(Boolean);
        const vibe_checks = PROMPTS.buildVibeChecks(toolsUsed, toolsAvailable);

        // Build summary
        const summaryParts = [];
        if (counts.critical > 0) summaryParts.push(`${counts.critical} critical issue${counts.critical > 1 ? 's' : ''}`);
        if (counts.high > 0) summaryParts.push(`${counts.high} high-severity issue${counts.high > 1 ? 's' : ''}`);
        if (counts.medium > 0) summaryParts.push(`${counts.medium} medium issue${counts.medium > 1 ? 's' : ''}`);
        const summary = vulnerabilities.length === 0
            ? 'No security vulnerabilities were found. Your code looks secure and ready to deploy.'
            : `Found ${summaryParts.join(', ')}. ${verdict === 'do_not_deploy' ? 'Fix critical issues before deploying.' : verdict === 'deploy_with_caution' ? 'Address high-priority issues soon.' : 'Minor improvements recommended.'}`;

        // Assemble reportData in the format renderResults() expects
        prevReport = reportData;
        reportData = { verdict, score, summary, counts, vibe_checks, vulnerabilities };

        const loadSec = $('loadSec');
        if (loadSec) loadSec.classList.remove('show');
        renderResults(reportData);

        // Notify React Dashboard
        window.dispatchEvent(new CustomEvent('codesafe:report', {
            detail: { scanning: false, scanId: reportData.scanId }
        }));

        initChat(reportData);
        showToast('✓ Scan complete');

        let regression = null;

        // Record scan usage
        if (isUserAuthed && currentUser) {
            const sb = getSupabase();
            if (sb) {
                // Determine approximate code size in KB
                const codeSizeKb = Math.round(code.length / 1024);

                // 1. REGRESSION DETECTION: Fetch last scan for this project
                const { data: lastScans } = await sb.from('scan_history')
                    .select('score, report_data, created_at')
                    .eq('user_id', currentUser.id)
                    .eq('project_name', folderName || 'Unknown')
                    .order('created_at', { ascending: false })
                    .limit(1);

                if (lastScans && lastScans.length > 0) {
                    const prev = lastScans[0];
                    const prevVulns = prev.report_data?.vulnerabilities || [];
                    const currVulns = vulnerabilities || [];

                    const prevKeys = new Set(prevVulns.map(v => `${v.title || v.name}|${v.file}`));
                    const currKeys = new Set(currVulns.map(v => `${v.title || v.name}|${v.file}`));

                    regression = {
                        prevScore: prev.score,
                        prevDate: prev.created_at,
                        fixed: prevVulns.filter(v => !currKeys.has(`${v.title || v.name}|${v.file}`)).length,
                        newIssues: currVulns.filter(v => !prevKeys.has(`${v.title || v.name}|${v.file}`)).length,
                        persisting: currVulns.filter(v => prevKeys.has(`${v.title || v.name}|${v.file}`)).length
                    };
                }

                // Update reportData with regression for UI
                reportData.regression = regression;

                // Increment scans
                const newUsed = (currentUserPlan?.scans_used || 0) + 1;
                await sb.from('user_plans').update({ scans_used: newUsed }).eq('user_id', currentUser.id);

                // Save history and attach the saved scan ID to the report
                const { data: scanHistoryRow, error: scanHistoryError } = await sb.from('scan_history')
                    .insert({
                        user_id: currentUser.id,
                        plan_tier: currentUserPlan?.plan_tier || 'free',
                        project_name: folderName || 'Unknown',
                        biz_type: bizType,
                        input_mode: inputMode,
                        code_size_kb: codeSizeKb,
                        checks_run: toolsUsed.length,
                        vulns_found: vulnerabilities.length,
                        score: score,
                        scan_duration_s: 0,
                        report_data: { ...reportData, project_name: folderName || 'Unknown' }
                    })
                    .select('id')
                    .single();

                // Attach the scan history row ID to reportData so Knowledge Graph can use it
                if (scanHistoryRow && scanHistoryRow.id) {
                    reportData.scanId = scanHistoryRow.id;
                    console.log('[Scan] Attached scanId to reportData:', scanHistoryRow.id);
                }

                // ── Trigger multi-agent pipeline in the background ──────────────
                // This builds the Knowledge Graph and runs the 5-agent orchestration
                // pipeline. Results are persisted to scan_graphs and scan_findings
                // tables for the Knowledge Graph viewer.
                if (folderFiles.length > 0 && inputMode === 'folder') {
                    try {
                        // Get auth token for the pipeline API
                        const { data: { session } } = await sb.auth.getSession();
                        const pipelineToken = session?.access_token;

                        if (pipelineToken) {
                            const pipelineFormData = new FormData();

                            // Tell the API which extension set to use based on the user's selection
                            // bizType 'mobile' → mobile extensions (dart, swift, kt, etc.)
                            // everything else  → web extensions (ts, js, py, go, etc.)
                            const scanType = (bizType === 'mobile') ? 'mobile' : 'web';
                            pipelineFormData.append('scanType', scanType);
                            console.log(`[Pipeline] scanType=${scanType} (bizType=${bizType})`);

                            for (const f of folderFiles.slice(0, 100)) {
                                // Preserve relative path in the file name
                                const relPath = f.webkitRelativePath || f._relPath || f.name;
                                const renamedFile = new File([f], relPath, { type: f.type });
                                pipelineFormData.append('files', renamedFile);
                            }

                            // Fire-and-forget — don't await, let it run in background
                            fetch('/api/scan', {
                                method: 'POST',
                                headers: { 'Authorization': `Bearer ${pipelineToken}` },
                                body: pipelineFormData,
                            }).then(async (pipeRes) => {
                                if (pipeRes.ok) {
                                    const pipeData = await pipeRes.json();
                                    console.log('[Pipeline] Multi-agent scan started:', pipeData);
                                    // Link the pipeline's scanId to the scan_history row
                                    if (pipeData.scanId && scanHistoryRow?.id) {
                                        await sb.from('scan_history').update({
                                            report_data: { ...reportData, pipelineScanId: pipeData.scanId }
                                        }).eq('id', scanHistoryRow.id);

                                        // Also persist graph will use pipeData.scanId
                                        // Update currentScanId on dashboard with pipeline scan
                                        window.dispatchEvent(new CustomEvent('codesafe:report', {
                                            detail: { scanId: pipeData.scanId }
                                        }));
                                    }
                                } else {
                                    const errData = await pipeRes.json().catch(() => ({}));
                                    console.warn('[Pipeline] Multi-agent pipeline error:', errData.error || pipeRes.status);
                                }
                            }).catch(err => {
                                console.warn('[Pipeline] Multi-agent pipeline network error:', err.message);
                            });
                        }
                    } catch (pipeErr) {
                        console.warn('[Pipeline] Could not trigger multi-agent pipeline:', pipeErr.message);
                    }
                }

                // Notify React Dashboard with scanId
                window.dispatchEvent(new CustomEvent('codesafe:report', {
                    detail: { data: reportData, scanId: reportData.scanId }
                }));

                // Refresh local plan and history state
                if (window.fetchUserPlan) fetchUserPlan();
                if (window.fetchScanHistory) fetchScanHistory();
            }
        }

    } catch (e) {
        console.error('Scan Error:', e);
        if (loadSec) loadSec.classList.remove('show');
        const scanBtn = $('scanBtn');
        if (scanBtn) scanBtn.disabled = false;
        showErr('Scan failed: ' + e.message + '. Try a smaller project or check connection.');
    }
};

document.addEventListener('click', e => {
    if (e.target.id === 'scanBtn' || e.target.closest('#scanBtn')) {
        window.performCodeSafeScan();
    }
});

/* ═══ FILTER ══════════════════════════════════ */
function setFilter(f, btn) {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.vuln-card').forEach(card => {
        card.style.display = (f === 'all' || card.dataset.severity === f) ? '' : 'none';
    });
}

/* ═══ RENDER RESULTS ══════════════════════════ */
/* ═══ RENDER RESULTS ══════════════════════════ */
function renderResults(r, prev = null) {
    // Dispatch event for React (DashboardReport)
    window.dispatchEvent(new CustomEvent('codesafe:report', {
        detail: { data: r, prev: prev, visible: true, scanId: r?.scanId }
    }));

    // For now, keep the old DOM logic as fallback/compatibility if needed, 
    // but wrap in try-catch since we're removing the HTML from page.tsx
    try {
        const sharedBar = $('sharedBar');
        if (sharedBar) sharedBar.classList.remove('show');
        const vw = $('verdictWrap'), sr = $('statsRow'), vl = $('vulnList'), resSec = $('resSec');
        if (!vw || !sr || !vl) {
            // If React took over, those IDs might not exist in the same way or at all
            // We just ensure resSec is visible if it exists as a wrapper
            if (resSec) resSec.classList.add('show');
            return;
        }

        const svgs = {
            go: '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-anim-pulse" style="fill: var(--green-dim);"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>',
            nogo: '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--red)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-anim-pulse" style="fill: var(--red-dim);"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>',
            warn: '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--yellow)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-anim-pulse" style="fill: var(--yellow-dim);"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
        };
        const VM = { deploy: { cls: 'go', icon: svgs.go, head: 'Safe to Deploy' }, do_not_deploy: { cls: 'nogo', icon: svgs.nogo, head: 'Do NOT Deploy Yet' }, deploy_with_caution: { cls: 'warn', icon: svgs.warn, head: 'Deploy with Caution' } };
        const vm = VM[r.verdict] || VM.deploy_with_caution;
        vw.innerHTML = `<div class="verdict ${vm.cls}"><div class="v-icon">${vm.icon}</div><div class="v-body"><div class="v-lbl">Deploy Verdict</div><div class="v-head">${vm.head}</div><div class="v-sum">${r.summary}</div></div><div class="v-score"><div class="v-score-n">${r.score}</div><div class="v-score-l">Score</div></div></div>`;

        const sc = r.counts || {};
        const sevKeys = ['critical', 'high', 'medium', 'low'];
        const sevShort = ['c', 'h', 'm', 'l'];
        sr.innerHTML = sevKeys.map((k, i) => `<div class="stat-box sev-${sevShort[i]}"><div class="stat-n">${sc[k] || 0}</div><div class="stat-l">${k}</div></div>`).join('');

        // Vibe checks
        const vc = r.vibe_checks || {};
        const vibeGrid = $('vibeGrid'), vibePanel = $('vibePanel');
        if (vibeGrid) {
            vibeGrid.innerHTML = Object.entries(CONFIG.VIBE_META).map(([key, { icon, label }]) => {
                const s = vc[key] || 'skip';
                const statusHtml = s === 'pass'
                    ? '<span style="display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;background:var(--green-dim);color:var(--green);border-radius:3px;font-weight:700;font-size:11px;">✓</span>'
                    : s === 'fail'
                        ? '<span style="display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;background:var(--red-dim);color:var(--red);border-radius:3px;font-weight:700;font-size:11px;">✕</span>'
                        : '<span style="display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;background:var(--surface2);color:var(--muted);border:1px solid var(--border);border-radius:3px;font-size:12px;">—</span>';
                return `<div class="vibe-item" data-status="${s}"><div class="vibe-icon">${icon}</div><div class="vibe-label">${label}</div><div class="vibe-status">${statusHtml}</div></div>`;
            }).join('');
        }
        if (vibePanel) vibePanel.style.display = 'block';

        // Vulns
        vl.innerHTML = '';
        const vulns = r.vulnerabilities || [];
        if (vulns.length) {
            const SC = { critical: 'sc tc', high: 'sh th', medium: 'sm tm', low: 'sl tl', info: 'si ti' };
            vulns.forEach((v, i) => {
                const [cardCls, tagCls] = (SC[v.severity] || 'si ti').split(' ');
                const toStr = val => Array.isArray(val) ? val.join('<br>') : (typeof val === 'string' ? val.replace(/\n/g, '<br>') : String(val || ''));
                const codeBlock = v.fixed_code ? `<div class="code-block"><div class="code-hdr"><span class="code-lang">${v.code_language || 'code'} — fixed</span><button class="copy-btn" onclick="copyCode(this)">Copy</button></div><pre class="code-pre">${esc(v.fixed_code)}</pre></div>` : '';
                const card = document.createElement('div');
                card.className = `vuln-card ${cardCls}`; card.dataset.severity = v.severity;
                if (i === 0) card.classList.add('open');
                card.innerHTML = `
            <div class="vuln-top">
              <span class="sev-tag ${tagCls}">${v.severity}</span>
              <div class="v-meta"><div class="v-name">${v.title}</div><div class="v-file">📄 ${v.file}</div></div>
              <div class="toggle">⌄</div>
            </div>
            <div class="vuln-body">
              <div class="vuln-grid">
                <div><div class="vg-lbl">What is this?</div><div class="vg-txt">${toStr(v.what_is_it)}</div></div>
                <div><div class="vg-lbl">Why dangerous?</div><div class="vg-txt">${toStr(v.why_dangerous)}</div></div>
              </div>
              <div style="margin-bottom:14px"><div class="vg-lbl">Business risk</div><div class="vg-txt">${toStr(v.business_risk)}</div></div>
              <div class="fix-hdr">✅ How to fix</div>
              <div class="fix-steps">${toStr(v.how_to_fix)}</div>
              ${codeBlock}
            </div>`;
                card.querySelector('.vuln-top').addEventListener('click', () => card.classList.toggle('open'));
                vl.appendChild(card);
            });
        }

        if (resSec) {
            resSec.classList.add('show');
            resSec.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    } catch (e) { console.log('DOM render skipped (likely using React)', e); }
}


/* ═══ SCORE SHARE ════════════════════════════ */
function shareScore() {
    if (!reportData) return;
    const prev = prevReport?.score ?? null;
    const txt = prev !== null
        ? `My CodeSafe security score improved ${prev}→${reportData.score} after fixing vulnerabilities! 🛡️ #buildinpublic #indiehacker`
        : `My CodeSafe security score: ${reportData.score}/100 — ${reportData.verdict === 'deploy' ? '✅ Safe to deploy!' : '🔴 Found issues to fix before launch.'} #buildinpublic`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(txt)}`);
}
function copyScore() {
    if (!reportData) return;
    const txt = prevReport
        ? `CodeSafe: ${prevReport.score} → ${reportData.score} (+${reportData.score - prevReport.score})\n${reportData.vulnerabilities.length} issues remaining`
        : `CodeSafe Security Score: ${reportData.score}/100\nVerdict: ${reportData.verdict}\nIssues: ${reportData.vulnerabilities.length}`;
    navigator.clipboard.writeText(txt).then(() => showToast('Score card copied!'));
}

/* ═══ FIX FOR ME ══════════════════════════════ */
$('fixForMeBtn')?.addEventListener('click', () => window.handleFixForMe());
window.handleFixForMe = async function () {
    if (!reportData) return;

    // Notify React Dashboard
    window.dispatchEvent(new CustomEvent('codesafe:report', {
        detail: { fixing: true, fixedData: [] }
    }));

    const fixable = (reportData.vulnerabilities || []).filter(v => v.fixed_code);
    if (!fixable.length) { showToast('No auto-fixable issues found'); return; }
    const fixPanel = $('fixPanel'), fixGen = $('fixGen'), fixFileList = $('fixFileList');
    if (fixPanel) fixPanel.classList.add('show');
    if (fixGen) fixGen.style.display = 'block';
    if (fixFileList) fixFileList.style.display = 'none';
    if (fixPanel) fixPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });

    const fp = PROMPTS.getFixPrompt(fixable, codeSnapshot);

    try {
        const raw = await callAI({ messages: [{ role: 'user', content: fp }] });
        const fixes = JSON.parse(raw.replace(/```json|```/g, '').trim());
        if (fixGen) fixGen.style.display = 'none'; if (fixFileList) fixFileList.style.display = 'flex'; if (fixFileList) fixFileList.innerHTML = '';
        (fixes.fixes || []).forEach(f => {
            const item = document.createElement('div'); item.className = 'fix-file-item';
            item.innerHTML = `<div class="fix-file-hdr"><span class="fix-file-name">📄 ${f.file}</span><button class="fix-file-copy" onclick="copyFix(this)">Copy File</button></div><pre class="fix-file-pre">${esc(f.content)}</pre>`;
            fixFileList.appendChild(item);
        });

        // Notify React Dashboard
        window.dispatchEvent(new CustomEvent('codesafe:report', {
            detail: { fixing: false, fixedData: fixes.fixes || [] }
        }));

        if (!fixes.fixes?.length) if (fixFileList) fixFileList.innerHTML = `<div style="padding:20px;color:var(--muted);font-size:13px;text-align:center">No complete fixes could be generated.</div>`;
        showToast(`✅ ${(fixes.fixes || []).length} fixed files ready`);
    } catch (e) {
        const fixGen = $('fixGen'), fixFileList = $('fixFileList'), fixPanel = $('fixPanel');
        if (fixGen) fixGen.style.display = 'none'; if (fixFileList) fixFileList.style.display = 'flex';
        if (fixFileList) fixFileList.innerHTML = `<div style="padding:20px;color:var(--red);font-size:13px">Fix generation failed: ${e.message}</div>`;
    }
}
$('closeFixBtn')?.addEventListener('click', () => {
    const fixPanel = $('fixPanel');
    if (fixPanel) fixPanel.classList.remove('show');
});
function copyFix(btn) { const pre = btn.closest('.fix-file-item').querySelector('pre'); navigator.clipboard.writeText(pre.textContent).then(() => { btn.textContent = 'Copied!'; setTimeout(() => btn.textContent = 'Copy File', 1500); }); }

/* ═══ HELPERS ════════════════════════════════ */
function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function copyCode(btn) { const pre = btn.closest('.code-block').querySelector('pre'); navigator.clipboard.writeText(pre.textContent).then(() => { btn.textContent = 'Copied!'; setTimeout(() => btn.textContent = 'Copy', 1500); }); }

function repairJSON(str) {
    // Remove any trailing incomplete key-value pairs or strings
    // Close unterminated strings
    let s = str;

    // Count unescaped quotes — if odd, we have an unterminated string
    let inStr = false, escaped = false, lastQuoteIdx = -1;
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (escaped) { escaped = false; continue; }
        if (c === '\\') { escaped = true; continue; }
        if (c === '"') { inStr = !inStr; if (inStr) lastQuoteIdx = i; }
    }

    if (inStr && lastQuoteIdx >= 0) {
        // Find a safe truncation point — last complete property
        const truncPoint = s.lastIndexOf('",', lastQuoteIdx);
        const truncPoint2 = s.lastIndexOf('"}', lastQuoteIdx);
        const truncPoint3 = s.lastIndexOf('"]', lastQuoteIdx);
        const best = Math.max(truncPoint, truncPoint2, truncPoint3);
        if (best > 0) {
            s = s.slice(0, best + 2);
        } else {
            // Just close the string
            s += '"';
        }
    }

    // Remove trailing commas before closing brackets
    s = s.replace(/,\s*([\]}])/g, '$1');

    // Count unclosed brackets and close them
    let opens = { '{': 0, '[': 0 };
    let inString = false, esc2 = false;
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (esc2) { esc2 = false; continue; }
        if (c === '\\') { esc2 = true; continue; }
        if (c === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (c === '{') opens['{']++;
        if (c === '}') opens['{']--;
        if (c === '[') opens['[']++;
        if (c === ']') opens['[']--;
    }

    // Remove any trailing comma
    s = s.replace(/,\s*$/, '');

    // Close unclosed brackets
    for (let i = 0; i < opens['[']; i++) s += ']';
    for (let i = 0; i < opens['{']; i++) s += '}';

    return s;
}

/* ═══ ACTION BUTTONS ══════════════════════════ */
function showToast(msg, dur = 2500) { toast.textContent = msg; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), dur); }

$('shareBtn')?.addEventListener('click', () => {
    if (!reportData) return;
    try {
        const enc = btoa(unescape(encodeURIComponent(JSON.stringify(reportData))));
        const url = `${location.origin}${location.pathname}#report=${enc}`;
        navigator.clipboard.writeText(url).then(() => {
            const sBtn = $('shareBtn');
            if (sBtn) {
                sBtn.textContent = '✅ Copied!'; sBtn.classList.add('ok');
                showToast('Report link copied!');
                setTimeout(() => { sBtn.textContent = '🔗 Share'; sBtn.classList.remove('ok'); }, 2000);
            }
        });
    } catch (e) { showToast('Could not generate link'); }
});
const dlBtn = $('downloadReportBtn');
if (dlBtn) {
    dlBtn.addEventListener('click', () => {
        if (!reportData) return;
        const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `CodeSafe_Report_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('Report downloaded successfully!');
    });
}

const rescanBn = $('rescanBtn');
rescanBn?.addEventListener('click', () => {
    if (resSec) resSec.classList.remove('show'); if (loadSec) loadSec.classList.remove('show'); if (fixPanel) fixPanel.classList.remove('show');
    clearFiles(); chatHistory = []; if (chatMsgs) chatMsgs.innerHTML = ''; if (vibePanel) vibePanel.style.display = 'none'; if (scoreCard) scoreCard.style.display = 'none';
    backToInput();
    showToast('Drop your updated folder to re-scan');
});

// Expose handleRescan for the React dashboard "Re-scan" button.
// If files are already loaded, re-run scan immediately; else go back to input.
window.handleRescan = function () {
    if (folderFiles && folderFiles.length > 0) {
        // Files still in memory — just click scan again
        if (scanBtn && !scanBtn.disabled) {
            scanBtn.click();
        } else if (scanBtn) {
            scanBtn.disabled = false;
            scanBtn.click();
        }
    } else {
        // No files loaded — take user back to input
        if (resSec) resSec.classList.remove('show');
        if (loadSec) loadSec.classList.remove('show');
        if (fixPanel) fixPanel.classList.remove('show');
        backToInput();
        showToast('Drop your updated folder to re-scan');
    }
};


/* ═══ CHAT ═══════════════════════════════════ */
function initChat(report, focusVuln = null) {
    chatMsgs.innerHTML = ''; chatHistory = [];
    const issues = report.vulnerabilities || [];
    const criticalCount = issues.filter(v => v.severity === 'critical').length;

    let intro = "";
    if (focusVuln) {
        intro = `I'm focusing specifically on the <strong>${focusVuln.title}</strong> issue in your report. This is a ${focusVuln.severity} risk. What can I help you understand about it?`;
    } else {
        intro = issues.length
            ? `I've analyzed the security report. There are ${issues.length} issue${issues.length > 1 ? 's' : ''} to review${criticalCount ? `, including ${criticalCount} critical vulnerability` : ''}. I'm ready to help you prioritize and fix them. What would you like to start with?`
            : "Your codebase is looking secure based on the current scan! No vulnerabilities were detected. Do you have any questions about maintaining this security posture?";
    }

    addMsg('ai', intro);
    const qpRow = $('quickRow'); qpRow.innerHTML = '';

    const qs = focusVuln
        ? [`How do I fix ${focusVuln.title.split(' ')[0]}?`, 'Why is this dangerous?', 'Is it safe to launch?', 'Show other issues']
        : (issues.length
            ? ['Where should I start?', 'Explain the top risk?', 'Show me the fixes', 'Can I launch today?']
            : ['Best practices for Supabase?', 'Security checklist before launch']);

    qs.forEach(q => {
        const b = document.createElement('button');
        b.className = 'qp';
        b.textContent = q;
        b.addEventListener('click', () => {
            if (q === 'Show other issues') {
                initChat(report);
            } else {
                chatInput.value = q;
                sendChat();
            }
        });
        qpRow.appendChild(b);
    });

    chatHistory.push({ role: 'user', content: PROMPTS.getChatContextMessage(report) });
    if (focusVuln) {
        chatHistory.push({ role: 'user', content: `I have a question about the specific issue: "${focusVuln.title}".` });
    }
    chatHistory.push({ role: 'assistant', content: intro.replace(/<[^>]+>/g, '') });
}

function getChatIcon(r) { return r === 'user' ? '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>' : '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/><path d="M12 8V4"/><path d="M12 4h4"/></svg>'; }
function addMsg(role, text) { const d = document.createElement('div'); d.className = `chat-msg ${role === 'user' ? 'u' : ''}`; d.innerHTML = `<div class="msg-av">${getChatIcon(role)}</div><div class="msg-bub">${text}</div>`; chatMsgs.appendChild(d); chatMsgs.scrollTop = chatMsgs.scrollHeight; }
function addTyping() { const d = document.createElement('div'); d.className = 'chat-msg'; d.id = 'typingMsg'; d.innerHTML = `<div class="msg-av">${getChatIcon('ai')}</div><div class="msg-bub typing"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>`; chatMsgs.appendChild(d); chatMsgs.scrollTop = chatMsgs.scrollHeight; }

async function sendChat() {
    const msg = chatInput.value.trim();
    if (!msg || isChatting) return;
    chatInput.value = ''; isChatting = true; sendBtn.disabled = true;
    addMsg('user', msg); $('quickRow').innerHTML = ''; addTyping();
    chatHistory.push({ role: 'user', content: msg });
    try {
        const reply = await callAI({
            messages: chatHistory,
            systemPrompt: PROMPTS.getChatSystemPrompt(),
            maxTokens: CONFIG.CHAT_MAX_TOKENS
        });
        chatHistory.push({ role: 'assistant', content: reply });
        $('typingMsg')?.remove(); addMsg('ai', reply.replace(/\n/g, '<br>'));
    } catch (e) { $('typingMsg')?.remove(); addMsg('ai', 'Something went wrong. Please try again.'); }
    isChatting = false; sendBtn.disabled = false;
}
document.addEventListener('click', e => {
    const btn = e.target.closest('#sendBtn');
    if (btn) sendChat();
});

document.addEventListener('keydown', e => {
    if (e.target.id === 'chatInput' && e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChat();
    }
});

/* ═══ FAQ ════════════════════════════════════ */
function toggleFaq(btn) { const item = btn.closest('.faq-item'), wasOpen = item.classList.contains('open'); document.querySelectorAll('.faq-item.open').forEach(x => x.classList.remove('open')); if (!wasOpen) item.classList.add('open'); }

/* ═══ SHARED REPORT ══════════════════════════ */
function checkShared() {
    if (!location.hash.startsWith('#report=')) return;
    try {
        const dec = JSON.parse(decodeURIComponent(escape(atob(location.hash.replace('#report=', '')))));
        reportData = dec; renderResults(dec); if (typeof initChat === 'function') initChat(dec);
        if (sharedBar) sharedBar.classList.add('show');
        if ($('uploadSec')) $('uploadSec').style.display = 'none';

        // Hide back buttons & update instructions for shared view
        const backBtn = document.querySelector('.back-btn');
        if (backBtn) backBtn.style.display = 'none';
        const inpBackBtn = document.querySelector('.inp-back-btn');
        if (inpBackBtn) inpBackBtn.style.display = 'none';
        const appSub = document.querySelector('.dash-sidebar .app-sub');
        if (appSub) appSub.textContent = 'This security report was shared via a public link.';

        // Auto-navigate to report view
        showApp();
        showDashboard();

        // Ensure loader is hidden and empty state is gone
        if (loadSec) loadSec.classList.remove('show');
        const eds = $('emptyDashState'); if (eds) eds.style.display = 'none';

    } catch (e) { console.warn('Bad shared report', e); }
}

checkShared();


// ── Initial routing ───────────────────────────
if (location.hash.startsWith('#report=')) showApp();
else if (location.hash.startsWith('#open-plan=')) {
    // Came from landing page pricing button — go to app and open pricing modal
    showApp();
    const _planFromHash = location.hash.replace('#open-plan=', '');
    // Clear hash so it doesn't persist on refresh
    history.replaceState(null, '', location.pathname);
    // Wait for auth + plan data to load, then open modal
    setTimeout(() => {
        if (window.showPricingModal) {
            window.showPricingModal();
        } else {
            // Retry once if showPricingModal not yet defined (auth still loading)
            setTimeout(() => window.showPricingModal?.(), 800);
        }
    }, 600);
} else showLanding();

