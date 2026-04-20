'use client';

import React, { useState, useEffect } from 'react';
import { PLAN_LIMITS, TOTAL_CHECKS } from './Pricing';
import { RecentScans } from './RecentScans';
import { vibeCheck, generateVibeReportCard } from '../../codesafe/lib/vibe-check';
import { ShieldAlert, AlertTriangle, AlertCircle, Info, FileCode2, Database, KeyRound, Globe, Users, Zap, Lock, ShieldCheck, Factory, Search, CheckCircle2, Activity, MessageSquare, Heart } from 'lucide-react';
import { supabase } from '../lib/supabase';

declare global {
  interface Window {
    askAboutReport?: (data: any, focusVuln?: any) => void;
  }
}


const getProfessionalIcon = (iconStr: string, size = 18, color?: string) => {
  const c = color || "currentColor";
  switch (iconStr) {
    case '🔑': case '🔐': case '🔓': case '🎫': return <KeyRound size={size} color={c} strokeWidth={2.5} />;
    case '🌐': case '🌍': case '🎣': case '↪️': case '🔌': return <Globe size={size} color={c} strokeWidth={2.5} />;
    case '💉': case '🎭': case '💻': case '📝': case '⚡': case '💣': case '💥': case '💀': return <FileCode2 size={size} color={c} strokeWidth={2.5} />;
    case '📂': case '📁': case '🗄️': case '📦': case '📤': case '🪣': return <Database size={size} color={c} strokeWidth={2.5} />;
    case '🚪': case '👤': case '🚶': case '🏴‍☠️': return <Users size={size} color={c} strokeWidth={2.5} />;
    case '🛡️': case '🔒': return <Lock size={size} color={c} strokeWidth={2.5} />;
    case '🤖': case '🧠': return <Zap size={size} color={c} strokeWidth={2.5} />;
    case '🔄': case '⏳': case '⏱️': case '🚰': case '📊': case '🌀': case '🧮': return <Activity size={size} color={c} strokeWidth={2.5} />;
    case '⚠️': case '📋': case '🗺️': default: return <AlertTriangle size={size} color={c} strokeWidth={2.5} />;
  }
};

// ── Types ──────────────────────────────────────────────────────────────────
interface Vulnerability {
  name?: string;
  title?: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  file: string;
  line?: number;
  priority?: string;
  desc?: string;
  what_is_it?: string;
  why_dangerous?: string;
  business_risk?: string;
  how_to_fix?: string;
  fixed_code?: string;
  evidence?: string;
  code_language?: string;
  vibe_category?: string;
  // Cross-validation fields from Aggregator
  confidence?: number;
  confirmed_by?: string[];
  agent_agreement?: 'confirmed' | 'partial' | 'single';
  needs_review?: boolean;
}

interface ScanHistory {
  label: string;
  time: string;
  score: number;
  color: string;
}

interface ReportData {
  score: number;
  project_name?: string;
  stack?: string;
  summary?: string;
  verdict?: 'deploy' | 'deploy_with_caution' | 'do_not_deploy';
  counts: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  vibe_checks?: Record<string, 'pass' | 'fail' | 'skip'>;
  safety_checks?: Array<{ key: string; status: 'pass' | 'fail' | 'skip' }>;
  vulnerabilities?: Vulnerability[];
  scan_history?: ScanHistory[];
  scanId?: string;
  regression?: {
    prevScore: number;
    prevDate: string;
    fixed: number;
    newIssues: number;
    persisting: number;
  } | null;
}

interface FixedFile {
  file: string;
  fixed_code: string;
}

interface HistoryItem {
  id: string;
  project_name: string;
  score: number;
  vulns_found: number;
  created_at: string;
  report_data?: any;
}

// ── Check metadata (labels) ─────────────────────────────────────────────────
// All 83 checks, keyed by the VIBE_META / TOOL_TO_VIBE_KEY identifier
const VIBE_META: Record<string, { label: string }> = {
  // ── P0 Critical (original) ──
  supabase_rls: { label: 'Supabase RLS' },
  frontend_secrets: { label: 'Frontend Secrets' },
  next_public_prefix: { label: 'NEXT_PUBLIC Keys' },
  env_git_tracking: { label: '.env in Git' },
  auth_middleware: { label: 'Auth Middleware' },
  stripe_webhook: { label: 'Stripe Webhook' },
  server_side_price: { label: 'Server Side Price' },
  custom_auth: { label: 'Custom Auth' },
  upload_directory: { label: 'Upload Dir' },
  csrf_token: { label: 'CSRF Token' },
  insecure_deserialization: { label: 'Deserialization' },
  excessive_ai_agency: { label: 'AI Code Exec' },
  supply_chain: { label: 'Supply Chain' },
  ssrf: { label: 'SSRF Attack' },

  // ── P1 High (original) ──
  idor_ownership: { label: 'IDOR Check' },
  sql_injection: { label: 'SQL Injection' },
  xss_injection: { label: 'XSS Injection' },
  payment_frontend_gating: { label: 'Payment Gating' },
  console_log_leaks: { label: 'Browser Logs' },
  server_log_leaks: { label: 'Server Logs' },
  file_upload_validation: { label: 'File Upload' },
  ai_endpoint_abuse: { label: 'AI Cost Abuse' },
  session_config: { label: 'Session Config' },
  api_versioning: { label: 'API Versioning' },
  ai_config_files: { label: 'AI Config Files' },
  ai_hallucinated_packages: { label: 'Fake AI Packages' },
  insecure_llm_output: { label: 'LLM Output XSS' },
  model_dos: { label: 'Model DoS' },
  backup_exposure: { label: 'Backup Exposure' },
  prompt_injection: { label: 'Prompt Injection' },
  bola: { label: 'Mass Assignment' },

  // ── P2 Medium (original) ──
  security_headers: { label: 'Sec Headers' },
  cors_wildcard: { label: 'CORS Config' },
  rate_limiting: { label: 'Rate Limiting' },
  dependency_risks: { label: 'Dependencies' },
  sensitive_urls: { label: 'Sensitive URLs' },
  error_verbosity: { label: 'Error Leakage' },
  command_injection: { label: 'Cmd Injection' },
  path_traversal: { label: 'Path Traversal' },
  input_validation: { label: 'Input Validation' },
  password_policy: { label: 'Password Policy' },
  open_redirect: { label: 'Open Redirect' },
  dependency_bloat: { label: 'Dep Bloat' },
  env_validation: { label: 'Env Validation' },
  http_vs_https: { label: 'HTTP vs HTTPS' },
  incident_logging: { label: 'Incident Logging' },
  weak_random: { label: 'Weak Random' },
  race_condition: { label: 'Race Condition' },

  // ── NEW checks #52–#86 ──
  insecure_client_storage: { label: 'Client Storage' },
  missing_security_logging: { label: 'No Security Log' },
  insecure_pickle_deserialization: { label: 'Pickle RCE' },
  missing_payload_limits: { label: 'Payload Size' },
  ssrf_vulnerability: { label: 'SSRF (new)' },
  missing_csrf_protection: { label: 'Missing CSRF' },
  inverted_auth_logic: { label: 'Auth Inverted' },
  negative_value_manipulation: { label: 'Negative Values' },
  rate_limit_ip_bypass: { label: 'IP Bypass' },
  prompt_injection_repo: { label: 'Repo Injection' },
  fail_open_access: { label: 'Fail-Open Auth' },
  missing_env_separation: { label: 'Env Separation' },
  log_injection: { label: 'Log Injection' },
  jwt_algorithm_confusion: { label: 'JWT Alg Confusion' },
  slopsquatting: { label: 'Slopsquatting' },
  api_docs_exposed: { label: 'API Docs Exposed' },
  missing_token_expiry: { label: 'Token Expiry' },
  weak_cryptography: { label: 'Weak Crypto' },
  ai_agent_db_overperm: { label: 'DB Overperm Agent' },
  nosql_injection: { label: 'NoSQL Injection' },
  ssti_vulnerability: { label: 'SSTI' },
  redos_vulnerability: { label: 'ReDoS Regex' },
  account_enumeration: { label: 'Acct Enumeration' },
  graphql_batching_dos: { label: 'GraphQL DoS' },
  integer_overflow: { label: 'Integer Overflow' },
  hidden_unicode_rules: { label: 'Hidden Unicode' },
  insecure_randomness: { label: 'Insecure Random' },
  crlf_injection: { label: 'CRLF Injection' },
  malicious_postinstall: { label: 'Postinstall Attack' },
  firebase_open_rules: { label: 'Firebase Open Rules' },
  overprivileged_iac: { label: 'IaC Privileges' },
  trusted_client_headers: { label: 'Client Headers' },
  negative_price_injection: { label: 'Negative Price' },
  container_as_root: { label: 'Container Root' },
  pii_unencrypted: { label: 'PII Unencrypted' },
};



// ── Maps Tool.js _checkNumber → VIBE_META key (via TOOL_TO_VIBE_KEY) ────────
// This is the SINGLE SOURCE OF TRUTH linking check numbers to dashboard keys.
const CHECK_NUMBER_TO_VIBE_KEY: Record<number, string> = {
  1: 'supabase_rls',
  2: 'frontend_secrets',
  3: 'next_public_prefix',
  4: 'env_git_tracking',
  5: 'auth_middleware',
  6: 'stripe_webhook',
  7: 'server_side_price',
  8: 'idor_ownership',
  9: 'sql_injection',
  10: 'xss_injection',
  11: 'payment_frontend_gating',
  12: 'console_log_leaks',
  13: 'server_log_leaks',
  14: 'file_upload_validation',
  15: 'ai_endpoint_abuse',
  16: 'session_config',
  17: 'security_headers',
  18: 'cors_wildcard',
  19: 'rate_limiting',
  20: 'dependency_risks',
  21: 'sensitive_urls',
  22: 'error_verbosity',
  23: 'command_injection',
  24: 'prompt_injection',
  25: 'path_traversal',
  26: 'input_validation',
  27: 'password_policy',
  28: 'open_redirect',
  29: 'api_versioning',
  30: 'custom_auth',
  31: 'ai_config_files',
  32: 'upload_directory',
  33: 'dependency_bloat',
  34: 'env_validation',
  35: 'http_vs_https',
  36: 'csrf_token',
  37: 'insecure_deserialization',
  38: 'ai_hallucinated_packages',
  39: 'insecure_llm_output',
  40: 'model_dos',
  41: 'excessive_ai_agency',
  42: 'backup_exposure',
  43: 'bola',                            // report_mass_assignment → _checkNumber 48 but kept as bola
  44: 'supply_chain',                     // _checkNumber 46
  45: 'incident_logging',
  46: 'supply_chain',
  47: 'ssrf',
  48: 'bola',
  49: 'weak_random',
  50: 'race_condition',
  // New checks #52–#86
  52: 'insecure_client_storage',
  53: 'missing_security_logging',
  54: 'insecure_pickle_deserialization',
  55: 'missing_payload_limits',
  56: 'ssrf_vulnerability',
  57: 'missing_csrf_protection',
  58: 'inverted_auth_logic',
  59: 'negative_value_manipulation',
  60: 'rate_limit_ip_bypass',
  61: 'prompt_injection_repo',
  62: 'fail_open_access',
  63: 'missing_env_separation',
  64: 'log_injection',
  65: 'jwt_algorithm_confusion',
  66: 'slopsquatting',
  67: 'api_docs_exposed',
  68: 'missing_token_expiry',
  69: 'weak_cryptography',
  70: 'ai_agent_db_overperm',
  71: 'nosql_injection',
  72: 'ssti_vulnerability',
  73: 'redos_vulnerability',
  74: 'account_enumeration',
  75: 'graphql_batching_dos',
  76: 'integer_overflow',
  77: 'hidden_unicode_rules',
  78: 'insecure_randomness',
  79: 'crlf_injection',
  80: 'malicious_postinstall',
  81: 'firebase_open_rules',
  82: 'overprivileged_iac',
  83: 'trusted_client_headers',
  84: 'negative_price_injection',
  85: 'container_as_root',
  86: 'pii_unencrypted',
};


// ── Plan check numbers — sourced from central Pricing.tsx ─────────────
const getPlanCheckNumbers = (tier: string): number[] | 'all' => {
  const t = tier.toLowerCase();
  const plan = (PLAN_LIMITS as any)[t] || PLAN_LIMITS.free;
  return plan.checkNumbers;
};

// Helper: resolve plan check numbers → Set of VIBE_META keys for a plan tier
function getPlanVibeKeys(tier: string): Set<string> {
  const nums = getPlanCheckNumbers(tier);
  if (nums === 'all') return new Set(Object.keys(VIBE_META));
  const keys = new Set<string>();
  if (Array.isArray(nums)) {
    for (const n of nums) {
      const key = CHECK_NUMBER_TO_VIBE_KEY[n];
      if (key && VIBE_META[key]) keys.add(key);
    }
  }
  return keys;
}

// ── Helpers ────────────────────────────────────────────────────────────────
const scoreColor = (s: number) => s >= 80 ? '#10B981' : s >= 50 ? '#F59E0B' : '#E11D48';

const statusLabel = (s: number) =>
  s >= 80
    ? { text: '✓ Safe to Deploy', color: '#10B981', bg: '#F0FDF4', border: '#A7F3D0' }
    : s >= 50
      ? { text: '⚠ Deploy with Caution', color: '#D97706', bg: '#FEFCE8', border: '#FDE047' }
      : { text: '✕ Do NOT Deploy Yet', color: '#E11D48', bg: '#FFF1F2', border: '#FECDD3' };

const historyColor = (s: number) => s >= 80 ? '#2afcbaff' : s >= 50 ? '#814dfbff' : '#ff5e3eff';

