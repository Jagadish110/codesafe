'use client';
import { useState } from 'react';

export const TOTAL_CHECKS = 90;

export const PRICING_DATA = [
  {
    tier: "Starter",
    price: "$9",
    period: "Per Scan",
    subPeriod: "",
    desc: "Catch the biggest launch-blockers before going live.",
    checks: 50,
    totalChecks: TOTAL_CHECKS,
    scans: 1,
    codeLimit: "50 MB",
    highlights: ["Secrets & SQL injection", "XSS, CORS, RLS, auth"],
    buttonText: "Starter →",
    featured: false,
    accentColor: "#6366f1",
    accentGlow: "rgba(99,102,241,0.12)",
    gradient: "linear-gradient(135deg, #f8f7ff 0%, #eef2ff 100%)",
  },
  {
    tier: "Pro",
    price: "$19",
    period: "",
    subPeriod: "",
    desc: "Full AI-era coverage for founders actively building.",
    checks: 90,
    totalChecks: TOTAL_CHECKS,
    scans: 3,
    codeLimit: "2 GB",
    highlights: ["AI cost abuse & prompt injection", "JWT confusion, SSRF, supply chain", "Fix For Me AI remediation"],
    buttonText: "Get Pro →",
    featured: true,
    popular: "★ Popular",
    accentColor: "#10b981",
    accentGlow: "rgba(16,185,129,0.15)",
    gradient: "linear-gradient(135deg, #f0fdf9 0%, #dcfce7 100%)",
  },
  {
    tier: "Plus",
    price: "$49",
    period: "",
    subPeriod: "",
    desc: "Every check including advanced infra & AI-era attacks.",
    checks: 90,
    totalChecks: TOTAL_CHECKS,
    scans: 10,
    codeLimit: "5 GB",
    highlights: ["Pickle RCE, SSTI, ReDoS, Firebase rules", "IaC privileges, PII encryption", "5 team seats + Slack support"],
    buttonText: "Get Plus →",
    featured: false,
    accentColor: "#f59e0b",
    accentGlow: "rgba(245,158,11,0.12)",
    gradient: "linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)",
  },

];

export const PLAN_LIMITS = {
  free: {
    scansPerMonth: 1,
    maxCodeMB: 50,
    label: 'Starter',
    color: '#6366f1',
    checkNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 17, 18, 19, 22, 23, 25, 26, 27, 28, 35],
  },
  starter: {
    scansPerMonth: 1,
    maxCodeMB: 50,
    label: 'Starter',
    color: '#6366f1',
    checkNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 17, 18, 19, 22, 23, 25, 26, 27, 28, 35],
  },
  pro: {
    scansPerMonth: 3,
    maxCodeMB: 2048,
    label: 'Pro',
    color: '#10b981',
    checkNumbers: [
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 17, 18, 19, 22, 23, 25, 26, 27, 28, 35,
      11, 12, 13, 14, 15, 16, 20, 21, 24, 29, 30, 31, 32, 33, 34, 36, 37, 38,
      39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 50,
      52, 53, 56, 57, 60, 62, 63, 65, 66, 67, 68, 70,
    ],
  },
  plus: {
    scansPerMonth: 10,
    maxCodeMB: 5120,
    label: 'Plus',
    color: '#f59e0b',
    checkNumbers: 'all',
  },
  test: {
    scansPerMonth: 1,
    maxCodeMB: 1,
    label: 'Test',
    color: '#ef4444',
    checkNumbers: [1, 2, 3, 4, 5],
  },
};

