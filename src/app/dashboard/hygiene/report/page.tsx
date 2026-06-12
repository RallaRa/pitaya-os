'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, ClipboardCheck, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { getAuthHeaders } from '@/lib/getAuthHeaders';

interface SlotStatus {
  kind: string;
  label: string;
  complete: boolean;
  overdue: boolean;
  dueAt: string;
}

interface MonthlyReport {
  month: string;
  totalDays: number;
  completedDays: number;
  completionRate: number;
  slotCompletionRates: { morning: number; midday: number; closing: number };
}

export default function HygieneReportPage() {
  const { currentStore } = useStore();
  const storeId = currentStore?.storeId || '';
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [slots, setSlots] = useState<SlotStatus[]>([]);
  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!storeId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const headers = await getAuthHeaders();
      const [statusRes, reportRes] = await Promise.all([
        fetch(`/api/hygiene/automation?storeId=${encodeURIComponent(storeId)}`, { headers }),
        fetch(`/api/hygiene/automation?storeId=${encodeURIComponent(storeId)}&month=${encodeURIComponent(month)}`, { headers }),
      ]);
      const statusData = await statusRes.json();
      const reportData = await reportRes.json();
      if (!statusRes.ok) throw new Error(statusData.error || '조회 실패');
      if (!reportRes.ok) throw new Error(reportData.error || '보고서 실패');
      setSlots(statusData.slots || []);
      setReport(reportData.report || null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '불러오기 실패');
    } finally {
      setLoading(false);
    }
  }, [storeId, month]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="min-h-full bg-slate-950 text-slate-200 p-4 md:p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard/hygiene" className="p-2 rounded-lg hover:bg-slate-800 text-slate-400">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-teal-400" />
            시간별알림
          </h1>
          <p className="text-xs text-slate-500">아침·오후·마감 3회 · 미완료 30분 후 메신저</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-teal-400" /></div>
      ) : error ? (
        <p className="text-red-400 text-sm">{error}</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {slots.map(s => (
              <div
                key={s.kind}
                className={`rounded-xl border p-3 ${s.complete ? 'border-teal-500/40 bg-teal-950/20' : s.overdue ? 'border-amber-500/40 bg-amber-950/20' : 'border-slate-800 bg-slate-900/50'}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">{s.label}</span>
                  {s.complete
                    ? <CheckCircle2 className="w-4 h-4 text-teal-400" />
                    : s.overdue
                      ? <AlertTriangle className="w-4 h-4 text-amber-400" />
                      : null}
                </div>
                <p className="text-[10px] text-slate-500">
                  {s.complete ? '완료' : s.overdue ? '미완료 (알림 발송됨)' : '대기'}
                </p>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium">월간 보고서</h2>
              <input
                type="month"
                value={month}
                onChange={e => setMonth(e.target.value)}
                className="rounded bg-slate-950 border border-slate-700 px-2 py-1 text-xs"
              />
            </div>
            {report ? (
              <dl className="grid grid-cols-2 gap-2 text-xs">
                <div><dt className="text-slate-500">완료율</dt><dd className="text-teal-300">{report.completionRate}%</dd></div>
                <div><dt className="text-slate-500">기록일</dt><dd>{report.completedDays}/{report.totalDays}일</dd></div>
                <div><dt className="text-slate-500">아침</dt><dd>{report.slotCompletionRates.morning}%</dd></div>
                <div><dt className="text-slate-500">오후</dt><dd>{report.slotCompletionRates.midday}%</dd></div>
                <div><dt className="text-slate-500">마감</dt><dd>{report.slotCompletionRates.closing}%</dd></div>
              </dl>
            ) : (
              <p className="text-xs text-slate-500">해당 월 데이터 없음</p>
            )}
            <p className="text-[10px] text-slate-600 mt-3">1년 초과 기록은 자동 아카이브 · PDF 미지원</p>
          </div>
        </div>
      )}
    </div>
  );
}
