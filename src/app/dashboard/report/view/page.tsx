'use client';

import { useState, useEffect, useCallback } from 'react';
import { useStore } from '@/context/StoreContext';
import { db } from '@/lib/firebase/firebase';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import {
  ShoppingCart, ChevronRight, Loader2, Calendar, Search,
  TrendingUp, Users, RotateCcw, Tag, Pencil, RefreshCw, AlertCircle,
} from 'lucide-react';
import Link from 'next/link';

// ── 타입 ──────────────────────────────────────────────────────────
interface WeatherData { condition: string; tempMax: number; tempMin: number; }

interface PosBreakdown {
  posNo: string;
  totalSale: number;
  netSale: number;
  cashSale?: number;
  cardSale?: number;
  returnCount?: number;
  returnSale?: number;
}

interface ReportRow {
  id: string;
  reportDate: string;
  serialNumber: string;
  totalSales: number;
  netSales: number;
  customerCount: number;
  returnAmount: number;
  discountAmount: number;
  weather?: WeatherData | string | null;
  issues?: any[] | string | null;
  promotions?: string[];
  promotion?: string;
  source?: string;
  isClosed?: boolean;
  editHistory?: any[];
  posBreakdown?: PosBreakdown[];
}

type Preset = 'week' | 'month' | 'lastMonth' | 'custom';

const PRESET_LABELS: Record<Preset, string> = {
  week: '이번 주', month: '이번 달', lastMonth: '지난 달', custom: '직접입력',
};

// ── 날짜 유틸 ─────────────────────────────────────────────────────
function toYMD(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getThisWeek() {
  const today = new Date();
  const sun = new Date(today);
  sun.setDate(today.getDate() - today.getDay()); // 일요일로
  return { start: toYMD(sun), end: toYMD(today) };
}
function getThisMonth() {
  const t = new Date();
  return { start: toYMD(new Date(t.getFullYear(), t.getMonth(), 1)), end: toYMD(t) };
}
function getLastMonth() {
  const t = new Date();
  return {
    start: toYMD(new Date(t.getFullYear(), t.getMonth() - 1, 1)),
    end:   toYMD(new Date(t.getFullYear(), t.getMonth(), 0)),
  };
}

// 경과 일수 (start ~ min(today, end))
function calendarDaysElapsed(start: string, end: string): number {
  const today = toYMD(new Date());
  const effectiveEnd = end < today ? end : today;
  if (effectiveEnd < start) return 1;
  const a = new Date(start + 'T00:00:00');
  const b = new Date(effectiveEnd + 'T00:00:00');
  return Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
}

// 전월 동일 일자 (말일 초과 시 말일로 클램프)
function subtractOneMonth(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const ty = m === 1 ? y - 1 : y;
  const tm = m === 1 ? 12 : m - 1;
  const lastDay = new Date(ty, tm, 0).getDate();
  return `${ty}-${String(tm).padStart(2, '0')}-${String(Math.min(d, lastDay)).padStart(2, '0')}`;
}

// 전년 동일 날짜
function subtractOneYear(dateStr: string): string {
  return `${parseInt(dateStr.slice(0, 4)) - 1}${dateStr.slice(4)}`;
}

// 전년 동월 동요일 (52주 = 364일 전 → 같은 요일 보장)
function subtractOneYearSameWeekday(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() - 364);
  return toYMD(d);
}

// % 변화량
function pctChange(current: number, prev: number | undefined): { text: string; color: string } | null {
  if (prev == null || prev === 0) return null;
  const pct = Math.round(((current - prev) / prev) * 100);
  return {
    text:  pct > 0 ? `+${pct}%↑` : pct < 0 ? `${pct}%↓` : `0%`,
    color: pct > 0 ? 'text-teal-400' : pct < 0 ? 'text-red-400' : 'text-slate-500',
  };
}

