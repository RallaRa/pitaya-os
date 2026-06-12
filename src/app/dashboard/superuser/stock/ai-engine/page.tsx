'use client';

import { useEffect, useState } from 'react';
import { Loader2, Sparkles, CheckCircle2, XCircle } from 'lucide-react';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import { safeFetchJson } from '@/lib/safeFetchJson';

interface ScanStep {
  ok: boolean;
  error?: string;
  [key: string]: unknown;
}

interface ScanPayload {
  ok?: boolean;
  error?: string;
  steps?: { universe: ScanStep; scores: ScanStep; ai: ScanStep };
  analysis?: Record<string, unknown>;
  topPick?: { symbol: string; name: string; buyProbability: number };
  errors?: string[];
}

async function stockHeaders() {
  const headers = await getAuthJsonHeaders();
  const session = localStorage.getItem('pitaya_stock_session_id');
  if (session) headers['x-stock-session'] = session;
  return headers;
}

export default function StockAiEnginePage() {
  const [state, setState] = useState<Record<string, unknown> | null>(null);
  const [scan, setScan] = useState<ScanPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const headers = await stockHeaders();
      const { res, data } = await safeFetchJson<{ state?: Record<string, unknown> }>(
        '/api/stock/ai-engine',
        { headers },
      );
      if (res.ok && data.state) setState(data.state);
    } catch {
      // ignore initial load errors
    }
  };

  useEffect(() => { void load(); }, []);

  const runScan = async () => {
    setLoading(true);
    setError('');
    setScan(null);
    try {
      const headers = await stockHeaders();
      const { res, data, parseError } = await safeFetchJson<ScanPayload>(
        '/api/stock/scan',
        { method: 'POST', headers },
      );

      const json = data;

      if (parseError || !res.ok) {
        const msg =
          json.errors?.join(' · ') ||
          json.error ||
          (parseError === 'empty body'
            ? `HTTP ${res.status} — 서버 응답 없음. 새로고침(Cmd+Shift+R) 후 재시도하세요.`
            : '스캔 실패');
        setError(msg);
        if (json.steps) setScan(json);
        if (json.analysis) setState(json.analysis);
        return;
      }

      setScan(json);
      setState(json.analysis || null);
      if (json.errors?.length) setError(json.errors.join(' · '));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const StepRow = ({ label, step }: { label: string; step?: ScanStep }) => (
    <div className="flex items-center gap-2 text-sm">
      {step?.ok ? <CheckCircle2 className="w-4 h-4 text-teal-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
      <span className="text-slate-300">{label}</span>
      {step?.error && <span className="text-red-400 text-xs">{step.error}</span>}
      {step?.ok && label.startsWith('①') && typeof step.passed === 'number' && (
        <span className="text-slate-500 text-xs">({step.passed}종 통과)</span>
      )}
    </div>
  );

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-5 pb-24">
      <h1 className="text-lg font-bold text-white flex items-center gap-2">
        <Sparkles className="w-5 h-5 text-amber-400" /> AI 시장 스캔
      </h1>
      <p className="text-sm text-slate-400">
        유니버스 → 팩터 스코어 → AI 분석 (마스터 OFF 가능)
      </p>

      <button
        type="button"
        onClick={() => void runScan()}
        disabled={loading}
        className="px-4 py-2 rounded-lg bg-teal-700 text-white text-sm inline-flex items-center gap-2"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
        {loading ? '스캔 중… (최대 30초)' : '시장 스캔 실행'}
      </button>

      {scan?.steps && (
        <div className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-4 space-y-2">
          <StepRow label="① 유니버스" step={scan.steps.universe} />
          <StepRow label="② 팩터 스코어" step={scan.steps.scores} />
          <StepRow label="③ AI 분석" step={scan.steps.ai} />
          {scan.topPick && (
            <p className="text-xs text-teal-300 pt-2">
              Top Pick: {scan.topPick.name} ({scan.topPick.symbol}) · {(scan.topPick.buyProbability * 100).toFixed(0)}%
            </p>
          )}
        </div>
      )}

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {state && (
        <pre className="text-xs text-slate-300 bg-slate-900/80 border border-slate-700 rounded-xl p-4 overflow-x-auto whitespace-pre-wrap">
          {JSON.stringify(state, null, 2)}
        </pre>
      )}
    </div>
  );
}
