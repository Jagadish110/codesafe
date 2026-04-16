import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Legal — Privacy, Terms & Security | CodeSafe",
  description:
    "CodeSafe's Privacy Policy, Terms of Service, and Security practices. We are committed to protecting your code and data.",
};

const SECTIONS = [
  {
    id: "privacy",
    icon: "🔒",
    title: "Privacy Policy",
    lastUpdated: "April 2026",
    content: [
      {
        heading: "What We Collect",
        body: "We collect your email address when you sign up, and the code files you upload during a security scan. We also collect basic usage data (scan count, plan tier) to manage your account.",
      },
      {
        heading: "How We Use Your Data",
        body: "Your email is used solely to manage your account and send essential product notifications. Your uploaded code files are processed in memory during the scan and are NOT permanently stored on our servers after the scan completes.",
      },
      {
        heading: "Third-Party Services",
        body: "We use Supabase for authentication and database storage, and Google Gemini AI for security analysis. Your scan data may be processed by these services under their respective privacy policies. We do not sell your data to any third party.",
      },
      {
        heading: "Data Retention",
        body: "Your account data (email, scan history, plan details) is retained for as long as your account is active. You may request deletion of your account and all associated data at any time by contacting us.",
      },
      {
        heading: "Cookies",
        body: "We use essential cookies to maintain your login session. We do not use advertising or tracking cookies.",
      },
      {
        heading: "Your Rights",
        body: "You have the right to access, correct, or delete your personal data. To exercise these rights, contact us at support@codesafe.co.in.",
      },
    ],
  },
  {
    id: "terms",
    icon: "📄",
    title: "Terms of Service",
    lastUpdated: "April 2026",
    content: [
      {
        heading: "Acceptance of Terms",
        body: 'By accessing or using CodeSafe ("the Service"), you agree to be bound by these Terms of Service. If you do not agree, please do not use the Service.',
      },
      {
        heading: "Description of Service",
        body: "CodeSafe is an AI-powered security scanning tool that analyses code for potential vulnerabilities. The Service provides informational reports and is intended to assist developers and founders in identifying common security risks.",
      },
      {
        heading: "Use of the Service",
        body: "You agree to use the Service only for lawful purposes and only on code that you own or have explicit permission to scan. You must not use the Service to analyse code obtained illegally or without authorisation.",
      },
      {
        heading: "Disclaimer of Warranties",
        body: "CodeSafe provides security analysis on a best-effort basis using AI. We do NOT guarantee that our scans will detect every vulnerability in your code. The Service is provided 'as is' without warranty of any kind. A clean scan report does NOT certify your application as secure.",
      },
      {
        heading: "Limitation of Liability",
        body: "To the fullest extent permitted by law, CodeSafe shall not be liable for any damages arising from the use or inability to use the Service, including any security breaches that may occur even after a scan. Your use of the Service is at your own risk.",
      },
      {
        heading: "Subscriptions & Payments",
        body: "Paid plans (Plus, Pro) are billed monthly. Scan credits are consumed when a scan is successfully initiated. All payments are processed securely through our payment provider. Prices are displayed in USD and are subject to change with 30 days' notice.",
      },
      {
        heading: "Refund Policy",
        body: "All purchases are final. We do not provide refunds for scan credits that have been used or for partial subscription periods. You may cancel your subscription at any time, and access will continue until the end of the current billing cycle.",
      },
      {
        heading: "Termination",
        body: "We reserve the right to suspend or terminate accounts that violate these Terms or that are used fraudulently. You may close your account at any time.",
      },
      {
        heading: "Changes to Terms",
        body: "We may update these Terms from time to time. We will notify users of significant changes via email. Continued use of the Service following notice of changes constitutes acceptance of the updated Terms.",
      },
      {
        heading: "Governing Law",
        body: "These Terms are governed by and construed in accordance with the laws of India. Any disputes shall be subject to the exclusive jurisdiction of the courts of India.",
      },
    ],
  },
  {
    id: "security",
    icon: "🛡️",
    title: "Security",
    lastUpdated: "April 2026",
    content: [
      {
        heading: "Our Commitment",
        body: "Security is our core product. We hold ourselves to the same standard we help others achieve. We continuously review our own infrastructure and processes to ensure your data is safe.",
      },
      {
        heading: "Data in Transit",
        body: "All data transmitted between your browser and our servers is encrypted using TLS 1.3. We enforce HTTPS on all endpoints.",
      },
      {
        heading: "Data at Rest",
        body: "Your account data is stored in Supabase with AES-256 encryption at rest. Row-Level Security (RLS) policies ensure users can only access their own data.",
      },
      {
        heading: "Code File Handling",
        body: "Uploaded code files are processed in memory and are not written to permanent storage. They are transmitted to the AI provider over an encrypted connection and are not used to train AI models.",
      },
      {
        heading: "Authentication",
        body: "We use Supabase Auth which implements industry-standard JWT-based sessions. Passwords are never stored in plain text.",
      },
      {
        heading: "Responsible Disclosure",
        body: "If you discover a security vulnerability in CodeSafe, please report it responsibly to support@codesafe.co.in. We commit to investigating all legitimate reports and responding within 72 hours.",
      },
    ],
  },
];