export default function Pricing() {
  const [loadingTier, setLoadingTier] = useState<string | null>(null);

  const handleCheckout = async (tier: string, plan: any) => {
    try {
      setLoadingTier(tier);

      // Get access token from the CDN Supabase client (exposed by app.js as window._sbClient)
      let accessToken = '';
      try {
        const sb = (window as any)._sbClient;
        if (sb) {
          const { data } = await sb.auth.getSession();
          accessToken = data?.session?.access_token || '';
        }
      } catch (e) {
        console.warn('Could not get Supabase session:', e);
      }

      if (!accessToken) {
        alert('Please sign in to continue.');
        setLoadingTier(null);
        return;
      }

      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier, accessToken }),
      });

      const data = await res.json();

      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        alert(data.error || 'Failed to initialize checkout');
        setLoadingTier(null);
      }
    } catch (err) {
      console.error('Checkout error:', err);
      alert('An error occurred during checkout.');
      setLoadingTier(null);
    }
  };

  return (
    <section className="section" id="pricing" style={{ paddingBottom: '80px' }}>
      <div className="section-eyebrow">Pricing</div>
      <h2 className="section-title" style={{ marginBottom: '8px' }}>
        Start your trial.<br />Scale when you grow.
      </h2>
      <p className="section-sub" style={{ marginBottom: '48px' }}>
        Scale when you grow. Cancel anytime.
      </p>

      <style dangerouslySetInnerHTML={{
        __html: `
        .pricing-grid-v2 {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(290px, 1fr));
          gap: 24px;
          max-width: 1100px;
          margin: 12px auto 0;
        }
        @media (max-width: 768px) {
          .pricing-grid-v2 { grid-template-columns: 1fr; gap: 16px; }
        }

        .pc2 {
          position: relative;
          border-radius: 20px;
          padding: 28px 24px 24px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          border: 1.5px solid rgba(0,0,0,0.07);
          transition: transform 0.3s cubic-bezier(0.23, 1, 0.32, 1),
                      box-shadow 0.3s cubic-bezier(0.23, 1, 0.32, 1);
        }
        .pc2:hover {
          transform: translateY(-6px);
          box-shadow: 0 24px 48px rgba(0,0,0,0.10);
        }
        .pc2.pc2--featured {
          border-width: 2px;
        }

        /* Shimmer top stripe removed */

        .pc2-popular {
          position: absolute;
          top: -12px;
          left: 50%;
          transform: translateX(-50%);
          font-size: 9.5px;
          font-weight: 800;
          padding: 4px 14px;
          border-radius: 100px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          z-index: 10;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
          white-space: nowrap;
        }

        .pc2-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 8px;
        }
        .pc2-tier-wrap {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .pc2-tier {
          font-size: 13px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .pc2-period-sub {
          font-size: 11px;
          color: #94a3b8;
          font-weight: 500;
        }
        .pc2-price {
          display: flex;
          align-items: baseline;
          gap: 1px;
          text-align: right;
        }
        .pc2-amount {
          font-size: 36px;
          font-weight: 900;
          color: #0f172a;
          line-height: 1;
          letter-spacing: -1px;
        }
        .pc2-per {
          font-size: 13px;
          color: #94a3b8;
          font-weight: 500;
          margin-bottom: 2px;
        }

        .pc2-desc {
          font-size: 13.5px;
          color: #64748b;
          line-height: 1.55;
          margin: 0;
        }

        .pc2-divider {
          height: 1px;
          background: rgba(0,0,0,0.06);
          margin: 0;
        }

        .pc2-meta {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
          text-align: center;
        }
        .pc2-meta-item {
          background: rgba(255,255,255,0.7);
          border: 1px solid rgba(0,0,0,0.06);
          border-radius: 12px;
          padding: 10px 4px;
          backdrop-filter: blur(4px);
        }
        .pc2-meta-val {
          font-size: 15px;
          font-weight: 800;
          color: #1e293b;
        }
        .pc2-meta-key {
          font-size: 9.5px;
          color: #94a3b8;
          margin-top: 2px;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          font-weight: 600;
        }

        .pc2-checks-row {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .pc2-checks-pill {
          border-radius: 20px;
          padding: 3px 12px;
          font-size: 11.5px;
          font-weight: 700;
          white-space: nowrap;
          background: rgba(255,255,255,0.8);
          border: 1.5px solid currentColor;
        }
        .pc2-checks-bar-wrap {
          flex: 1;
          height: 5px;
          background: rgba(0,0,0,0.06);
          border-radius: 10px;
          overflow: hidden;
        }
        .pc2-checks-bar {
          height: 100%;
          border-radius: 10px;
          transition: width 0.5s ease;
        }

        .pc2-highlights {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .pc2-highlights li {
          display: flex;
          align-items: flex-start;
          gap: 9px;
          font-size: 13px;
          color: #475569;
          line-height: 1.45;
          font-weight: 500;
        }
        .pc2-check-icon {
          flex-shrink: 0;
          margin-top: 1px;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 9px;
          font-weight: 900;
          color: #fff;
        }

        .pc2-btn {
          margin-top: auto;
          width: 100%;
          padding: 13px 20px;
          border-radius: 14px;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          border: none;
          letter-spacing: 0.01em;
        }
        .pc2-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(0,0,0,0.15);
        }
        .pc2-btn:active {
          transform: translateY(0);
        }

        .pricing-footnote-v2 {
          text-align: center;
          font-size: 12px;
          color: #94a3b8;
          margin-top: 32px;
          opacity: 0.8;
        }
      `}} />

      <div className="pricing-grid-v2">
        {PRICING_DATA.map((plan, idx) => {
          const pct = Math.round((plan.checks / plan.totalChecks) * 100);
          return (
            <div
              key={idx}
              className={`pc2 ${plan.featured ? 'pc2--featured' : ''} reveal-on-scroll`}
              style={{
                background: plan.gradient,
                borderColor: plan.featured ? plan.accentColor : 'rgba(0,0,0,0.07)',
                boxShadow: plan.featured ? `0 12px 40px ${plan.accentGlow}` : '0 4px 16px rgba(0,0,0,0.04)',
                transitionDelay: `${idx * 0.1}s`,
              }}
            >
              {/* Top accent stripe removed */}

              {plan.popular && (
                <div
                  className="pc2-popular"
                  style={{ background: plan.accentColor, color: '#fff' }}
                >
                  {plan.popular}
                </div>
              )}

              {(plan as any).isTest && (
                <div
                  className="pc2-popular"
                  style={{
                    background: '#ef4444',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  🧪 DEV TEST — Remove before launch
                </div>
              )}

              {/* Header */}
              <div className="pc2-head">
                <div className="pc2-tier-wrap">
                  <div className="pc2-tier" style={{ color: plan.accentColor }}>
                    {plan.tier}
                  </div>
                  {plan.subPeriod && (
                    <div className="pc2-period-sub">{plan.subPeriod}</div>
                  )}
                  {!plan.subPeriod && (
                    <div className="pc2-period-sub"></div>
                  )}
                </div>
                <div className="pc2-price">
                  <span className="pc2-amount">{plan.price}</span>
                  {plan.period !== 'forever' && <span className="pc2-per">{plan.period}</span>}
                </div>
              </div>

              <p className="pc2-desc">{plan.desc}</p>

              <div className="pc2-divider" />

              {/* 3-stat row */}
              <div className="pc2-meta">
                <div className="pc2-meta-item">
                  <div className="pc2-meta-val" style={{ color: plan.accentColor }}>{plan.checks}</div>
                  <div className="pc2-meta-key">Checks</div>
                </div>
                <div className="pc2-meta-item">
                  <div className="pc2-meta-val" style={{ color: plan.accentColor }}>{plan.scans}</div>
                  <div className="pc2-meta-key">Scans</div>
                </div>
                <div className="pc2-meta-item">
                  <div className="pc2-meta-val" style={{ color: plan.accentColor }}>{plan.codeLimit}</div>
                  <div className="pc2-meta-key">Code Limit</div>
                </div>
              </div>

              {/* Coverage bar */}
              <div className="pc2-checks-row">
                <span
                  className="pc2-checks-pill"
                  style={{ color: plan.accentColor, borderColor: plan.accentColor }}
                >
                  {pct}% coverage
                </span>
                <div className="pc2-checks-bar-wrap">
                  <div
                    className="pc2-checks-bar"
                    style={{ width: `${pct}%`, background: plan.accentColor }}
                  />
                </div>
              </div>

              {/* Highlights */}
              <ul className="pc2-highlights">
                {plan.highlights.map((h, i) => (
                  <li key={i}>
                    <span
                      className="pc2-check-icon"
                      style={{ background: plan.accentColor }}
                    >
                      ✓
                    </span>
                    {h}
                  </li>
                ))}
              </ul>

              <button
                className="pc2-btn"
                style={{
                  background: plan.featured ? plan.accentColor : `rgba(255,255,255,0.85)`,
                  color: plan.featured ? '#fff' : plan.accentColor,
                  border: plan.featured ? 'none' : `1.5px solid ${plan.accentColor}`,
                  boxShadow: plan.featured ? `0 4px 20px ${plan.accentGlow}` : 'none',
                  opacity: loadingTier === plan.tier ? 0.7 : 1,
                  cursor: loadingTier === plan.tier ? 'not-allowed' : 'pointer'
                }}
                disabled={loadingTier === plan.tier}
                onClick={() => handleCheckout(plan.tier, plan)}
              >
                {loadingTier === plan.tier ? 'Processing...' : plan.buttonText}
              </button>
            </div>
          );
        })}
      </div>

      <p className="pricing-footnote-v2">
        All plans include: AI-powered analysis · GitHub scanning · PDF export · Vibe check grid
      </p>
    </section>
  );
}
