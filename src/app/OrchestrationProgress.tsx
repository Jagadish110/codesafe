// ─────────────────────────────────────────────────────────────────────────────
// src/app/OrchestrationProgress.tsx
// Displays orchestration phase progress and agent assignments during scanning
// ─────────────────────────────────────────────────────────────────────────────

'use client';

import React from 'react';
import type { RoutingManifest } from '@/hooks/useScan';

interface OrchestrationProgressProps {
  phase: string;
  progress: number;
  routingManifest: RoutingManifest | null;
}

const AgentIcon: Record<string, string> = {
  sleuth: '🔑',
  guardian: '🛡️',
  hacker: '⚔️',
  auditor: '🔐',
};

const AgentLabel: Record<string, string> = {
  sleuth: 'Sleuth (Secrets)',
  guardian: 'Guardian (Auth/Authz)',
  hacker: 'Hacker (Injection)',
  auditor: 'Auditor (Crypto)',
};

const PhaseInfo: Record<string, { label: string; description: string }> = {
  'graph_building': {
    label: 'Building Knowledge Graph',
    description: 'Analyzing code structure and dependencies...',
  },
  'orchestrating': {
    label: 'Routing Files to Agents',
    description: 'Intelligent assignment of files to specialist agents...',
  },
  'scanning': {
    label: 'Agents Scanning in Parallel',
    description: '4 specialist agents analyzing code simultaneously...',
  },
  'aggregating': {
    label: 'Merging and Prioritizing Results',
    description: 'Deduplicating and cross-linking findings...',
  },
};

export const OrchestrationProgress: React.FC<OrchestrationProgressProps> = ({
  phase,
  progress,
  routingManifest,
}) => {
  const getProgressPercent = () => {
    if (phase === 'graph_building') return Math.min(progress, 10) * 10;
    if (phase === 'orchestrating') return Math.min(progress - 10, 20) * 5;
    if (phase === 'scanning') return Math.min(progress - 30, 40) * 2.5;
    if (phase === 'aggregating') return Math.min(progress - 75, 20) * 5;
    return progress;
  };

  const phaseInfo = PhaseInfo[phase] || { label: 'Processing...', description: '' };

  return (
    <div style={styles.container}>
      {/* Phase Banner */}
      <div style={styles.phaseBanner}>
        <div>
          <h3 style={styles.phaseLabel}>{phaseInfo.label}</h3>
          <p style={styles.phaseDesc}>{phaseInfo.description}</p>
        </div>
        <div style={styles.progressValue}>{progress}%</div>
      </div>

      {/* Progress Bar */}
      <div style={styles.progressBar}>
        <div style={{ ...styles.progressFill, width: `${getProgressPercent()}%` }} />
      </div>

      {/* Routing Manifest Display */}
      {routingManifest && phase === 'orchestrating' && (
        <div style={styles.routingSection}>
          <h4 style={styles.routingTitle}>📊 File Routing Summary</h4>
          <div style={styles.agentGrid}>
            {['sleuth', 'guardian', 'hacker', 'auditor'].map((agentId) => {
              const count = routingManifest.agent_distributions[agentId as keyof typeof routingManifest.agent_distributions] || 0;
              return (
                <div key={agentId} style={styles.agentCard}>
                  <div style={styles.agentIcon}>{AgentIcon[agentId]}</div>
                  <div style={styles.agentName}>{AgentLabel[agentId]}</div>
                  <div style={styles.agentCount}>{count} file{count !== 1 ? 's' : ''}</div>
                </div>
              );
            })}
          </div>
          {routingManifest.skipped_files && routingManifest.skipped_files.length > 0 && (
            <div style={styles.skippedInfo}>
              ⏭️ Skipped {routingManifest.skipped_files.length} file(s) (low risk or excluded)
            </div>
          )}
        </div>
      )}

      {/* Scanning Phase Agent Status */}
      {phase === 'scanning' && routingManifest && (
        <div style={styles.agentStatusSection}>
          <h4 style={styles.agentStatusTitle}>⚙️ Agent Status</h4>
          <div style={styles.agentStatusGrid}>
            {['sleuth', 'guardian', 'hacker', 'auditor'].map((agentId) => {
              const isActive = true;
              return (
                <div key={agentId} style={{ ...styles.agentStatus, opacity: isActive ? 1 : 0.5 }}>
                  <span>{AgentIcon[agentId]}</span>
                  <span>{AgentLabel[agentId]}</span>
                  <span style={styles.spinner}>◌</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    background: 'linear-gradient(135deg, #f8f9fa 0%, #f0f1f3 100%)',
    border: '1px solid #e0e2e7',
    borderRadius: '16px',
    padding: '24px',
    marginBottom: '24px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
  },
  phaseBanner: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  phaseLabel: {
    fontSize: '16px',
    fontWeight: '700',
    margin: '0 0 4px 0',
    color: '#1a202c',
  },
  phaseDesc: {
    fontSize: '13px',
    color: '#64748b',
    margin: 0,
  },
  progressValue: {
    fontSize: '28px',
    fontWeight: '800',
    color: '#0f172a',
  },
  progressBar: {
    width: '100%',
    height: '8px',
    background: '#e2e8f0',
    borderRadius: '10px',
    overflow: 'hidden',
    marginBottom: '20px',
  },
  progressFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #ec5b13, #8b5cf6)',
    borderRadius: '10px',
    transition: 'width 0.3s ease',
  },
  routingSection: {
    marginTop: '20px',
    paddingTop: '20px',
    borderTop: '1px solid #e0e2e7',
  },
  routingTitle: {
    fontSize: '14px',
    fontWeight: '700',
    margin: '0 0 12px 0',
    color: '#1a202c',
  },
  agentGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
    gap: '12px',
    marginBottom: '12px',
  },
  agentCard: {
    background: '#ffffff',
    border: '1px solid #e0e2e7',
    borderRadius: '12px',
    padding: '12px',
    textAlign: 'center',
  },
  agentIcon: {
    fontSize: '24px',
    marginBottom: '6px',
  },
  agentName: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#1a202c',
    marginBottom: '4px',
  },
  agentCount: {
    fontSize: '14px',
    fontWeight: '700',
    color: '#ec5b13',
  },
  skippedInfo: {
    fontSize: '12px',
    color: '#64748b',
    padding: '8px 12px',
    background: '#f1f5f9',
    borderRadius: '8px',
    marginTop: '8px',
  },
  agentStatusSection: {
    marginTop: '20px',
    paddingTop: '20px',
    borderTop: '1px solid #e0e2e7',
  },
  agentStatusTitle: {
    fontSize: '14px',
    fontWeight: '700',
    margin: '0 0 12px 0',
    color: '#1a202c',
  },
  agentStatusGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '12px',
  },
  agentStatus: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 12px',
    background: '#ffffff',
    border: '1px solid #e0e2e7',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: '600',
    color: '#1a202c',
  },
  spinner: {
    display: 'inline-block',
    marginLeft: 'auto',
    animation: 'spin 1s linear infinite',
  },
};

// Add keyframe animation
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style');
  styleSheet.textContent = `
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(styleSheet);
}
