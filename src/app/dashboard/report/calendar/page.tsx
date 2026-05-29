'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useStore } from '@/context/StoreContext';
import { db } from '@/lib/firebase/firebase';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import {
  CalendarDays, ChevronLeft, ChevronRight, Loader2,
  TrendingUp, Users, RotateCcw, X, ExternalLink,
} from 'lucide-react';

interface DayReport {
  id: string;
  reportDate: string;
  totalSales: number;
  netSales: number;
  customerCount: number;
  returnAmount: number;
  discountAmount: number;
  source?: string;
  posBreakdown?: { posNo: string; netSale: number; totalSale: number }[];
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

const isLivePOS = (src?: string) => src === 'pos_bridge';
const score = (dr: any): number => {
  const s = dr.totalSales || 0;
  if (isLivePOS(dr.source) && s > 0) return Infinity;
  if (isLivePOS(dr.source) && s === 0) return -1;
  return s;
};

function getKSTParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const [y, m, d] = fmt.format(date).split('-').map(Number);
  return { year: y, month: m, day: d };
}

function getKSTTodayYMD() {
  const { year, month, day } = getKSTParts();
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function monthRangeYMD(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { start, end, daysInMonth: lastDay };
}

function parseReport(dr: any): DayReport {
  const netSales =
    dr.netSales != null && dr.netSales !== 0 ? dr.netSales
    : dr.netSale != null && dr.netSale !== 0 ? dr.netSale
    : dr.netSales ?? dr.netSale ??
      ((dr.totalSales ?? 0) - (dr.returnAmount ?? 0) - (dr.discountAmount ?? 0));

  return {
    id: dr.id,
    reportDate: dr.reportDate ?? '',
    totalSales: dr.totalSales ?? 0,
    netSales,
    customerCount: dr.customerCount ?? 0,
    returnAmount: dr.returnAmount ?? 0,
    discountAmount: dr.discountAmount ?? 0,
    source: dr.source ?? 'manual',
    posBreakdown: Array.isArray(dr.posBreakdown) ? dr.posBreakdown : [],
  };
}

export default function SalesCalendarPage() {
  const { currentStore, storesLoaded } = useStore();
  const kst = getKSTParts();

  const [year, setYear] = useState(kst.year);
  const [month, setMonth] = useState(kst.month);
  const [reports, setReports] = useState<DayReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<DayReport | null>(null);

  const { start, end, daysInMonth } = monthRangeYMD(year, month);
  const todayYMD = getKSTTodayYMD();
  const isCurrentMonth = todayYMD.startsWith(`${year}-${String(month).padStart(2, '0')}`);

  const avgDivisor = useMemo(() => {
    if (isCurrentMonth) return kst.day;
    return daysInMonth;
  }, [isCurrentMonth, kst.day, daysInMonth]);

  const fetchMonth = useCallback(async () => {
    if (!storesLoaded) return;
    const storeId = currentStore?.storeId;
    if (!storeId) { setLoading(false); return; }

    setLoading(true);
    try {
      let snap;
      try {
        snap = await getDocs(query(
          collection(db, 'daily_reports'),
          where('storeId', '==', storeId),
          where('reportDate', '>=', start),
          where('reportDate', '<=', end),
          orderBy('reportDate', 'asc'),
        ));
      } catch {
        snap = await getDocs(query(
          collection(db, 'daily_reports'),
          where('reportDate', '>=', start),
          where('reportDate', '<=', end),
        ));
      }

      const byDate = new Map<string, any>();
      for (const docSnap of snap.docs) {
        const data = { id: docSnap.id, ...docSnap.data() };
        if (data.storeId !== storeId) continue;
        const existing = byDate.get(data.reportDate);
        if (!existing || score(data) > score(existing)) byDate.set(data.reportDate, data);
      }

      setReports(Array.from(byDate.values()).map(parseReport));
    } catch (e) {
      console.error('[report/calendar]', e);
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, [currentStore?.storeId, storesLoaded, start, end]);

  useEffect(() => { fetchMonth(); }, [fetchMonth]);

  const byDateMap = useMemo(() => {
    const m = new Map<string, DayReport>();
    reports.forEach(r => m.set(r.reportDate, r));
    return m;
  }, [reports]);

  const stats = useMemo(() => {
    const totalSales = reports.reduce((s, r) => s + r.totalSales, 0);
    const netSales = reports.reduce((s, r) => s + r.netSales, 0);
    const returnAmount = reports.reduce((s, r) => s + r.returnAmount, 0);
    const customerCount = reports.reduce((s, r) => s + r.customerCount, 0);
    const divisor = Math.max(avgDivisor, 1);

    return {
      totalSales,
      netSales,
      returnAmount,
      avgSales: Math.round(netSales / divisor),
      avgCustomers: Math.round((customerCount / divisor) * 10) / 10,
      dataDays: reports.length,
    };
  }, [reports, avgDivisor]);

  const calendarCells = useMemo(() => {
    const firstDow = new Date(`${start}T00:00:00`).getDay();
    const cells: { date: string | null; day: number | null }[] = [];

    for (let i = 0; i < firstDow; i++) cells.push({ date: null, day: null });
    for (let d = 1; d <= daysInMonth; d++) {
      const date = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ date, day: d });
    }
    return cells;
  }, [start, year, month, daysInMonth]);

  const shiftMonth = (delta: number) => {
    let m = month + delta;
    let y = year;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    setYear(y);
    setMonth(m);
    setSelected(null);
  };

  const monthLabel = `${year}년 ${month}월`;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-teal-400 flex items-center gap-2">
            <CalendarDays className="w-6 h-6" />
            달력매출
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            {currentStore?.storeName || '매장 선택 필요'}
            {isCurrentMonth && (
              <span className="text-slate-600 ml-2">· 평균 기준: 1일~오늘 (KST)</span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => shiftMonth(-1)}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2">
            <input
              type="month"
              value={`${year}-${String(month).padStart(2, '0')}`}
              onChange={e => {
                const [y, m] = e.target.value.split('-').map(Number);
                if (y && m) { setYear(y); setMonth(m); setSelected(null); }
              }}
              className="bg-transparent text-white text-sm outline-none"
            />
          </div>
          <button
            onClick={() => shiftMonth(1)}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => { const p = getKSTParts(); setYear(p.year); setMonth(p.month); setSelected(null); }}
            className="px-3 py-2 rounded-lg bg-teal-600/20 border border-teal-500/30 text-teal-300 text-sm hover:bg-teal-600/30"
          >
            이번 달
          </button>
        </div>
      </div>

      {/* 월간 요약 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        {[
          { label: '총매출', value: `${stats.totalSales.toLocaleString()}원`, color: 'text-teal-400', icon: TrendingUp },
          { label: '순매출', value: `${stats.netSales.toLocaleString()}원`, color: 'text-emerald-400', icon: TrendingUp },
          { label: '반품', value: `${stats.returnAmount.toLocaleString()}원`, color: 'text-red-400', icon: RotateCcw },
          { label: '평균매출', value: `${stats.avgSales.toLocaleString()}원`, color: 'text-blue-400', icon: TrendingUp,
            sub: isCurrentMonth ? `${avgDivisor}일 기준` : `${daysInMonth}일 기준` },
          { label: '평균객수', value: `${stats.avgCustomers}명`, color: 'text-violet-400', icon: Users,
            sub: isCurrentMonth ? `${avgDivisor}일 기준` : `${daysInMonth}일 기준` },
        ].map(card => (
          <div key={card.label} className="bg-slate-900 border border-slate-700 rounded-xl p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <card.icon className={`w-4 h-4 ${card.color}`} />
              <span className="text-slate-500 text-xs">{card.label}</span>
            </div>
            <p className={`text-lg font-bold ${card.color}`}>{card.value}</p>
            {card.sub && <p className="text-slate-600 text-[10px] mt-0.5">{card.sub}</p>}
          </div>
        ))}
      </div>

      <p className="text-slate-600 text-xs mb-3">
        {monthLabel} · 데이터 {stats.dataDays}일 · 날짜를 클릭하면 상세 내역을 볼 수 있습니다
      </p>

      {/* 달력 */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 text-teal-400 animate-spin" />
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
          <div className="grid grid-cols-7 border-b border-slate-700">
            {WEEKDAYS.map((wd, i) => (
              <div
                key={wd}
                className={`py-2 text-center text-xs font-semibold ${
                  i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-slate-500'
                }`}
              >
                {wd}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {calendarCells.map((cell, idx) => {
              if (!cell.date || !cell.day) {
                return <div key={`empty-${idx}`} className="min-h-[88px] border-b border-r border-slate-800/60 bg-slate-950/30" />;
              }

              const report = byDateMap.get(cell.date);
              const isToday = cell.date === todayYMD;
              const isFuture = cell.date > todayYMD;
              const dow = new Date(`${cell.date}T00:00:00`).getDay();

              return (
                <button
                  key={cell.date}
                  onClick={() => report && setSelected(report)}
                  disabled={!report}
                  className={`min-h-[88px] p-2 border-b border-r border-slate-800/60 text-left transition-colors
                    ${report ? 'hover:bg-slate-800/80 cursor-pointer' : 'cursor-default'}
                    ${isToday ? 'bg-teal-950/30 ring-1 ring-inset ring-teal-500/30' : ''}
                    ${selected?.reportDate === cell.date ? 'bg-teal-900/40' : ''}
                  `}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs font-semibold ${
                      isToday ? 'text-teal-400' :
                      dow === 0 ? 'text-red-400' : dow === 6 ? 'text-blue-400' : 'text-slate-400'
                    }`}>
                      {cell.day}
                    </span>
                    {report && (report.source === 'pos_bridge' || report.source === 'pos_bridge_migration') && (
                      <span className="text-[8px] text-red-400">POS</span>
                    )}
                  </div>

                  {report ? (
                    <div className="space-y-0.5">
                      <p className="text-[11px] text-emerald-400 font-semibold tabular-nums leading-tight">
                        {(report.netSales / 10000 >= 1
                          ? `${(report.netSales / 10000).toFixed(1)}만`
                          : `${(report.netSales / 1000).toFixed(0)}천`)}
                      </p>
                      <p className="text-[10px] text-slate-500 tabular-nums">
                        {report.customerCount}명
                      </p>
                    </div>
                  ) : isFuture ? (
                    <p className="text-[10px] text-slate-700">-</p>
                  ) : (
                    <p className="text-[10px] text-slate-700">미입력</p>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 일별 상세 모달 */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[85vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-slate-900 border-b border-slate-700 px-5 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-white font-bold">
                  {new Date(`${selected.reportDate}T00:00:00`).toLocaleDateString('ko-KR', {
                    month: 'long', day: 'numeric', weekday: 'short',
                  })}
                </h2>
                <p className="text-slate-500 text-xs mt-0.5">{selected.reportDate}</p>
              </div>
              <button onClick={() => setSelected(null)} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: '총매출', value: selected.totalSales, color: 'text-teal-400' },
                  { label: '순매출', value: selected.netSales, color: 'text-emerald-400' },
                  { label: '객수', value: selected.customerCount, color: 'text-blue-400', suffix: '명' },
                  { label: '반품', value: selected.returnAmount, color: 'text-red-400' },
                  { label: '할인', value: selected.discountAmount, color: 'text-yellow-400' },
                ].map(item => (
                  <div key={item.label} className="bg-slate-800/60 rounded-xl p-3">
                    <p className="text-slate-500 text-xs mb-1">{item.label}</p>
                    <p className={`font-bold ${item.color}`}>
                      {item.suffix
                        ? `${item.value}${item.suffix}`
                        : `${item.value.toLocaleString()}원`}
                    </p>
                  </div>
                ))}
              </div>

              {selected.posBreakdown && selected.posBreakdown.length > 0 && (
                <div>
                  <p className="text-slate-400 text-xs mb-2">POS별 매출</p>
                  <div className="space-y-1.5">
                    {selected.posBreakdown.map(pos => (
                      <div key={pos.posNo} className="flex justify-between text-sm bg-slate-800/40 rounded-lg px-3 py-2">
                        <span className="text-slate-400">POS {pos.posNo}</span>
                        <span className="text-emerald-400 tabular-nums">{(pos.netSale ?? pos.totalSale ?? 0).toLocaleString()}원</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Link
                href={`/dashboard/report/view/${selected.id}`}
                className="flex items-center justify-center gap-2 w-full py-3 bg-teal-600/20 hover:bg-teal-600/30 border border-teal-500/30 text-teal-300 rounded-xl text-sm font-semibold transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                전체 상세 내역 보기
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
