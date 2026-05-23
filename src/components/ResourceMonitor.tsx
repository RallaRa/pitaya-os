'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';

interface ServiceStat {
  id: string;
  name: string;
  provider: string;
  emoji: string;
  used: number | null;
  limit: number;
  unit: string;
  period: string;
  available: boolean;
  note?: string;
  realtime?: boolean;
}

const barColor = (pct: number, available: boolean) => {
  if (!available) return 'bg-slate-600';
  if (pct >= 90) return 'bg-red-500';
  if (pct >= 70) return 'bg-yellow-500';
  return 'bg-teal-500';
};

const textColor = (pct: number, available: boolean) => {
  if (!available) return 'text-slate-500';
  if (pct >= 90) return 'text-red-400';
  if (pct >= 70) return 'text-yellow-400';
  return 'text-teal-400';
};

export default function ResourceMonitor() {
  const [services,   setServices]   = useState<ServiceStat[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [expanded,   setExpanded]   = useState(false);
  const [updatedAt,  setUpdatedAt]  = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (showSpin = false) => {
    if (showSpin) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await fetch('/api/usage/summary');
      if (!res.ok) return;
      const data = await res.json();
      setServices(data.services || []);
      if (data.updatedAt) {
        const d = new Date(data.updatedAt);
        setUpdatedAt(d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }));
      }
    } catch {
      /* silent */
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="border-t border-slate-800">
      {/* 섹션 헤더 */}
      <button
        onClick={() => {
          const next = !expanded;
          setExpanded(next);
          if (next && services.length === 0) load();
        }}
        className="w-full flex items-center justify-between px-4 py-3 text-slate-500 hover:text-slate-300 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-widest">리소스 현황</span>
          {updatedAt && <span className="text-[9px] opacity-50">{updatedAt} 기준</span>}
        </div>
        <div className="flex items-center gap-1">
          {expanded && (
            <button
              onClick={e => { e.stopPropagation(); load(true); }}
              className="p-1 hover:text-teal-400 transition-colors"
              title="새로고침"
            >
              <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin text-teal-400' : ''}`} />
            </button>
          )}
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </div>
      </button>

      {/* 리소스 목록 */}
      {expanded && (
        <div className="px-3 pb-4 space-y-3">
          {loading ? (
            [...Array(4)].map((_, i) => (
              <div key={i} className="space-y-1">
                <div className="h-3 bg-slate-800 rounded animate-pulse w-3/4" />
                <div className="h-1.5 bg-slate-800 rounded-full animate-pulse" />
              </div>
            ))
          ) : services.length === 0 ? (
            <p className="text-slate-600 text-xs text-center py-2">데이터 없음</p>
          ) : (
            services.map(svc => {
              const pct = svc.used != null && svc.limit > 0
                ? Math.min(100, Math.round((svc.used / svc.limit) * 100))
                : null;

              return (
                <div key={svc.id}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs leading-none">{svc.emoji}</span>
                      <span className="text-slate-400 text-[11px] font-medium">{svc.name}</span>
                      {svc.realtime && (
                        <span className="text-[8px] bg-teal-500/20 text-teal-400 px-1 rounded">실시간</span>
                      )}
                    </div>
                    <span className={`text-[10px] font-semibold ${pct != null ? textColor(pct, svc.available) : 'text-slate-600'}`}>
                      {!svc.available
                        ? '미설정'
                        : svc.used == null
                          ? '조회 불가'
                          : `${svc.used.toLocaleString()}/${svc.limit.toLocaleString()} ${svc.unit}`
                      }
                    </span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all duration-500 ${barColor(pct ?? 0, svc.available)}`}
                      style={{ width: `${pct ?? 0}%` }}
                    />
                  </div>
                  {svc.note && (
                    <p className="text-slate-600 text-[9px] mt-0.5">{svc.note}</p>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
