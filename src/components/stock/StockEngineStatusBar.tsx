'use client';

import { useCallback, useEffect, useState } from 'react';
import { Activity, Circle, RefreshCw, Server, Wifi, WifiOff } from 'lucide-react';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';

type Phase = 'disabled' | 'offline' | 'standby' | 'active' | 'paused' | 'warning';

interface RuntimeStatus {
  phase: Phase;
  label: string;
  detail: string;
  masterEnabled: boolean;
  posOnline: boolean;
  marketOpen: boolean;
  heartbeatAt: string | null;
  heartbeatAgeSec: number | null;
  lastScanAt: string | null;
  lastMarketRegime: string | null;
  nextAction: string;
  checklist: Array<{ ok: boolean; label: string; hint?: string }>;
}

const PHASE_STYLE: Record<Phase, { border: string; bg: string; text: string; dot: string; pulse: boolean }> = {
  active: {
    border: 'border-teal-500/50',
    bg: 'bg-teal-950/40',
    text: 'text-teal-100',
    dot: 'bg-teal-400',
    pulse: true,
  },
  standby: {
    border: 'border-blue-500/40',
    bg: 'bg-blue-950/30',
    text: 'text-blue-100',
    dot: 'bg-blue-400',
    pulse: true,
  },
  paused: {
    border: 'border-amber-500/50',
    bg: 'bg-amber-950/30',
    text: 'text-amber-100',
    dot: 'bg-amber-400',
    pulse: false,
  },
  warning: {
    border: 'border-orange-500/50',
    bg: 'bg-orange-950/30',
    text: 'text-orange-100',
    dot: 'bg-orange-400',
    pulse: true,
  },
  offline: {
    border: 'border-red-500/50',
    bg: 'bg-red-950/30',
    text: 'text-red-100',
    dot: 'bg-red-500',
    pulse: false,
  },
  disabled: {
    border: 'border-slate-600/50',
    bg: 'bg-slate-900/50',
    text: 'text-slate-400',
    dot: 'bg-slate-500',
    pulse: false,
  },
};

function formatAge(sec: number | null): string {
  if (sec == null) return '—';
  if (sec < 60) return `${sec}초 전`;
  if (sec < 3600) return `${Math.floor(sec / 60)}분 전`;
  return `${Math.floor(sec / 3600)}시간 전`;
}

interface Props {
  masterEnabled?: boolean;
  refreshKey?: number;
}

export default function StockEngineStatusBar({ masterEnabled, refreshKey = 0 }: Props) {
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastPoll, setLastPoll] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/stock/engine-status', { headers, cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        setRuntime(json.runtime);
        setLastPoll(new Date());
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => { void load(); }, 15000);
    return () => clearInterval(id);
  }, [load, refreshKey, masterEnabled]);

  if (loading && !runtime) {
    return (
      <div className="rounded-xl border border-slate-700/60 bg-slate-900/50 px-4 py-3 animate-pulse">
        <div className="h-5 w-48 bg-slate-800 rounded" />
      </div>
    );
  }

  if (!runtime) return null;

  const style = PHASE_STYLE[runtime.phase];

  return (
    <div className={`rounded-xl border ${style.border} ${style.bg} overflow-hidden`}>
      <div className="px-4 py-3 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="relative mt-0.5 shrink-0">
            <span className={`block w-3 h-3 rounded-full ${style.dot}`} />
            {style.pulse && (
              <span className={`absolute inset-0 w-3 h-3 rounded-full ${style.dot} animate-ping opacity-60`} />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className={`text-base font-bold ${style.text}`}>
                {runtime.label}
              </p>
              {runtime.masterEnabled && runtime.phase === 'active' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-teal-800/60 text-teal-200 text-[10px] font-medium">
                  <Activity className="w-3 h-3" /> LIVE
                </span>
              )}
              {runtime.lastMarketRegime && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                  {runtime.lastMarketRegime}
                </span>
              )}
            </div>
            <p className="text-sm text-slate-300 mt-1">{runtime.detail}</p>
            <p className="text-xs text-slate-500 mt-1">다음: {runtime.nextAction}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-[10px] text-slate-500 shrink-0">
          <span className="inline-flex items-center gap-1">
            <Server className="w-3 h-3" />
            POS {runtime.posOnline ? '연결' : '미연결'}
            {runtime.heartbeatAgeSec != null && ` · ${formatAge(runtime.heartbeatAgeSec)}`}
          </span>
          <span className="inline-flex items-center gap-1">
            {runtime.marketOpen ? <Wifi className="w-3 h-3 text-teal-400" /> : <WifiOff className="w-3 h-3" />}
            {runtime.marketOpen ? '장중' : '장외'}
          </span>
          {lastPoll && (
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-1 hover:text-slate-300"
            >
              <RefreshCw className="w-3 h-3" />
              {lastPoll.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </button>
          )}
        </div>
      </div>

      <div className="px-4 pb-3 flex flex-wrap gap-2">
        {runtime.checklist.map(item => (
          <div
            key={item.label}
            title={item.hint}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] border ${
              item.ok
                ? 'border-teal-800/50 bg-teal-950/30 text-teal-200'
                : 'border-red-800/40 bg-red-950/20 text-red-300'
            }`}
          >
            <Circle className={`w-2 h-2 fill-current ${item.ok ? 'text-teal-400' : 'text-red-400'}`} />
            {item.label}
          </div>
        ))}
      </div>

      {runtime.phase === 'offline' && runtime.masterEnabled && (
        <div className="px-4 pb-3">
          <div className="rounded-lg bg-red-950/40 border border-red-500/30 px-3 py-2 text-xs text-red-200">
            <strong>조치 필요:</strong> POS PC에서{' '}
            <code className="bg-red-900/50 px-1 rounded">pm2 start ecosystem.config.js</code>{' '}
            실행 후 5분 이내 heartbeat가 표시되어야 합니다.
          </div>
        </div>
      )}
    </div>
  );
}
