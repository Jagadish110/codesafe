'use client';

import React, { useState, useEffect } from 'react';

interface HistoryItem {
  id: string;
  project_name: string;
  score: number;
  vulns_found: number;
  created_at: string;
  report_data?: any;
}

const scoreColor = (s: number) => s >= 80 ? '#16A34A' : s >= 50 ? '#C4701A' : '#D84040';

export const RecentScans: React.FC<{ onSelect?: (data: any, scanId?: string) => void }> = ({ onSelect }) => {
  const [history, setHistory] = useState<HistoryItem[]>([]);

  useEffect(() => {
    const handleHistory = (e: Event) => {
      const d = (e as CustomEvent).detail ?? [];
      setHistory(d);
    };
    window.addEventListener('codesafe:history_updated', handleHistory);
    
    // Initial fetch if already exists in window
    if ((window as any).CODESAFE_HISTORY) {
        setHistory((window as any).CODESAFE_HISTORY);
    }

    return () => window.removeEventListener('codesafe:history_updated', handleHistory);
  }, []);

  if (history.length === 0) return null;

  return (
    <div className="cs-card" style={{ 
      padding: 0, 
      overflow: 'hidden', 
      background: '#ffffff', 
      border: '1px solid #e2e8f0',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)'
    }}>
      <div style={{ 
        background: '#f8fafc', 
        borderBottom: '1px solid #f1f5f9', 
        padding: '12px 16px', 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center' 
      }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: '#0F172A' }}>Recent Scans</span>
        <span style={{ fontSize: 10, color: '#64748B', fontWeight: 600 }}>{history.length} reports</span>
      </div>
      <div style={{ maxHeight: '320px', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
        {history.map((h, i) => (
          <div
            key={i}
            onClick={() => {
              if (h.report_data && onSelect) {
                const scanId = h.report_data?.scanId || h.id;
                onSelect(h.report_data, scanId);
              }
            }}
            style={{
              padding: '12px 16px',
              borderBottom: i === history.length - 1 ? 'none' : '1px solid #f1f5f9',
              cursor: h.report_data ? 'pointer' : 'default',
              display: 'flex',
              flexDirection: 'column',
              gap: 4
            }}
            className="cs-hist-item"
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: '#1E293B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '180px' }} title={h.project_name}>
                {h.project_name}
              </span>
              <span style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 800, color: scoreColor(h.score) }}>
                {h.score}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10, color: '#64748B' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7 }}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                {new Date(h.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </div>
              <span style={{ 
                background: h.vulns_found > 0 ? '#FEF2F2' : '#F0FDF4', 
                color: h.vulns_found > 0 ? '#EF4444' : '#22C55E', 
                padding: '2px 8px', 
                borderRadius: 100, 
                fontWeight: 700,
                border: `1px solid ${h.vulns_found > 0 ? '#FEE2E2' : '#DCFCE7'}`
              }}>
                {h.vulns_found} issues
              </span>
            </div>
          </div>
        ))}
      </div>
      <style>{`
        .cs-hist-item { 
          transition: background-color 0.15s ease, padding-left 0.2s ease; 
          background: transparent;
        }
        .cs-hist-item:hover { 
          background: #f8fafc !important; 
          padding-left: 20px !important;
        }
        /* Custom Scrollbar for smoothness */
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
        ::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
      `}</style>
    </div>
  );
};
