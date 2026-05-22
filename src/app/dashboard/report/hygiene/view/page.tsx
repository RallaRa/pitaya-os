'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useStore } from '@/context/StoreContext';
import { Loader2, Search, ClipboardCheck, ChevronDown, ChevronUp, PenLine } from 'lucide-react';
import { HYGIENE_SECTIONS } from '@/lib/hygieneChecklist';

interface HygieneItem {
  result: 'pass' | 'fail' | null;
  note: string;
}

interface HygieneRecord {
  id: string;
  storeId: string;
  uid: string;
  inspectorName: string;
  checkDate: string;
  items: Record<string, HygieneItem>;
  totalItems: number;
  passedItems: number;
  status: 'pass' | 'partial' | 'fail';
  saveType?: 'draft' | 'final';
  createdAt?: any;
  updatedAt?: any;
}

type Preset = 'week' | 'month' | 'custom';

function toYMD(d: Date) { return d.toISOString().split('T')[0]; }

function getThisWeek() {
  const today = new Date();
  const dow = today.getDay();
  const mon = new Date(today);
  mon.setDate(today.getDate() + (dow === 0 ? -6 : 1 - dow));
  return { start: toYMD(mon), end: toYMD(today) };
}

function getThisMonth() {
  const today = new Date();
  return {
    start: toYMD(new Date(today.getFullYear(), today.getMonth(), 1)),
    end: toYMD(today),
  };
}

const STATUS_META = {
  pass:    { label: '양호', icon: '✅', cls: 'text-teal-400'   },
  partial: { label: '부분', icon: '⚠️', cls: 'text-yellow-400' },
  fail:    { label: '미흡', icon: '❌', cls: 'text-red-400'    },
} as const;