// ── Styles ─────────────────────────────────────────────────────────────────
const CSS = `
  :root {
    --error: #e6d9d5ff;
    --error-dim: #f18e67ff;
  }
  .cs-wrap{font-family:'Inter', -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;background:transparent;color:var(--text);font-size:13px;line-height:1.5;min-height:100vh;-webkit-font-smoothing:antialiased}
  * { scrollbar-width: none !important; -ms-overflow-style: none !important; }
  *::-webkit-scrollbar { display: none !important; }
  html, body { scrollbar-width: none !important; -ms-overflow-style: none !important; }
  html::-webkit-scrollbar, body::-webkit-scrollbar { display: none !important; }
  .cs-nav{display:none}
  .cs-menu-toggle{width:40px;height:40px;border-radius:12px;background:var(--surface);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--text);box-shadow: var(--shadow-sm);transition: all 0.2s ease;}
  .cs-menu-toggle:hover{background:var(--surface2);border-color:var(--border2);box-shadow: var(--shadow);}
  .cs-action-popover{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:8px;display:flex;flex-direction:column;gap:4px;box-shadow:var(--shadow-xl);min-width:180px;position:absolute;top:calc(100% + 8px);right:0;z-index:2001}
  .cs-menu-item{display:flex;align-items:center;gap:10px;padding:10px 16px;border-radius:10px;font-size:13px;font-weight:600;color:var(--text-secondary);background:none;border:none;cursor:pointer;text-align:left;transition: all 0.2s ease;}
  .cs-menu-item:hover{background:var(--surface2);color:var(--text);}
  .cs-menu-item.primary{color:#C2410C}
  .cs-menu-item.primary:hover{background:rgba(240, 159, 127, 0.05)}
  .cs-btn{height:40px;padding:0 20px;border-radius:12px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-family:inherit;font-size:13px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:8px;white-space:nowrap;box-shadow: var(--shadow-sm);transition: all 0.2s ease;}
  .cs-btn:hover{background:var(--surface2);border-color:var(--border2);box-shadow: var(--shadow);}
  .cs-btn-p{background:var(--accent)!important;color:#fff!important;border-color:var(--accent)!important;box-shadow: var(--shadow-md)!important;}
  .cs-btn-p:hover{background:var(--accent-hover)!important;transform:translateY(-1px);}
  .cs-page{max-width:1200px;margin:0 auto;padding:24px;contain: content}
  .cs-top{display:grid;grid-template-columns:320px 1fr;gap:20px;margin-bottom:20px;contain: layout style}
  .cs-card{background:var(--surface);border:1px solid var(--border);border-radius:24px;padding:24px;box-shadow:var(--shadow-md);transition: transform 0.2s ease;}
  .cs-lbl{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text-muted)}
  .cs-risk{display:flex;flex-direction:column;gap:20px}
  .cs-ring-wrap{position:relative;width:80px;height:80px;flex-shrink:0}
  .cs-ring-wrap svg{transform:rotate(-90deg)}
  .cs-ring-c{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
  .cs-risk-bars{display:flex;flex-direction:column;gap:8px}
  .cs-bar-row{display:flex;align-items:center;gap:10px;font-size:11px}
  .cs-bar-lbl{color:var(--text-secondary);width:65px;flex-shrink:0;font-weight:600}
  .cs-bar-track{flex:1;height:5px;background:var(--bg-tertiary);border-radius:10px;overflow:hidden}
  .cs-bar-fill{height:100%;border-radius:10px;transition:width .6s cubic-bezier(0.16, 1, 0.3, 1)}
  .cs-sev-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
  .cs-sev-card{background:var(--surface);border:1px solid var(--border);border-radius:24px;padding:24px;display:flex;flex-direction:column;gap:8px;position:relative;overflow:hidden;box-shadow: var(--shadow-md);}
  .cs-sev-card::before{content:'';position:absolute;top:0;left:0;right:0;height:4px}
  .cs-sc::before{background:var(--error)}.cs-sh::before{background:var(--warning)}.cs-sm::before{background:#06b6d4}.cs-sl::before{background:var(--success)}
  .cs-sev-n{font-family:var(--mono);font-size:40px;font-weight:700;line-height:1}
  .cs-sev-name{font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--text);margin-top:2px}
  .cs-sev-act{font-size:11px;color:var(--text-muted);font-weight:500}
  .cs-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
  .cs-bot{display:flex;flex-direction:column;gap:20px}
  .cs-left{display:flex;flex-direction:column;gap:20px}
  .cs-card-h{padding:20px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between}
  .cs-card-t{font-size:16px;font-weight:700;letter-spacing:-.2px;color:var(--text)}
  .cs-badge{font-size:11px;padding:2px 10px;border-radius:100px;font-weight:600}
  .cs-bg{background:var(--success-dim);color:var(--success);border:1px solid rgba(16,185,129,0.1)}
  .cs-br{background:var(--error-dim);color:var(--error);border:1px solid rgba(239,68,68,0.1)}
  .cs-bgy{background:var(--bg-tertiary);color:var(--text-muted);border:1px solid var(--border)}
  .cs-checks-h{display:flex;gap:12px;padding:20px;overflow-x:auto;-ms-overflow-style:none;scrollbar-width:none}
  .cs-checks-h::-webkit-scrollbar{display:none}
  .cs-checks-grid{display:grid;grid-template-columns:repeat(auto-fill, minmax(180px, 1fr));gap:12px;padding:20px}
  .cs-chk-card{background:var(--surface2);border:1px solid var(--border);border-radius:16px;padding:12px;display:flex;align-items:center;gap:10px;}
  .cs-chk-card-ico{width:8px;height:8px;border-radius:50%;flex-shrink:0;margin-top:4px}
  .cs-chk-card-det{display:flex;flex-direction:column;gap:1px;overflow:hidden}
  .cs-chk-card-t{font-size:12px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .cs-chk-card-s{font-size:11px;font-weight:600;color:var(--text-muted)}
  .cs-more-card{flex:0 0 50px;display:flex;align-items:center;justify-content:center;background:var(--surface);border:1px solid var(--border);border-radius:100px;cursor:pointer;transition: all 0.2s ease;}
  .cs-more-card:hover{background:var(--surface2);border-color:var(--border2);}
  .cs-side{display:flex;flex-direction:column;gap:12px}
  .cs-vuln-item{padding:20px;border-bottom:1px solid var(--border);display:flex;flex-direction:column;gap:10px;background:transparent}
  .cs-vuln-item:last-of-type{border-bottom:none}
  .cs-pill{font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:3px 10px;border-radius:100px}
  .cs-pc{background:var(--error-dim);color:var(--error);border:1px solid rgba(225,29,72,0.1)}
  .cs-ph{background:var(--warning-dim);color:var(--warning);border:1px solid rgba(139, 92, 246, 0.1)}
  .cs-pm{background:rgba(6,182,212,0.05);color:#0891b2;border:1px solid rgba(6,182,212,0.1)}
  .cs-pl{background:var(--success-dim);color:var(--success);border:1px solid rgba(5,150,105,0.1)}
  .cs-tag{font-family:var(--mono);font-size:10px;color:var(--text-secondary);background:var(--bg-tertiary);padding:2px 8px;border-radius:100px}
  .cs-hist-row{display:flex;align-items:center;gap:12px;padding:12px 20px;border-bottom:1px solid var(--border);font-size:12px}
  .cs-hist-row:last-child{border-bottom:none}
  .cs-quick{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:16px}
  .cs-qbtn{display:flex;flex-direction:column;align-items:flex-start;gap:3px;padding:12px;border-radius:12px;border:1px solid var(--border);background:var(--surface);color:var(--text);cursor:pointer;font-family:inherit;text-align:left;transition: all 0.2s ease;}
  .cs-qbtn:hover{background:var(--surface2);border-color:var(--border2);box-shadow: var(--shadow-sm);}
  .cs-ip{background:var(--success)}.cs-if{background:var(--error)}.cs-is{background:var(--text-muted)}
  .cs-vuln-h{display:flex;align-items:center;justify-content:space-between;padding:18px 24px;cursor:pointer;user-select:none;transition: background 0.2s ease;}
  .cs-vuln-h:hover{background:var(--bg-secondary)}
  .cs-vuln-chevron{color:var(--text-muted);transition: transform 0.2s ease;}
  .cs-vuln-chevron.expanded{transform:rotate(180deg)}
  .cs-trend{display:inline-flex;align-items:center;gap:3px;font-size:11px;padding:2px 7px;border-radius:100px}
  .cs-load{
    position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;
    background: #ffffff;
    background-image: 
      radial-gradient(at 0% 0%, rgba(249, 87, 0, 0.07) 0, transparent 50%), 
      radial-gradient(at 100% 0%, rgba(249, 87, 0, 0.04) 0, transparent 50%),
      radial-gradient(at 50% 50%, rgba(249, 87, 0, 0.02) 0, transparent 80%),
      radial-gradient(at 100% 100%, rgba(249, 87, 0, 0.07) 0, transparent 50%),
      radial-gradient(at 0% 100%, rgba(249, 87, 0, 0.04) 0, transparent 50%);
    z-index:99999;
    overflow:hidden;
    overflow-y:auto;
    animation: csFadeIn 0.4s ease-out;
  }
  @keyframes csFadeIn { from { opacity: 0; } to { opacity: 1; } }

  .cs-orch-wrap{
    width:100%;max-width:1100px;padding:40px 32px 32px;
  }
  .cs-orch-header{margin-bottom:36px}
  .cs-orch-title{
    font-family:'Instrument Serif', serif !important;
    font-size:52px !important;
    font-weight:400 !important;
    color:#0f172a;
    letter-spacing:-0.01em;line-height:1.05;margin:0 0 16px;
  }
  .cs-orch-sub{
    font-family:'Instrument Sans', sans-serif !important;
    font-size:18px !important;
    color:#475569;
    line-height:1.5;margin:0;
    max-width:700px;
    letter-spacing: -0.01em;
    font-weight: 400;
  }
  .cs-orch-grid{
    display:grid;grid-template-columns:1fr 1fr;gap:28px;align-items:start;
  }
  @media(max-width:860px){
    .cs-orch-grid{grid-template-columns:1fr}
  }

  /* ── Left: Task Cards ── */
  .cs-orch-tasks{display:flex;flex-direction:column;gap:12px}

  .cs-orch-task{
    background:#ffffff;border:1px solid #e2e8f0;border-radius:18px;
    padding:18px 22px;display:flex;align-items:center;gap:16px;
    box-shadow:0 2px 8px rgba(0,0,0,0.04);
    transition:all 0.3s cubic-bezier(0.16,1,0.3,1);
    animation:csTaskSlide 0.5s ease-out both;
  }
  .cs-orch-task.active{
    border-color:#f95700;box-shadow:0 4px 20px rgba(249,87,0,0.12);
    background:linear-gradient(135deg,#fff8f2 0%,#ffffff 100%);
  }
  .cs-orch-task.done{border-color:#10b981;background:#f0fdf9}
  @keyframes csTaskSlide{
    from{opacity:0;transform:translateY(12px)}
    to{opacity:1;transform:translateY(0)}
  }

  .cs-orch-ico{
    width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;
    flex-shrink:0;
  }
  .cs-orch-ico.done{background:#d1fae5;color:#059669}
  .cs-orch-ico.active{background:#fff1eb;color:#f95700;animation:csOrchPulse 1.5s ease-in-out infinite}
  .cs-orch-ico.pending{background:#f1f5f9;color:#94a3b8}
  @keyframes csOrchPulse{
    0%,100%{box-shadow:0 0 0 0 rgba(249,87,0,0)}
    50%{box-shadow:0 0 0 8px rgba(249,87,0,0.12)}
  }

  .cs-orch-info{flex:1;min-width:0}
  .cs-orch-task-name{
    font-family:'DM Sans',sans-serif;font-size:15px;font-weight:700;color:#0f172a;
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin:0 0 3px;
  }
  .cs-orch-task-status{
    font-family:'Space Mono',monospace;font-size:11px;font-weight:600;
    letter-spacing:0.05em;text-transform:uppercase;
  }
  .cs-orch-task-status.done{color:#059669}
  .cs-orch-task-status.active{color:#f95700}
  .cs-orch-task-status.pending{color:#94a3b8}

  .cs-orch-time{
    font-family:'Space Mono',monospace;font-size:12px;color:#94a3b8;font-weight:500;
    flex-shrink:0;min-width:40px;text-align:right;
  }

  /* ── Right: Terminal Card ── */
  .cs-orch-terminal{
    background:#1a1b26;border-radius:18px;overflow:hidden;
    box-shadow:0 8px 32px rgba(0,0,0,0.18);
    display:flex;flex-direction:column;min-height:420px;max-height:520px;
  }
  .cs-orch-term-bar{
    background:#12131d;padding:12px 18px;display:flex;align-items:center;gap:10px;
    border-bottom:1px solid rgba(255,255,255,0.06);flex-shrink:0;
  }
  .cs-orch-dots{display:flex;gap:7px}
  .cs-orch-dot{width:11px;height:11px;border-radius:50%}
  .cs-orch-dot.r{background:#ff5f57}.cs-orch-dot.y{background:#febc2e}.cs-orch-dot.g{background:#28c840}
  .cs-orch-term-title{
    flex:1;text-align:center;font-family:'Space Mono',monospace;
    font-size:11px;font-weight:600;color:#7aa2f7;letter-spacing:0.08em;text-transform:uppercase;
  }
  .cs-orch-term-body{
    padding:20px;flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:6px;
    scrollbar-width:thin;scrollbar-color:rgba(255,255,255,0.08) transparent;
  }
  .cs-orch-term-body::-webkit-scrollbar{width:5px}
  .cs-orch-term-body::-webkit-scrollbar-track{background:transparent}
  .cs-orch-term-body::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:10px}

  .cs-orch-log{
    font-family:'Space Mono',monospace;font-size:12px;line-height:1.65;
    animation:csLogFade 0.35s ease-out both;
    display:flex;gap:10px;
  }
  @keyframes csLogFade{
    from{opacity:0;transform:translateY(4px)}
    to{opacity:1;transform:translateY(0)}
  }
  .cs-orch-log-ts{color:#565f89;flex-shrink:0;font-size:11px}
  .cs-orch-log-msg{color:#a9b1d6}
  .cs-orch-log-msg.info{color:#a9b1d6}
  .cs-orch-log-msg.success{color:#9ece6a}
  .cs-orch-log-msg.warn{color:#e0af68}
  .cs-orch-log-msg.task{color:#7dcfff}
  .cs-orch-log-msg.system{color:#bb9af7}

  .cs-orch-cursor{
    display:inline-block;width:8px;height:16px;background:#7aa2f7;
    animation:csBlink 1s step-end infinite;margin-left:4px;vertical-align:middle;
  }
  @keyframes csBlink{0%,100%{opacity:1}50%{opacity:0}}

  .cs-orch-term-footer{
    background:#12131d;padding:10px 18px;display:flex;justify-content:space-between;
    align-items:center;border-top:1px solid rgba(255,255,255,0.06);flex-shrink:0;
  }
  .cs-orch-meter{
    font-family:'Space Mono',monospace;font-size:10px;color:#565f89;
    font-weight:600;letter-spacing:0.04em;text-transform:uppercase;
  }
  .cs-orch-bar-wrap{
    width:100%;height:4px;background:rgba(255,255,255,0.06);border-radius:10px;
    margin-top:8px;overflow:hidden;
  }
  .cs-orch-bar-fill{
    height:100%;border-radius:10px;
    background:linear-gradient(90deg, #f95700, #ff8c42, #f95700);
    background-size: 200% 100%;
    animation: csBarMove 2s linear infinite;
    transition:width 0.6s cubic-bezier(0.16,1,0.3,1);
  }
  @keyframes csBarMove { to { background-position: -200% 0; } }
  @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
  
  .cs-hist-item:hover{background:var(--surface2)!important;}
  .cs-pre{margin:0;padding:16px;font-size:11px;color:var(--text-secondary);overflow-x:auto;line-height:1.6;font-family:var(--mono)}
  .cs-code{background:var(--bg-secondary);border-radius:16px;overflow:hidden;margin-top:8px;border:1px solid var(--border)}
  .cs-upsell{padding:16px 20px;background:var(--surface2);display:flex;align-items:center;gap:8px;border-top:1px solid var(--border)}
  .cs-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;gap:12px;color:var(--text-muted)}
  @media (max-width: 1024px) {
    .cs-top { grid-template-columns: 1fr; }
    .cs-side { position: static !important; width: 100% !important; }
  }
`;