export default function LegalPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f8f7f4",
        fontFamily:
          "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      {/* ── Nav ── */}
      <nav
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          background: "rgba(248,247,244,0.9)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid rgba(0,0,0,0.08)",
          padding: "0 24px",
        }}
      >
        <div
          style={{
            maxWidth: 900,
            margin: "0 auto",
            height: 60,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <a
            href="/"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              textDecoration: "none",
              fontWeight: 800,
              fontSize: 16,
              color: "#0f172a",
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "#ef4444",
                display: "inline-block",
              }}
            />
            CodeSafe
          </a>
          <a
            href="/"
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "#64748b",
              textDecoration: "none",
              padding: "6px 14px",
              borderRadius: 8,
              border: "1px solid rgba(0,0,0,0.12)",
              transition: "all 0.2s",
            }}
          >
            ← Back to Home
          </a>
        </div>
      </nav>

      {/* ── Hero ── */}
      <div
        style={{
          maxWidth: 900,
          margin: "0 auto",
          padding: "64px 24px 40px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            background: "rgba(239,68,68,0.08)",
            color: "#ef4444",
            borderRadius: 99,
            padding: "6px 16px",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            marginBottom: 20,
          }}
        >
          Legal Documents
        </div>
        <h1
          style={{
            fontSize: "clamp(28px, 5vw, 40px)",
            fontWeight: 800,
            color: "#0f172a",
            margin: "0 0 16px",
            lineHeight: 1.2,
          }}
        >
          Privacy, Terms & Security
        </h1>
        <p
          style={{
            fontSize: 16,
            color: "#64748b",
            maxWidth: 520,
            margin: "0 auto 40px",
            lineHeight: 1.6,
          }}
        >
          We believe in full transparency. Below is everything you need to know
          about how we handle your data and how we operate.
        </p>

        {/* Section jump links */}
        <div
          style={{
            display: "flex",
            gap: 12,
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 18px",
                background: "#ffffff",
                border: "1px solid rgba(0,0,0,0.10)",
                borderRadius: 99,
                fontSize: 13,
                fontWeight: 600,
                color: "#0f172a",
                textDecoration: "none",
                boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                transition: "all 0.2s",
              }}
            >
              <span>{s.icon}</span> {s.title}
            </a>
          ))}
        </div>
      </div>

      {/* ── Sections ── */}
      <div
        style={{ maxWidth: 900, margin: "0 auto", padding: "0 24px 80px" }}
      >
        {SECTIONS.map((section, si) => (
          <section
            key={section.id}
            id={section.id}
            style={{
              background: "#ffffff",
              borderRadius: 20,
              border: "1px solid rgba(0,0,0,0.08)",
              padding: "40px 44px",
              marginBottom: 24,
              boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
              scrollMarginTop: 80,
            }}
          >
            {/* Section Header */}
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 16,
                marginBottom: 32,
                paddingBottom: 24,
                borderBottom: "1px solid rgba(0,0,0,0.06)",
              }}
            >
              <span
                style={{
                  fontSize: 28,
                  lineHeight: 1,
                  flexShrink: 0,
                  marginTop: 2,
                }}
              >
                {section.icon}
              </span>
              <div>
                <h2
                  style={{
                    fontSize: 22,
                    fontWeight: 800,
                    color: "#0f172a",
                    margin: "0 0 4px",
                  }}
                >
                  {section.title}
                </h2>
                <p style={{ fontSize: 12, color: "#94a3b8", margin: 0 }}>
                  Last updated: {section.lastUpdated}
                </p>
              </div>
            </div>

            {/* Subsections */}
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              {section.content.map((item, ii) => (
                <div key={ii}>
                  <h3
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: "#0f172a",
                      margin: "0 0 8px",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: "#ef4444",
                        display: "inline-block",
                        flexShrink: 0,
                      }}
                    />
                    {item.heading}
                  </h3>
                  <p
                    style={{
                      fontSize: 14,
                      color: "#475569",
                      margin: 0,
                      lineHeight: 1.75,
                      paddingLeft: 14,
                    }}
                  >
                    {item.body}
                  </p>
                </div>
              ))}
            </div>
          </section>
        ))}

        {/* ── Contact Card ── */}
        <div
          style={{
            background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
            borderRadius: 20,
            padding: "40px 44px",
            textAlign: "center",
            color: "#ffffff",
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 12 }}>✉️</div>
          <h3
            style={{
              fontSize: 20,
              fontWeight: 800,
              margin: "0 0 10px",
              color: "#ffffff",
            }}
          >
            Questions or Concerns?
          </h3>
          <p
            style={{
              fontSize: 14,
              color: "#94a3b8",
              margin: "0 0 24px",
              lineHeight: 1.6,
            }}
          >
            If you have any questions about these policies or want to request
            deletion of your data, we are here to help.
          </p>
          <a
            href="mailto:support@codesafe.co.in"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "12px 28px",
              background: "#ef4444",
              color: "#ffffff",
              borderRadius: 12,
              textDecoration: "none",
              fontWeight: 700,
              fontSize: 14,
              boxShadow: "0 4px 14px rgba(239,68,68,0.35)",
            }}
          >
            support@codesafe.co.in
          </a>
        </div>
      </div>
    </div>
  );
}