export default function HygieneViewPage() {
  const { currentStore } = useStore();
  const router = useRouter();

  const [preset, setPreset]           = useState<Preset>('month');
  const init                          = getThisMonth();
  const [queriedRange, setQueriedRange] = useState(init);
  const [customStart, setCustomStart]   = useState(init.start);
  const [customEnd,   setCustomEnd]     = useState(init.end);
  const [records,   setRecords]   = useState<HygieneRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expanded,  setExpanded]  = useState<Set<string>>(new Set());

  const fetchRecords = useCallback(async (start: string, end: string) => {
    if (!currentStore?.storeId) return;
    setIsLoading(true);
    try {
      const res = await fetch(
        `/api/hygiene?storeId=${currentStore.storeId}&startDate=${start}&endDate=${end}`
      );
      const data = await res.json();
      setRecords(data.records || []);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }, [currentStore?.storeId]);

  useEffect(() => {
    fetchRecords(queriedRange.start, queriedRange.end);
  }, [queriedRange, fetchRecords]);

  const handlePreset = (p: Preset) => {
    setPreset(p);
    if (p === 'week')  { const r = getThisWeek();  setQueriedRange(r); }
    if (p === 'month') { const r = getThisMonth(); setQueriedRange(r); }
  };

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const formatDate = (ymd: string) =>
    new Date(ymd + 'T00:00:00').toLocaleDateString('ko-KR', {
      year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
    });

  const formatTimestamp = (ts: any) => {
    if (!ts) return '';
    const d = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
    return d.toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="p-4 md:p-6 max-w-4xl">
      {/* 헤더 */}
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-teal-400 flex items-center gap-2">
            <ClipboardCheck className="w-6 h-6" />
            위생 점검일지 조회
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            {currentStore?.storeName} · {queriedRange.start} ~ {queriedRange.end}
          </p>
        </div>
        <Link
          href="/dashboard/report/hygiene"
          className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-teal-400 transition-colors shrink-0 mt-1"
        >
          <PenLine className="w-4 h-4" />
          작성
        </Link>
      </div>

      {/* 기간 선택 */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 mb-5 space-y-3">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">기간 선택</p>
        <div className="flex flex-wrap gap-2">
          {(['week', 'month', 'custom'] as Preset[]).map(p => (
            <button
              key={p}
              onClick={() => handlePreset(p)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                preset === p ? 'bg-teal-500 text-slate-950' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {{ week: '이번 주', month: '이번 달', custom: '직접입력' }[p]}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-500" />
            <span className="text-slate-500">~</span>
            <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-500" />
            <button
              onClick={() => { if (customStart && customEnd) setQueriedRange({ start: customStart, end: customEnd }); }}
              className="flex items-center gap-1.5 px-4 py-2 bg-teal-500 hover:bg-teal-400 text-slate-950 rounded-lg text-sm font-semibold transition-colors"
            >
              <Search className="w-4 h-4" />조회
            </button>
          </div>
        )}
      </div>

      {/* 로딩 */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-teal-400 animate-spin" />
        </div>

      ) : records.length === 0 ? (
        <div className="text-center py-20 text-slate-500">
          <ClipboardCheck className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p>해당 기간에 점검일지가 없습니다.</p>
          <Link href="/dashboard/report/hygiene"
            className="text-teal-400 text-sm mt-2 block hover:underline">
            점검일지 작성하기 →
          </Link>
        </div>

      ) : (
        <div className="space-y-3">
          {records.map(rec => {
            const isDraft  = rec.saveType === 'draft';
            const meta     = STATUS_META[rec.status] ?? STATUS_META.fail;
            const isOpen   = expanded.has(rec.id);

            const failItems: Array<{ section: string; item: string; note: string }> = [];
            HYGIENE_SECTIONS.forEach((section, si) => {
              section.items.forEach((item, ii) => {
                const cell = rec.items?.[`${si}_${ii}`];
                if (cell?.result === 'fail') failItems.push({ section: section.category, item, note: cell.note });
              });
            });

            return (
              <div key={rec.id} className={`bg-slate-900 border rounded-xl overflow-hidden ${
                isDraft ? 'border-yellow-700/50' : 'border-slate-800'
              }`}>
                {/* 요약 행 */}
                <div
                  onClick={() => isDraft
                    ? router.push(`/dashboard/report/hygiene?date=${rec.checkDate}`)
                    : toggleExpand(rec.id)
                  }
                  className="w-full flex items-center gap-3 px-5 py-4 hover:bg-slate-800/50 transition-colors cursor-pointer"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white text-sm">{formatDate(rec.checkDate)}</p>
                    <p className="text-slate-500 text-xs mt-0.5">
                      점검자: {rec.inspectorName || '-'}
                      {rec.updatedAt && ` · ${formatTimestamp(rec.updatedAt)}`}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {isDraft ? (
                      <>
                        <span className="text-sm">📝</span>
                        <span className="text-yellow-400 text-sm font-semibold">작성중</span>
                        <span className="text-slate-400 text-sm">{rec.passedItems}/{rec.totalItems}</span>
                        <span className="bg-yellow-500/20 text-yellow-400 text-xs font-semibold px-2 py-0.5 rounded-full border border-yellow-600/30">
                          임시
                        </span>
                      </>
                    ) : (
                      <>
                        <span className={`text-sm font-bold ${meta.cls}`}>
                          {meta.icon} {meta.label}
                        </span>
                        <span className="text-slate-400 text-sm">{rec.passedItems}/{rec.totalItems}</span>
                        <span className="bg-teal-500/20 text-teal-400 text-xs font-semibold px-2 py-0.5 rounded-full border border-teal-600/30">
                          완료
                        </span>
                        {isOpen
                          ? <ChevronUp className="w-4 h-4 text-slate-400" />
                          : <ChevronDown className="w-4 h-4 text-slate-400" />
                        }
                      </>
                    )}
                  </div>
                </div>

                {/* 최종저장 상세 (펼쳐짐) */}
                {!isDraft && isOpen && (
                  <div className="border-t border-slate-800 px-5 py-4 space-y-5">
                    {failItems.length > 0 && (
                      <div className="bg-red-900/20 border border-red-800/40 rounded-lg p-3">
                        <p className="text-red-400 text-xs font-semibold mb-2">
                          ❌ 부적정 항목 ({failItems.length}건)
                        </p>
                        <ul className="space-y-1">
                          {failItems.map((f, i) => (
                            <li key={i} className="text-xs text-red-300">
                              <span className="text-slate-500">[{f.section}]</span> {f.item}
                              {f.note && <span className="text-slate-400"> — {f.note}</span>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {HYGIENE_SECTIONS.map((section, si) => (
                      <div key={si}>
                        <h3 className="text-xs font-semibold text-teal-400 uppercase tracking-wider mb-2">
                          {section.category}
                        </h3>
                        <div className="space-y-1">
                          {section.items.map((item, ii) => {
                            const cell   = rec.items?.[`${si}_${ii}`];
                            const result = cell?.result;
                            return (
                              <div key={ii} className={`flex items-start gap-2 text-xs py-1.5 px-2 rounded-lg ${
                                result === 'fail' ? 'bg-red-900/20 text-red-300'
                                : result === 'pass' ? 'text-slate-300'
                                : 'text-slate-500'
                              }`}>
                                <span className="shrink-0 mt-0.5">
                                  {result === 'pass' ? '✅' : result === 'fail' ? '❌' : '○'}
                                </span>
                                <span className="flex-1">{item}</span>
                                {cell?.note && (
                                  <span className="text-slate-400 shrink-0 ml-2">({cell.note})</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
