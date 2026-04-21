import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CodeSafe — Security Scanner for Founders",
  description: "Scan your website code for security vulnerabilities before you launch. Plain English report, no technical knowledge needed.",
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon.ico',
    apple: '/favicon.ico',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning style={{ scrollbarGutter: 'stable' }}>
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body className="antialiased" suppressHydrationWarning>{children}</body>
    </html>
  );
}