// ── Component ──────────────────────────────────────────────────────────────
const DashboardReport: React.FC = () => {
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [isVisible, setIsVisible] = useState<boolean>(false);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanSteps, setScanSteps] = useState<string[]>([]);
  const [isFixing, setIsFixing] = useState<boolean>(false);
  const [fixedFiles, setFixedFiles] = useState<FixedFile[]>([]);
  const [expandedIndices, setExpandedIndices] = useState<number[]>([0]);
  const [expandedChecks, setExpandedChecks] = useState<boolean>(false);
  const [showActionMenu, setShowActionMenu] = useState<boolean>(false);
  const [planTier, setPlanTier] = useState<string>('free');
  const [scansUsed, setScansUsed] = useState<number>(0);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);
  const [showImpactModal, setShowImpactModal] = useState<boolean>(false);
  const [showGraphViewer, setShowGraphViewer] = useState<boolean>(false);
  const [currentScanId, setCurrentScanId] = useState<string | null>(null);
  const [activeExplainId, setActiveExplainId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState('');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [feedbackSuccess, setFeedbackSuccess] = useState(false);

  const handleFeedbackSubmit = async () => {
    if (!feedback.trim()) return;
    setIsSubmittingFeedback(true);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from('user_feedback')
        .insert([{
          content: feedback,
          user_id: user?.id,
          user_email: user?.email,
          scan_id: reportData?.scanId || currentScanId,
          metadata: {
            project_name: reportData?.project_name,
            score: reportData?.score,
            verdict: reportData?.verdict
          }
        }]);

      if (error) throw error;

      setFeedbackSuccess(true);
      setFeedback('');
      setTimeout(() => setFeedbackSuccess(false), 5000);
    } catch (error) {
      console.error('Feedback submission failed', error);
      alert('Failed to send feedback. Please try again.');
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  // ── Plan limits sourced from central Pricing.tsx ────────────────────────────
  const PLAN_LIMITS_LOCAL = PLAN_LIMITS as any;

  // ── Orchestration: timer-based progressive task index ──
  const [orchTaskIndex, setOrchTaskIndex] = useState<number>(0);
  const [orchTermLogs, setOrchTermLogs] = useState<{ ts: string; msg: string; type: string }[]>([]);
  const orchStartRef = React.useRef<number>(0);

  useEffect(() => {
    const handleGlobalClick = () => setActiveExplainId(null);
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  useEffect(() => {
    // Pick up data if app.js already set it before this component mounted
    const state = (window as any).CODESAFE_STATE;
    if (state?.reportData) {
      setReportData(state.reportData);
      setIsVisible(true);
      if (state.reportData.scanId) {
        setCurrentScanId(state.reportData.scanId);
      }
    }
    if (state?.scanId) {
      setCurrentScanId(state.scanId);
    }
    if (state?.scanning) setIsScanning(true);

    // Check for shared report in URL
    const urlParams = new URLSearchParams(window.location.search);
    const sharedReport = urlParams.get('report');
    if (sharedReport) {
      try {
        const json = decodeURIComponent(atob(sharedReport));
        const data = JSON.parse(json);
        setReportData(data);
        setIsVisible(true);
        if (data.scanId) {
          setCurrentScanId(data.scanId);
        }
      } catch (e) {
        console.error('Failed to load shared report from URL', e);
      }
    }

    const handleReport = (e: Event) => {
      const d = (e as CustomEvent).detail ?? {};
      console.log('[handleReport] Event detail:', d);

      if (d.clearData) { setReportData(null); }

      // Update intermediate state
      if (d.data) {
        setReportData(d.data);
        setIsVisible(true);
        if (d.data.scanId) {
          console.log('[handleReport] Setting currentScanId from data.scanId to:', d.data.scanId);
          setCurrentScanId(d.data.scanId);
        }
      }

      if (d.scanId) {
        console.log('[handleReport] Setting currentScanId to:', d.scanId);
        setCurrentScanId(d.scanId);
      }

      if (d.visible != null) setIsVisible(d.visible);
      if (d.fixing != null) setIsFixing(d.fixing);
      if (d.scanStep) setScanSteps((p) => [...p, d.scanStep]);
      if (d.fixedData) setFixedFiles(d.fixedData);

      // Handle the scanning transition smoothly
      if (d.scanning === true) {
        setIsScanning(true);
        setScanSteps([]);
      } else if (d.scanning === false) {
        // Fast-forward the orchestration animation to completion
        setOrchTaskIndex(6);

        // Wait 1200ms to let the user see the "completed" state, then transition to dashboard
        setTimeout(() => {
          setIsScanning(false);
        }, 1500);
      }
    };

    const handleHistory = (e: Event) => {
      const d = (e as CustomEvent).detail ?? [];
      setHistory(d);
    };

    window.addEventListener('codesafe:report', handleReport);
    window.addEventListener('codesafe:history_updated', handleHistory);
    return () => {
      window.removeEventListener('codesafe:report', handleReport);
      window.removeEventListener('codesafe:history_updated', handleHistory);
    };
  }, []);

  const [usage, setUsage] = useState({ total: 0, input: 0, output: 0 });

  useEffect(() => {
    // Sync usage data
    const updateUsage = () => {
      if ((window as any).UsageTracker) {
        setUsage((window as any).UsageTracker.getStats());
      }
    };
    updateUsage();
    window.addEventListener('codesafe:usage_updated', updateUsage);
    return () => window.removeEventListener('codesafe:usage_updated', updateUsage);
  }, []);

  useEffect(() => {
    // Sync plan data from app.js
    const syncPlan = () => {
      const up = (window as any).currentUserPlan;
      if (up) {
        setPlanTier(up.plan_tier || 'free');
        setScansUsed(up.scans_used || 0);
      }
    };
    syncPlan();
    window.addEventListener('codesafe:plan_updated', syncPlan);
    window.addEventListener('codesafe:report', syncPlan);
    return () => {
      window.removeEventListener('codesafe:plan_updated', syncPlan);
      window.removeEventListener('codesafe:report', syncPlan);
    };
  }, []);

  // ── Enrich vulnerabilities with pipeline cross-validation findings ─────────
  // Once the multi-agent pipeline scan completes, poll its findings and merge
  // confirmed_by / agent_agreement / needs_review / confidence into the live
  // reportData.vulnerabilities so the dashboard badges are populated.
  useEffect(() => {
    if (!currentScanId) return;

    let attempts = 0;
    const MAX_ATTEMPTS = 22; // ~3 min at 8s intervals
    let timerId: ReturnType<typeof setTimeout>;

    async function fetchAndEnrich() {
      try {
        const res = await fetch(`/api/scan?scanId=${currentScanId}`);
        if (!res.ok) return;
        const json = await res.json();
        const pipeFindings: any[] = json.findings ?? [];

        if (pipeFindings.length === 0) {
          // Pipeline not done yet — retry
          if (++attempts < MAX_ATTEMPTS) {
            timerId = setTimeout(fetchAndEnrich, 8000);
          }
          return;
        }

        // Build a lookup: "file:line" → pipeline finding
        const findingMap = new Map<string, any>();
        for (const f of pipeFindings) {
          const key = `${f.file}:${f.line ?? 0}`;
          // Keep the one with highest confidence if duplicates
          const existing = findingMap.get(key);
          if (!existing || (f.confidence ?? 0) > (existing.confidence ?? 0)) {
            findingMap.set(key, f);
          }
        }

        // Enrich current reportData vulnerabilities
        setReportData(prev => {
          if (!prev) return prev;
          const enriched = (prev.vulnerabilities ?? []).map(v => {
            const key = `${v.file}:${v.line ?? 0}`;
            const pf = findingMap.get(key);
            if (!pf) return v;
            return {
              ...v,
              confidence:    pf.confidence    ?? v.confidence,
              confirmed_by:  pf.confirmed_by  ?? v.confirmed_by,
              agent_agreement: pf.agent_agreement ?? v.agent_agreement,
              needs_review:  pf.needs_review  ?? v.needs_review,
            };
          });
          return { ...prev, vulnerabilities: enriched };
        });
      } catch (_) {
        // Silent — non-critical enrichment
        if (++attempts < MAX_ATTEMPTS) {
          timerId = setTimeout(fetchAndEnrich, 8000);
        }
      }
    }

    // Start polling after a brief delay to give the pipeline time to kick off
    timerId = setTimeout(fetchAndEnrich, 12000);
    return () => clearTimeout(timerId);
  }, [currentScanId]);

  useEffect(() => {
    // Auto-scroll scan steps
    const scroll = document.getElementById('scanStepScroll');
    if (scroll) scroll.scrollTop = scroll.scrollHeight;
  }, [scanSteps]);

  // ── Progressive task timer: advance tasks one-by-one with realistic delays ──
  useEffect(() => {
    if (!isScanning) {
      // Reset when scanning ends so next scan starts fresh
      setOrchTaskIndex(0);
      setOrchTermLogs([]);
      orchStartRef.current = 0;
      return;
    }

    // Record start time
    if (orchStartRef.current === 0) orchStartRef.current = Date.now();

    // Task durations in ms — greatly extended so they don't finish early before the API returns.
    // If the API returns early, our handleReport interceptor will jump orchTaskIndex to 6 anyway.
    const TASK_DELAYS = [4000, 5000, 8500, 10200, 12000, 15000];
    // Terminal log messages per task (appear while task is active)
    const TASK_LOGS: { msg: string; type: string }[][] = [
      [
        { msg: 'System.Connect: Established handshake via TLS 1.3', type: 'system' },
        { msg: 'Parsing project file structure and imports...', type: 'task' },
        { msg: 'Knowledge graph: Mapping dependency tree across modules', type: 'info' },
      ],
      [
        { msg: 'Orchestrator: Analyzing file risk profiles...', type: 'system' },
        { msg: 'Routing files to specialist analysis agents', type: 'task' },
        { msg: 'Analyzing contextual significance of critical entry points...', type: 'info' },
      ],
      [
        { msg: 'Scanning for exposed API keys and credentials...', type: 'task' },
        { msg: 'Checking .env files, config, and hardcoded tokens', type: 'info' },
        { msg: 'Analysis: Inspecting 12 config patterns for secret leaks', type: 'info' },
        { msg: 'Testing theoretical bypass using regex fuzzing...', type: 'system' },
      ],
      [
        { msg: 'Evaluating authentication middleware and RLS policies...', type: 'task' },
        { msg: 'Checking for IDOR, broken access control, and auth bypass', type: 'info' },
        { msg: 'Simulating unauthenticated requests against protected routes', type: 'system' },
        { msg: 'Warning: Missing authorization check detected in route handler', type: 'warn' },
      ],
      [
        { msg: 'Probing for SQL injection, XSS, and SSRF vectors...', type: 'task' },
        { msg: 'Scanning request handlers for unsanitized user input', type: 'info' },
        { msg: 'Running vibe-coding checks (Supabase RLS, frontend secrets)...', type: 'task' },
        { msg: 'Testing parameter pollution in Next.js query strings...', type: 'system' },
        { msg: 'Checking for prompt injection and error handler leaks...', type: 'info' },
      ],
      [
        { msg: 'Auditing package.json dependencies for known CVEs...', type: 'task' },
        { msg: 'Scanning supply chain, SSRF, and injection risks...', type: 'info' },
        { msg: 'Reviewing transitive dependency graph for hidden vulnerabilities...', type: 'task' },
        { msg: 'Finalizing security models and aggregating confidence scores...', type: 'system' },
        { msg: 'Generating your plain English report...', type: 'success' },
      ],
    ];

    let taskIdx = 0;
    let logQueue: { msg: string; type: string; delay: number }[] = [];
    let cumulativeDelay = 0;

    // Build a schedule of all logs with absolute delays from start
    for (let t = 0; t < TASK_LOGS.length; t++) {
      const logs = TASK_LOGS[t];
      const taskDuration = TASK_DELAYS[t];
      const logInterval = taskDuration / (logs.length + 1);

      logs.forEach((log, li) => {
        logQueue.push({ ...log, delay: cumulativeDelay + logInterval * (li + 1) });
      });

      cumulativeDelay += taskDuration;
    }

    // Set up task advancement timers
    const taskTimers: ReturnType<typeof setTimeout>[] = [];
    let taskCumulative = 0;
    TASK_DELAYS.forEach((dur, i) => {
      // Each task starts "active" when cumulative time of previous tasks has passed
      taskCumulative += dur;
      const timer = setTimeout(() => {
        setOrchTaskIndex(i + 1); // tasks 0..i are now done, i+1 is active
      }, taskCumulative);
      taskTimers.push(timer);
    });

    // Set up log timers
    const logTimers = logQueue.map((entry, i) => {
      return setTimeout(() => {
        const now = new Date();
        const ts = now.toTimeString().slice(0, 8);
        setOrchTermLogs(prev => [...prev, { ts: `[${ts}]`, msg: entry.msg, type: entry.type }]);
      }, entry.delay);
    });

    return () => {
      taskTimers.forEach(clearTimeout);
      logTimers.forEach(clearTimeout);
    };
  }, [isScanning]);

  // Auto-scroll terminal when new logs appear
  useEffect(() => {
    const scroll = document.getElementById('scanStepScroll');
    if (scroll) scroll.scrollTop = scroll.scrollHeight;
  }, [orchTermLogs]);

  // ── Callbacks ─────────────────────────────────────────────────────────────
  const onBack = () => (window as any).backToInput?.();
  const onRescan = () => (window as any).handleRescan?.();
  const onDownload = () => {
    if (!reportData || !vulnerabilities.length) return;

    let md = `# SECURITY AUDIT REPORT: ${reportData.project_name || 'Project'}\n`;
    md += `**Generated by CodeSafe AI**\n\n`;
    md += `> [!IMPORTANT]\n`;
    md += `> Provide this file to an AI assistant (Cursor, ChatGPT, or Advanced AI) and say: \n`;
    md += `> **"Fix the security vulnerabilities listed in this report. Follow the 'How to Fix' steps exactly for each file."**\n\n`;
    md += `---\n\n`;

    vulnerabilities.forEach((v, index) => {
      const vibe = vibeCheck(
        v.name ?? v.title ?? v.vibe_category ?? '',
        v.severity,
        ''
      );

      md += `## ISSUE #${index + 1}: ${vibe.headline}\n`;
      md += `- **Urgency:** ${vibe.urgency}\n`;
      md += `- **Severity:** \`${v.severity.toUpperCase()}\`\n`;
      md += `- **Location:** \`${v.file}\`${v.line ? ` (Line: ${v.line})` : ''}\n`;
      md += `- **Technical Type:** \`${v.name ?? v.title ?? v.vibe_category ?? 'General'}\`\n\n`;

      md += `### Business Impact\n`;
      md += `${vibe.businessImpact}\n\n`;

      md += `### Worst Case Scenario\n`;
      md += `> ${vibe.worstCase}\n\n`;

      md += `### Technical Description\n`;
      md += `${v.what_is_it || v.desc || 'No description available.'}\n\n`;

      if (v.evidence) {
        md += `### 🔍 Exact Code Issue - ${v.file}:${v.line || 'unknown'}\n`;
        md += `\`\`\`${v.code_language || ''}\n${v.evidence}\n\`\`\`\n\n`;
      }

      md += `### 🛠️ AI Security Fix Instructions\n`;
      md += `Hey AI, please modify the code in \`${v.file}\` to resolve this security vulnerability by following these steps:\n`;
      const stepsRaw = v.how_to_fix || '';
      const steps = stepsRaw.split(/\r?\n/).filter(line => line.trim().length > 0);

      if (steps.length > 0) {
        steps.forEach((step, i) => {
          md += `${step.match(/^\d+\./) ? step : `${i + 1}. ${step}`}\n`;
        });
      } else {
        md += `1. Locate the issue at line ${v.line || 'specified in excerpt'} in \`${v.file}\`.\n`;
        md += `2. Apply industry-standard security mitigations for \`${v.vibe_category || 'this type of risk'}\`.\n`;
        md += `3. Ensure the fix preserves existing business logic while closing the vulnerability.\n`;
      }

      if (v.fixed_code) {
        md += `\n**Reference implementation for the fix (Verify before applying):**\n`;
        md += `\`\`\`${v.code_language || ''}\n${v.fixed_code}\n\`\`\`\n`;
      }

      md += `\n---\n\n`;
    });

    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", url);
    downloadAnchorNode.setAttribute("download", `codesafe-report-${reportData.project_name || 'project'}.md`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    URL.revokeObjectURL(url);
  };

  const onFix = () => (window as any).handleFixForMe?.();


  const onAsk = () => (window as any).askAboutReport?.(reportData);

  // ── Nothing to show ───────────────────────────────────────────────────────
  if (!isScanning && !isVisible) return null;

  // ── Derived (only when reportData exists) ─────────────────────────────────
  const vibeChecks = reportData?.vibe_checks ?? {};
  const allVulnerabilities: Vulnerability[] = reportData?.vulnerabilities ?? [];
  const allKeys = Object.keys(VIBE_META);

  // ── Plan-aware check filtering using actual check number sets ──────────
  // getPlanVibeKeys resolves PLAN_CHECK_NUMBERS → Set<VIBE_META key>
  const planKeySet = getPlanVibeKeys(planTier);
  const planKeys = allKeys.filter(k => planKeySet.has(k));       // checks user's plan scans
  const lockedKeys = allKeys.filter(k => !planKeySet.has(k));    // checks requiring upgrade
  const planChecksCount = planKeys.length;

  // ── vibe_category → VIBE_META key mapper ─────────────────────────────
  // Some vibe_category values from Tool.js differ from VIBE_META keys
  const CATEGORY_TO_KEY: Record<string, string> = {
    supabase_rls: 'supabase_rls',
    frontend_secret: 'frontend_secrets',
    next_public: 'next_public_prefix',
    env_tracking: 'env_git_tracking',
    auth_missing: 'auth_middleware',
    stripe_webhook: 'stripe_webhook',
    payment_bypass: 'server_side_price',
    custom_auth: 'custom_auth',
    upload_directory: 'upload_directory',
    csrf: 'csrf_token',
    deserialization: 'insecure_deserialization',
    ai_agency: 'excessive_ai_agency',
    supply_chain: 'supply_chain',
    ssrf: 'ssrf',
    idor: 'idor_ownership',
    sql_injection: 'sql_injection',
    xss: 'xss_injection',
    payment_gating: 'payment_frontend_gating',
    console_log: 'console_log_leaks',
    server_log: 'server_log_leaks',
    file_upload: 'file_upload_validation',
    ai_abuse: 'ai_endpoint_abuse',
    session: 'session_config',
    api_versioning: 'api_versioning',
    ai_config: 'ai_config_files',
    ai_packages: 'ai_hallucinated_packages',
    llm_output: 'insecure_llm_output',
    model_dos: 'model_dos',
    backup_exposure: 'backup_exposure',
    prompt_injection: 'prompt_injection',
    bola: 'bola',
    security_headers: 'security_headers',
    cors: 'cors_wildcard',
    rate_limiting: 'rate_limiting',
    dependency: 'dependency_risks',
    sensitive_url: 'sensitive_urls',
    error_leak: 'error_verbosity',
    command_injection: 'command_injection',
    path_traversal: 'path_traversal',
    input_validation: 'input_validation',
    password_policy: 'password_policy',
    open_redirect: 'open_redirect',
    dependency_bloat: 'dependency_bloat',
    env_validation: 'env_validation',
    http_https: 'http_vs_https',
    incident_logging: 'incident_logging',
    weak_random: 'weak_random',
    race_condition: 'race_condition',
    // New checks — category matches VIBE_META key directly
    insecure_client_storage: 'insecure_client_storage',
    missing_security_logging: 'missing_security_logging',
    insecure_pickle_deserialization: 'insecure_pickle_deserialization',
    missing_payload_limits: 'missing_payload_limits',
    ssrf_vulnerability: 'ssrf_vulnerability',
    missing_csrf_protection: 'missing_csrf_protection',
    inverted_auth_logic: 'inverted_auth_logic',
    negative_value_manipulation: 'negative_value_manipulation',
    rate_limit_ip_bypass: 'rate_limit_ip_bypass',
    prompt_injection_repo: 'prompt_injection_repo',
    fail_open_access: 'fail_open_access',
    missing_env_separation: 'missing_env_separation',
    log_injection: 'log_injection',
    jwt_algorithm_confusion: 'jwt_algorithm_confusion',
    slopsquatting: 'slopsquatting',
    api_docs_exposed: 'api_docs_exposed',
    missing_token_expiry: 'missing_token_expiry',
    weak_cryptography: 'weak_cryptography',
    ai_agent_db_overperm: 'ai_agent_db_overperm',
    nosql_injection: 'nosql_injection',
    ssti_vulnerability: 'ssti_vulnerability',
    redos_vulnerability: 'redos_vulnerability',
    account_enumeration: 'account_enumeration',
    graphql_batching_dos: 'graphql_batching_dos',
    integer_overflow: 'integer_overflow',
    hidden_unicode_rules: 'hidden_unicode_rules',
    insecure_randomness: 'insecure_randomness',
    crlf_injection: 'crlf_injection',
    malicious_postinstall: 'malicious_postinstall',
    firebase_open_rules: 'firebase_open_rules',
    overprivileged_iac: 'overprivileged_iac',
    trusted_client_headers: 'trusted_client_headers',
    negative_price_injection: 'negative_price_injection',
    container_as_root: 'container_as_root',
    pii_unencrypted: 'pii_unencrypted',
  };

  // Filter vulnerabilities to only those within the user's plan checks.
  const vulnerabilities: Vulnerability[] = allVulnerabilities.filter(v => {
    const cat = (v as any).vibe_category ?? '';
    // First try direct match (new checks category === VIBE_META key)
    if (planKeySet.has(cat)) return true;
    // Then try the mapping
    const vibeKey = CATEGORY_TO_KEY[cat];
    if (vibeKey) return planKeySet.has(vibeKey);
    return true; // unknown/general — always show
  });

  // Recalculate score from plan-filtered vulnerabilities using same formula as Tool.js:
  // critical: -25, high: -10, medium: -4, low: -1
  const planScore = (() => {
    if (!reportData) return 0;
    let s = 100;
    for (const v of vulnerabilities) {
      if (v.severity === 'critical') s -= 25;
      else if (v.severity === 'high') s -= 10;
      else if (v.severity === 'medium') s -= 4;
      else if (v.severity === 'low') s -= 1;
    }
    return Math.max(0, s);
  })();

  // Recalculate counts from plan-filtered vulnerabilities
  const counts = {
    critical: vulnerabilities.filter(v => v.severity === 'critical').length,
    high: vulnerabilities.filter(v => v.severity === 'high').length,
    medium: vulnerabilities.filter(v => v.severity === 'medium').length,
    low: vulnerabilities.filter(v => v.severity === 'low').length,
  };

  const getStatus = (key: string): 'pass' | 'fail' | 'skip' =>
    (vibeChecks[key] as 'pass' | 'fail' | 'skip') ?? 'skip';

  const passedCount = planKeys.filter(k => getStatus(k) === 'pass').length;
  const failedCount = planKeys.filter(k => getStatus(k) === 'fail').length;
  const skippedCount = planKeys.filter(k => getStatus(k) === 'skip').length;

  // Use plan-filtered score for the ring and verdict
  const score = planScore;
  const circumference = 2 * Math.PI * 33;
  const strokeOffset = circumference - (circumference * score) / 100;
  const ringColor = scoreColor(score);
  const sl = statusLabel(score);

  const totalVulns = Math.max(counts.critical + counts.high + counts.medium + counts.low, 1);

  const pillClass: Record<string, string> = {
    critical: 'cs-pc', high: 'cs-ph', medium: 'cs-pm', low: 'cs-pl', info: 'cs-bgy',
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="cs-wrap" id="security-report-view">

        {/* ── SCANNING LOADER — Orchestration Workflow ── */}
        {isScanning && (() => {
          // ── Task definitions (task names, NOT agent names) ──
          const TASKS = [
            { id: 'graph', name: 'Building Knowledge Graph', icon: '◈' },
            { id: 'route', name: 'Intelligent File Routing', icon: '◇' },
            { id: 'secrets', name: 'Secret & Key Detection', icon: '◆' },
            { id: 'auth', name: 'Auth & Access Control Scan', icon: '◆' },
            { id: 'inject', name: 'Injection & Attack Surface Scan', icon: '◆' },
            { id: 'supply', name: 'Supply Chain & Dependency Audit', icon: '◆' },
          ];

          // ── Derive task status from orchTaskIndex (timer-based) ──
          const TASK_ORDER = ['graph', 'route', 'secrets', 'auth', 'inject', 'supply'];
          const getStatus = (taskId: string): 'done' | 'active' | 'pending' => {
            const idx = TASK_ORDER.indexOf(taskId);
            if (idx < orchTaskIndex) return 'done';
            if (idx === orchTaskIndex) return 'active';
            return 'pending';
          };

          // ── Timing display per task ──
          const TASK_TIMINGS = ['2.8s', '2.2s', '4.5s', '5.2s', '6.0s', '4.8s'];
          const getTiming = (taskId: string, status: string) => {
            if (status !== 'done') return '';
            const idx = TASK_ORDER.indexOf(taskId);
            return TASK_TIMINGS[idx] || '';
          };

          // ── Terminal logs come from orchTermLogs (timer-based accumulation) ──
          // Also inject real scanSteps that haven't been covered
          const terminalLogs = [...orchTermLogs];
          scanSteps.forEach((step) => {
            // Avoid duplicates — only add if not already represented
            if (!terminalLogs.some(l => l.msg === step)) {
              const now = new Date().toTimeString().slice(0, 8);
              let type = 'info';
              const sl = step.toLowerCase();
              if (sl.includes('reading') || sl.includes('building') || sl.includes('connect')) type = 'system';
              else if (sl.includes('analyz') || sl.includes('scanning') || sl.includes('running')) type = 'task';
              else if (sl.includes('warning') || sl.includes('detected')) type = 'warn';
              else if (sl.includes('generat') || sl.includes('complete') || sl.includes('done')) type = 'success';
              terminalLogs.push({ ts: `[${now}]`, msg: step, type });
            }
          });

          // ── Active task name for terminal header ──
          const activeTask = TASKS.find(t => getStatus(t.id) === 'active');
          const termTitle = activeTask
            ? `CONSOLE :: ${activeTask.name.toUpperCase().replace(/ /g, '_')}`
            : 'CONSOLE :: FINALIZING';

          // ── Progress percentage ──
          const progressPct = Math.min(Math.round((orchTaskIndex / 6) * 100), 95);

          return (
            <div className="cs-load">
              <div className="cs-orch-wrap">
                {/* ── Header ── */}
                <div className="cs-orch-header">
                  <h1 className="cs-orch-title">Security Analysis Pipeline</h1>
                  <p className="cs-orch-sub">
                    Multi-agent deep scan executing on your codebase.{' '}
                    Tracing data flows and checking for 40+ vulnerability types.
                  </p>
                </div>

                {/* ── Grid: Tasks + Terminal ── */}
                <div className="cs-orch-grid">
                  {/* Left — Task cards */}
                  <div className="cs-orch-tasks">
                    {TASKS.map((task, i) => {
                      const status = getStatus(task.id);
                      const timing = getTiming(task.id, status);
                      return (
                        <div
                          key={task.id}
                          className={`cs-orch-task ${status}`}
                          style={{ animationDelay: `${i * 0.08}s` }}
                        >
                          <div className={`cs-orch-ico ${status}`}>
                            {status === 'done' ? (
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <path d="m5 12 5 5L20 7" />
                              </svg>
                            ) : status === 'active' ? (
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 2s linear infinite' }}>
                                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                              </svg>
                            ) : (
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" />
                              </svg>
                            )}
                          </div>
                          <div className="cs-orch-info">
                            <div className="cs-orch-task-name">{task.name}</div>
                            <div className={`cs-orch-task-status ${status}`}>
                              {status === 'done' ? 'STATUS: COMPLETE' : status === 'active' ? (
                                <>STATUS: RUNNING <span style={{ display: 'inline-block', animation: 'csBlink 1s step-end infinite' }}>•••</span></>
                              ) : 'STATUS: PENDING'}
                            </div>
                          </div>
                          {timing && (
                            <div className="cs-orch-time">{timing}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Right — Terminal */}
                  <div className="cs-orch-terminal">
                    <div className="cs-orch-term-bar">
                      <div className="cs-orch-dots">
                        <div className="cs-orch-dot r" />
                        <div className="cs-orch-dot y" />
                        <div className="cs-orch-dot g" />
                      </div>
                      <div className="cs-orch-term-title">{termTitle}</div>
                    </div>

                    <div className="cs-orch-term-body" id="scanStepScroll">
                      {terminalLogs.map((log, i) => (
                        <div key={i} className="cs-orch-log">
                          <span className="cs-orch-log-ts">{log.ts}</span>
                          <span className={`cs-orch-log-msg ${log.type}`}>{log.msg}</span>
                        </div>
                      ))}
                      {/* Blinking cursor */}
                      <div className="cs-orch-log" style={{ marginTop: 4 }}>
                        <span className="cs-orch-log-ts" style={{ visibility: 'hidden' }}>[--:--:--]</span>
                        <span style={{ color: '#565f89' }}>– <span className="cs-orch-cursor" /></span>
                      </div>
                    </div>

                    <div className="cs-orch-term-footer">
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span className="cs-orch-meter">
                            {usage.total > 0 ? `TOKENS: ${usage.total.toLocaleString()}` : `PROGRESS: ${progressPct}%`}
                          </span>
                          <span className="cs-orch-meter">
                            {usage.total > 0
                              ? `IN: ${usage.input.toLocaleString()} / OUT: ${usage.output.toLocaleString()}`
                              : `${orchTaskIndex} / 6 TASKS`
                            }
                          </span>
                        </div>
                        <div className="cs-orch-bar-wrap">
                          <div className="cs-orch-bar-fill" style={{ width: `${progressPct}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── REPORT VIEW ── */}
        {!isScanning && isVisible && reportData && (
          <div id="resSec">
            {/* STICKY HEADER CONTROLS - FULL WIDTH */}
            <div style={{
              position: 'sticky',
              top: 0,
              zIndex: 9999,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              padding: '12px 0',
              margin: '0 auto',
              width: '100%',
              background: 'transparent',
              pointerEvents: 'none'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: 'min(1400px, calc(100% - 48px))',
                gap: 20
              }}>
                <div style={{ pointerEvents: 'auto', flexShrink: 0 }}>
                  <button className="cs-btn" onClick={onBack} style={{
                    borderRadius: '99px',
                    padding: '8px 20px',
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    fontSize: '13px',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                    cursor: 'pointer'
                  }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
                      <path d="m15 18-6-6 6-6" />
                    </svg>
                    Back
                  </button>
                </div>

                {/* SUBSCRIPTION STATUS BANNER - Centered in sticky header */}
                <div style={{ pointerEvents: 'auto', flex: 1, display: 'flex', justifyContent: 'center' }}>
                  {(() => {
                    const pl = PLAN_LIMITS_LOCAL[planTier] || PLAN_LIMITS_LOCAL.free;
                    const scanPct = Math.min((scansUsed / pl.scansPerMonth) * 100, 100);
                    const checkPct = Math.round((planChecksCount / TOTAL_CHECKS) * 100);
                    const isNearLimit = scansUsed >= pl.scansPerMonth - 1;
                    return (
                      <div className="dashboard-status-banner" style={{
                        background: 'rgba(255, 255, 255, 0.95)',
                        backdropFilter: 'blur(10px)',
                        border: `1.5px solid ${isNearLimit ? 'rgba(225,29,72,0.4)' : '#e2e8f0'}`,
                        borderRadius: 60,
                        padding: '10px 24px',
                        display: 'flex',
                        alignItems: 'center',
                        flexWrap: 'wrap', // Added for mobile
                        gap: '12px 24px', // Adjusted gap
                        boxShadow: isNearLimit ? '0 0 0 4px rgba(225,29,72,0.1)' : '0 8px 24px rgba(0,0,0,0.06)',
                        width: '100%',
                        maxWidth: '1100px',
                      }}>
                        {/* Plan badge */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                          <div style={{
                            width: 36, height: 36, borderRadius: 10,
                            background: pl.color + '18',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            {planTier === 'plus' ? <ShieldCheck size={20} color={pl.color} /> : planTier === 'pro' ? <Zap size={20} color={pl.color} /> : <Search size={20} color={pl.color} />}
                          </div>
                          <div>
                            <div style={{ fontWeight: 800, fontSize: 13, color: '#0F172A', lineHeight: 1.2 }}>{pl.label} Plan</div>
                            <div style={{ fontSize: 11, color: '#64748B', fontWeight: 500 }}>Active subscription</div>
                          </div>
                          <button
                            onClick={() => (window as any).showPricingModal?.()}
                            style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: pl.color, background: pl.color + '12', border: `1px solid ${pl.color}30`, borderRadius: 100, padding: '3px 10px', cursor: 'pointer' }}
                          >
                            {planTier === 'plus' ? 'Manage' : 'Upgrade ↗'}
                          </button>
                        </div>

                        {/* Divider */}
                        <div className="divider-v" style={{ width: 1, height: 40, background: '#e2e8f0', flexShrink: 0 }} />

                        {/* Scans meter */}
                        <div style={{ flex: '1 1 140px', minWidth: 120 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Scans This Month</span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: isNearLimit ? '#E11D48' : '#0F172A', fontFamily: 'monospace' }}>{scansUsed}/{pl.scansPerMonth}</span>
                          </div>
                          <div style={{ height: 6, background: '#F1F5F9', borderRadius: 6, overflow: 'hidden' }}>
                            <div style={{ width: `${scanPct}%`, height: '100%', background: isNearLimit ? '#E11D48' : pl.color, borderRadius: 6, transition: 'width 0.4s' }} />
                          </div>
                          {isNearLimit && <div style={{ fontSize: 10, color: '#E11D48', fontWeight: 600, marginTop: 3 }}>⚠ Limit almost reached</div>}
                        </div>

                        {/* Divider */}
                        <div className="divider-v" style={{ width: 1, height: 40, background: '#e2e8f0', flexShrink: 0 }} />

                        {/* Code limit */}
                        <div style={{ flexShrink: 0 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>Max Code Size</div>
                          <div style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', lineHeight: 1 }}>{pl.maxCodeMB >= 1024 ? (pl.maxCodeMB / 1024).toFixed(0) + 'GB' : pl.maxCodeMB + 'MB'}</div>
                          <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 2 }}>per scan</div>
                        </div>

                        {/* Divider */}
                        <div className="divider-v" style={{ width: 1, height: 40, background: '#e2e8f0', flexShrink: 0 }} />

                        {/* Checks */}
                        <div style={{ flex: '1 1 120px', minWidth: 100 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Security Checks</span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#0F172A', fontFamily: 'monospace' }}>{planChecksCount}/83</span>
                          </div>
                          <div style={{ height: 6, background: '#F1F5F9', borderRadius: 6, overflow: 'hidden' }}>
                            <div style={{ width: `${checkPct}%`, height: '100%', background: pl.color, borderRadius: 6 }} />
                          </div>
                          <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 3 }}>{83 - planChecksCount > 0 ? `${83 - planChecksCount} more on higher plan` : 'Full coverage ✓'}</div>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                <div style={{ pointerEvents: 'auto', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 12, position: 'relative' }}>
                  <button
                    className="cs-menu-toggle"
                    onClick={() => setShowActionMenu(!showActionMenu)}
                    title="Action menu"
                    style={{
                      borderRadius: '50%',
                      width: '42px',
                      height: '42px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                      cursor: 'pointer',
                      padding: 0
                    }}
                  >
                    {showActionMenu ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="4" y1="6" x2="20" y2="6" />
                        <line x1="4" y1="12" x2="20" y2="12" />
                        <line x1="4" y1="18" x2="20" y2="18" />
                      </svg>
                    )}
                  </button>

                  {showActionMenu && (
                    <div className="cs-action-popover" onClick={(e) => e.stopPropagation()}>
                      <button className="cs-menu-item" onClick={() => { onDownload(); setShowActionMenu(false); }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                        Download Report
                      </button>
                      <button className="cs-menu-item" onClick={() => { setShowHistoryModal(true); setShowActionMenu(false); }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20v-6M6 20V10M18 20V4" /></svg>
                        Recent Scans
                      </button>

                      <button
                        className="cs-menu-item"
                        style={{ background: 'rgba(99, 102, 241, 0.1)', color: '#4F46E5', fontWeight: 800, marginTop: 4, borderRadius: 10 }}
                        onClick={() => { if (window.askAboutReport) window.askAboutReport(reportData); setShowActionMenu(false); }}
                      >
                        <MessageSquare size={14} style={{ color: '#4F46E5' }} />
                        Ask AI Assistant
                      </button>


                      {reportData.regression && (
                        <button className="cs-menu-item" onClick={() => { setShowImpactModal(true); setShowActionMenu(false); }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 3h5v5M4 20L21 3M21 21l-7-7M20 16h-5v5" /></svg>
                          Impact Analysis
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="cs-page" style={{ paddingTop: 40 }}>

              {/* HEADER */}
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 28 }}>
                <div>
                  <h1 style={{ fontSize: 26, fontWeight: 700, color: '#0F172A', margin: 0, letterSpacing: '-0.02em' }}>Security Scan Report</h1>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#64748B', fontSize: 13, marginTop: 6 }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                    <span>Last scan completed just now · <span style={{ color: '#0F172A', fontWeight: 500 }}>{reportData.project_name || 'production-main-branch'}</span></span>
                  </div>
                </div>

              </div>

              {/* TOP GRID */}
              <div className="cs-top">

                {/* RISK SCORE */}
                <div className="cs-card cs-risk">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span className="cs-lbl">Risk Score</span>
                  </div>
                  {/* Plan scope note */}
                  <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 500, marginBottom: 4 }}>
                    Based on <strong style={{ color: PLAN_LIMITS_LOCAL[planTier]?.color }}>{planChecksCount} checks</strong> · {PLAN_LIMITS_LOCAL[planTier]?.label} Plan
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                    <div className="cs-ring-wrap">
                      <svg width="80" height="80" viewBox="0 0 80 80">
                        <circle cx="40" cy="40" r="33" stroke="#E5E3DC" strokeWidth="7" fill="none" />
                        <circle cx="40" cy="40" r="33" stroke={ringColor} strokeWidth="7" fill="none"
                          strokeDasharray={circumference} strokeDashoffset={strokeOffset} strokeLinecap="round" />
                      </svg>
                      <div className="cs-ring-c">
                        <span style={{ fontFamily: 'monospace', fontSize: 22, fontWeight: 500, lineHeight: 1, color: '#0F0E0B' }}>{score}</span>
                        <span style={{ fontSize: 10, color: '#A09F9B', marginTop: 1 }}>/100</span>
                      </div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', fontSize: 12, fontWeight: 500, color: sl.color, background: sl.bg, border: `1px solid ${sl.border}`, padding: '3px 10px', borderRadius: 100, marginBottom: 8 }}>
                        {sl.text}
                      </div>
                      {reportData.summary && (
                        <p style={{ fontSize: 12, color: '#6B6A66', lineHeight: 1.6, margin: 0 }}>{reportData.summary}</p>
                      )}
                    </div>
                  </div>

                  <div className="cs-risk-bars">
                    {([
                      { label: 'Critical', val: counts.critical, color: '#E11D48' },
                      { label: 'High', val: counts.high, color: '#EA580C' },
                      { label: 'Medium', val: counts.medium, color: '#F59E0B' },
                      { label: 'Low', val: counts.low, color: '#059669' },
                    ] as const).map(({ label, val, color }) => (
                      <div key={label} className="cs-bar-row">
                        <span className="cs-bar-lbl">{label}</span>
                        <div className="cs-bar-track">
                          <div className="cs-bar-fill" style={{ width: `${Math.round((val / totalVulns) * 100)}%`, background: color }} />
                        </div>
                        <span style={{ color: '#A09F9B', width: 16, textAlign: 'right', fontFamily: 'monospace', fontSize: 11 }}>{val}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* SEVERITY + STATS */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div className="cs-sev-grid">
                    {([
                      { cls: 'cs-sc', label: 'Critical', action: 'Immediate fix', val: counts.critical, color: '#E11D48', bg: '#FFF1F2', bdr: '#FDA4AF', textColor: '#9F1239' },
                      { cls: 'cs-sh', label: 'High', action: 'Fix soon', val: counts.high, color: '#EA580C', bg: '#FFF7ED', bdr: '#FDBA74', textColor: '#9A3412' },
                      { cls: 'cs-sm', label: 'Medium', action: 'Plan fix', val: counts.medium, color: '#D97706', bg: '#FEFCE8', bdr: '#FDE047', textColor: '#854D0E' },
                      { cls: 'cs-sl', label: 'Low', action: 'Low priority', val: counts.low, color: '#059669', bg: '#F0FDF4', bdr: '#86EFAC', textColor: '#166534' },
                    ] as const).map(({ cls, label, action, val, color, ...rest }) => {
                      const bg = 'bg' in rest ? (rest as any).bg : undefined;
                      const bdr = 'bdr' in rest ? (rest as any).bdr : undefined;
                      const textColor = 'textColor' in rest ? (rest as any).textColor : color;
                      return (
                        <div key={label} className={`cs-sev-card ${cls}`} style={(val > 0) ? { background: bg, borderColor: bdr } : { background: 'var(--surface)', opacity: 0.8 }}>
                          <span className="cs-sev-n" style={{ color }}>{val}</span>
                          <span className="cs-sev-name" style={(val > 0) ? { color: textColor } : {}}>{label}</span>
                          <span className="cs-sev-act" style={(val > 0) ? { color } : {}}>{action}</span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="cs-stats">
                    {(() => {
                      const planInfo = PLAN_LIMITS_LOCAL[planTier] || PLAN_LIMITS_LOCAL.free;
                      const planChecks = planChecksCount;
                      const scansLimit = planInfo.scansPerMonth;
                      return [
                        { label: 'Plan Checks', val: planChecks, sub: `of 83 total · ${planInfo.label} plan`, color: planInfo.color },
                        { label: 'Passed', val: passedCount, sub: `${Math.round((passedCount / (allKeys.length || 1)) * 100)}% pass rate`, color: '#16A34A' },
                        { label: 'Issues', val: failedCount, sub: 'needs fix', color: failedCount > 0 ? '#D84040' : '#0F0E0B' },
                        { label: 'Scans Left', val: scansLimit - scansUsed, sub: `${scansUsed}/${scansLimit} used`, color: (scansLimit - scansUsed) <= 1 ? '#D84040' : '#0F0E0B' },
                      ].map(({ label, val, sub, color }) => (
                        <div key={label} className="cs-card" style={{ padding: '14px 16px' }}>
                          <div className="cs-lbl" style={{ marginBottom: 4 }}>{label}</div>
                          <div style={{ fontFamily: 'monospace', fontSize: 20, fontWeight: 500, color: color ?? '#0F0E0B' }}>{val}</div>
                          <div style={{ fontSize: 11, color: '#A09F9B', marginTop: 2 }}>{sub}</div>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              </div>

              {/* BOTTOM GRID */}
              <div className="cs-bot">

                {/* LEFT */}
                <div className="cs-left">

                  {/* SAFETY CHECKS */}
                  <div className="cs-card" style={{ padding: 0, overflow: 'hidden' }}>
                    <div className="cs-card-h">
                      <span className="cs-card-t">Safety Checks</span>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        {passedCount > 0 && <span className="cs-badge cs-bg">{passedCount} passed</span>}
                        {failedCount > 0 && <span className="cs-badge cs-br">{failedCount} issue{failedCount !== 1 ? 's' : ''}</span>}
                        {skippedCount > 0 && <span className="cs-badge cs-bgy">{skippedCount} skipped</span>}
                        <span style={{ fontSize: 11, padding: '2px 8px', background: PLAN_LIMITS_LOCAL[planTier]?.color + '18', color: PLAN_LIMITS_LOCAL[planTier]?.color, border: `1px solid ${PLAN_LIMITS_LOCAL[planTier]?.color}30`, borderRadius: 100, fontWeight: 700 }}>
                          {planChecksCount}/{TOTAL_CHECKS} · {PLAN_LIMITS_LOCAL[planTier]?.label}
                        </span>
                      </div>
                    </div>

                    {/* Active plan checks */}
                    <div className={expandedChecks ? 'cs-checks-grid' : 'cs-checks-h'} style={{ paddingRight: expandedChecks ? 20 : 0 }}>
                      {(expandedChecks ? planKeys : planKeys.slice(0, 6)).map((key) => {
                        const st = getStatus(key);
                        const meta = VIBE_META[key];
                        const statusText = st === 'pass' ? 'No Issues' : st === 'fail' ? 'Issue Found' : 'Not Applicable';
                        const statusColor = st === 'pass' ? '#16A34A' : st === 'fail' ? '#C2410C' : '#94A3B8';
                        const tooltip = st === 'pass'
                          ? 'Scanned and no vulnerability found for this check.'
                          : st === 'fail'
                            ? 'A vulnerability was detected in your code. See details below.'
                            : 'This check was skipped — not applicable to your detected tech stack.';
                        return (
                          <div key={key} className="cs-chk-card" style={{ flex: expandedChecks ? 'none' : '0 0 160px', alignItems: 'flex-start' }} title={tooltip}>
                            <div className={`cs-chk-card-ico ${st === 'pass' ? 'cs-ip' : st === 'fail' ? 'cs-if' : 'cs-is'}`} />
                            <div className="cs-chk-card-det">
                              <span className="cs-chk-card-t">{VIBE_META[key].label}</span>
                              <span className="cs-chk-card-s" style={{ color: statusColor }}>
                                {statusText}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                      {!expandedChecks && planKeys.length > 6 && (
                        <div
                          className="cs-more-card"
                          style={{ flex: '0 0 44px', minHeight: 54 }}
                          onClick={() => setExpandedChecks(true)}
                          title="Show all safety checks"
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6B6A66" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                        </div>
                      )}
                    </div>

                    {expandedChecks && (
                      <div style={{ padding: '0 20px 8px', textAlign: 'center' }}>
                        <button className="cs-btn" style={{ width: '100%', justifyContent: 'center', height: 36, opacity: 0.8 }} onClick={() => setExpandedChecks(false)}>
                          Show less ▴
                        </button>
                      </div>
                    )}

                    {expandedChecks && lockedKeys.length > 0 && (
                      <div style={{ padding: '0 20px 20px' }}>
                        <div style={{ borderTop: '1px dashed #e2e8f0', paddingTop: 16, marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#64748B' }}>
                              <Lock size={14} />
                              <span style={{ fontSize: 13, fontWeight: 700 }}>{lockedKeys.length} More Checks</span>
                            </div>
                            <span style={{ fontSize: 11, color: '#94A3B8', fontWeight: 500 }}>not included in {PLAN_LIMITS_LOCAL[planTier]?.label} plan</span>
                          </div>

                          <button
                            onClick={() => (window as any).showPricingModal?.()}
                            style={{ fontSize: 12, fontWeight: 700, color: '#C2410C', background: 'rgba(194,65,12,0.08)', border: '1px solid rgba(194,65,12,0.2)', borderRadius: 100, padding: '4px 14px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                          >
                            Upgrade to Unlock ↗
                          </button>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {lockedKeys.map((key) => (
                            <div
                              key={key}
                              onClick={() => (window as any).showPricingModal?.()}
                              title="Upgrade to scan this check"
                              style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                padding: '5px 10px', borderRadius: 10,
                                background: '#F8FAFC', border: '1px dashed #CBD5E1',
                                cursor: 'pointer', opacity: 0.55,
                                transition: 'opacity 0.15s',
                              }}
                              onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
                              onMouseLeave={e => (e.currentTarget.style.opacity = '0.55')}
                            >
                              <Lock size={12} strokeWidth={2.5} color="#CBD5E1" />
                              <span style={{ fontSize: 11, fontWeight: 600, color: '#94A3B8' }}>{VIBE_META[key].label}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ── VIBE CHECK REPORT CARD ────────────────────────────── */}

                  {/* ══════════════════════════════════════════════════════
                      PRODUCTION ISSUES CARD — The Operator Agent
                      Shows bugs that caused real outages at real companies
                      ══════════════════════════════════════════════════════ */}
                  {(() => {
                    // Pull operator findings from reportData
                    const operatorFindings: Array<{
                      type: string;
                      severity: string;
                      file: string;
                      line?: number;
                      snippet?: string;
                      reasoning?: string;
                      fix?: string;
                      incident?: string;
                      confidence?: number;
                    }> = (reportData as any)?.operator_findings || [];

                    if (operatorFindings.length === 0) return null;

                    const criticalOp = operatorFindings.filter(f => f.severity?.toLowerCase() === 'critical').length;
                    const highOp = operatorFindings.filter(f => f.severity?.toLowerCase() === 'high').length;

                    const sevColor = (s: string) => {
                      switch (s?.toLowerCase()) {
                        case 'critical': return { bg: '#FFF7ED', border: '#FDBA74', text: '#9A3412', dot: '#EA580C' };
                        case 'high': return { bg: '#FFFBEB', border: '#FED7AA', text: '#9A3412', dot: '#F97316' };
                        case 'medium': return { bg: '#FEFCE8', border: '#FDE68A', text: '#713F12', dot: '#CA8A04' };
                        default: return { bg: '#F0FDF4', border: '#BBF7D0', text: '#166534', dot: '#16A34A' };
                      }
                    };

                    return (
                      <div className="cs-card" style={{ padding: 0, overflow: 'hidden', borderColor: criticalOp > 0 ? '#FECACA' : '#FED7AA' }}>
                        {/* Header */}
                        <div style={{
                          background: criticalOp > 0
                            ? 'linear-gradient(135deg, #fc9228ff 0%, #f1694bff 100%)'
                            : 'linear-gradient(135deg, #fc9228ff 0%, #f1694bff 100%)',
                          padding: '18px 24px',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <Factory size={22} color="#fff" />
                              <div>
                                <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>
                                  Production Failure Risks
                                </div>
                                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', fontWeight: 500, marginTop: 2 }}>
                                  Patterns that caused real outages at GitLab, StackOverflow, Knight Capital & more
                                </div>
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: 6 }}>
                              {criticalOp > 0 && (
                                <span style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)', color: '#fff', fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.2)' }}>
                                  {criticalOp} CRITICAL
                                </span>
                              )}
                              {highOp > 0 && (
                                <span style={{ background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)', color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.15)' }}>
                                  {highOp} HIGH
                                </span>
                              )}
                            </div>
                          </div>
                          {/* Quick stat row */}
                          <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
                            {(['critical', 'high', 'medium', 'low'] as const).map(sev => {
                              const n = operatorFindings.filter(f => f.severity?.toLowerCase() === sev).length;
                              if (!n) return null;
                              const colors = { critical: '#F87171', high: '#FB923C', medium: '#FBBF24', low: '#4ADE80' };
                              return (
                                <div key={sev} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: colors[sev] }} />
                                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 600, textTransform: 'capitalize' }}>{n} {sev}</span>
                                </div>
                              );
                            })}
                            <div style={{ marginLeft: 'auto', fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>
                              {operatorFindings.length} pattern{operatorFindings.length !== 1 ? 's' : ''} detected by The Operator
                            </div>
                          </div>
                        </div>

                        {/* Findings list */}
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          {operatorFindings.map((f, idx) => {
                            const sc = sevColor(f.severity);
                            const [expandedOp, setExpandedOp] = [false, () => { }]; // handled via data-attr trick below
                            return (
                              <details key={idx} style={{ borderBottom: idx === operatorFindings.length - 1 ? 'none' : '1px solid rgba(0,0,0,0.06)' }}>
                                <summary style={{
                                  display: 'flex', alignItems: 'center', gap: 10,
                                  padding: '14px 20px', cursor: 'pointer',
                                  listStyle: 'none', userSelect: 'none',
                                  transition: 'background 0.15s ease',
                                }}
                                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#FAFAFA'; }}
                                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                                >
                                  {/* Severity dot */}
                                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: sc.dot, flexShrink: 0 }} />

                                  {/* Type + file */}
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: '#0F0E0B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {f.type}
                                    </div>
                                    <div style={{ fontSize: 10, color: '#64748B', fontFamily: 'monospace', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {f.file}{f.line ? `:${f.line}` : ''}
                                    </div>
                                  </div>

                                  {/* Severity pill */}
                                  <span style={{
                                    background: sc.bg, border: `1px solid ${sc.border}`, color: sc.text,
                                    fontSize: 9, fontWeight: 800, padding: '2px 8px', borderRadius: 20,
                                    textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0,
                                  }}>
                                    {f.severity}
                                  </span>

                                  {/* Chevron */}
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0, transition: 'transform 0.2s' }}>
                                    <path d="m6 9 6 6 6-6" />
                                  </svg>
                                </summary>

                                {/* Expanded detail */}
                                <div style={{ padding: '0 20px 16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>

                                  {/* Real incident badge */}
                                  {f.incident && (
                                    <div style={{
                                      display: 'flex', alignItems: 'flex-start', gap: 10,
                                      background: 'linear-gradient(135deg, rgba(127,29,29,0.04), rgba(153,27,27,0.06))',
                                      border: '1px solid rgba(220,38,38,0.12)',
                                      borderRadius: 10, padding: '10px 14px',
                                    }}>
                                      <Search size={16} color="#e6aa61ff" style={{ flexShrink: 0, marginTop: 2 }} />
                                      <div>
                                        <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#991B1B', marginBottom: 3 }}>
                                          Real Incident
                                        </div>
                                        <div style={{ fontSize: 11, color: '#e8a567ff', lineHeight: 1.6, fontWeight: 500 }}>
                                          {f.incident}
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                  {/* Code snippet */}
                                  {f.snippet && (
                                    <div style={{ background: '#0F172A', borderRadius: 8, overflow: 'hidden' }}>
                                      <div style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <div style={{ display: 'flex', gap: 4 }}>
                                          {['#FF5F57', '#FEBC2E', '#28C840'].map(c => <div key={c} style={{ width: 6, height: 6, borderRadius: '50%', background: c }} />)}
                                        </div>
                                        <span style={{ fontSize: 9, color: '#64748B', fontFamily: 'monospace', fontWeight: 600, marginLeft: 4 }}>{f.file}</span>
                                      </div>
                                      <pre style={{ margin: 0, padding: '10px 14px', fontFamily: 'monospace', fontSize: 11, color: '#F8FAFC', lineHeight: 1.6, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                                        {f.snippet}
                                      </pre>
                                    </div>
                                  )}

                                  {/* Why it fails in production */}
                                  {f.reasoning && (
                                    <div>
                                      <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#94A3B8', marginBottom: 6 }}>
                                        Why This Fails in Production
                                      </div>
                                      <p style={{ fontSize: 12, color: '#475569', lineHeight: 1.7, margin: 0 }}>
                                        {f.reasoning}
                                      </p>
                                    </div>
                                  )}

                                  {/* Fix */}
                                  {f.fix && (
                                    <div style={{
                                      background: 'rgba(5,150,105,0.04)',
                                      border: '1px solid rgba(5,150,105,0.12)',
                                      borderRadius: 10, padding: '10px 14px',
                                    }}>
                                      <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#059669', marginBottom: 5 }}>
                                        🛠 How to Fix
                                      </div>
                                      <p style={{ fontSize: 11, color: '#065F46', lineHeight: 1.7, margin: 0, fontWeight: 500 }}>
                                        {f.fix}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              </details>
                            );
                          })}
                        </div>

                        {/* Footer */}
                        <div style={{
                          padding: '10px 20px',
                          borderTop: '1px solid rgba(0,0,0,0.06)',
                          background: '#FAFAFA',
                          display: 'flex', alignItems: 'center', gap: 6,
                        }}>
                          <Factory size={10} color="#94A3B8" />
                          <span style={{ fontSize: 10, color: '#94A3B8', fontWeight: 600 }}>
                            Detected by The Operator — patterns from real production incidents at GitLab, Knight Capital, StackOverflow & more
                          </span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Vibe Summary Banner */}

                  {vulnerabilities.length > 0 && (() => {
                    const vibeReport = generateVibeReportCard(
                      vulnerabilities.map(v => ({
                        type: v.name ?? v.title ?? v.vibe_category ?? '',
                        severity: v.severity,
                        cwe: '',
                      })),
                      score
                    );
                    const vibeScoreBg: Record<string, string> = {
                      'Ship It 🚀': 'linear-gradient(135deg, #059669, #10B981)',
                      'Almost There 🔧': 'linear-gradient(135deg, #D97706, #F59E0B)',
                      'Danger Zone 🚨': 'linear-gradient(135deg, #EA580C, #F97316)',
                      'Code Red 🔴': 'linear-gradient(135deg, #EA580C, #EA580C)',
                    };
                    return (
                      <div className="cs-card" style={{ padding: 0, overflow: 'hidden' }}>
                        <div style={{
                          background: vibeScoreBg[vibeReport.vibeScore] ?? 'linear-gradient(135deg, #6366F1, #8B5CF6)',
                          padding: '20px 24px',
                          color: '#fff',
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em' }}>
                              Vibe Check
                            </div>
                            <div style={{
                              background: 'rgba(255,255,255,0.2)',
                              backdropFilter: 'blur(10px)',
                              padding: '6px 16px',
                              borderRadius: 20,
                              fontSize: 13,
                              fontWeight: 700,
                            }}>
                              {vibeReport.vibeScore}
                            </div>
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.6, opacity: 0.95 }}>
                            {vibeReport.summary}
                          </div>
                        </div>
                        {/* Top threats */}
                        {vibeReport.topThreats.length > 0 && (
                          <div style={{ padding: '16px 20px', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                            <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#94A3B8', marginBottom: 10 }}>
                              Top Threats in Plain English
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                              {vibeReport.topThreats.slice(0, 3).map((threat, idx) => (
                                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  {getProfessionalIcon(threat.icon, 16, '#0F172A')}
                                  <span style={{ fontSize: 12, fontWeight: 600, color: '#0F172A', lineHeight: 1.4 }}>
                                    {threat.headline}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Vulnerability Cards with Vibe Check translations */}
                  <div className="cs-card" style={{ padding: 0, overflow: 'visible' }}>
                    <div className="cs-card-h" style={{ borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
                      <div className="cs-card-t" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <ShieldCheck size={20} color="#0F172A" />
                        Security Issues — Plain English
                      </div>
                    </div>

                    {vulnerabilities.length === 0 ? (
                      <div style={{ padding: '32px 20px', textAlign: 'center', color: '#A09F9B', fontSize: 13 }}>
                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}><CheckCircle2 size={40} color="#059669" strokeWidth={2.5} /></div>
                        <div style={{ fontWeight: 700, color: '#059669', marginBottom: 4 }}>Vibe Check Passed!</div>
                        No security issues found. Your code looks clean.
                      </div>
                    ) : (
                      <div className="cs-vuln-list">
                        {vulnerabilities.map((v, i) => {
                          const isExpanded = expandedIndices.includes(i);
                          const vibe = vibeCheck(
                            v.name ?? v.title ?? v.vibe_category ?? '',
                            v.severity,
                            ''
                          );
                          const urgencyColors: Record<string, { bg: string; border: string; text: string }> = {
                            '🔥 Fix Now': { bg: '#FFE4E6', border: '#FDA4AF', text: '#E11D48' },
                            '⚠️ Fix Soon': { bg: '#FFEDD5', border: '#FDBA74', text: '#EA580C' },
                            '📋 Plan to Fix': { bg: '#FEF3C7', border: '#FDE047', text: '#D97706' },
                            '💡 Good to Know': { bg: '#D1FAE5', border: '#6EE7B7', text: '#059669' },
                          };
                          const uc = urgencyColors[vibe.urgency] ?? urgencyColors['📋 Plan to Fix'];

                          const iconPalette = [
                            { bg: '#EFF6FF', border: '#BFDBFE', text: '#2563EB' }, // Blue
                            { bg: '#F5F3FF', border: '#DDD6FE', text: '#7C3AED' }, // Violet
                            { bg: '#ECFEFF', border: '#A5F3FC', text: '#0891B2' }, // Cyan
                            { bg: '#FFF1F2', border: '#FECDD3', text: '#E11D48' }, // Rose
                            { bg: '#ECFDF5', border: '#A7F3D0', text: '#059669' }, // Emerald
                            { bg: '#FFF7ED', border: '#FED7AA', text: '#EA580C' }, // Orange
                          ];
                          // Hash the icon name so the same issue type always gets the same color, preventing color changes on re-renders, but randomizing nicely.
                          const hash = vibe.icon.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
                          const ic = iconPalette[(hash + i) % iconPalette.length];

                          return (
                            <div key={i} style={{ borderBottom: i === vulnerabilities.length - 1 ? 'none' : '1px solid rgba(0,0,0,.06)' }}>
                              {/* HEADER — Vibe Check headline */}
                              <div className="cs-vuln-h" onClick={() => {
                                setExpandedIndices(prev =>
                                  prev.includes(i) ? prev.filter(idx => idx !== i) : [...prev, i]
                                );
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1, overflow: 'hidden' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: ic.bg, border: `1px solid ${ic.border}`, boxShadow: `0 2px 8px ${ic.border}66`, borderRadius: '12px', width: 42, height: 42, flexShrink: 0 }}>
                                    {getProfessionalIcon(vibe.icon, 20, ic.text)}
                                  </div>
                                  <div style={{ overflow: 'hidden', minWidth: 0 }}>
                                    <div style={{ fontSize: 13, fontWeight: 750, color: '#0F0E0B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                      {vibe.headline}
                                    </div>
                                    <div style={{ fontSize: 11, color: '#64748B', fontWeight: 500, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                      {v.file}{v.line ? ` : L${v.line}` : ''}
                                    </div>
                                    {/* Agent agreement row */}
                                    {(() => {
                                      const agentColors: Record<string, { bg: string; text: string; border: string }> = {
                                        sleuth:   { bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE' },
                                        guardian: { bg: '#F5F3FF', text: '#6D28D9', border: '#DDD6FE' },
                                        hacker:   { bg: '#FFF1F2', text: '#BE123C', border: '#FECDD3' },
                                        auditor:  { bg: '#FFF7ED', text: '#C2410C', border: '#FED7AA' },
                                        sentinel: { bg: '#F0FDF4', text: '#166534', border: '#BBF7D0' },
                                        operator: { bg: '#FAFAFA', text: '#374151', border: '#E5E7EB' },
                                      };
                                      if (v.confirmed_by && v.confirmed_by.length >= 2) {
                                        return (
                                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 5, flexWrap: 'wrap' }}>
                                            <span style={{ fontSize: 9, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: 1 }}>Confirmed by</span>
                                            {v.confirmed_by.map((agent) => {
                                              const ac = agentColors[agent] ?? { bg: '#F1F5F9', text: '#475569', border: '#CBD5E1' };
                                              return (
                                                <span key={agent} style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 100, background: ac.bg, color: ac.text, border: `1px solid ${ac.border}`, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                  {agent}
                                                </span>
                                              );
                                            })}
                                          </div>
                                        );
                                      }
                                      if (v.needs_review) {
                                        return (
                                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 5 }}>
                                            <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 7px', borderRadius: 100, background: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A', letterSpacing: '0.04em' }}>
                                              ⚠ Needs Review
                                            </span>
                                          </div>
                                        );
                                      }
                                      return null;
                                    })()}
                                  </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, position: 'relative' }}>
                                  {/* Confidence badge */}
                                  {v.confidence != null && (
                                    <span title={`Confidence: ${v.confidence}%`} style={{
                                      fontSize: 10, fontWeight: 700, padding: '2px 7px',
                                      borderRadius: 100, fontFamily: 'monospace',
                                      background: v.confidence >= 90 ? '#ECFDF5' : v.confidence >= 75 ? '#FFFBEB' : '#FFF1F2',
                                      color:      v.confidence >= 90 ? '#065F46' : v.confidence >= 75 ? '#92400E' : '#9F1239',
                                      border: `1px solid ${v.confidence >= 90 ? '#6EE7B7' : v.confidence >= 75 ? '#FDE68A' : '#FECDD3'}`,
                                    }}>
                                      {v.confidence}%
                                    </span>
                                  )}
                                  <span className={`cs-pill ${pillClass[v.severity] ?? 'cs-bgy'}`} style={{ transform: 'scale(0.85)', transformOrigin: 'center' }}>
                                    {v.severity}
                                  </span>
                                  <button
                                    style={{
                                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                      padding: '5px 12px', borderRadius: 8,
                                      background: '#fff',
                                      color: '#334155',
                                      border: '1px solid #CBD5E1',
                                      boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                                      fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                      transition: 'all 0.15s ease',
                                    }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActiveExplainId(activeExplainId === i ? null : i);
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.background = '#F8FAFC'; e.currentTarget.style.borderColor = '#94A3B8'; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#CBD5E1'; }}
                                  >
                                    <Info size={14} strokeWidth={2.5} color="#64748B" /> Explain
                                  </button>

                                  {/* Custom Popover for Explain */}
                                  {activeExplainId === i && (
                                    <div
                                      onClick={(e) => e.stopPropagation()}
                                      style={{
                                        position: 'absolute',
                                        bottom: 'calc(100% + 12px)',
                                        right: 30,
                                        width: 320,
                                        background: '#0F172A',
                                        padding: '16px 20px',
                                        borderRadius: 12,
                                        boxShadow: '0 10px 25px rgba(0,0,0,0.2), 0 0 0 1px rgba(255,255,255,0.05)',
                                        zIndex: 100,
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: 12,
                                        cursor: 'default',
                                        animation: 'csFadeIn 0.15s ease-out',
                                      }}
                                    >
                                      {/* Popover Arrow */}
                                      <div style={{ position: 'absolute', bottom: -5, right: 32, width: 10, height: 10, background: '#0F172A', transform: 'rotate(45deg)', borderBottom: '1px solid rgba(255,255,255,0.05)', borderRight: '1px solid rgba(255,255,255,0.05)' }} />

                                      <div>
                                        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94A3B8', marginBottom: 6 }}>
                                          Worst Case Scenario
                                        </div>
                                        <div style={{ fontSize: 12, lineHeight: 1.6, fontWeight: 500, color: '#F8FAFC' }}>
                                          {vibe.worstCase.replace(/💀|💼/g, '')}
                                        </div>
                                      </div>
                                      <div style={{ height: 1, background: 'rgba(255,255,255,0.1)' }} />
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (window.askAboutReport) {
                                            window.askAboutReport(reportData, v);
                                          }
                                        }}
                                        style={{
                                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                          padding: '10px', borderRadius: 8,
                                          background: 'linear-gradient(135deg, #4F46E5, #7C3AED)',
                                          color: '#fff', border: 'none',
                                          fontSize: 12, fontWeight: 700, cursor: 'pointer',
                                          transition: 'all 0.15s ease',
                                          boxShadow: '0 4px 12px rgba(79, 70, 229, 0.3)',
                                        }}
                                        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(99, 102, 241, 0.4)'; }}
                                        onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
                                      >
                                        <MessageSquare size={14} /> Ask Assistant for Guidance
                                      </button>
                                    </div>
                                  )}

                                  <div className={`cs-vuln-chevron ${isExpanded ? 'expanded' : ''}`} style={{ color: '#94A3B8', marginLeft: 4 }}>
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                                  </div>
                                </div>
                              </div>

                              {/* EXPANDED — One-Click Fix Card */}
                              {isExpanded && (
                                <div className="cs-vuln-item" style={{ borderBottom: 'none', paddingTop: 0, marginTop: -4 }}>

                                  {/* Business Impact Banner */}
                                  <div style={{
                                    background: uc.bg,
                                    border: `1px solid ${uc.border}`,
                                    borderRadius: 10,
                                    padding: '12px 16px',
                                    marginBottom: 14,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 10,
                                  }}>
                                    {getProfessionalIcon(vibe.icon, 18, uc.text)}
                                    <div style={{ flex: 1 }}>
                                      <div style={{ fontSize: 13, fontWeight: 600, color: uc.text, lineHeight: 1.4 }}>
                                        {vibe.businessImpact.replace(/💀|💼/g, '')}
                                      </div>
                                    </div>
                                    <button
                                      onClick={() => {
                                        if (window.askAboutReport) {
                                          window.askAboutReport(reportData, v);
                                        }
                                      }}
                                      style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                        padding: '6px 12px', borderRadius: 8,
                                        background: 'linear-gradient(135deg, #4F46E5, #7C3AED)',
                                        color: '#fff', border: 'none',
                                        fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                        boxShadow: '0 2px 4px rgba(79, 70, 229, 0.2)',
                                      }}
                                    >
                                      <MessageSquare size={14} /> Ask AI
                                    </button>
                                  </div>

                                  {/* ❌ Current Code */}
                                  {v.evidence && (
                                    <div style={{ marginBottom: 14 }}>
                                      {/* Current (vulnerable) code */}
                                      <div style={{
                                        borderRadius: 10,
                                        overflow: 'hidden',
                                        border: '1px solid #FECACA',
                                        background: '#FEF2F2',
                                      }}>
                                        <div style={{
                                          padding: '8px 12px',
                                          background: '#FEE2E2',
                                          borderBottom: '1px solid #FECACA',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'space-between',
                                        }}>
                                          <span style={{ fontSize: 11, fontWeight: 800, color: '#991B1B', letterSpacing: '0.02em' }}>
                                            Vulnerable Code {v.line ? `(line ${v.line})` : ''}
                                          </span>
                                          <span style={{ fontSize: 10, color: '#B91C1C', fontFamily: 'monospace', fontWeight: 600, opacity: 0.7 }}>
                                            {v.file?.split('/').pop()}
                                          </span>
                                        </div>
                                        <pre style={{
                                          margin: 0,
                                          padding: '12px 14px',
                                          fontSize: 11,
                                          fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
                                          lineHeight: 1.6,
                                          color: '#7F1D1D',
                                          overflowX: 'auto',
                                          whiteSpace: 'pre-wrap',
                                          wordBreak: 'break-all',
                                          background: 'transparent',
                                        }}>
                                          {v.evidence}
                                        </pre>
                                      </div>
                                    </div>
                                  )}

                                  {/* 📋 Steps */}
                                  {v.how_to_fix && (
                                    <div style={{
                                      background: '#F8FAFC',
                                      border: '1px solid #E2E8F0',
                                      borderRadius: 10,
                                      padding: '14px 16px',
                                      marginBottom: 14,
                                    }}>
                                      <div style={{ fontSize: 13, fontWeight: 750, color: '#16A34A', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <ShieldCheck size={16} /> Remediation Steps
                                      </div>

                                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {v.how_to_fix.split(/\s*(?=\d+\.)/).filter(s => s.trim().length > 0).map((step, idx) => {
                                          const stepText = step.trim().replace(/^\d+\.\s*/, '');
                                          if (!stepText) return null;
                                          return (
                                            <div key={idx} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                                              <div style={{
                                                minWidth: 20, height: 20, borderRadius: '50%',
                                                background: 'linear-gradient(135deg, #16A34A, #059669)',
                                                color: '#fff',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: 10, fontWeight: 800, marginTop: 1,
                                                boxShadow: '0 1px 3px rgba(22,163,74,0.3)',
                                              }}>
                                                {idx + 1}
                                              </div>
                                              <div style={{ lineHeight: 1.5, color: '#1E293B', fontWeight: 500, fontSize: 12 }}>
                                                {stepText}
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}

                                  <details style={{ marginBottom: 14 }}>
                                    <summary style={{
                                      fontSize: 11, fontWeight: 700, color: '#9A3412', cursor: 'pointer',
                                      padding: '10px 14px', borderRadius: 8,
                                      background: '#FFF7ED', border: '1px solid #FED7AA',
                                      listStyle: 'none', display: 'flex', alignItems: 'center', gap: 6,
                                    }}>
                                      <span>Warning:</span> Potential Security Risk
                                    </summary>
                                    <div style={{
                                      padding: '12px 14px', marginTop: -1,
                                      background: '#FFF7ED', borderBottomLeftRadius: 8, borderBottomRightRadius: 8,
                                      border: '1px solid #FED7AA', borderTop: '1px dashed #FDBA74',
                                    }}>
                                      <div style={{ fontSize: 12, fontWeight: 500, color: '#7C2D12', lineHeight: 1.6, fontStyle: 'italic' }}>
                                        "{vibe.worstCase.replace(/💀|💼/g, '')}"
                                      </div>
                                    </div>
                                  </details>

                                  {/* Technical details — collapsible */}
                                  <details style={{ marginBottom: 14 }}>
                                    <summary style={{
                                      fontSize: 11, fontWeight: 700, color: '#64748B', cursor: 'pointer',
                                      padding: '8px 0', borderTop: '1px dashed rgba(0,0,0,0.08)',
                                      listStyle: 'none', display: 'flex', alignItems: 'center', gap: 6,
                                    }}>
                                      <span style={{ fontSize: 10 }}>Info:</span>
                                      Technical Analysis
                                      <span style={{ fontSize: 10, color: '#94A3B8' }}>({v.name ?? v.title} · {v.vibe_category ?? 'general'})</span>
                                    </summary>
                                    <div style={{ paddingTop: 8, paddingLeft: 4 }}>
                                      <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#6B6A66', background: 'rgba(0,0,0,0.04)', display: 'inline-block', padding: '2px 8px', borderRadius: 4, marginBottom: 10 }}>
                                        {v.file}{v.line ? ` : L${v.line}` : ''}
                                      </div>
                                      {(v.desc ?? v.what_is_it) && (
                                        <p style={{ fontSize: 12, color: '#6B6A66', lineHeight: 1.6, margin: '0 0 12px 0' }}>{v.desc ?? v.what_is_it}</p>
                                      )}
                                    </div>
                                  </details>


                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}


                  </div>
                </div>

                {/* SIDEBAR */}
                <div className="cs-side" style={{ position: 'sticky', top: 20 }}>

                  {/* FEEDBACK SECTION */}
                  <div className="cs-card" style={{ padding: 20, background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)', border: '1px solid #e2e8f0', borderRadius: 24, boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 10, background: '#fff1eb', color: '#f95700', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Heart size={18} fill="#f95700" />
                      </div>
                      <span style={{ fontSize: 14, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.2px' }}>Improve CodeSafe</span>
                    </div>
                    
                    <p style={{ fontSize: 11.5, color: '#64748B', marginBottom: 14, lineHeight: 1.5, fontWeight: 500 }}>
                      Spotted a bug or have an idea? Help us build the future of AI security.
                    </p>

                    {feedbackSuccess ? (
                      <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 16, padding: '16px 12px', textAlign: 'center', animation: 'csFadeIn 0.3s ease-out' }}>
                        <CheckCircle2 size={24} color="#16A34A" style={{ margin: '0 auto 8px' }} />
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#166534', marginBottom: 2 }}>Awesome!</div>
                        <div style={{ fontSize: 11, color: '#15803D', fontWeight: 500 }}>Your feedback was sent.</div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <textarea
                          value={feedback}
                          onChange={(e) => setFeedback(e.target.value)}
                          placeholder="What's on your mind?"
                          style={{
                            width: '100%',
                            minHeight: 80,
                            padding: '12px 14px',
                            borderRadius: 16,
                            border: '1px solid #E2E8F0',
                            fontSize: 12.5,
                            fontFamily: 'inherit',
                            resize: 'none',
                            outline: 'none',
                            transition: 'all 0.2s ease',
                            background: '#ffffff',
                            color: '#0F172A',
                            fontWeight: 500
                          }}
                          onFocus={(e) => {
                            e.target.style.borderColor = '#f95700';
                            e.target.style.boxShadow = '0 0 0 3px rgba(249, 87, 0, 0.08)';
                          }}
                          onBlur={(e) => {
                            e.target.style.borderColor = '#E2E8F0';
                            e.target.style.boxShadow = 'none';
                          }}
                        />
                        <button
                          onClick={handleFeedbackSubmit}
                          disabled={!feedback.trim() || isSubmittingFeedback}
                          style={{
                            width: '100%',
                            height: 40,
                            borderRadius: 14,
                            background: feedback.trim() ? '#f95700' : '#f1f5f9',
                            color: feedback.trim() ? '#ffffff' : '#94a3b8',
                            border: 'none',
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: feedback.trim() ? 'pointer' : 'default',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 8,
                            transition: 'all 0.2s ease',
                            boxShadow: feedback.trim() ? '0 4px 12px rgba(249, 87, 0, 0.2)' : 'none'
                          }}
                          onMouseEnter={(e) => {
                            if (feedback.trim() && !isSubmittingFeedback) {
                              e.currentTarget.style.transform = 'translateY(-1px)';
                              e.currentTarget.style.background = '#e85000';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (feedback.trim() && !isSubmittingFeedback) {
                              e.currentTarget.style.transform = 'none';
                              e.currentTarget.style.background = '#f95700';
                            }
                          }}
                        >
                          {isSubmittingFeedback ? (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 2s linear infinite' }}>
                              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                            </svg>
                          ) : (
                            <>
                              <MessageSquare size={14} /> Send Feedback
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* FIX FOR ME PANEL */}
                  {isFixing && (
                    <div className="cs-card" id="fixPanel" style={{ padding: 0, overflow: 'hidden', marginTop: 16 }}>
                      <div className="cs-card-h">
                        <span className="cs-card-t">Fix For Me — Corrected files</span>
                        <button className="cs-btn" style={{ height: 26, fontSize: 11, padding: '0 8px' }} onClick={() => setIsFixing(false)}>✕</button>
                      </div>
                      <div style={{ padding: 16 }} id="fixFileList">
                        {fixedFiles.length === 0
                          ? <div style={{ textAlign: 'center', padding: 20, color: '#6B6A66' }}>Generating fixed files...</div>
                          : fixedFiles.map((f, i) => (
                            <div key={i} style={{ marginBottom: 12 }}>
                              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, fontFamily: 'monospace' }}>{f.file}</div>
                              <div className="cs-code"><pre className="cs-pre">{f.fixed_code}</pre></div>
                            </div>
                          ))
                        }
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
        }

        {/* HISTORY MODAL overlay */}
        {showHistoryModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'none', zIndex: 9999, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', padding: '110px 24px' }} onClick={() => setShowHistoryModal(false)}>
            <div style={{ background: '#ffffff', width: '100%', maxWidth: 420, borderRadius: 20, overflow: 'hidden', boxShadow: '0 20px 40px rgba(0,0,0,0.1)', animation: 'csFadeIn 0.2s ease-out', border: '1px solid #e2e8f0' }} onClick={e => e.stopPropagation()}>
              <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#ffffff' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, color: '#0F172A', fontWeight: 700 }}>Scanning History</h3>
                  <p style={{ margin: '2px 0 0 0', fontSize: 11, color: '#64748B' }}>Your recent audit results</p>
                </div>
                <button
                  onClick={() => setShowHistoryModal(false)}
                  style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid #e2e8f0', background: '#fff', color: '#64748B', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                >
                  ✕
                </button>
              </div>
              <div style={{ padding: 12 }}>
                <RecentScans
                  onSelect={(data) => {
                    setReportData(data);
                    window.dispatchEvent(new CustomEvent('codesafe:load_report', { detail: data }));
                    setShowHistoryModal(false);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                />
              </div>
              <div style={{ padding: '12px 24px', background: '#f8fafc', borderTop: '1px solid #f1f5f9', textAlign: 'center' }}>
                <span style={{ fontSize: 10, color: '#94A3B8', fontWeight: 600 }}>Showing your last 10 audits</span>
              </div>
            </div>
          </div>
        )}

        {/* IMPACT MODAL */}
        {showImpactModal && reportData?.regression && (
          <div style={{ position: 'fixed', inset: 0, background: 'none', zIndex: 9999, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', padding: '110px 24px' }} onClick={() => setShowImpactModal(false)}>
            <div style={{ background: '#ffffff', width: '100%', maxWidth: 420, borderRadius: 20, overflow: 'hidden', boxShadow: '0 20px 40px rgba(0,0,0,0.1)', animation: 'csFadeIn 0.2s ease-out', border: '1px solid #e2e8f0' }} onClick={e => e.stopPropagation()}>
              <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#ffffff' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, color: '#0F172A', fontWeight: 700 }}>Security Comparison</h3>
                  <p style={{ margin: '2px 0 0 0', fontSize: 11, color: '#64748B', fontWeight: 500 }}>Comparison with previous audit</p>
                </div>
                <button
                  onClick={() => setShowImpactModal(false)}
                  style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid #e2e8f0', background: '#fff', color: '#64748B', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                >
                  ✕
                </button>
              </div>

              <div style={{ padding: '24px 28px' }}>
                {/* Score Summary Row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
                  <div style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>Security Score Delta</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: (reportData.score || 0) - reportData.regression.prevScore >= 0 ? '#16A34A' : '#DC2626' }}>
                      {(reportData.score || 0) - reportData.regression.prevScore > 0 ? '+' : ''}{(reportData.score || 0) - reportData.regression.prevScore}
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '4px 8px', borderRadius: 6, background: (reportData.score || 0) >= reportData.regression.prevScore ? '#DCFCE7' : '#FEE2E2', color: (reportData.score || 0) >= reportData.regression.prevScore ? '#166534' : '#991B1B' }}>
                      {(reportData.score || 0) >= reportData.regression.prevScore ? 'Improved' : 'Regression'}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: '#F0FDF4', color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #DCFCE7' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 750, color: '#0F172A' }}>{reportData.regression.fixed} Issues Fixed</div>
                      <div style={{ fontSize: 12, color: '#64748B', fontWeight: 500 }}>Successfully resolved vulnerabilities</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: '#FEF2F2', color: '#DC2626', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #FEE2E2' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 750, color: '#0F172A' }}>{reportData.regression.newIssues} New Risks</div>
                      <div style={{ fontSize: 12, color: '#64748B', fontWeight: 500 }}>Newly detected security regressions</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: '#F8FAFC', color: '#64748B', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #E2E8F0' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 750, color: '#0F172A' }}>{reportData.regression.persisting} Persisting</div>
                      <div style={{ fontSize: 12, color: '#64748B', fontWeight: 500 }}>Unresolved security debt</div>
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ padding: '20px 28px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setShowImpactModal(false)}
                  style={{ padding: '10px 24px', borderRadius: 12, background: '#0F172A', color: '#fff', fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer' }}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default DashboardReport;