// ── 데이터 중복 제거 스코어 ──────────────────────────────────────
const isLivePOS = (src?: string) => src === 'pos_bridge';
const score = (dr: any): number => {
  const s = dr.totalSales || 0;
  if (isLivePOS(dr.source) && s > 0) return Infinity;
  if (isLivePOS(dr.source) && s === 0) return -1;
  return s;
};

function buildDateMap(docs: any[], storeId: string): Map<string, number> {
  const byDate = new Map<string, any>();
  for (const d of docs) {
    if (d.storeId !== storeId) continue;
    const existing = byDate.get(d.reportDate);
    if (!existing || score(d) > score(existing)) byDate.set(d.reportDate, d);
  }
  const result = new Map<string, number>();
  for (const [date, dr] of byDate) result.set(date, dr.netSales ?? dr.netSale ?? ((dr.totalSales ?? 0) - (dr.returnAmount ?? 0) - (dr.discountAmount ?? 0)));
  return result;
}

// ── 컴포넌트 ──────────────────────────────────────────────────────
export default function ReportViewPage() {
  const { currentStore, storesLoaded } = useStore();

  const [preset, setPreset]          = useState<Preset>('month');
  const init                          = getThisMonth();
  const [range, setRange]             = useState(init);
  const [customStart, setCustomStart] = useState(init.start);
  const [customEnd, setCustomEnd]     = useState(init.end);

  const [reports, setReports]   = useState<ReportRow[]>([]);
  const [isLoading, setLoading] = useState(true);
  const [error, setError]       = useState<string | null>(null);

  // 비교 데이터
  const [prevMonthMap, setPrevMonthMap] = useState<Map<string, number>>(new Map());
  const [prevYearMap,  setPrevYearMap]  = useState<Map<string, number>>(new Map());

  // 전년 비교 옵션: 'date' = 동일 날짜, 'weekday' = 동월 동요일(52주 전)
  const [yearMode, setYearMode] = useState<'date' | 'weekday'>('date');

  // ── 비교 범위 fetch 헬퍼 ────────────────────────────────────────
  const fetchComparison = useCallback(async (
    storeId: string,
    cStart: string,
    cEnd: string,
  ): Promise<Map<string, number>> => {
    if (!cStart || !cEnd || cStart > cEnd) return new Map();
    try {
      const snap = await getDocs(query(
        collection(db, 'daily_reports'),
        where('reportDate', '>=', cStart),
        where('reportDate', '<=', cEnd),
      ));
      return buildDateMap(snap.docs.map(d => ({ id: d.id, ...d.data() })), storeId);
    } catch { return new Map(); }
  }, []);

  // ── 메인 데이터 조회 ────────────────────────────────────────────
  const fetchData = useCallback(async (start: string, end: string) => {
    if (!storesLoaded) return;
    const storeId = currentStore?.storeId;
    if (!storeId) { setLoading(false); return; }

    setLoading(true);
    setError(null);

    try {
      // 메인 쿼리
      let snap;
      try {
        snap = await getDocs(query(
          collection(db, 'daily_reports'),
          where('storeId', '==', storeId),
          where('reportDate', '>=', start),
          where('reportDate', '<=', end),
          orderBy('reportDate', 'desc'),
        ));
      } catch {
        snap = await getDocs(query(
          collection(db, 'daily_reports'),
          where('reportDate', '>=', start),
          where('reportDate', '<=', end),
        ));
      }

      const rawDocs = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));

      // 날짜별 중복 제거
      const byDate = new Map<string, any>();
      for (const dr of rawDocs) {
        if (dr.storeId !== storeId) continue;
        const existing = byDate.get(dr.reportDate);
        if (!existing || score(dr) > score(existing)) byDate.set(dr.reportDate, dr);
      }

      const rows: ReportRow[] = Array.from(byDate.values()).map(dr => ({
        id:             dr.id,
        reportDate:     dr.reportDate    ?? '',
        serialNumber:   dr.serialNumber  ?? '',
        totalSales:     dr.totalSales    ?? 0,
        netSales:       dr.netSales ?? dr.netSale ?? ((dr.totalSales ?? 0) - (dr.returnAmount ?? 0) - (dr.discountAmount ?? 0)),
        customerCount:  dr.customerCount ?? 0,
        returnAmount:   dr.returnAmount  ?? 0,
        discountAmount: dr.discountAmount ?? 0,
        weather:        dr.weather    ?? null,
        issues:         dr.issues     ?? [],
        promotions:     dr.promotions ?? [],
        promotion:      dr.promotion,
        source:         dr.source     ?? 'manual',
        isClosed:       dr.isClosed,
        editHistory:    dr.editHistory ?? [],
        posBreakdown:   Array.isArray(dr.posBreakdown) ? dr.posBreakdown : [],
      }));
      rows.sort((a, b) => b.reportDate.localeCompare(a.reportDate));
      setReports(rows);

      // 비교 데이터 fetch (병렬)
      if (rows.length > 0) {
        const dates = rows.map(r => r.reportDate);

        const pmDates = dates.map(subtractOneMonth);
        const pmStart = pmDates.reduce((a, b) => a < b ? a : b);
        const pmEnd   = pmDates.reduce((a, b) => a > b ? a : b);

        // 전년: date 모드와 weekday 모드 양쪽 다 fetch (토글 시 재조회 없이 전환)
        const pyDatesDate    = dates.map(subtractOneYear);
        const pyDatesWeekday = dates.map(subtractOneYearSameWeekday);
        const pyStartDate    = pyDatesDate.reduce((a, b) => a < b ? a : b);
        const pyEndDate      = pyDatesDate.reduce((a, b) => a > b ? a : b);
        const pyStartWday    = pyDatesWeekday.reduce((a, b) => a < b ? a : b);
        const pyEndWday      = pyDatesWeekday.reduce((a, b) => a > b ? a : b);
        const pyStart        = pyStartDate < pyStartWday ? pyStartDate : pyStartWday;
        const pyEnd          = pyEndDate   > pyEndWday   ? pyEndDate   : pyEndWday;

        const [pmMap, pyMap] = await Promise.all([
          fetchComparison(storeId, pmStart, pmEnd),
          fetchComparison(storeId, pyStart, pyEnd),
        ]);
        setPrevMonthMap(pmMap);
        setPrevYearMap(pyMap);
      } else {
        setPrevMonthMap(new Map());
        setPrevYearMap(new Map());
      }
    } catch (e: any) {
      console.error('[report/view] 조회 오류:', e);
      setError('데이터 조회에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  }, [currentStore?.storeId, storesLoaded, fetchComparison]);

  useEffect(() => { fetchData(range.start, range.end); }, [range, fetchData]);

  useEffect(() => {
    const onFocus = () => fetchData(range.start, range.end);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [range, fetchData]);

  const handlePreset = (p: Preset) => {
    setPreset(p);
    if (p === 'week')      setRange(getThisWeek());
    if (p === 'month')     setRange(getThisMonth());
    if (p === 'lastMonth') setRange(getLastMonth());
  };

  // ── 통계 계산 ────────────────────────────────────────────────────
  const totalSales    = reports.reduce((s, r) => s + (r.totalSales    || 0), 0);
  const totalNetSales = reports.reduce((s, r) => s + (r.netSales      || 0), 0);
  const totalCustomer = reports.reduce((s, r) => s + (r.customerCount || 0), 0);
  const totalReturn   = reports.reduce((s, r) => s + (r.returnAmount  || 0), 0);
  const totalDiscount = reports.reduce((s, r) => s + (r.discountAmount|| 0), 0);

  // 평균: 오늘 기준 경과 일수로 나눔
  const elapsed  = calendarDaysElapsed(range.start, range.end);
  const avgSales = elapsed > 0 ? Math.round(totalNetSales / elapsed) : 0;

  // ── 날씨 포맷 ────────────────────────────────────────────────────
  const fmtWeather = (w: any) => {
    if (!w) return '-';
    if (typeof w === 'object') return `${w.condition} ${w.tempMin}°~${w.tempMax}°`;
    return w as string;
  };

  // ── 전년 비교 날짜 계산 ──────────────────────────────────────────
  const getPrevYearDate = (date: string) =>
    yearMode === 'weekday' ? subtractOneYearSameWeekday(date) : subtractOneYear(date);

  // ── 렌더링 ───────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 max-w-full">

      {/* 헤더 */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-teal-400 flex items-center gap-2">
            <Calendar className="w-6 h-6" />
            일마감내역
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            {currentStore?.storeName} · {range.start} ~ {range.end}
          </p>
        </div>
        <button
          onClick={() => fetchData(range.start, range.end)}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-lg text-sm transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          새로고침
        </button>
      </div>

      {/* 기간 선택 + 전년 비교 옵션 */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 mb-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">기간 선택</p>
          {/* 전년 비교 모드 토글 */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-slate-500">전년 대비:</span>
            <button
              onClick={() => setYearMode('date')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                yearMode === 'date'
                  ? 'bg-violet-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              동일 날짜
            </button>
            <button
              onClick={() => setYearMode('weekday')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                yearMode === 'weekday'
                  ? 'bg-violet-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              동월 동요일
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {(['week', 'month', 'lastMonth', 'custom'] as Preset[]).map(p => (
            <button
              key={p}
              onClick={() => handlePreset(p)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                preset === p ? 'bg-teal-500 text-slate-950' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {PRESET_LABELS[p]}
            </button>
          ))}
        </div>

        {preset === 'custom' && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-500" />
            <span className="text-slate-500 text-sm">~</span>
            <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-500" />
            <button
              onClick={() => { if (customStart && customEnd) setRange({ start: customStart, end: customEnd }); }}
              className="flex items-center gap-1.5 px-4 py-2 bg-teal-500 hover:bg-teal-400 text-slate-950 rounded-lg text-sm font-semibold transition-colors"
            >
              <Search className="w-4 h-4" />조회
            </button>
          </div>
        )}
      </div>

      {/* 로딩 */}
      {isLoading ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl p-4 animate-pulse">
                <div className="h-3 bg-slate-700 rounded w-16 mb-2" />
                <div className="h-6 bg-slate-700 rounded w-24" />
              </div>
            ))}
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden animate-pulse">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="px-4 py-4 border-b border-slate-800 flex gap-4">
                <div className="h-4 bg-slate-700 rounded w-24" />
                <div className="h-4 bg-slate-700 rounded w-20 ml-auto" />
                <div className="h-4 bg-slate-700 rounded w-20" />
                <div className="h-4 bg-slate-700 rounded w-16" />
              </div>
            ))}
          </div>
        </div>

      ) : error ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mb-4 opacity-70" />
          <p className="text-slate-300 font-medium mb-1">데이터 조회 실패</p>
          <p className="text-slate-500 text-sm mb-5">{error}</p>
          <button
            onClick={() => fetchData(range.start, range.end)}
            className="flex items-center gap-2 px-5 py-2.5 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-sm font-semibold transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            다시 시도
          </button>
        </div>

      ) : reports.length === 0 ? (
        <div className="text-center py-20 text-slate-500">
          <ShoppingCart className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p>해당 기간에 보고서가 없습니다.</p>
          <Link href="/dashboard/report/input"
            className="text-teal-400 text-sm mt-2 block hover:underline">
            마감 보고서 작성하기 →
          </Link>
        </div>

      ) : (
        <>
          {/* 통계 카드 */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
            {[
              { icon: <TrendingUp className="w-3.5 h-3.5 text-teal-400"    />, label: '총 매출',    value: `${totalSales.toLocaleString()}원`,    color: 'text-teal-400' },
              { icon: <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />, label: '총 순매출',  value: `${totalNetSales.toLocaleString()}원`,  color: 'text-emerald-400' },
              { icon: <Users      className="w-3.5 h-3.5 text-blue-400"   />, label: '일평균 순매출', value: `${avgSales.toLocaleString()}원`,    color: 'text-blue-400',
                sub: `${elapsed}일 기준` },
              { icon: <RotateCcw  className="w-3.5 h-3.5 text-red-400"    />, label: '총 반품',    value: totalReturn   > 0 ? `${totalReturn.toLocaleString()}원`   : '-', color: 'text-red-400' },
              { icon: <Tag        className="w-3.5 h-3.5 text-yellow-400" />, label: '총 할인',    value: totalDiscount > 0 ? `${totalDiscount.toLocaleString()}원` : '-', color: 'text-yellow-400' },
            ].map(c => (
              <div key={c.label} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <div className="flex items-center gap-1.5 mb-1">
                  {c.icon}
                  <p className="text-xs text-slate-500">{c.label}</p>
                </div>
                <p className={`text-lg font-bold ${c.color}`}>{c.value}</p>
                {'sub' in c && c.sub && (
                  <p className="text-slate-600 text-[10px] mt-0.5">{c.sub}</p>
                )}
              </div>
            ))}
          </div>

          {/* 범례 */}
          <div className="flex items-center gap-3 mb-3 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
              🔴 POS 자동연동
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-blue-500" />
              🔵 수동입력
            </span>
            <span className="text-slate-600 ml-auto">총 {reports.length}일</span>
          </div>

          {/* 테이블 */}
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full min-w-[1100px]">
              <thead>
                <tr className="bg-slate-800 border-b border-slate-700">
                  {[
                    { label: '날짜',        align: 'left'   },
                    { label: '총매출',      align: 'right'  },
                    { label: '순매출',      align: 'right'  },
                    { label: '전월대비',    align: 'right'  },
                    { label: '전년대비',    align: 'right'  },
                    { label: '객수',        align: 'right'  },
                    { label: '반품',        align: 'right'  },
                    { label: '할인',        align: 'right'  },
                    { label: '날씨',        align: 'center' },
                    { label: '이슈/프로모션', align: 'left' },
                    { label: '수정이력',    align: 'center' },
                    { label: '액션',        align: 'center' },
                  ].map(h => (
                    <th key={h.label}
                      className={`px-3 py-3 text-slate-400 text-xs font-medium whitespace-nowrap text-${h.align}`}>
                      {h.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reports.map((report, idx) => {
                  const isPOS = report.source === 'pos_bridge' || report.source === 'pos_bridge_migration';

                  const dow = report.reportDate ? new Date(report.reportDate + 'T00:00:00').getDay() : -1;
                  const DOW_LABELS = ['일','월','화','수','목','금','토'];
                  const dowColor = dow === 0 ? 'text-red-400' : dow === 6 ? 'text-blue-400' : 'text-slate-300';

                  const pmDate   = subtractOneMonth(report.reportDate);
                  const pyDate   = getPrevYearDate(report.reportDate);
                  const pmSales  = prevMonthMap.get(pmDate);
                  const pySales  = prevYearMap.get(pyDate);
                  const pmChg    = pctChange(report.netSales, pmSales);
                  const pyChg    = pctChange(report.netSales, pySales);

                  return (
                    <tr key={report.id}
                      className={`border-b border-slate-800 hover:bg-slate-800/50 transition-colors ${idx % 2 !== 0 ? 'bg-slate-900/30' : ''}`}>

                      {/* 날짜 */}
                      <td className="px-3 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <p className="text-white font-medium text-sm flex items-center gap-1">
                            {report.reportDate
                              ? new Date(report.reportDate + 'T00:00:00').toLocaleDateString('ko-KR', {
                                  month: 'long', day: 'numeric',
                                })
                              : '-'}
                            {dow >= 0 && (
                              <span className={`text-xs font-bold ${dowColor}`}>({DOW_LABELS[dow]})</span>
                            )}
                          </p>
                          {isPOS ? (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-900/40 border border-red-500/30 text-red-400">🔴</span>
                          ) : (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-900/40 border border-blue-500/30 text-blue-400">🔵</span>
                          )}
                          {isPOS && report.isClosed === false && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-900/40 border border-yellow-500/30 text-yellow-400">미마감</span>
                          )}
                        </div>
                        <p className="text-slate-600 text-[10px] font-mono">{report.serialNumber}</p>
                      </td>

                      {/* 총매출 */}
                      <td className="px-3 py-3 text-right">
                        <Link href={`/dashboard/report/view/${report.id}`}
                          className="text-teal-400 hover:text-teal-300 font-bold text-sm hover:underline whitespace-nowrap">
                          {(report.totalSales || 0).toLocaleString()}원
                        </Link>
                        {(report.posBreakdown?.length ?? 0) >= 2 && (
                          <div className="mt-1 space-y-0.5">
                            {report.posBreakdown!.map(pos => (
                              <div key={pos.posNo} className="flex items-center justify-end gap-1 text-[10px]">
                                <span className="text-slate-600 bg-slate-800 px-1 rounded">POS{pos.posNo}</span>
                                <span className="text-slate-400 font-mono">{pos.totalSale.toLocaleString()}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>

                      {/* 순매출 */}
                      <td className="px-3 py-3 text-right">
                        <span className="text-emerald-400 font-bold text-sm whitespace-nowrap">
                          {(report.netSales || 0).toLocaleString()}원
                        </span>
                        {(report.posBreakdown?.length ?? 0) >= 2 && (
                          <div className="mt-1 space-y-0.5">
                            {report.posBreakdown!.map(pos => (
                              <div key={pos.posNo} className="flex items-center justify-end gap-1 text-[10px]">
                                <span className="text-slate-600 bg-slate-800 px-1 rounded">POS{pos.posNo}</span>
                                <span className="text-slate-400 font-mono">{pos.netSale.toLocaleString()}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>

                      {/* 전월 대비 */}
                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        {pmSales != null ? (
                          <div>
                            <p className="text-slate-400 text-xs">{pmSales.toLocaleString()}원</p>
                            {pmChg ? (
                              <>
                                <span className={`text-xs font-bold ${pmChg.color}`}>{pmChg.text}</span>
                                <p className="text-slate-600 text-[10px]">{pmDate.slice(5)} 대비</p>
                              </>
                            ) : (
                              <p className="text-slate-600 text-[10px]">{pmDate.slice(5)}</p>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-600 text-xs">-</span>
                        )}
                      </td>

                      {/* 전년 대비 */}
                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        {pySales != null ? (
                          <div>
                            <p className="text-slate-400 text-xs">{pySales.toLocaleString()}원</p>
                            {pyChg ? (
                              <>
                                <span className={`text-xs font-bold ${pyChg.color}`}>{pyChg.text}</span>
                                <p className="text-slate-600 text-[10px]">
                                  {pyDate.slice(0, 4)}년 {yearMode === 'weekday' ? '동요일' : pyDate.slice(5)} 대비
                                </p>
                              </>
                            ) : (
                              <p className="text-slate-600 text-[10px]">
                                {pyDate.slice(0, 4)}년 {yearMode === 'weekday' ? '동요일' : pyDate.slice(5)}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-600 text-xs">-</span>
                        )}
                      </td>

                      {/* 객수 */}
                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        <span className="text-blue-400 font-bold text-sm">
                          {report.customerCount ? `${report.customerCount}명` : '-'}
                        </span>
                      </td>

                      {/* 반품 */}
                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        <span className={`text-sm font-medium ${(report.returnAmount || 0) > 0 ? 'text-red-400' : 'text-slate-600'}`}>
                          {(report.returnAmount || 0) > 0 ? `${report.returnAmount!.toLocaleString()}원` : '-'}
                        </span>
                      </td>

                      {/* 할인 */}
                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        <span className={`text-sm font-medium ${(report.discountAmount || 0) > 0 ? 'text-yellow-400' : 'text-slate-600'}`}>
                          {(report.discountAmount || 0) > 0 ? `${report.discountAmount!.toLocaleString()}원` : '-'}
                        </span>
                      </td>

                      {/* 날씨 */}
                      <td className="px-3 py-3 text-center whitespace-nowrap">
                        <span className="text-slate-300 text-sm">{fmtWeather(report.weather)}</span>
                      </td>

                      {/* 이슈/프로모션 */}
                      <td className="px-3 py-3 max-w-[160px]">
                        <div className="space-y-0.5">
                          {Array.isArray(report.issues) && report.issues.length > 0 && (
                            <p className="text-yellow-400 text-xs truncate">🔔 {report.issues[0]?.title}</p>
                          )}
                          {typeof report.issues === 'string' && report.issues && (
                            <p className="text-yellow-400 text-xs truncate">🔔 {report.issues}</p>
                          )}
                          {(report.promotions?.length ?? 0) > 0 && (
                            <p className="text-emerald-400 text-xs truncate">🎯 {report.promotions!.join(', ')}</p>
                          )}
                          {!report.promotions?.length && report.promotion && (
                            <p className="text-emerald-400 text-xs truncate">🎯 {report.promotion}</p>
                          )}
                          {!report.issues?.length && !report.promotions?.length && !report.promotion && (
                            <span className="text-slate-600 text-xs">-</span>
                          )}
                        </div>
                      </td>

                      {/* 수정이력 */}
                      <td className="px-3 py-3 text-center whitespace-nowrap">
                        {(report.editHistory?.length ?? 0) > 0 ? (
                          <span className="inline-flex items-center gap-1 bg-amber-900/30 border border-amber-500/30 text-amber-400 text-xs px-2 py-0.5 rounded-full">
                            <Pencil className="w-3 h-3" />{report.editHistory!.length}회
                          </span>
                        ) : (
                          <span className="text-slate-600 text-xs">-</span>
                        )}
                      </td>

                      {/* 액션 */}
                      <td className="px-3 py-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          <Link href={`/dashboard/report/view/${report.id}`}
                            className="inline-flex items-center gap-1 bg-slate-700 hover:bg-slate-600 text-slate-300 px-2 py-1.5 rounded-lg text-xs transition-colors">
                            상세 <ChevronRight className="w-3 h-3" />
                          </Link>
                          <Link href={`/dashboard/report/input?editDate=${report.reportDate}`}
                            className="inline-flex items-center gap-1 bg-amber-900/40 hover:bg-amber-800/60 text-amber-400 px-2 py-1.5 rounded-lg text-xs transition-colors">
                            <Pencil className="w-3 h-3" />수정
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              {/* 합계 */}
              <tfoot>
                <tr className="bg-slate-800 border-t-2 border-slate-600">
                  <td className="px-3 py-3 text-slate-300 font-bold text-sm">합계 ({reports.length}일)</td>
                  <td className="px-3 py-3 text-right text-teal-400    font-bold text-sm">{totalSales.toLocaleString()}원</td>
                  <td className="px-3 py-3 text-right text-emerald-400 font-bold text-sm">{totalNetSales.toLocaleString()}원</td>
                  <td className="px-3 py-3 text-right text-slate-500   text-xs" colSpan={2}>
                    일평균 <span className="text-blue-300 font-semibold">{avgSales.toLocaleString()}원</span>
                    <span className="text-slate-600 ml-1">({elapsed}일 기준)</span>
                  </td>
                  <td className="px-3 py-3 text-right text-blue-400    font-bold text-sm">{totalCustomer}명</td>
                  <td className="px-3 py-3 text-right text-red-400     font-bold text-sm">
                    {totalReturn > 0 ? `${totalReturn.toLocaleString()}원` : '-'}
                  </td>
                  <td className="px-3 py-3 text-right text-yellow-400  font-bold text-sm">
                    {totalDiscount > 0 ? `${totalDiscount.toLocaleString()}원` : '-'}
                  </td>
                  <td colSpan={4} />
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
