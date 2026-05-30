'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { db } from '@/lib/firebase/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { Loader2, RefreshCw, BarChart2, Package } from 'lucide-react';
import { AiUsedBadge, type AiMetaDisplay } from '@/components/AiUsedBadge';
import { getKSTTodayYMD, formatDateShortWithDow } from '@/lib/dateUtils';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import {
  COMPARE_COLUMNS,
  CompareKey,
  ReportSnapshot,
  aggregateTimeSlotsFromItems,
  calcAvgTicket,
  calcChange,
  getCompareDates,
  mapDailyReportDoc,
  normalizePosBreakdown,
  pickBestDailyReport,
  topItems,
  type DailyReportView,
} from '@/lib/reportCompare';

interface RangeContext {
  start: string;
  end: string;
  totalNet: number;
  days: number;
  avgNet: number;
}

interface Props {
  storeId: string;
  storeName?: string;
  initialDate?: string;
  rangeContext?: RangeContext | null;
}

interface ReportDoc extends DailyReportView {}

async function fetchReportsForCompare(
  storeId: string,
  baseDate: string,
): Promise<Partial<Record<CompareKey, ReportDoc | null>>> {
  const dates = getCompareDates(baseDate);
  const allYmds = Object.values(dates);
  const sorted = [...allYmds].sort();

  const snap = await getDocs(query(
    collection(db, 'daily_reports'),
    where('storeId', '==', storeId),
    where('reportDate', '>=', sorted[0]),
    where('reportDate', '<=', sorted[sorted.length - 1]),
  ));

  const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Record<string, unknown>));
  return Object.fromEntries(
    Object.entries(dates).map(([key, date]) => {
      const best = pickBestDailyReport(docs, storeId, date);
      return [key, best ? mapDailyReportDoc(best) : null];
    }),
  );
}

const METRICS = [
  { key: 'totalSales', label: '총매출' },
  { key: 'netSales', label: '순매출' },
  { key: 'customerCount', label: '객수', suffix: '명' },
  { key: 'avgTicket', label: '객단가' },
  { key: 'returnAmount', label: '반품' },
] as const;

/** 분석 테이블 — 전일·동요일 비교 중심 */
const ANALYSIS_COMPARE_KEYS: CompareKey[] = [
  'today', 'yesterday', 'lastWeekDow', 'lastMonthDow', 'lastYearMonthDow',
];

