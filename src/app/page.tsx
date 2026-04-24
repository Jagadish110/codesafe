'use client';

import Script from 'next/script';
import DashboardReport from './DashboardReport';
import Pricing, { PRICING_DATA, PLAN_LIMITS, TOTAL_CHECKS } from './Pricing';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

function CheckoutAlert() {
  const params = useSearchParams();
  const router = useRouter();
  const checkout = params.get('checkout');
  const status = params.get('status');
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (checkout || status) {
      setVisible(true);
      // Auto-hide the toast after 6 seconds per user request
      const timer = setTimeout(() => setVisible(false), 6000);
      return () => clearTimeout(timer);
    }
  }, [checkout, status, router]);

  if (!visible) return null;

  const isSuccess = checkout === 'success' && status !== 'failed';
  const isError = status === 'failed';

  return (
    <div style={{
      position: 'fixed', top: '108px', left: '50%', transform: 'translateX(-50%)',
      zIndex: 10000,
      background: 'rgba(255, 255, 255, 0.96)',
      backdropFilter: 'blur(24px) saturate(160%)',
      WebkitBackdropFilter: 'blur(24px) saturate(160%)',
      border: `1px solid ${isSuccess ? 'rgba(5, 150, 105, 0.15)' : 'rgba(225, 29, 72, 0.15)'}`,
      borderRadius: '99px',
      padding: '12px 16px 12px 20px',
      display: 'flex', alignItems: 'center', gap: '14px',
      boxShadow: '0 20px 40px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.05)',
      animation: 'toastSlideDown 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards'
    }}>
      <style>{`
        @keyframes toastSlideDown {
          0% { opacity: 0; transform: translate(-50%, -20px); }
          100% { opacity: 1; transform: translate(-50%, 0); }
        }
        .toast-close-btn:hover { background: rgba(15, 23, 42, 0.05); color: #0f172a; }
      `}</style>

      {isSuccess && (
        <>
          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--success-dim)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', paddingRight: '12px' }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.3px' }}>Payment Successful</span>
            <span style={{ fontSize: '13px', color: '#64748b' }}>Your CodeSafe plan is now active.</span>
          </div>
        </>
      )}

      {isError && (
        <>
          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--error-dim)', color: 'var(--error)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', paddingRight: '12px' }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.3px' }}>Payment Failed</span>
            <span style={{ fontSize: '13px', color: '#64748b' }}>There was an issue processing your payment.</span>
          </div>
        </>
      )}
    </div>
  );
}

export default function SecurityPage() {
  const [businessType, setBusinessType] = useState('saas');

  const [currentUserPlan, setCurrentUserPlan] = useState<any>(null);
  const [navBtnsVisible, setNavBtnsVisible] = useState(false);

  useEffect(() => {
    const updateNavBtns = (e: any) => {
      setNavBtnsVisible(e.detail.visible);
    };
    window.addEventListener('codesafe:nav_btns', updateNavBtns);
    return () => window.removeEventListener('codesafe:nav_btns', updateNavBtns);
  }, []);

  useEffect(() => {
    const updatePlan = () => {
      if (typeof window !== 'undefined') {
        setCurrentUserPlan((window as any).currentUserPlan);
      }
    };
    window.addEventListener('codesafe:plan_updated', updatePlan);
    updatePlan();
    return () => window.removeEventListener('codesafe:plan_updated', updatePlan);
  }, []);

  const getTierInfo = () => {
    const tier = currentUserPlan?.plan_tier || 'free';
    const limitInfo = (PLAN_LIMITS as any)[tier] || PLAN_LIMITS.free;

    // Find the matching entry in PRICING_DATA for display labels
    const data = PRICING_DATA.find(p => p.tier.toLowerCase() === limitInfo.label.toLowerCase()) || PRICING_DATA[0];

    return {
      label: `${limitInfo.label} Plan`,
      checks: `${data.checks}/${TOTAL_CHECKS}`,
      max: limitInfo.scansPerMonth
    };
  };

  const tierInfo = getTierInfo();
  const scansUsed = currentUserPlan?.scans_used || 0;
  const usagePercent = Math.min(100, (scansUsed / tierInfo.max) * 100);

  // Sync businessType to window.bizType for app.js
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).bizType = businessType;

      const handleBizChange = (e: any) => {
        if (e.detail) setBusinessType(e.detail);
      };

      window.addEventListener('codesafe:biz_type_changed' as any, handleBizChange);
      return () => window.removeEventListener('codesafe:biz_type_changed' as any, handleBizChange);
    }
  }, [businessType]);
  useEffect(() => {
    (window as any).PRICING_DATA = PRICING_DATA;
    (window as any).PLAN_LIMITS = PLAN_LIMITS;
    (window as any).TOTAL_CHECKS = TOTAL_CHECKS;

    // ── Scroll reveal (IntersectionObserver) ───────────────────────────
    if (typeof IntersectionObserver !== 'undefined') {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
          }
        });
      }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });

      const observe = () =>
        document.querySelectorAll('.reveal-on-scroll').forEach(el => observer.observe(el));
      observe();
      setTimeout(observe, 500);

      return () => observer.disconnect();
    }
  }, []);

  // ── Sync account widget in input screen ─────────────────────────────
  useEffect(() => {
    const sync = () => {
      const plan = (window as any).currentUserPlan;
      const user = (window as any).currentUser;
      const widget = document.getElementById('inpAccountWidget');
      const signInBtn = document.querySelector('.nav-signup-btn') as HTMLElement;

      if (user) {
        if (widget) widget.style.display = 'block';
        if (signInBtn) signInBtn.style.display = 'none';

        const name = user.user_metadata?.full_name || user.user_metadata?.name || user.email || 'U';
        const tier = plan?.plan_tier || 'free';
        const limitInfo = (PLAN_LIMITS as any)[tier] || PLAN_LIMITS.free;
        const scansUsed = plan?.scans_used || 0;
        const scansLimit = limitInfo.scansPerMonth;
        const pct = Math.min((scansUsed / scansLimit) * 100, 100);

        const avatar = document.getElementById('inpAvatarCircle');
        if (avatar) avatar.textContent = name.charAt(0).toUpperCase();
        const nameEl = document.getElementById('inpAccountName');
        if (nameEl) nameEl.textContent = name.split('@')[0];
        const badge = document.getElementById('inpPlanBadge');
        const planLabel = limitInfo.label === 'Starter' ? `${limitInfo.scansPerMonth}-Scan Trial` : `${limitInfo.label} Plan`;
        if (badge) badge.textContent = planLabel;
        const email = document.getElementById('inpMenuEmail');
        if (email) email.textContent = user.email || '';
        const menuPlan = document.getElementById('inpMenuPlan');
        if (menuPlan) menuPlan.textContent = planLabel;
        const menuUsage = document.getElementById('inpMenuUsage');
        if (menuUsage) menuUsage.textContent = `${scansUsed} / ${scansLimit} scans used`;
        const fill = document.getElementById('inpUsageFill');
        if (fill) fill.style.width = pct + '%';
      } else {
        if (widget) widget.style.display = 'none';
        if (signInBtn) signInBtn.style.display = 'inline-flex';
      }
    };

    // Close menu on outside click
    const clickHandler = (e: MouseEvent) => {
      const widget = document.getElementById('inpAccountWidget');
      const menu = document.getElementById('inpAccountMenu');
      if (menu && widget && !widget.contains(e.target as Node)) {
        menu.style.display = 'none';
      }
    };
    document.addEventListener('click', clickHandler);
    window.addEventListener('codesafe:plan_updated', sync);
    sync();
    return () => {
      document.removeEventListener('click', clickHandler);
      window.removeEventListener('codesafe:plan_updated', sync);
    };
  }, []);

  const onHistorySelect = (data: any, scanId?: string) => {
    // Show report view
    (window as any).showDashboard?.();
    const reportData = scanId ? { ...data, scanId } : data;
    // Dispatch event to React report component and app.js
    window.dispatchEvent(new CustomEvent('codesafe:report', { detail: { data: reportData, scanId, visible: true } }));
    window.dispatchEvent(new CustomEvent('codesafe:load_report', { detail: reportData }));
  };
  return (
    <>
      <Suspense fallback={null}>
        <CheckoutAlert />
      </Suspense>
      {/* ─── Google Fonts for the security scanner ─── */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <style dangerouslySetInnerHTML={{
        __html: `
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@300;400;500;600;700;800&family=Space+Mono:wght@400;700&family=DM+Sans:wght@300;400;500;600;700&display=swap');
      `}} />

      {/* ─── Override root globals.css which sets dark bg / Inter font ─── */}
      <style dangerouslySetInnerHTML={{
        __html: `
        #security-root,
        #security-root * {
          font-family: 'Inter', sans-serif;
        }
        /* Premium Professional Color Palette */
        #security-root {
          --bg: #faf4edff;
          --bg-secondary: #faf4edff;
          --bg-tertiary: #f8fafc;
          --surface: rgba(255, 255, 255, 0.7);
          --surface2: rgba(255, 255, 255, 0.5);
          --surface3: rgba(255, 255, 255, 0.3);
          --border: rgba(15, 23, 42, 0.08); /* slate-900 with low opacity */
          --border2: rgba(15, 23, 42, 0.12);
          --border3: rgba(15, 23, 42, 0.16);
          
          /* Professional Slate/Indigo Palette */
          --primary: #0f172a;
          --primary-hover: #020617;
          --primary-dim: rgba(15, 23, 42, 0.05);
          --primary-glow: rgba(15, 23, 42, 0.1);
          
          --accent: #ff6e20ff; /* Indigo */
          --accent-hover: #ff6e20ff;
          --accent-dim: rgba(79, 70, 229, 0.08);
          --accent-glow: rgba(79, 70, 229, 0.2);
          
          --success: #059669;
          --success-dim: rgba(5, 150, 105, 0.05);
          --warning: #ff6e20ff; /* Replacing orange with violet */
          --warning-dim: rgba(139, 92, 246, 0.05);
          --orange: #ff6e20ff;
          --orange-dim: rgba(139, 92, 246, 0.05);
          --error: #e11d48;
          --error-dim: rgba(225, 29, 72, 0.05); 
          --yellow: #0284c7; /* Sky 600 */
          --yellow-dim: rgba(2, 132, 199, 0.05);
          
          --text: #0f172a; /* Slate 900 */
          --text-secondary: #475569; /* Slate 600 */
          --text-muted: #64748b; /* Slate 500 */
          --text-light: #94a3b8; /* Slate 400 */
          
          --mono: 'Space Mono', monospace;
          --sans: 'Inter', sans-serif;

          /* Reset the root theme variables */
          --color-bg-dark: var(--bg);
          --color-text-primary: var(--text);

          /* Professional shadows */
          --shadow-sm: 0 2px 4px rgba(0, 0, 0, 0.02);
          --shadow: 0 4px 12px rgba(0, 0, 0, 0.04);
          --shadow-md: 0 12px 24px rgba(0, 0, 0, 0.06);
          --shadow-lg: 0 24px 48px rgba(0, 0, 0, 0.08);
          --shadow-xl: 0 32px 64px rgba(0, 0, 0, 0.1);

          /* Hide all visual scrollbars */
          scrollbar-width: none !important;
          -ms-overflow-style: none !important;
        }
        #security-root::-webkit-scrollbar {
          display: none !important;
        }

        /* Global scrollbar removal for this page */
        * {
          scrollbar-width: none !important;
          -ms-overflow-style: none !important;
        }
        *::-webkit-scrollbar {
          display: none !important;
        }
        html, body {
          scrollbar-width: none !important;
          -ms-overflow-style: none !important;
          overflow-x: hidden !important;
        }
        html::-webkit-scrollbar, body::-webkit-scrollbar {
          display: none !important;
        }

        #security-root {
          position: relative;
          min-height: 100vh;
          background-color: var(--bg);
          background-image: 
            radial-gradient(at 0% 0%, rgba(200, 220, 255, 0.4) 0px, transparent 50%),
            radial-gradient(at 100% 0%, rgba(255, 230, 240, 0.4) 0px, transparent 50%),
            radial-gradient(at 100% 100%, rgba(240, 240, 255, 0.4) 0px, transparent 50%);
          color: var(--text);
          overflow-x: hidden;
          z-index: 1;
        }

        /* Fix AI Chat Widget background transparency */
        #security-root #chatWidget, 
        #security-root .chat-widget {
          background: #ffffff !important;
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
          box-shadow: 0 16px 64px rgba(15, 23, 42, 0.16) !important;
        }

        /* Premium Component Styling */
        .nav, .problem-card, .step-card, .feat-card, .coverage-tier, .price-card, .faq-item, .mockup-window, .hero-badge, .auth-content, .github-btn {
            background: var(--surface) !important;
            backdrop-filter: blur(24px) saturate(160%) !important;
            -webkit-backdrop-filter: blur(24px) saturate(160%) !important;
            border: 1px solid var(--border) !important;
            box-shadow: var(--shadow) !important;
            border-radius: 16px !important;
        }

        /* Center Auth Modal */
        .auth-modal {
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            position: fixed !important;
            inset: 0 !important;
            z-index: 999999 !important;
        }

        .auth-content {
            margin: auto !important;
            position: relative !important;
            transform: none !important;
        }
        
        .cta-banner {
            background: linear-gradient(135deg, rgba(79, 70, 229, 0.05) 0%, rgba(15, 23, 42, 0.02) 100%) !important;
            border: 1px solid var(--border) !important;
            border-radius: 24px !important;
            overflow: hidden !important;
            padding: 0 !important;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.03) !important;
        }

        .cta-inner {
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            padding: 80px 40px !important;
        }

        .input-screen {
            padding: 0 !important;
            background: #ffffff !important;
            min-height: 100vh;
        }

        .input-screen-inner {
            display: grid !important;
            grid-template-columns: 1.1fr 0.9fr !important;
            gap: 100px !important;
            max-width: 1400px !important;
            margin: 0 auto !important;
            padding: 160px 48px 100px 48px !important;
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
            align-items: flex-start !important;
            position: relative !important;
            z-index: 2 !important;
        }

        /* Hide legacy elements that might be injected by old scripts */
        #scanPagePlanBadge, #userProfileWidget.app-bottom-left {
            display: none !important;
            visibility: hidden !important;
            opacity: 0 !important;
            pointer-events: none !important;
        }

        .inp-col-left {
            display: flex !important;
            flex-direction: column !important;
        }

        .inp-title {
            font-size: 64px !important;
            font-weight: 800 !important;
            line-height: 1.05 !important;
            margin-bottom: 32px !important;
            font-family: 'Instrument Serif', serif !important;
            color: #0f172a !important;
            letter-spacing: -0.01em !important;
        }

        .highlight-vibe {
            position: relative;
            display: inline-block;
            color: #f95700ff !important;
            z-index: 1;
        }

        .highlight-vibe::after {
            content: "";
            position: absolute;
            left: -2%;
            width: 104%;
            bottom: -6px;
            height: 12px;
            background-image: url("data:image/svg+xml,%3Csvg width='164' height='12' viewBox='0 0 164 12' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M2 9.5C30.5 5 75.5 2 162 4' stroke='%23f95700' stroke-width='5' stroke-linecap='round'/%3E%3C/svg%3E");
            background-size: 100% 100%;
            background-repeat: no-repeat;
            z-index: -1;
            opacity: 0.8;
            transform: translateY(2px);
        }

        .inp-sub {
            font-size: 20px !important;
            color: #64748b !important;
            margin-bottom: 56px !important;
            line-height: 1.5 !important;
            max-width: 520px !important;
            letter-spacing: -0.01em !important;
        }

        .inp-section-label {
            font-size: 11px !important;
            font-weight: 700 !important;
            letter-spacing: 0.1em !important;
            text-transform: uppercase !important;
            color: #94a3b8 !important;
            margin-bottom: 20px !important;
            font-family: 'DM Mono', monospace !important;
        }

        .inp-biz-row {
            display: flex !important;
            flex-wrap: wrap !important;
            gap: 12px !important;
            margin-bottom: 40px !important;
        }

        .inp-biz-btn {
            background: #ffffff !important;
            border: 1px solid #e2e8f0 !important;
            border-radius: 99px !important;
            padding: 10px 20px !important;
            font-size: 14px !important;
            font-weight: 600 !important;
            color: #475569 !important;
            cursor: pointer !important;
            display: flex !important;
            align-items: center !important;
            gap: 10px !important;
            transition: color 0.2s, border-color 0.2s, box-shadow 0.2s, transform 0.2s, background-color 0.2s !important;
            box-shadow: 0 1px 2px rgba(0,0,0,0.05) !important;
        }

        .inp-biz-btn:hover {
            border-color: #cbd5e1 !important;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05) !important;
            transform: translateY(-1px) !important;
        }

        .inp-biz-btn.active {
            background: #ffffff !important;
            border-color: #ff6e20 !important;
            color: #ff6e20 !important;
            box-shadow: 0 0 0 1px #ff6e20, 0 4px 12px rgba(255, 110, 32, 0.15) !important;
        }

        /* USAGE CARD */
        .usage-card {
            background: #ffffff !important;
            border-radius: 16px !important;
            padding: 12px 16px !important;
            margin-bottom: 0 !important;
            display: flex !important;
            align-items: center !important;
            gap: 12px !important;
            width: 240px !important;
            border: 1px solid #e2e8f0 !important;
            box-shadow: 0 4px 12px rgba(0,0,0,0.03) !important;
        }

        .usage-icon {
            width: 32px !important;
            height: 32px !important;
            background: #f1f5f9 !important;
            border-radius: 8px !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
        }

        .usage-icon svg {
            color: #3b82f6 !important;
        }

        .usage-info {
            flex: 1 !important;
        }

        .usage-header {
            display: flex !important;
            justify-content: space-between !important;
            margin-bottom: 6px !important;
            font-size: 12px !important;
            font-weight: 700 !important;
            color: #0f172a !important;
        }

        .usage-bar-bg {
            height: 5px !important;
            background: #cbd5e1 !important;
            border-radius: 3px !important;
            overflow: hidden !important;
        }

        .usage-bar-val {
            height: 100% !important;
            background: #4f46e5 !important;
            border-radius: 3px !important;
        }

        .usage-sub {
            font-size: 10px !important;
            color: #64748b !important;
            margin-top: 6px !important;
            font-weight: 600 !important;
        }

        .usage-upgrade {
            color: #4f46e5 !important;
            text-decoration: none !important;
            margin-left: 4px !important;
        }

        .inp-scan-btn {
            background: #fff5f5 !important;
            border: 1px solid #fee2e2 !important;
            border-radius: 99px !important;
            padding: 20px 56px !important;
            font-size: 18px !important;
            font-weight: 700 !important;
            color: #991b1b !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            box-shadow: 0 10px 30px rgba(153, 27, 27, 0.05) !important;
            max-width: 420px !important;
            font-family: 'Instrument Serif', serif !important;
            font-style: italic !important;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
            cursor: pointer !important;
        }

        .inp-scan-btn:not(:disabled):hover {
            transform: translateY(-2px) !important;
            box-shadow: 0 15px 35px rgba(153, 27, 27, 0.08) !important;
            background: #fef2f2 !important;
        }

        .inp-scan-btn:disabled {
            opacity: 0.5 !important;
            cursor: not-allowed !important;
            color: #94a3b8 !important;
            background: #f1f5f9 !important;
            border-color: #e2e8f0 !important;
            box-shadow: none !important;
        }

        .inp-col-right {
            display: flex !important;
            flex-direction: column !important;
            align-items: flex-end !important;
        }

        .inp-tabs {
            background: #f1f5f9 !important;
            border-radius: 99px !important;
            padding: 6px !important;
            display: flex !important;
            gap: 4px !important;
            margin-bottom: 40px !important;
        }

        .inp-tab {
            background: transparent !important;
            border: none !important;
            padding: 10px 24px !important;
            border-radius: 99px !important;
            font-size: 14px !important;
            font-weight: 600 !important;
            color: #64748b !important;
            cursor: pointer !important;
            display: flex !important;
            align-items: center !important;
            gap: 10px !important;
            box-shadow: none !important;
            transition: all 0.2s ease !important;
        }

        .inp-tab.active {
            background: #ffffff !important;
            color: #ff6e20 !important;
            box-shadow: 0 4px 12px rgba(255, 110, 32, 0.15) !important;
        }

        .inp-upload-zone {
            width: 100% !important;
            background: #ffffff !important;
            border: 1px dashed #cbd5e1 !important;
            border-radius: 24px !important;
            padding: 80px 48px !important;
            text-align: center !important;
            position: relative !important;
            transition: all 0.3s ease !important;
            box-shadow: 0 10px 40px rgba(0,0,0,0.02) !important;
        }

        .inp-footer {
            position: absolute !important;
            bottom: 32px !important;
            left: 48px !important;
            right: 48px !important;
            display: flex !important;
            justify-content: space-between !important;
            align-items: flex-end !important;
            z-index: 5 !important;
        }

        .inp-upload-ico {
            width: 64px !important;
            height: 64px !important;
            background: #f8fafc !important;
            border: 1px solid #f1f5f9 !important;
            border-radius: 16px !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            margin: 0 auto 24px auto !important;
        }

        .inp-upload-title {
            font-size: 24px !important;
            font-weight: 800 !important;
            color: #0f172a !important;
            margin-bottom: 8px !important;
        }

        .inp-upload-hint {
            font-size: 15px !important;
            color: #94a3b8 !important;
            margin-bottom: 32px !important;
        }

        /* Professional form elements */
        .btn-ghost, .github-input, .auth-input-group input, .inp-tab {
            background: var(--surface) !important;
            backdrop-filter: none !important;
            -webkit-backdrop-filter: none !important;
            border: 1px solid var(--border) !important;
            color: var(--text) !important;
            border-radius: 12px !important;
            box-shadow: var(--shadow-sm) !important;
        }

        .btn-ghost:hover, .github-input:hover, .auth-input-group input:hover, .inp-tab:hover {
            border-color: var(--border2) !important;
            box-shadow: var(--shadow) !important;
        }

        /* Premium Professional Navigation */
        .nav {
            position: fixed !important;
            top: 24px !important;
            left: 0 !important;
            right: 0 !important;
            margin: 0 auto !important;
            width: min(1100px, calc(100% - 48px)) !important;
            height: 74px !important;
            z-index: 1000 !important;
            background: rgba(255, 255, 255, 0.96) !important;
            backdrop-filter: blur(22px) !important;
            -webkit-backdrop-filter: blur(22px) !important;
            border: 1px solid var(--border) !important;
            border-radius: 99px !important;
            box-shadow: var(--shadow) !important;
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            padding: 0 32px !important;
            transform: none !important;
            contain: layout;
        }
        #security-root:has(#appView.active) .nav {
            display: flex !important;
        }
        .nav a, .nav button {
            border-radius: 99px !important;
        }

        .nav-logo {
            font-family: var(--sans) !important;
            font-size: 24px !important;
            font-weight: 700 !important;
            letter-spacing: -0.5px !important;
            display: flex !important;
            align-items: center !important;
            gap: 12px !important;
            cursor: pointer !important;
            color: var(--text) !important;
            text-decoration: none !important;
        }

        .logo-img {
            width: 32px !important;
            height: 32px !important;
            object-fit: contain !important;
            transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
        }

        .nav-logo:hover .logo-img {
            transform: scale(1.1) rotate(-5deg) !important;
        }

        .logo-pip { display: none !important; }

        .nav-links {
            display: flex !important;
            align-items: center !important;
            gap: 32px !important;
            list-style: none !important;
        }

        .nav-links a {
            font-size: 14px !important;
            font-weight: 500 !important;
            color: var(--text-secondary) !important;
            text-decoration: none !important;
            transition: all 0.2s ease !important;
            padding: 8px 16px !important;
            border-radius: 8px !important;
        }

        .nav-links a:hover {
            color: var(--text) !important;
            background: var(--bg-secondary) !important;
        }

        .nav-actions {
            display: flex !important;
            align-items: center !important;
            gap: 16px !important;
        }

        .nav-link {
            background: transparent !important;
            color: var(--text-secondary) !important;
            border: none !important;
            padding: 8px 16px !important;
            font-size: 14px !important;
            font-weight: 500 !important;
            cursor: pointer !important;
            transition: all 0.2s ease !important;
        }

        .nav-link:hover {
            color: var(--text) !important;
        }


        .nav-cta {
            padding: 10px 28px !important;
            background: var(--accent) !important;
            color: white !important;
            border: none !important;
            border-radius: 99px !important;
            font-size: 14px !important;
            font-weight: 600 !important;
            cursor: pointer !important;
            transition: all 0.2s ease !important;
            box-shadow: var(--shadow) !important;
        }

        .nav-cta:hover {
            background: var(--accent-hover) !important;
            transform: translateY(-1px) !important;
            box-shadow: var(--shadow-md) !important;
        }

        /* Ensure body doesn't fight us */
        body:has(#security-root) {
          background: var(--bg) !important;
          color: var(--text) !important;
          font-family: var(--sans) !important;
        }

        /* Hide Nav on Scanner Page */
        #security-root:has(#appView.active) .nav {
            display: none !important;
        }

        /* Premium Button Styles */
        .btn-primary {
            background: var(--accent) !important;
            color: white !important;
            border: none !important;
            border-radius: 99px !important;
            padding: 14px 32px !important;
            font-size: 16px !important;
            font-weight: 600 !important;
            cursor: pointer !important;
            transition: all 0.2s ease !important;
            box-shadow: var(--shadow) !important;
        }

        .btn-primary:hover {
            background: var(--accent-hover) !important;
            transform: translateY(-1px) !important;
            box-shadow: var(--shadow-md) !important;
        }

        /* Hero Section Enhancements */
        .hero {
            padding: 120px 40px 80px !important;
            text-align: center !important;
            max-width: 1200px !important;
            margin: 0 auto !important;
        }

        .hero-badge {
            display: inline-flex !important;
            align-items: center !important;
            gap: 8px !important;
            background: var(--accent-dim) !important;
            color: var(--accent) !important;
            padding: 8px 16px !important;
            border-radius: 20px !important;
            font-size: 14px !important;
            font-weight: 500 !important;
            margin-bottom: 24px !important;
            border: 1px solid var(--accent-glow) !important;
        }

        .hero h1 {
            font-size: 82px !important;
            font-weight: 800 !important;
            line-height: 0.95 !important;
            margin-bottom: 32px !important;
            color: #0f172a !important;
            letter-spacing: -2px !important;
        }

        .hero h1 span.serif {
            font-family: 'Instrument Serif', serif !important;
            font-style: italic !important;
            font-weight: 400 !important;
            letter-spacing: -1px !important;
            color: #0f172a !important;
            display: block !important;
            margin-bottom: -10px !important;
        }

        .hero-sub {
            font-size: 18px !important;
            color: #64748b !important;
            line-height: 1.6 !important;
            margin-bottom: 48px !important;
            max-width: 600px !important;
            margin-left: auto !important;
            margin-right: auto !important;
        }

        .hero-actions {
            display: flex !important;
            gap: 16px !important;
            justify-content: center !important;
            margin-bottom: 60px !important;
        }

        .btn-ghost {
            background: #ffffff !important;
            color: #1e293b !important;
            border: 1px solid #f1f5f9 !important;
            border-radius: 99px !important;
            padding: 14px 28px !important;
            font-size: 15px !important;
            font-weight: 600 !important;
            cursor: pointer !important;
            transition: all 0.2s ease !important;
            display: inline-flex;
            align-items: center !important;
            gap: 10px !important;
            box-shadow: 0 1px 2px rgba(0,0,0,0.05) !important;
        }

        /* Force-hide these nav buttons until JS removes this class */
        #returnToReportBtn.btn-nav-hidden,
        #scanNewProjectBtn.btn-nav-hidden {
            display: none !important;
        }

        .btn-ghost:hover {
            background: #f8fafc !important;
            border-color: #e2e8f0 !important;
            transform: translateY(-1px) !important;
        }

        .gradient-text {
            background: linear-gradient(135deg, var(--accent) 0%, #a855f7 100%) !important;
            -webkit-background-clip: text !important;
            -webkit-text-fill-color: transparent !important;
            background-clip: text !important;
            display: inline-block;
            font-weight: 800 !important;
        }

        .keyword-underline-wrapper {
            position: relative;
            display: inline-block;
            z-index: 10;
        }

        .keyword-underline-wrapper::after {
            content: "";
            position: absolute;
            left: -5%;
            width: 110%;
            bottom: -6px;
            height: 14px;
            background-image: url("data:image/svg+xml,%3Csvg width='164' height='12' viewBox='0 0 164 12' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M2 9.5C30.5 5 75.5 2 162 4' stroke='%23ff6e20' stroke-width='5' stroke-linecap='round'/%3E%3C/svg%3E");
            background-size: 100% 100%;
            background-repeat: no-repeat;
            z-index: -1;
            pointer-events: none;
            opacity: 0.95;
            transform: translateY(2px);
        }

        .gradient-text-code {
            background: linear-gradient(135deg, #c45aca 0%, #a855f7 100%) !important;
            -webkit-background-clip: text !important;
            -webkit-text-fill-color: transparent !important;
            background-clip: text !important;
            display: inline-block;
            font-weight: 800 !important;
        }
        
        .highlight {
            color: var(--accent) !important;
            font-weight: 800 !important;
            padding: 0 !important;
            background: none !important;
            border: none !important;
            box-shadow: none !important;
            display: inline-block;
        }

        /* Premium Section Styling */
        .section {
            padding: 100px 40px !important;
            max-width: 1440px !important;
            margin: 0 auto !important;
        }

        .section-eyebrow {
            font-size: 14px !important;
            font-weight: 600 !important;
            color: var(--accent) !important;
            text-transform: uppercase !important;
            letter-spacing: 1.5px !important;
            margin-bottom: 20px !important;
            text-align: center !important;
        }

        .section-title {
            font-size: 56px !important;
            font-weight: 800 !important;
            line-height: 1.1 !important;
            color: var(--text) !important;
            margin-bottom: 24px !important;
            text-align: center !important;
        }

        .section-sub {
            font-size: 20px !important;
            color: var(--text-secondary) !important;
            line-height: 1.6 !important;
            text-align: center !important;
            max-width: 650px !important;
            margin: 0 auto 80px !important;
        }

        /* Features Section Enhancements */
        .features-grid {
            display: grid !important;
            grid-template-columns: repeat(3, 1fr) !important;
            gap: 20px !important;
            margin: 0 auto !important;
            max-width: 1100px !important;
        }

        .feat-card {
            position: relative !important;
            border-radius: 16px !important;
            border: 1px solid #f1f5f9 !important;
            background: #ffffff !important;
            padding: 32px 20px 24px !important;
            box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02), 0 2px 4px -2px rgba(0,0,0,0.02) !important;
            transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1) !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            text-align: center !important;
            min-height: 220px !important;
        }

        .feat-card:hover {
            transform: translateY(-5px) !important;
            box-shadow: 0 12px 24px rgba(0,0,0,0.04) !important;
            border-color: #e2e8f0 !important;
        }

        .feat-icon-top-row {
            width: 100% !important;
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            margin-bottom: 24px !important;
            position: absolute !important;
            top: 20px !important;
            left: 0 !important;
            padding: 0 20px !important;
        }

        .feat-card .feat-icon {
            width: 32px !important;
            height: 32px !important;
            background: rgba(0,0,0,0.02) !important;
            border-radius: 10px !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            font-size: 16px !important;
            transition: all 0.3s ease !important;
        }

        .feat-card:hover .feat-icon {
            transform: scale(1.05) !important;
        }

        .feat-card .feat-title {
            font-size: 16px !important;
            font-weight: 700 !important;
            color: #1e293b !important;
            margin: 16px 0 10px !important;
        }

        .feat-card .feat-text {
            font-size: 13px !important;
            color: #475569 !important;
            line-height: 1.5 !important;
            max-width: 100% !important;
        }

        .feat-tag {
            background: rgba(0,0,0,0.04) !important;
            color: #475569 !important;
            padding: 4px 12px !important;
            border-radius: 100px !important;
            font-size: 10px !important;
            font-weight: 700 !important;
            text-transform: uppercase !important;
            letter-spacing: 0.8px !important;
            white-space: nowrap !important;
        }

        /* Coverage Section Refinements */
        .coverage-grid {
            display: grid !important;
            grid-template-columns: repeat(3, 1fr) !important;
            gap: 20px !important;
            max-width: 1100px !important;
            margin: 0 auto !important;
        }

        .coverage-tier {
            border-radius: 16px !important;
            border: 1px solid #f1f5f9 !important;
            background: #ffffff !important;
            padding: 24px !important;
            box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02) !important;
            transition: all 0.3s ease !important;
        }

        .coverage-tier:hover {
            transform: translateY(-3px) !important;
            box-shadow: 0 10px 20px rgba(0,0,0,0.03) !important;
        }
        
        .coverage-tier .tier-label {
            margin-bottom: 20px !important;
            padding: 6px 12px !important;
            font-size: 11px !important;
            font-weight: 700 !important;
            border-radius: 8px !important;
            display: inline-block !important;
        }

        .coverage-tier .tier-label.p0 { background: rgba(239, 68, 68, 0.1) !important; color: #ef4444 !important; }
        .coverage-tier .tier-label.p1 { background: rgba(139, 92, 246, 0.1) !important; color: #8b5cf6 !important; }
        .coverage-tier .tier-label.p2 { background: rgba(59, 130, 246, 0.1) !important; color: #3b82f6 !important; }

        .coverage-list {
            list-style: none !important;
            padding: 0 !important;
            margin: 0 !important;
            display: flex !important;
            flex-direction: column !important;
            gap: 14px !important;
        }

        .coverage-list li {
            font-size: 13px !important;
            color: #64748b !important;
            line-height: 1.4 !important;
        }

        .coverage-list li strong {
            display: block !important;
            color: #1e293b !important;
            font-size: 14px !important;
            margin-bottom: 2px !important;
        }

        /* Premium Built-for Section (Mockup Match) */
        .built-for {
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            flex-wrap: wrap !important;
            gap: 16px !important;
            margin-top: 60px !important;
        }

        .built-for-label {
            text-transform: uppercase !important;
            letter-spacing: 1.2px !important;
            font-size: 12px !important;
            color: #64748b !important;
            font-weight: 600 !important;
            margin-right: 12px !important;
        }

        .tool-badge {
            display: inline-flex !important;
            align-items: center !important;
            gap: 12px !important;
            padding: 14px 28px !important;
            background: #ffffff !important;
            border: 1px solid #f1f5f9 !important;
            border-radius: 20px !important;
            color: #1e293b !important;
            font-size: 16px !important;
            font-weight: 600 !important;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
            box-shadow: 0 4px 12px rgba(0,0,0,0.03) !important;
        }

        .tool-badge:hover {
            transform: translateY(-2px) !important;
            border-color: var(--accent) !important;
            background: #ffffff !important;
            box-shadow: 0 10px 20px rgba(0,0,0,0.04) !important;
        }

        .tool-badge svg {
            width: 20px !important;
            height: 20px !important;
            transition: transform 0.3s ease !important;
        }

        .tool-badge:hover svg {
            transform: scale(1.1) !important;
        }

        /* Premium Footer */
        .footer {
            background: var(--bg-secondary) !important;
            border-top: 1px solid var(--border) !important;
            padding: 60px 40px !important;
            text-align: center !important;
        }

        /* ── RESPONSIVE DESIGN (Mobile Fixes) ── */
        @media (max-width: 900px) {
            .section-title { font-size: 42px !important; }
            .features-grid, .coverage-grid { 
                grid-template-columns: repeat(2, 1fr) !important; 
                gap: 16px !important;
            }
        }

        @media (max-width: 640px) {
            .section { padding: 60px 20px !important; }
            .section-title { font-size: 32px !important; }
            .section-sub { font-size: 16px !important; margin-bottom: 40px !important; }
            
            .features-grid, .coverage-grid { 
                grid-template-columns: 1fr !important; 
                padding: 0 10px !important;
            }
            
            .feat-card { min-height: auto !important; padding: 40px 20px 24px !important; }
            
            .nav { 
                padding: 0 12px !important; 
                width: 100% !important; 
                max-width: 100% !important;
                top: 0 !important; 
                border-radius: 0 !important;
                height: 60px !important;
                left: 0 !important;
                right: 0 !important;
                margin: 0 !important;
                justify-content: space-between !important;
                position: fixed !important;
            }
            .nav-logo { 
                font-size: 16px !important; 
                gap: 6px !important; 
                flex-shrink: 1 !important; 
                min-width: 0 !important;
                overflow: hidden !important;
                text-overflow: ellipsis !important;
                white-space: nowrap !important;
            }
            .logo-img { width: 20px !important; height: 20px !important; flex-shrink: 0 !important; }
            .nav-links { display: none !important; }
            .nav-actions { 
                gap: 6px !important; 
                flex-shrink: 0 !important; 
                display: flex !important;
                align-items: center !important;
            }
            .nav-cta { 
                padding: 7px 12px !important; 
                font-size: 11px !important; 
                white-space: nowrap !important; 
                border-radius: 50px !important;
                flex-shrink: 0 !important;
            }
            .nav-signup-btn { 
                padding: 6px 10px !important; 
                font-size: 10px !important; 
                white-space: nowrap !important;
                display: block !important;
                flex-shrink: 0 !important;
            }
            
            @media (max-width: 360px) {
                .nav-signup-btn { display: none !important; } /* Hide Sign In on extremely small screens */
                .nav-logo { font-size: 14px !important; }
            }
            
            .hero-badge { font-size: 11px !important; padding: 6px 12px !important; }
            .hero-title { font-size: 40px !important; }
            .hero-sub { font-size: 16px !important; }
            
            /* Input Screen Mobile Fixes */
            .input-screen-inner {
                display: flex !important;
                flex-direction: column !important;
                padding: 100px 20px 40px 20px !important;
                gap: 40px !important;
                align-items: center !important;
            }
            .inp-col-left, .inp-col-right {
                width: 100% !important;
                max-width: 100% !important;
                align-items: center !important;
                text-align: center !important;
            }
            .inp-col-right {
                align-items: center !important;
            }
            .inp-title {
                font-size: 40px !important;
                margin-bottom: 20px !important;
                text-align: center !important;
            }
            .inp-sub {
                font-size: 16px !important;
                margin-bottom: 32px !important;
                text-align: center !important;
                margin-left: auto !important;
                margin-right: auto !important;
            }
            .inp-biz-row {
                justify-content: center !important;
            }
            
            /* Scanner Nav Mobile Fixes */
            .scanner-nav {
                padding: 12px 16px !important;
            }
            .scanner-nav-inner {
                width: 100% !important;
            }
            .nav-back-btn {
                padding: 8px 14px !important;
                font-size: 12px !important;
            }
            #returnToReportBtn, #scanNewProjectBtn {
                padding: 8px 12px !important;
                font-size: 11px !important;
            }

            /* Fix terminal demo scale */
            .terminal-demo { 
                transform: scale(0.9) !important; 
                margin: 0 -20px !important;
            }
            
            .tool-badge { padding: 10px 20px !important; font-size: 14px !important; }
        }

        .footer-logo {
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            gap: 12px !important;
            font-size: 20px !important;
            font-weight: 700 !important;
            color: var(--text) !important;
            margin-bottom: 16px !important;
        }

        .footer-copy {
            color: var(--text-secondary) !important;
            font-size: 14px !important;
            margin-bottom: 24px !important;
        }

        .footer-links {
            display: flex !important;
            justify-content: center !important;
            gap: 32px !important;
        }

        .footer-links a {
            color: var(--text-secondary) !important;
            text-decoration: none !important;
            font-size: 14px !important;
            font-weight: 500 !important;
            transition: color 0.2s ease !important;
        }

        .footer-links a:hover {
            color: var(--text) !important;
        }

        /* Dashboard and app screens style unification */
        #appView, #inputScreen {
            background: var(--bg-secondary) !important;
            color: var(--text) !important;
            padding-top: 120px !important;
        }
        #dashScreen {
            background: var(--bg-secondary) !important;
            color: var(--text) !important;
            padding-top: 0 !important;
        }

        #landingView {
            background: var(--bg-secondary) !important;
            color: var(--text) !important;
            padding-top: 0 !important;
        }

        .dash-screen {
            padding: 0 !important;
            min-height: 100vh !important;
            background: var(--bg) !important;
        }

        .input-screen {
            padding-top: 0 !important;
        }

      `}} />

      {/* Load the original plain CSS files from public/security */}
      <link rel="stylesheet" href="/security/styles.css" />
      <link rel="stylesheet" href="/security/_new_screens.css" />
      {/* Scoping patch: re-applies body-level resets to #security-root */}
      <link rel="stylesheet" href="/security/security-scope.css" />

      {/* Supabase JS Client */}
      <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
      <script dangerouslySetInnerHTML={{
        __html: `
        window.SUPABASE_URL = '${process.env.NEXT_PUBLIC_SUPABASE_URL}';
        window.SUPABASE_ANON_KEY = '${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}';
        try {
          const keys = Object.keys(window.localStorage);
          const hasAuth = keys.some(k => k.startsWith('sb-') && k.endsWith('-auth-token') && JSON.parse(window.localStorage.getItem(k))?.access_token);
          if (hasAuth) document.documentElement.classList.add('hide-signup');
        } catch(e) {}
      `}} />

      {/* ───────────────────────────────────────
          SECURITY ROOT — all content lives here
          so CSS vars are scoped away from root
      ─────────────────────────────────────── */}
      <div id="security-root">
        {/* ─── REMOVED 3D BACKGROUND ELEMENTS ─── */}


        {/* AUTH MODAL */}
        <div id="authModal" className="auth-modal">
          <div className="auth-overlay" onClick={() => (window as any).hideAuthModal?.()}></div>
          <div className="auth-content">
            <button className="auth-close" onClick={() => (window as any).hideAuthModal?.()}>&#10005;</button>

            <div className="auth-hdr">
              <div className="auth-logo">
                <img src="/logo.png" alt="CodeSafe" className="logo-img" />
                CodeSafe
              </div>
              <h2 className="auth-title" id="authTitle">Create your account</h2>
              <p className="auth-sub" id="authSub">Join 2,000+ developers securing their AI code in seconds.</p>
            </div>

            <div className="auth-body">
              <button className="auth-google-btn" onClick={() => (window as any).handleGoogleAuth?.()}>
                <svg width="20" height="20" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Continue with Google
              </button>

              <div className="auth-divider">
                <span>OR</span>
              </div>

              <div className="auth-form">
                <div className="auth-input-group">
                  <label>Email Address</label>
                  <input type="email" placeholder="name@company.com" />
                </div>
                <div className="auth-input-group">
                  <label>Password</label>
                  <input type="password" placeholder="••••••••" />
                </div>
                <button className="auth-submit-btn" id="authSubmitBtn" onClick={() => (window as any).handleEmailAuth?.()}>
                  Create Account
                </button>
              </div>

              <p className="auth-footer" id="authFooter">
                Already have an account? <a href="#" onClick={(e) => { e.preventDefault(); (window as any).toggleAuthMode?.(); }}>Sign in</a>
              </p>
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════
          SHARED NAV
      ═══════════════════════════════ */}
        <nav className="nav">
          <a className="nav-logo" onClick={() => (window as any).showLanding?.()}>
            <img src="/logo.png" alt="CodeSafe" className="logo-img" />
            CodeSafe
          </a>
          <ul className="nav-links">
            <li><a href="#features">Features</a></li>
            <li><a href="#agents">Agents</a></li>
            <li><a href="#how">How it works</a></li>
            <li><a href="#pricing">Pricing</a></li>
          </ul>
          <div className="nav-actions">
            <button className="nav-link nav-signup-btn" onClick={() => (window as any).showAuthModal?.('signin')}>Sign In</button>
            <button className="nav-cta" onClick={() => (window as any).handleStartScan?.()}>Scan My Code →</button>
          </div>
        </nav>

        {/* ═══════════════════════════════
          LANDING PAGE
      ═══════════════════════════════ */}
        <div id="landingView">
          <div className="landing">

            {/* HERO */}
            <section className="hero">
              <div className="hero-badge">
                <span style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '12px', height: '12px', marginRight: '6px' }}>
                  <span style={{ position: 'absolute', width: '100%', height: '100%', backgroundColor: 'currentColor', borderRadius: '50%', animation: 'badgePulse 2s cubic-bezier(0, 0, 0.2, 1) infinite' }}></span>
                  <span style={{ position: 'relative', display: 'inline-block', width: '6px', height: '6px', backgroundColor: 'currentColor', borderRadius: '50%' }}></span>
                  <style dangerouslySetInnerHTML={{
                    __html: `
                    @keyframes badgePulse {
                      0% { transform: scale(0.8); opacity: 0.8; }
                      100% { transform: scale(2.4); opacity: 0; }
                    }
                  `}} />
                </span>
                Free trial available
              </div>
              <h1>
                <span className="serif">Secure Your</span>
                <span className="gradient-text">AI-Generated</span>{' '}
                <span className="keyword-underline-wrapper">
                  <span className="gradient-text-code">Code</span>
                </span>
              </h1>
              <p className="hero-sub reveal-on-scroll">Professional security scanning for modern development teams. Get comprehensive vulnerability reports with actionable fixes in under 30 seconds.</p>
              <div className="hero-actions reveal-on-scroll" style={{ transitionDelay: '0.1s' }}>
                <button className="btn-primary" onClick={() => (window as any).handleStartScan?.()}>
                  Start Your Trial
                </button>
                <button className="btn-ghost"
                  onClick={() => document.getElementById('how')?.scrollIntoView({ behavior: 'smooth' })}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ color: '#64748b' }}>
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                    <path d="M10 8L16 12L10 16V8Z" fill="currentColor" />
                  </svg>
                  How it works
                </button>
              </div>
              <div className="built-for reveal-on-scroll" style={{ transitionDelay: '0.2s' }}>
                <span className="built-for-label">TRUSTED BY TEAMS USING</span>

                <div className="tool-badge">
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                      <linearGradient id="lovG_final" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#FF6B00" />
                        <stop offset="30%" stopColor="#FF0080" />
                        <stop offset="60%" stopColor="#7000FF" />
                        <stop offset="100%" stopColor="#0066FF" />
                      </linearGradient>
                    </defs>
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="url(#lovG_final)" />
                  </svg>
                  Lovable
                </div>

                <div className="tool-badge">
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="12" r="10" fill="#000" />
                    <text x="50%" y="55%" dominantBaseline="middle" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="900" fontStyle="italic" fontSize="12" fill="white">b</text>
                  </svg>
                  Bolt
                </div>

                <div className="tool-badge">
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 2l8.66 5v10L12 22l-8.66-5V7L12 2z" fill="#000" />
                    <path d="M16 12l-7 4.5V7.5L16 12z" fill="#fff" />
                  </svg>
                  Cursor
                </div>

                <div className="tool-badge">
                  <img
                    src="/antigravity-icon.png"
                    alt="Antigravity"
                    style={{ width: '20px', height: '20px', objectFit: 'cover', borderRadius: '4px' }}
                  />
                  Antigravity
                </div>

                <div className="tool-badge">
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="5" y="4" width="6" height="6" rx="1.5" fill="#F26622" />
                    <rect x="5" y="14" width="6" height="6" rx="1.5" fill="#F26622" />
                    <rect x="13" y="9" width="6" height="6" rx="1.5" fill="#F26622" />
                  </svg>
                  Replit
                </div>
              </div>
            </section>

            {/* PROBLEM */}
            <section className="section">
              <div className="section-eyebrow reveal-on-scroll">The Challenge</div>
              <h2 className="section-title reveal-on-scroll">AI Development Creates<br />Hidden Security Risks</h2>
              <p className="section-sub reveal-on-scroll">While AI tools accelerate development, they often generate code with predictable security vulnerabilities that attackers actively exploit.</p>
              <div className="problem-grid">
                <div className="problem-card reveal-on-scroll" style={{ transitionDelay: '0s' }}>
                  <div className="problem-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"
                      fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
                      strokeLinejoin="round" className="icon-anim-float" style={{ color: 'var(--error)' }}>
                      <rect width="16" height="12" x="4" y="8" rx="2" />
                      <path d="M2 14h2" /><path d="M20 14h2" /><path d="M15 13v2" />
                      <path d="M9 13v2" /><path d="M12 8V4" /><path d="M12 4h4" />
                    </svg>
                  </div>
                  <div className="problem-title">Predictable AI Patterns</div>
                  <div className="problem-text">Popular AI coding tools generate code with the same security blind spots. Attackers scan GitHub repositories for these patterns within minutes of deployment.</div>
                </div>
                <div className="problem-card reveal-on-scroll" style={{ transitionDelay: '0.1s' }}>
                  <div className="problem-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"
                      fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
                      strokeLinejoin="round" className="icon-anim-shake" style={{ color: 'var(--warning)' }}>
                      <path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4" />
                      <path d="m21 2-9.6 9.6" /><circle cx="7.5" cy="15.5" r="5.5" />
                    </svg>
                  </div>
                  <div className="problem-title">Accidental Exposure</div>
                  <div className="problem-text">API keys, database credentials, and sensitive tokens frequently end up in code during rapid development cycles. A single exposed key can compromise entire systems.</div>
                </div>
                <div className="problem-card reveal-on-scroll" style={{ transitionDelay: '0.2s' }}>
                  <div className="problem-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"
                      fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
                      strokeLinejoin="round" className="icon-anim-pulse" style={{ color: 'var(--text-secondary)' }}>
                      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
                    </svg>
                  </div>
                  <div className="problem-title">Complex Security Tools</div>
                  <div className="problem-text">Traditional security scanners like Snyk and SonarQube require deep technical expertise to configure and interpret. Founders need simple, actionable insights.</div>
                </div>
              </div>
            </section>

            {/* ══════════════════════════════
              AGENTS SECTION
            ══════════════════════════════ */}
            <style dangerouslySetInnerHTML={{
              __html: `
              /* ── Scroll-reveal base ── */
              .reveal-on-scroll {
                opacity: 0;
                transform: translateY(32px);
                transition: opacity 0.65s cubic-bezier(0.22,1,0.36,1), transform 0.65s cubic-bezier(0.22,1,0.36,1);
              }
              .reveal-on-scroll.is-visible {
                opacity: 1;
                transform: translateY(0);
              }

              /* ── inp-footer position ── */
              .inp-footer {
                position: absolute !important;
                bottom: 32px !important;
                left: 48px !important;
                right: 48px !important;
                display: flex !important;
                justify-content: space-between !important;
                align-items: flex-end !important;
                z-index: 5 !important;
              }
              #inpAccountWidget {
                position: relative;
              }

              /* ── Agents section ── */
              .agents-section {
                padding: 120px 40px;
                max-width: 1440px;
                margin: 0 auto;
                position: relative;
              }
              .agents-header {
                text-align: center;
                margin-bottom: 72px;
              }
              .agents-grid {
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                gap: 20px;
              }
              @media (max-width: 900px) { .agents-grid { grid-template-columns: 1fr 1fr; } }
              @media (max-width: 600px) { .agents-grid { grid-template-columns: 1fr; } }

              .agent-card {
                background: #ffffff;
                border: 1px solid rgba(15,23,42,0.07);
                border-radius: 20px;
                padding: 28px 24px;
                transition: all 0.35s cubic-bezier(0.22,1,0.36,1);
                position: relative;
                overflow: hidden;
              }
              .inp-biz-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 18px;
          border-radius: 99px;
          border: 1.5px solid #e2e8f0;
          background: #f8fafc;
          font-size: 13px;
          font-weight: 700;
          color: #475569;
          cursor: pointer;
          transition: all 0.2s;
        }
        /* ── Scan-type mismatch warning ── */
        #scanTypeWarn {
          display: none;
          align-items: flex-start;
          gap: 12px;
          margin-top: 12px;
          padding: 14px 16px;
          border-radius: 14px;
          background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%);
          border: 1.5px solid #fcd34d;
          box-shadow: 0 4px 16px rgba(251,191,36,0.15);
          animation: warnSlideIn 0.3s cubic-bezier(0.34,1.56,0.64,1) both;
        }
        @keyframes warnSlideIn {
          from { opacity: 0; transform: translateY(-8px) scale(0.97); }
          to   { opacity: 1; transform: none; }
        }
        #scanTypeWarn .warn-ico {
          font-size: 20px;
          flex-shrink: 0;
          margin-top: 1px;
        }
        #scanTypeWarn .warn-body { flex: 1; min-width: 0; }
        #scanTypeWarn .warn-title {
          font-size: 13px;
          font-weight: 800;
          color: #92400e;
          margin-bottom: 3px;
        }
        #scanTypeWarn .warn-msg {
          font-size: 12px;
          color: #a16207;
          font-weight: 500;
          line-height: 1.5;
        }
        #scanTypeWarn .warn-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 8px;
        }
        #scanTypeWarn .warn-switch-btn {
          font-size: 11.5px;
          font-weight: 700;
          color: #92400e;
          background: rgba(146,64,14,0.1);
          border: 1px solid rgba(146,64,14,0.2);
          border-radius: 99px;
          padding: 4px 12px;
          cursor: pointer;
          transition: all 0.15s;
        }
        #scanTypeWarn .warn-switch-btn:hover {
          background: rgba(146,64,14,0.18);
        }
        #scanTypeWarn .warn-dismiss {
          font-size: 11px;
          color: #b45309;
          background: none;
          border: none;
          cursor: pointer;
          padding: 4px 6px;
          border-radius: 6px;
          font-weight: 600;
          opacity: 0.7;
          transition: opacity 0.15s;
        }
        #scanTypeWarn .warn-dismiss:hover { opacity: 1; }
        #scanTypeWarn .warn-close {
          flex-shrink: 0;
          background: none;
          border: none;
          color: #b45309;
          cursor: pointer;
          font-size: 16px;
          padding: 2px 4px;
          border-radius: 6px;
          opacity: 0.5;
          transition: opacity 0.15s;
          margin-top: -2px;
        }
        #scanTypeWarn .warn-close:hover { opacity: 1; }
              .agent-card::before {
                content: '';
                position: absolute;
                inset: 0;
                background: linear-gradient(135deg, transparent 60%, rgba(255,110,32,0.04) 100%);
                pointer-events: none;
              }
              .agent-card:hover {
                transform: translateY(-4px);
                box-shadow: 0 20px 48px rgba(0,0,0,0.08);
                border-color: rgba(255,110,32,0.2);
              }
              .agent-card-tag {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                font-size: 10px;
                font-weight: 800;
                letter-spacing: 0.1em;
                text-transform: uppercase;
                color: var(--accent);
                background: rgba(255,110,32,0.07);
                padding: 4px 10px;
                border-radius: 20px;
                margin-bottom: 16px;
                border: 1px solid rgba(255,110,32,0.12);
              }
              .agent-card-icon {
                width: 48px;
                height: 48px;
                border-radius: 14px;
                display: flex;
                align-items: center;
                justify-content: center;
                margin-bottom: 16px;
                font-size: 22px;
              }
              .agent-card-title {
                font-size: 17px;
                font-weight: 800;
                color: #0f172a;
                margin-bottom: 8px;
                line-height: 1.2;
              }
              .agent-card-desc {
                font-size: 13.5px;
                color: #64748b;
                line-height: 1.6;
                margin-bottom: 16px;
              }
              .agent-issues {
                display: flex;
                flex-direction: column;
                gap: 6px;
              }
              .agent-issue {
                display: flex;
                align-items: flex-start;
                gap: 8px;
                font-size: 12px;
                color: #475569;
                font-weight: 500;
              }
              .agent-issue-dot {
                width: 6px;
                height: 6px;
                border-radius: 50%;
                flex-shrink: 0;
                margin-top: 4px;
              }
              .agents-terminal {
                margin-top: 64px;
                background: #0d1117;
                border-radius: 20px;
                overflow: hidden;
                border: 1px solid rgba(255,255,255,0.06);
                box-shadow: 0 32px 80px rgba(0,0,0,0.2);
              }
              .agents-term-bar {
                background: #161b22;
                padding: 12px 20px;
                display: flex;
                align-items: center;
                gap: 8px;
                border-bottom: 1px solid rgba(255,255,255,0.06);
              }
              .agents-term-dot { width:10px; height:10px; border-radius:50%; }
              .agents-term-title {
                font-family: 'Space Mono', monospace;
                font-size: 11px;
                color: rgba(255,255,255,0.4);
                margin-left: 8px;
              }
              .agents-term-body {
                padding: 24px;
                font-family: 'Space Mono', monospace;
                font-size: 12px;
                line-height: 1.8;
              }
              .alog-sys   { color: #565f89; }
              .alog-task  { color: #7aa2f7; }
              .alog-warn  { color: #e0af68; }
              .alog-ok    { color: #9ece6a; }
              .alog-ts    { color: #414868; margin-right: 8px; }
              .alog-agent { color: #bb9af7; font-weight: 700; }
            `}} />

            <section className="agents-section" id="agents">
              <div className="agents-header">
                <div className="section-eyebrow reveal-on-scroll">Under the Hood</div>
                <h2 className="section-title reveal-on-scroll" style={{ marginBottom: 16 }}>
                  Six Specialist Agents.<br />
                  <span className="highlight">One Unified Report.</span>
                </h2>
                <p className="section-sub reveal-on-scroll" style={{ maxWidth: 580, margin: '0 auto' }}>
                  Each agent is a senior security specialist focused on a single attack surface — running in parallel to deliver deep, production-grade analysis in seconds.
                </p>
              </div>

              <div className="agents-grid">
                {/* Agent 1 — Knowledge Graph */}
                <div className="agent-card reveal-on-scroll" style={{ transitionDelay: '0s' }}>
                  <div className="agent-card-icon" style={{ background: 'rgba(122,162,247,0.1)', border: '1px solid rgba(122,162,247,0.2)' }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7aa2f7" strokeWidth="1.8" strokeLinecap="round">
                      <circle cx="12" cy="12" r="3" /><circle cx="4" cy="6" r="2" /><circle cx="20" cy="6" r="2" />
                      <circle cx="4" cy="18" r="2" /><circle cx="20" cy="18" r="2" />
                      <path d="M6 6l4 4M14 14l4 4M18 6l-4 4M6 18l4-4" />
                    </svg>
                  </div>
                  <div className="agent-card-tag">Task 1</div>
                  <div className="agent-card-title">Knowledge Graph Builder</div>
                  <div className="agent-card-desc">Maps your entire codebase into a dependency graph — understanding how data flows from request to database, auth checks to response handlers.</div>
                  <div className="agent-issues">
                    {['Detects taint propagation paths', 'Maps data flow across modules', 'Identifies trust boundary violations', 'Tracks third-party surface area'].map(i => (
                      <div key={i} className="agent-issue">
                        <div className="agent-issue-dot" style={{ background: '#7aa2f7' }} />
                        {i}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Agent 2 — File Routing */}
                <div className="agent-card reveal-on-scroll" style={{ transitionDelay: '0.07s' }}>
                  <div className="agent-card-icon" style={{ background: 'rgba(187,154,247,0.1)', border: '1px solid rgba(187,154,247,0.2)' }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#bb9af7" strokeWidth="1.8" strokeLinecap="round">
                      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
                    </svg>
                  </div>
                  <div className="agent-card-tag">Task 2</div>
                  <div className="agent-card-title">Intelligent File Routing</div>
                  <div className="agent-card-desc">Categorises every file by risk profile and routes it to the right specialist agent — ensuring no sensitive surface is ever skipped.</div>
                  <div className="agent-issues">
                    {['Prioritises high-risk entry points', 'Routes auth files to auth specialist', 'Identifies hidden config exposure', 'Skips binary / non-code assets'].map(i => (
                      <div key={i} className="agent-issue">
                        <div className="agent-issue-dot" style={{ background: '#bb9af7' }} />
                        {i}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Agent 3 — Secrets */}
                <div className="agent-card reveal-on-scroll" style={{ transitionDelay: '0.14s' }}>
                  <div className="agent-card-icon" style={{ background: 'rgba(224,175,104,0.1)', border: '1px solid rgba(224,175,104,0.2)' }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#e0af68" strokeWidth="1.8" strokeLinecap="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  </div>
                  <div className="agent-card-tag">Task 3</div>
                  <div className="agent-card-title">Secret &amp; Key Detection</div>
                  <div className="agent-card-desc">Scans every file for hardcoded credentials, exposed API keys, and leaked tokens — including inside build artifacts and config files.</div>
                  <div className="agent-issues">
                    {['AWS / GCP / Azure key exposure', 'Supabase anon keys in frontend', 'Hardcoded DB connection strings', 'Private keys committed to git'].map(i => (
                      <div key={i} className="agent-issue">
                        <div className="agent-issue-dot" style={{ background: '#e0af68' }} />
                        {i}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Agent 4 — Auth */}
                <div className="agent-card reveal-on-scroll" style={{ transitionDelay: '0.21s' }}>
                  <div className="agent-card-icon" style={{ background: 'rgba(252,107,104,0.1)', border: '1px solid rgba(252,107,104,0.2)' }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f7768e" strokeWidth="1.8" strokeLinecap="round">
                      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
                    </svg>
                  </div>
                  <div className="agent-card-tag">Task 4</div>
                  <div className="agent-card-title">Auth &amp; Access Control Scan</div>
                  <div className="agent-card-desc">Audits every authentication and authorization layer — from JWT validation to RLS policies to middleware chains — for exploitable logic flaws.</div>
                  <div className="agent-issues">
                    {['Missing Row-Level Security policies', 'Broken object-level authorisation', 'JWT algorithm confusion attacks', 'Auth bypass via parameter pollution'].map(i => (
                      <div key={i} className="agent-issue">
                        <div className="agent-issue-dot" style={{ background: '#f7768e' }} />
                        {i}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Agent 5 — Injection */}
                <div className="agent-card reveal-on-scroll" style={{ transitionDelay: '0.28s' }}>
                  <div className="agent-card-icon" style={{ background: 'rgba(115,218,202,0.1)', border: '1px solid rgba(115,218,202,0.2)' }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#73daca" strokeWidth="1.8" strokeLinecap="round">
                      <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
                    </svg>
                  </div>
                  <div className="agent-card-tag">Task 5</div>
                  <div className="agent-card-title">Injection &amp; Attack Surface</div>
                  <div className="agent-card-desc">Probes every input pathway for injection vulnerabilities — SQL, XSS, SSRF, command injection, and AI-specific prompt injection vectors.</div>
                  <div className="agent-issues">
                    {['SQL injection via unsanitised inputs', 'Stored XSS in user-generated content', 'SSRF through open redirect chains', 'Prompt injection in AI integrations'].map(i => (
                      <div key={i} className="agent-issue">
                        <div className="agent-issue-dot" style={{ background: '#73daca' }} />
                        {i}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Agent 6 — Supply Chain */}
                <div className="agent-card reveal-on-scroll" style={{ transitionDelay: '0.35s' }}>
                  <div className="agent-card-icon" style={{ background: 'rgba(158,206,106,0.1)', border: '1px solid rgba(158,206,106,0.2)' }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#9ece6a" strokeWidth="1.8" strokeLinecap="round">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
                    </svg>
                  </div>
                  <div className="agent-card-tag">Task 6</div>
                  <div className="agent-card-title">Supply Chain &amp; Dependencies</div>
                  <div className="agent-card-desc">Cross-references every npm, pip, and composer dependency against known CVE databases and flags transitive vulnerabilities in your dependency tree.</div>
                  <div className="agent-issues">
                    {['Known CVEs in direct dependencies', 'Typosquatted package detection', 'Outdated packages with exploits', 'Malicious transitive dependencies'].map(i => (
                      <div key={i} className="agent-issue">
                        <div className="agent-issue-dot" style={{ background: '#9ece6a' }} />
                        {i}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Terminal demo */}
              <div className="agents-terminal reveal-on-scroll" style={{ transitionDelay: '0.2s' }}>
                <div className="agents-term-bar">
                  <div className="agents-term-dot" style={{ background: '#ff5f57' }} />
                  <div className="agents-term-dot" style={{ background: '#febc2e' }} />
                  <div className="agents-term-dot" style={{ background: '#28c840' }} />
                  <div className="agents-term-title">codesafe — agent pipeline — running 6 workers</div>
                </div>
                <div className="agents-term-body">
                  <div><span className="alog-ts">[00:00.000]</span><span className="alog-sys">System.Connect: Pipeline initialised — TLS 1.3 handshake complete</span></div>
                  <div><span className="alog-ts">[00:00.142]</span><span className="alog-agent">Analyzer  </span><span className="alog-task"> ── Building knowledge graph across 247 source files</span></div>
                  <div><span className="alog-ts">[00:02.811]</span><span className="alog-agent">Filtering </span><span className="alog-task"> ── Routing files to specialist workers by risk profile</span></div>
                  <div><span className="alog-ts">[00:05.024]</span><span className="alog-agent">Security  </span><span className="alog-warn"> ── WARNING: Supabase anon key exposed in /src/lib/client.ts:14</span></div>
                  <div><span className="alog-ts">[00:05.893]</span><span className="alog-agent">Backend   </span><span className="alog-warn"> ── WARNING: Missing RLS policy on `user_payments` table</span></div>
                  <div><span className="alog-ts">[00:09.310]</span><span className="alog-agent">Injection </span><span className="alog-warn"> ── WARNING: SQL injection risk in /api/search/route.ts:88</span></div>
                  <div><span className="alog-ts">[00:24.100]</span><span className="alog-agent">Reporter  </span><span className="alog-task"> ── Aggregating findings — generating plain English report</span></div>
                  <div><span className="alog-ts">[00:26.441]</span><span className="alog-ok">✓ Scan complete — 3 critical, 5 high, 8 medium issues found. Report ready.</span></div>
                </div>
              </div>
            </section>
            <section className="how-section" id="how">
              <div className="how-inner">
                <div className="section-eyebrow reveal-on-scroll">How It Works</div>
                <h2 className="section-title reveal-on-scroll">Professional Security<br />Analysis in 3 Steps</h2>
                <div className="steps-row">
                  <div className="step-card reveal-on-scroll" style={{ transitionDelay: '0s' }}>
                    <div className="step-num">1</div>
                    <div className="step-title">Upload Your Codebase</div>
                    <div className="step-text">Drag and drop your entire project folder or connect your GitHub repository. Our scanner reads every file type including JavaScript, Python, PHP, configuration files, and environment variables.</div>
                  </div>
                  <div className="step-card reveal-on-scroll" style={{ transitionDelay: '0.1s' }}>
                    <div className="step-num">2</div>
                    <div className="step-title">AI-Powered Analysis</div>
                    <div className="step-text">AI analyzes your code like a senior security engineer, tracing data flows, identifying logic flaws, and detecting exposed secrets with contextual understanding.</div>
                  </div>
                  <div className="step-card reveal-on-scroll" style={{ transitionDelay: '0.2s' }}>
                    <div className="step-num">3</div>
                    <div className="step-title">Actionable Report</div>
                    <div className="step-text">Receive a comprehensive security report with prioritized vulnerabilities, business impact assessment, and ready-to-implement code fixes with step-by-step remediation guidance.</div>
                  </div>
                </div>
              </div>
            </section>

            {/* FEATURES */}
            <section className="section" id="features">
              <div className="section-eyebrow reveal-on-scroll">Why Choose CodeSafe</div>
              <h2 className="section-title reveal-on-scroll"><span className="highlight">Enterprise-Grade Security</span><br />Made Simple</h2>
              <div className="features-grid">
                <div className="feat-card reveal-on-scroll" style={{ transitionDelay: '0s' }}>
                  <div className="feat-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"
                      fill="none" className="icon-anim-pulse"
                      style={{ stroke: 'var(--success)', fill: 'var(--success-dim)' }} strokeWidth="1.5"
                      strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" />
                    </svg>
                  </div>
                  <div className="feat-title">Clear Security Score</div>
                  <div className="feat-text">Get an instant security score from 0-100 with clear deployment recommendations. No ambiguity about your application's security posture.</div>
                  <div className="feat-tag">Industry Standard</div>
                </div>
                <div className="feat-card reveal-on-scroll" style={{ transitionDelay: '0.1s' }}>
                  <div className="feat-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"
                      fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
                      strokeLinejoin="round" className="icon-anim-bounce" style={{ color: 'var(--accent)' }}>
                      <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
                    </svg>
                  </div>
                  <div className="feat-title">Interactive Report Chat</div>
                  <div className="feat-text">Ask questions about your vulnerabilities in plain English. Get detailed explanations, business impact assessments, and deployment guidance.</div>
                  <div className="feat-tag">AI-Powered</div>
                </div>
                <div className="feat-card reveal-on-scroll" style={{ transitionDelay: '0.2s' }}>
                  <div className="feat-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"
                      fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
                      strokeLinejoin="round" className="icon-anim-spin-slow" style={{ color: 'var(--primary)' }}>
                      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                    </svg>
                  </div>
                  <div className="feat-title">Automated Code Fixes</div>
                  <div className="feat-text">Every vulnerability includes production-ready code fixes. Copy and paste corrected implementations with confidence.</div>
                  <div className="feat-tag">Ready to Deploy</div>
                </div>
                <div className="feat-card reveal-on-scroll" style={{ transitionDelay: '0s' }}>
                  <div className="feat-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"
                      fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
                      strokeLinejoin="round" className="icon-anim-float" style={{ color: 'var(--text-secondary)' }}>
                      <rect width="16" height="20" x="4" y="2" rx="2" ry="2" />
                      <path d="M9 22v-4h6v4" /><path d="M8 6h.01" /><path d="M16 6h.01" />
                      <path d="M12 6h.01" /><path d="M12 10h.01" /><path d="M12 14h.01" />
                      <path d="M16 10h.01" /><path d="M16 14h.01" /><path d="M8 10h.01" /><path d="M8 14h.01" />
                    </svg>
                  </div>
                  <div className="feat-title">Business Context Aware</div>
                  <div className="feat-text">Security severity calibrated to your business type. Fintech vulnerabilities weighted differently than content platforms.</div>
                  <div className="feat-tag">Smart Analysis</div>
                </div>
                <div className="feat-card reveal-on-scroll" style={{ transitionDelay: '0.1s' }}>
                  <div className="feat-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"
                      fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
                      strokeLinejoin="round" className="icon-anim-spin" style={{ color: 'var(--error)' }}>
                      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                      <path d="M3 3v5h5" />
                      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                      <path d="M16 21v-5h5" />
                    </svg>
                  </div>
                  <div className="feat-title">Progress Tracking</div>
                  <div className="feat-text">Re-scan after fixes to track improvement. See exactly which vulnerabilities were resolved and monitor security trends.</div>
                  <div className="feat-tag">Insights</div>
                </div>

                <div className="feat-card reveal-on-scroll" style={{ transitionDelay: '0.2s' }}>
                  <div className="feat-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"
                      fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
                      strokeLinejoin="round" className="icon-anim-float" style={{ color: '#8b5cf6' }}>
                      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                    </svg>
                  </div>
                  <div className="feat-title">Deep Logic Tracing</div>
                  <div className="feat-text">Our AI traces data flows across your entire application architecture to identify complex business logic flaws and indirect permission leaks.</div>
                  <div className="feat-tag">Advanced Search</div>
                </div>

              </div>
            </section>

            {/* COVERAGE */}
            <section className="section" id="coverage">
              <div className="section-eyebrow reveal-on-scroll">Security Coverage</div>
              <h2 className="section-title reveal-on-scroll">We scan for 48+<br />security vulnerabilities</h2>
              <p className="section-sub reveal-on-scroll">From modern AI prompt injection to classic database exploits — we&apos;ve got you covered.</p>
              <div className="coverage-grid">
                <div className="coverage-tier reveal-on-scroll" style={{ transitionDelay: '0s' }}>
                  <div className="tier-label p0">🔴 P0 Critical</div>
                  <ul className="coverage-list">
                    <li><strong>Supply Chain Attacks</strong>Detect &quot;ghost&quot; or hijacked packages and insecure CI/CD triggers.</li>
                    <li><strong>Insecure Deserialization</strong>Detect unsafe pickle/unmarshal calls that allow remote code execution.</li>
                    <li><strong>SSRF Attacks</strong>Identify user-provided URLs targeting internal VPCs or AWS metadata.</li>
                    <li><strong>Supabase RLS</strong>Verify Row Level Security is active on every database table.</li>
                    <li><strong>Auth Middleware</strong>Find API routes or pages missing essential login requirements.</li>
                  </ul>
                </div>
                <div className="coverage-tier reveal-on-scroll" style={{ transitionDelay: '0.1s' }}>
                  <div className="tier-label p1">🟣 P1 High Risk</div>
                  <ul className="coverage-list">
                    <li><strong>AI Prompt Injection</strong>Find unsanitized input in prompts that could override instructions.</li>
                    <li><strong>Mass Assignment (BOLA)</strong>Detect direct DB updates that allow field-level privilege escalation.</li>
                    <li><strong>SQL &amp; XSS Injection</strong>Standard-issue protection for common database and browser attacks.</li>
                    <li><strong>IDOR Ownership</strong>Check if users can access objects they don&apos;t own by manipulating IDs.</li>
                    <li><strong>Session Security</strong>Verify Secure/HttpOnly cookies and proper JWT rotation.</li>
                  </ul>
                </div>
                <div className="coverage-tier reveal-on-scroll" style={{ transitionDelay: '0.2s' }}>
                  <div className="tier-label p2">🔵 P2 Medium Risk</div>
                  <ul className="coverage-list">
                    <li><strong>Schema Exposure</strong>Prevent internal DB table names from leaking in error messages.</li>
                    <li><strong>Weak Randomness</strong>Flag Math.random() usage for sensitive tasks like token generation.</li>
                    <li><strong>Race Conditions (TOCTOU)</strong>Detect logic flaws in financial or inventory steps.</li>
                    <li><strong>Permissive CORS</strong>Identify wildcard origins that expose your API to untrusted sites.</li>
                    <li><strong>Incident Logging Gaps</strong>Verify that failed login and admin actions are correctly logged.</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* PRICING */}
            <Pricing />

            {/* FAQ */}
            <section className="section" id="faq">
              <div className="section-eyebrow reveal-on-scroll">FAQ</div>
              <h2 className="section-title reveal-on-scroll">Questions answered.</h2>
              <div className="faq-list">
                <div className="faq-item reveal-on-scroll" style={{ transitionDelay: '0s' }}>
                  <button className="faq-q" onClick={(e) => (window as any).toggleFaq?.(e.currentTarget)}>
                    Is my code stored anywhere?
                    <span className="faq-icon">+</span>
                  </button>
                  <div className="faq-a">No. Your code never leaves your browser. CodeSafe reads files locally and
                    sends only the text content directly to the AI API for analysis. Nothing is stored on
                    any server. The API call is stateless — once the scan is done, nothing persists.</div>
                </div>
                <div className="faq-item reveal-on-scroll" style={{ transitionDelay: '0.1s' }}>
                  <button className="faq-q" onClick={(e) => (window as any).toggleFaq?.(e.currentTarget)}>
                    What languages and frameworks does it support?
                    <span className="faq-icon">+</span>
                  </button>
                  <div className="faq-a">CodeSafe supports 30+ file types including JavaScript, TypeScript, React,
                    Next.js, PHP, Python, Ruby, Go, SQL, YAML, .env files, Prisma schemas, and more. It
                    automatically skips node_modules, .git, and build folders to focus on your actual code.</div>
                </div>
                <div className="faq-item reveal-on-scroll" style={{ transitionDelay: '0.2s' }}>
                  <button className="faq-q" onClick={(e) => (window as any).toggleFaq?.(e.currentTarget)}>
                    How accurate is it? Will I get false positives?
                    <span className="faq-icon">+</span>
                  </button>
                  <div className="faq-a">CodeSafe uses AI which reads and reasons about your code rather than
                    matching patterns. This means it catches real logic flaws and business risks that rule-based
                    tools miss, with fewer false positives. That said, always review the suggestions — no
                    automated tool is perfect.</div>
                </div>
                <div className="faq-item reveal-on-scroll" style={{ transitionDelay: '0.3s' }}>
                  <button className="faq-q" onClick={(e) => (window as any).toggleFaq?.(e.currentTarget)}>
                    I&apos;m not technical — will I understand the report?
                    <span className="faq-icon">+</span>
                  </button>
                  <div className="faq-a">That&apos;s exactly who CodeSafe is built for. Every vulnerability is explained
                    with a real-world analogy (no CVE numbers, no CVSS scores). The &quot;how to fix it&quot; section
                    gives you numbered steps in plain English, plus the corrected code snippet you can hand to
                    your developer or paste directly.</div>
                </div>

              </div>
            </section>

            {/* CTA BANNER */}
            <div className="cta-banner reveal-on-scroll">
              <div className="cta-inner">
                <h2><span className="serif">Ready to Ship</span><br /><span className="cta-banner-gradient-text">Secure Code?</span></h2>
                <p>Professional security analysis for modern development teams. Start your free scan today.</p>
                <button className="btn-primary" onClick={() => (window as any).handleStartScan?.()}>Start Free Security Scan</button>
              </div>
            </div>

            {/* FOOTER */}
            <footer className="footer">
              <div className="footer-logo">
                <img src="/logo.png" alt="CodeSafe" className="logo-img" />
                CodeSafe
              </div>
              <div className="footer-copy">© 2026 CodeSafe. Enterprise-grade security, simplified.</div>
              <div className="footer-links">
                <a href="/legal#privacy">Privacy Policy</a>
                <a href="/legal#terms">Terms of Service</a>
                <a href="/legal#security">Security</a>
                <a href="mailto:support@codesafe.co.in">Contact</a>
              </div>
            </footer>
          </div>
        </div>

        {/* ═══════════════════════════════
          APP VIEW
      ═══════════════════════════════ */}
        <div id="appView">

          {/* SCREEN 1: INPUT */}
          <div id="inputScreen" className="input-screen">
            {/* ── TOP NAV BAR ── */}
            <nav style={{
              position: 'absolute', top: 0, left: 0, right: 0,
              padding: '32px 48px', display: 'flex',
              justifyContent: 'center', zIndex: 100
            }}>
              <div style={{ width: '100%', maxWidth: '1400px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button className="nav-back-btn" onClick={() => (window as any).showLanding?.()} style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 600, color: '#0f172a', cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', transition: 'all 0.2s ease' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6"></polyline>
                  </svg>
                  Back
                </button>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button id="returnToReportBtn" className={`btn-ghost ${!navBtnsVisible ? 'btn-nav-hidden' : ''}`} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '99px', padding: '10px 24px', fontSize: '14px', fontWeight: 600, color: '#0f172a', cursor: 'pointer', alignItems: 'center', gap: '8px' }} onClick={() => (window as any).showDashboard?.()}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M21 12a9 9 0 0 1-9 9 9 9 0 0 1-9-9 9 9 0 0 1 9-9c2.52 0 4.85.83 6.72 2.24"></path>
                      <path d="M21 3v9h-9"></path>
                    </svg>
                    Return to Report
                  </button>
                  <button id="scanNewProjectBtn" className={`btn-ghost ${!navBtnsVisible ? 'btn-nav-hidden' : ''}`} style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '99px', padding: '10px 24px', fontSize: '14px', fontWeight: 600, color: '#0f172a', cursor: 'pointer', alignItems: 'center', gap: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }} onClick={() => (window as any).clearProjectData?.()}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M12 20h9"></path>
                      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                    </svg>
                    Scan New Project
                  </button>
                </div>
              </div>
            </nav>

            <div className="input-screen-inner">
              {/* ── LEFT COLUMN: Branding + Config ── */}
              <div className="inp-col-left">
                <h2 className="inp-title">
                  Security Scan for<br />
                  <span className="highlight-vibe">Vibe Coders</span>
                </h2>
                <p className="inp-sub">Deep-scan your project folder or repository to generate a comprehensive, actionable security intelligence report on critical vulnerabilities.</p>

                <div className="inp-section-label">WHAT KIND OF PRODUCT IS THIS?</div>
                <div className="inp-biz-row">
                  <button
                    className={`inp-biz-btn ${businessType === 'mobile' ? 'active' : ''}`}
                    data-biz="mobile"
                    onClick={() => setBusinessType('mobile')}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <rect x="5" y="2" width="14" height="20" rx="2" ry="2" /><line x1="12" y1="18" x2="12.01" y2="18" />
                    </svg> Mobile App
                  </button>
                  <button
                    className={`inp-biz-btn ${businessType === 'saas' ? 'active' : ''}`}
                    data-biz="saas"
                    onClick={() => setBusinessType('saas')}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
                    </svg> Web App
                  </button>
                </div>

              </div>


              {/* ── RIGHT COLUMN: Upload / GitHub ── */}
              <div className="inp-col-right">
                <div className="inp-tabs">
                  <button className="inp-tab active" id="tabFolder" onClick={() => (window as any).switchTab?.('folder')}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg> Drop Folder
                  </button>
                  <button className="inp-tab" id="tabGithub" onClick={() => (window as any).switchTab?.('github')}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
                    </svg> GitHub URL
                  </button>
                </div>

                <div className="inp-tab-content-area" style={{ width: '100%', minHeight: '400px', display: 'flex', flexDirection: 'column' }}>
                  <div className="github-wrap" id="githubWrap" style={{ display: 'none' }}>

                    {/* User Card */}
                    <div id="githubUserCard" style={{ display: 'none', alignItems: 'center', gap: '12px', padding: '12px', background: '#f8fafc', borderRadius: '16px', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
                      <div id="githubUserAvatar" style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#e2e8f0', border: '2px solid #fff', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}></div>
                      <div style={{ flex: 1 }}>
                        <div id="githubUserName" style={{ fontWeight: 800, fontSize: '14px', color: '#1e293b' }}>GitHub Account</div>
                        <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span style={{ width: '6px', height: '6px', background: '#10b981', borderRadius: '50%' }}></span> Connected
                        </div>
                      </div>
                      <button id="githubDisconnect" style={{ color: '#ef4444', fontSize: '12px', fontWeight: 800, background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.1)', padding: '6px 12px', borderRadius: '10px', cursor: 'pointer', transition: 'all 0.2s' }}>Disconnect</button>
                    </div>

                    <div id="githubConnectView">
                      <div style={{ textAlign: 'center', padding: '40px 0' }}>
                        <p style={{ fontSize: '15px', color: '#0f172a', marginBottom: '20px', fontWeight: 600 }}>Connect to GitHub to scan repositories</p>
                        <button className="github-btn" id="githubLoginBtn" style={{ background: '#0f172a', color: 'white', border: 'none', borderRadius: '12px', padding: '14px 28px', fontSize: '15px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px', margin: '0 auto' }}>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.041-1.416-4.041-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" /></svg>
                          Continue with GitHub
                        </button>
                      </div>
                    </div>

                    <div id="githubSelectorWrap" style={{ display: 'none' }}>
                      <div className="inp-form-group">
                        <label>SELECT PROJECT</label>
                        <select id="githubRepoSelect" className="inp-select" style={{ width: '100%', marginBottom: '16px', background: '#f8fafc', border: '1px solid #e2e8f0', padding: '12px', borderRadius: '12px' }}>
                          <option value="">Loading your repositories...</option>
                        </select>
                        <button id="githubSelectBtn" className="btn-primary" style={{ width: '100%' }}>Use Selected Project</button>

                        <div id="githubReconnectBtnWrap" style={{ display: 'none', marginTop: '12px' }}>
                          <button id="githubReconnectBtn" className="github-btn" style={{ width: '100%', background: '#0f172a', color: 'white', border: 'none', borderRadius: '12px', padding: '14px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.041-1.416-4.041-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" /></svg>
                            Reconnect GitHub Account
                          </button>
                        </div>
                      </div>
                    </div>

                    <div id="githubManualWrap" style={{ display: 'none' }}>
                      <div className="inp-form-group">
                        <label>PASTE GITHUB URL</label>
                        <div style={{ position: 'relative', display: 'flex', gap: '10px' }}>
                          <input type="text" id="githubUrl" className="inp-input" placeholder="https://github.com/user/repo" style={{ flex: 1, padding: '14px', borderRadius: '12px', border: '1px solid #e2e8f0' }} />
                          <button className="btn-primary" onClick={() => (window as any).fetchGithub?.()} style={{ whiteSpace: 'nowrap' }}>Fetch Code</button>
                        </div>
                      </div>
                    </div>

                    <div id="githubAuthInfo" style={{ display: 'none', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', padding: '12px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                      <div id="githubUser" style={{ fontSize: '13px', fontWeight: 600 }}></div>
                      <a href="#" id="githubDisconnect" style={{ fontSize: '13px', color: '#64748b' }}>Disconnect</a>
                    </div>
                  </div>

                  <div className="inp-upload-zone" id="uploadZone">
                    <input type="file" id="fileInput" {...{ webkitdirectory: '' } as any} multiple />
                    <div className="inp-upload-ico">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                      </svg>
                    </div>
                    <div className="inp-upload-title">Drop your project folder here</div>
                    <div className="inp-upload-hint">or click to browse &middot; entire folder, any stack</div>
                    <div className="inp-chip-row">
                      <span className="inp-chip">React</span><span className="inp-chip">Next.js</span>
                      <span className="inp-chip">Node</span><span className="inp-chip">PHP</span>
                      <span className="inp-chip">Python</span><span className="inp-chip">Supabase</span>
                    </div>
                  </div>

                  {/* File info visual replaces upload zone */}
                  <div className="file-row" id="fileRow" style={{
                    display: 'none',
                    background: 'rgba(255, 255, 255, 0.7)',
                    backdropFilter: 'blur(10px)',
                    padding: '12px 16px',
                    borderRadius: '12px',
                    border: '1px solid rgba(226, 232, 240, 0.8)',
                    marginTop: '16px',
                    width: '100%',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.03)'
                  }}>
                    <div className="file-meta" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div className="file-thumb" style={{ background: '#ff6e20', color: 'white', padding: '6px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
                      </div>
                      <div>
                        <div className="file-name" id="fName" style={{ fontWeight: 600, color: '#0f172a', fontSize: '14px' }}></div>
                        <div className="file-count" id="fSize" style={{ fontSize: '11px', color: '#94a3b8' }}></div>
                      </div>
                    </div>
                    <button className="rm-btn" id="rmBtn" style={{ background: 'rgba(241, 245, 249, 0.8)', border: 'none', color: '#64748b', cursor: 'pointer', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', transition: 'all 0.2s' }}>&#10005;</button>
                  </div>

                  {/* ── Scan-type mismatch warning ── */}
                  <div id="scanTypeWarn">
                    <span className="warn-ico" id="scanTypeWarnIco">⚠️</span>
                    <div className="warn-body">
                      <div className="warn-title" id="scanTypeWarnTitle">Wrong scan type selected</div>
                      <div className="warn-msg" id="scanTypeWarnMsg">These look like web files, but you selected Mobile App.</div>
                      <div className="warn-actions">
                        <button className="warn-switch-btn" id="scanTypeWarnSwitch">Switch to Web App →</button>
                        <button className="warn-dismiss" onClick={() => { const w = document.getElementById('scanTypeWarn'); if (w) w.style.display = 'none'; }}>Ignore</button>
                      </div>
                    </div>
                    <button className="warn-close" onClick={() => { const w = document.getElementById('scanTypeWarn'); if (w) w.style.display = 'none'; }}>✕</button>
                  </div>
                </div>

                <div id="githubRepoView" style={{ display: 'none', width: '100%', marginTop: '20px' }}>
                  {/* Simplified repo selector */}
                </div>
              </div>

              <div className="inp-foot">
                <button className="inp-scan-btn" id="scanBtn" disabled>
                  Scan for Vulnerabilities
                </button>
              </div>
            </div>

            <div className="inp-footer">
              {/* Account widget — shown only when signed in, populated by useEffect */}
              <div id="inpAccountWidget" style={{ display: 'none' }}>
                <div
                  id="inpAccountBtn"
                  onClick={() => {
                    const m = document.getElementById('inpAccountMenu');
                    if (m) m.style.display = m.style.display === 'none' ? 'block' : 'none';
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                    width: '44px', height: '44px', borderRadius: '50%', background: '#ffffff',
                    border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                    transition: 'all 0.2s', color: '#1e293b'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--accent)';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#e2e8f0';
                    e.currentTarget.style.transform = 'none';
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </div>

                {/* Dropdown menu */}
                <div id="inpAccountMenu" style={{
                  display: 'none', position: 'absolute', bottom: '100%', left: 0,
                  marginBottom: 8, width: 240, background: '#ffffff',
                  border: '1px solid #e2e8f0', borderRadius: 16,
                  boxShadow: '0 8px 32px rgba(0,0,0,0.12)', padding: '8px 0', zIndex: 999
                }}>
                  <div style={{ padding: '12px 16px 10px', borderBottom: '1px solid #f1f5f9' }}>
                    <div id="inpMenuEmail" style={{ fontSize: 11, color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>email@example.com</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                      <div>
                        <div id="inpMenuPlan" style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>Plan</div>
                        <div id="inpMenuUsage" style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>0 / 0 scans used</div>
                      </div>
                      <div id="inpUsageBar" style={{ width: 48, height: 4, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden', marginTop: 4 }}>
                        <div id="inpUsageFill" style={{ width: '0%', height: '100%', background: 'var(--accent)', borderRadius: 4 }} />
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => (window as any).showPricingModal?.()}
                    style={{ width: '100%', padding: '10px 16px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 10 }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg>
                    Pricing &amp; Plans
                  </button>
                  <button
                    onClick={() => (window as any).showPricingModal?.()}
                    style={{ width: '100%', padding: '10px 16px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 10 }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                    Upgrade Plan
                  </button>
                  <div style={{ height: 1, background: '#f1f5f9', margin: '4px 0' }} />
                  <button
                    onClick={() => (window as any).handleSignOut?.()}
                    style={{ width: '100%', padding: '10px 16px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 10 }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
                    Sign out
                  </button>
                </div>
              </div>

              <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>
                CodeSafe &mdash; Powered by AI &middot; Code never stored
              </div>
            </div>
          </div>

          {/* SCREEN 2: DASHBOARD */}
          <div id="dashScreen" className="dash-screen">
            <DashboardReport />
          </div>

          {/* CHAT OVERLAY & WIDGET */}
          <div id="chatOverlay" className="chat-overlay"></div>
          <div id="chatWidget" className="chat-widget">
            <div className="chat-hdr"
              style={{ padding: '16px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div className="chat-hdr-title"
                  style={{ marginBottom: '4px', fontFamily: "'DM Sans', sans-serif", fontSize: '16px' }}>Ask about your report</div>
                <div className="chat-hdr-sub">Plain English answers &mdash; no jargon</div>
              </div>
              <button id="closeChatBtn" className="act-btn"
                style={{ padding: '6px 12px', fontSize: '14px', background: 'transparent', border: '1px solid var(--border)', cursor: 'pointer', borderRadius: '6px' }}>&#10005;</button>
            </div>
            <div className="chat-msgs" id="chatMsgs" style={{ flex: 1, overflowY: 'auto' }}></div>
            <div className="quick-row" id="quickRow" style={{ padding: '0 22px' }}></div>
            <div className="chat-inp-row" style={{ padding: '16px 22px' }}>
              <textarea id="chatInput" rows={1} placeholder="e.g. Can I launch with medium issues?"></textarea>
              <button className="send-btn" id="sendBtn">&uarr;</button>
            </div>
          </div>
        </div>

        <div className="toast" id="toast"></div>


      </div> {/* end #security-root */}

      <Script
        id="security-scripts-loader"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            (function loadSeq(scripts, i) {
              if (i >= scripts.length) return;
              var s = document.createElement('script');
              s.src = scripts[i];
              s.onload = function() { loadSeq(scripts, i + 1); };
              document.body.appendChild(s);
            })([
              'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js',
              '/security/config.js?v=3',
              '/security/UsageTracker.js?v=3',
              '/security/Tool.js?v=3',
              '/security/prompts.js?v=3',
              '/security/app.js?v=3'
            ], 0);
          `
        }}
      />
    </>
  );
}