export default function ReportDailyAnalysis({ storeId, storeName, initialDate, rangeContext }: Props) {
  const [baseDate, setBaseDate] = useState(initialDate || getKSTTodayYMD());
  const [tab, setTab] = useState<'time' | 'items'>('time');
  const [data, setData] = useState<Partial<Record<CompareKey, ReportDoc | null>>>({});
  const [loading, setLoading] = useState(true);
  const [review, setReview] = useState('');
  const [reviewAi, setReviewAi] = useState<AiMetaDisplay | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [itemCategory, setItemCategory] = useState('전체');

  useEffect(() => {
    if (initialDate) setBaseDate(initialDate);
  }, [initialDate]);

  const compareDates = useMemo(() => getCompareDates(baseDate), [baseDate]);

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    try {
      const entries = await fetchReportsForCompare(storeId, baseDate);
      setData(entries);
    } finally {
      setLoading(false);
    }
  }, [storeId, baseDate]);

  useEffect(() => { load(); }, [load]);

  const generateReview = useCallback(async () => {
    setReviewLoading(true);
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/dashboard/sales-review', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          storeId,
          date: baseDate,
          todayData: data.today,
          compareData: {
            yesterday: data.yesterday,
            lastMonthSame: data.lastMonthSame,
            lastMonthDow: data.lastMonthDow,
            lastWeekDow: data.lastWeekDow,
            lastYearMonthSame: data.lastYearMonthSame,
            lastYearMonthDow: data.lastYearMonthDow,
          },
          compareDates,
          isClosed: data.today?.isClosed,
          weather: data.today?.weather,
          issues: data.today?.issues,
          news: data.today?.news,
          rangeContext: rangeContext ?? undefined,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        setReview(j.error || 'AI 리뷰 생성 실패');
        setReviewAi(null);
        return;
      }
      setReview(j.review || '리뷰를 생성하지 못했습니다.');
      setReviewAi(j.ai || null);
    } catch {
      setReview('AI 리뷰를 불러오지 못했습니다.');
    } finally {
      setReviewLoading(false);
    }
  }, [baseDate, data, compareDates, storeId, rangeContext]);

  useEffect(() => {
    if (loading) return;
    if (!data.today) {
      setReview(`${baseDate} 일마감 데이터가 없습니다. POS 동기화 또는 매출 키인 후 분석됩니다.`);
      setReviewAi(null);
      return;
    }
    generateReview();
  }, [loading, data.today, baseDate, rangeContext]); // eslint-disable-line react-hooks/exhaustive-deps

  const posKeys = useMemo(() => {
    const keys = new Set<string>();
    Object.values(data).forEach(r => {
      Object.keys(normalizePosBreakdown(r?.posBreakdown)).forEach(k => keys.add(k));
    });
    return [...keys].sort();
  }, [data]);

  const timeSlots = useMemo(
    () => aggregateTimeSlotsFromItems(data.today?.items, data.today?.posBreakdown),
    [data.today],
  );

  const todayItems = useMemo(() => {
    let items = topItems(data.today?.items, 20);
    if (itemCategory !== '전체') {
      items = items.filter(i => (i.category || '').includes(itemCategory) || i.name.includes(itemCategory));
    }
    return items;
  }, [data.today, itemCategory]);

  const getVal = (snap: ReportSnapshot | null | undefined, key: string) => {
    if (!snap) return null;
    if (key === 'avgTicket') return calcAvgTicket(snap.netSales, snap.customerCount);
    return (snap as Record<string, unknown>)[key] as number | null ?? null;
  };

  const analysisColumns = COMPARE_COLUMNS.filter(c => ANALYSIS_COMPARE_KEYS.includes(c.key));

  const rows = [
    ...METRICS,
    ...posKeys.map(k => ({ key: k, label: k, isPos: true })),
    { key: 'cardSale', label: '카드' },
    { key: 'cashSale', label: '현금' },
  ];

  const inProgress = baseDate === getKSTTodayYMD() && data.today?.isClosed === false;

  return (
    <div className="mb-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-200">일별 매출 분석</h2>
          <p className="text-slate-500 text-xs">
            {storeName} · KST 기준
            {rangeContext && (
              <span className="text-slate-400 ml-2">
                · 조회기간 {rangeContext.start} ~ {rangeContext.end}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 sm:ml-auto">
          <input
            type="date"
            value={baseDate}
            onChange={e => setBaseDate(e.target.value)}
            className="bg-slate-900 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 text-sm"
          />
          <button
            onClick={load}
            className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-teal-400"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* AI 리뷰 */}
      <div className="bg-gradient-to-r from-blue-950/60 to-purple-950/60 border border-blue-800/40 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">🤖</span>
          <span className="font-semibold text-blue-300 text-sm">
            AI 매출 리뷰
            {inProgress && (
              <span className="ml-2 text-[10px] font-normal px-2 py-0.5 rounded-full bg-yellow-900/40 text-yellow-400 border border-yellow-500/30">
                영업중 · 동시간대 기준
              </span>
            )}
          </span>
          <button onClick={generateReview} className="text-xs text-blue-400 ml-auto hover:underline">새로고침</button>
        </div>
        {reviewLoading ? (
          <div className="h-10 bg-blue-900/30 rounded animate-pulse" />
        ) : (
          <>
            <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
              {reviewLoading ? '' : (review || '분석 데이터를 불러오는 중...')}
            </p>
            <AiUsedBadge ai={reviewAi} className="mt-3 pt-3 border-t border-blue-900/30" />
          </>
        )}
      </div>

      {/* 탭 */}
      <div className="flex gap-2 border-b border-slate-800 pb-2">
        {[
          { id: 'time' as const, label: '시간대별 매출', icon: BarChart2 },
          { id: 'items' as const, label: '품목별 매출', icon: Package },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.id ? 'bg-teal-600/20 text-teal-300 border border-teal-500/30' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 text-teal-400 animate-spin" />
        </div>
      ) : tab === 'time' ? (
        <div className="space-y-4">
          {/* 비교 테이블 */}
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="bg-slate-800 border-b border-slate-700">
                  <th className="sticky left-0 bg-slate-800 px-3 py-2 text-left text-slate-400 text-xs">구분</th>
                  {analysisColumns.map(c => (
                    <th key={c.key} className={`px-3 py-2 text-right text-xs whitespace-nowrap ${c.color}`}>
                      <div>{c.label}</div>
                      <div className="text-[10px] font-normal text-slate-500">
                        {formatDateShortWithDow(compareDates[c.key])}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.label} className="border-b border-slate-800/80">
                    <td className="sticky left-0 bg-slate-900 px-3 py-2 text-slate-400 text-xs whitespace-nowrap">{row.label}</td>
                    {analysisColumns.map(col => {
                      const snap = data[col.key];
                      let val: number | null = null;
                      if ('isPos' in row && row.isPos) {
                        val = normalizePosBreakdown(snap?.posBreakdown)[row.key] ?? null;
                      } else {
                        val = getVal(snap, row.key);
                      }
                      const suffix = row.key === 'customerCount' ? '명' : '원';
                      const todayVal = 'isPos' in row && row.isPos
                        ? normalizePosBreakdown(data.today?.posBreakdown)[row.key]
                        : getVal(data.today, row.key);
                      const ch = col.key !== 'today' && todayVal != null && val != null
                        ? calcChange(todayVal, val)
                        : null;
                      return (
                        <td key={col.key} className="px-3 py-2 text-right tabular-nums">
                          {val != null && val !== 0 ? (
                            <div>
                              <div className="text-slate-200">{val.toLocaleString()}{suffix === '명' ? suffix : suffix}</div>
                              {ch && <div className={`text-[10px] ${ch.color}`}>{ch.label}</div>}
                            </div>
                          ) : (
                            <span className="text-slate-600">-</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 시간대별 */}
          {timeSlots.length > 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800 text-sm font-semibold text-slate-300">시간대별 매출 ({baseDate})</div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-800/60">
                    <th className="px-4 py-2 text-left text-slate-500 text-xs">시간대</th>
                    <th className="px-4 py-2 text-right text-slate-500 text-xs">매출</th>
                    <th className="px-4 py-2 text-right text-slate-500 text-xs">건수</th>
                  </tr>
                </thead>
                <tbody>
                  {timeSlots.map(s => (
                    <tr key={s.label} className="border-t border-slate-800/60">
                      <td className="px-4 py-2 text-slate-400">{s.label}</td>
                      <td className="px-4 py-2 text-right text-emerald-400 tabular-nums">{s.total.toLocaleString()}원</td>
                      <td className="px-4 py-2 text-right text-slate-500">{s.count}건</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-slate-600 text-xs px-1">시간대 데이터 없음 — POS 동기화 후 품목별 시간(Sale_Time)이 반영됩니다.</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-slate-300 text-sm">📦 {baseDate} 상위 품목</h3>
              <div className="flex gap-1 flex-wrap">
                {['전체', '한우', '한돈', '수입', '계육'].map(c => (
                  <button
                    key={c}
                    onClick={() => setItemCategory(c)}
                    className={`text-[10px] px-2 py-0.5 rounded-full ${itemCategory === c ? 'bg-teal-600/30 text-teal-300' : 'bg-slate-800 text-slate-500'}`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {todayItems.length === 0 ? (
                <p className="text-slate-600 text-sm">품목 데이터 없음</p>
              ) : todayItems.map((item, idx) => (
                <div key={item.name} className="flex items-center gap-3 p-2 bg-slate-800/40 rounded-lg">
                  <span className="text-slate-600 font-bold w-5 text-sm">{idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-200 truncate">{item.name}</p>
                    <p className="text-[10px] text-slate-500">{item.qty}개 · {item.category || '-'}</p>
                  </div>
                  <p className="text-sm font-semibold text-teal-400 tabular-nums">{item.amount.toLocaleString()}원</p>
                </div>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full min-w-[700px] text-xs">
              <thead>
                <tr className="bg-slate-800">
                  <th className="sticky left-0 bg-slate-800 px-2 py-2 text-left text-slate-400">품목</th>
                  {analysisColumns.map(c => (
                    <th key={c.key} className={`px-2 py-2 text-right whitespace-nowrap ${c.color}`}>
                      <div>{c.label}</div>
                      <div className="text-[9px] font-normal text-slate-500">
                        {formatDateShortWithDow(compareDates[c.key])}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {todayItems.slice(0, 10).map(item => (
                  <tr key={item.name} className="border-t border-slate-800/60">
                    <td className="sticky left-0 bg-slate-900 px-2 py-1.5 text-slate-300 truncate max-w-[120px]">{item.name}</td>
                    {analysisColumns.map(col => {
                      const items = topItems(data[col.key]?.items, 100);
                      const found = items.find(i => i.name === item.name);
                      return (
                        <td key={col.key} className="px-2 py-1.5 text-right tabular-nums text-slate-400">
                          {found ? `${found.amount.toLocaleString()}` : '-'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
