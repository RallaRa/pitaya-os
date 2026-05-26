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
}

type Preset = 'week' | 'month' | 'lastMonth' | 'custom';

const PRESET_LABELS: Record<Preset, string> = {
  week: '이번 주', month: '이번 달', lastMonth: '지난 달', custom: '직접입력',
};

function toYMD(d: Date) { return d.toISOString().split('T')[0]; }

function getThisWeek() {
  const today = new Date();
  const dow = today.getDay();
  const mon = new Date(today);
  mon.setDate(today.getDate() + (dow === 0 ? -6 : 1 - dow));
  return { start: toYMD(mon), end: toYMD(today) };
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

// ── 컴포넌트 ──────────────────────────────────────────────────────
export default function ReportViewPage() {
  const { currentStore, storesLoaded } = useStore();

  const [preset, setPreset]           = useState<Preset>('month');
  const init                           = getThisMonth();
  const [range, setRange]              = useState(init);
  const [customStart, setCustomStart]  = useState(init.start);
  const [customEnd, setCustomEnd]      = useState(init.end);

  const [reports, setReports]   = useState<ReportRow[]>([]);
  const [isLoading, setLoading] = useState(true);
  const [error, setError]       = useState<string | null>(null);

  // ── 통합 데이터 조회 ──────────────────────────────────────────────
  const fetchData = useCallback(async (start: string, end: string) => {
    if (!storesLoaded) return;
    const storeId = currentStore?.storeId;
    if (!storeId) { setLoading(false); return; }

    setLoading(true);
    setError(null);

    try {
      let snap;
      try {
        // 1차: storeId + reportDate 복합 인덱스 쿼리 (빠름)
        snap = await getDocs(query(
          collection(db, 'daily_reports'),
          where('storeId', '==', storeId),
          where('reportDate', '>=', start),
          where('reportDate', '<=', end),
          orderBy('reportDate', 'desc'),
        ));
      } catch {
        // 인덱스 미준비 시 날짜 범위만으로 폴백 (클라이언트에서 storeId 필터)
        snap = await getDocs(query(
          collection(db, 'daily_reports'),
          where('reportDate', '>=', start),
          where('reportDate', '<=', end),
        ));
      }

      // 날짜별 중복 제거: 실데이터 live POS 최우선 > 매출 높은 쪽 > 0값 POS 최하위
      const isLivePOS = (src?: string) => src === 'pos_bridge';
      const score = (dr: any): number => {
        const sales = dr.totalSales || 0;
        if (isLivePOS(dr.source) && sales > 0) return Infinity;
        if (isLivePOS(dr.source) && sales === 0) return -1;
        return sales;
      };

      const byDate = new Map<string, any>();
      for (const d of snap.docs) {
        const dr = { id: d.id, ...d.data() } as any;
        if (dr.storeId !== storeId) continue;
        const existing = byDate.get(dr.reportDate);
        if (!existing || score(dr) > score(existing)) byDate.set(dr.reportDate, dr);
      }

      const rows: ReportRow[] = Array.from(byDate.values()).map(dr => ({
        id:            dr.id,
        reportDate:    dr.reportDate    ?? '',
        serialNumber:  dr.serialNumber  ?? '',
        totalSales:    dr.totalSales    ?? 0,
        netSales:      dr.netSales      ?? 0,
        customerCount: dr.customerCount ?? 0,
        returnAmount:  dr.returnAmount  ?? 0,
        discountAmount: dr.discountAmount ?? 0,
        weather:       dr.weather    ?? null,
        issues:        dr.issues     ?? [],
        promotions:    dr.promotions ?? [],
        promotion:     dr.promotion,
        source:        dr.source     ?? 'manual',
        isClosed:      dr.isClosed,
        editHistory:   dr.editHistory ?? [],
      }));

      rows.sort((a, b) => b.reportDate.localeCompare(a.reportDate));
      setReports(rows);
    } catch (e: any) {
      console.error('[report/view] 조회 오류:', e);
      setError('데이터 조회에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  }, [currentStore?.storeId, storesLoaded]);

  // 기간 변경 시 즉시 재조회
  useEffect(() => {
    fetchData(range.start, range.end);
  }, [range, fetchData]);

  // 페이지 포커스 시 자동 갱신
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
  const avgSales      = reports.length > 0 ? Math.round(totalNetSales / reports.length) : 0;

  // ── 날씨 포맷 ────────────────────────────────────────────────────
  const fmtWeather = (w: any) => {
    if (!w) return '-';
    if (typeof w === 'object') return `${w.condition} ${w.tempMin}°~${w.tempMax}°`;
    return w as string;
  };

  // ── 렌더링 ───────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 max-w-full">

      {/* 헤더 */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-teal-400 flex items-center gap-2">
            <Calendar className="w-6 h-6" />
            일일 마감 보고서
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            {currentStore?.storeName} · {range.start} ~ {range.end}
          </p>
        </div>
        <button
          onClick={() => fetchData(range.start, range.end)}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-lg text-sm transition-colors disabled:opacity-50"
          title="새로고침"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          새로고침
        </button>
      </div>

      {/* 기간 선택 */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 mb-5 space-y-3">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">기간 선택</p>
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
          {/* 스켈레톤 카드 */}
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
        /* 에러 상태 */
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
        /* 데이터 없음 */
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
              { icon: <TrendingUp className="w-3.5 h-3.5 text-teal-400"    />, label: '총 매출',   value: `${totalSales.toLocaleString()}원`,    color: 'text-teal-400' },
              { icon: <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />, label: '총 순매출', value: `${totalNetSales.toLocaleString()}원`,  color: 'text-emerald-400' },
              { icon: <Users      className="w-3.5 h-3.5 text-blue-400"   />, label: '평균 일매출',value: `${avgSales.toLocaleString()}원`,       color: 'text-blue-400' },
              { icon: <RotateCcw  className="w-3.5 h-3.5 text-red-400"    />, label: '총 반품',   value: totalReturn  > 0 ? `${totalReturn.toLocaleString()}원`  : '-', color: 'text-red-400' },
              { icon: <Tag        className="w-3.5 h-3.5 text-yellow-400" />, label: '총 할인',   value: totalDiscount > 0 ? `${totalDiscount.toLocaleString()}원` : '-', color: 'text-yellow-400' },
            ].map(c => (
              <div key={c.label} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <div className="flex items-center gap-1.5 mb-1">
                  {c.icon}
                  <p className="text-xs text-slate-500">{c.label}</p>
                </div>
                <p className={`text-lg font-bold ${c.color}`}>{c.value}</p>
              </div>
            ))}
          </div>

          {/* 데이터 출처 범례 */}
          <div className="flex items-center gap-3 mb-3 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-red-500"></span>
              🔴 POS 자동연동
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-blue-500"></span>
              🔵 수동입력
            </span>
            <span className="text-slate-600 ml-auto">총 {reports.length}일</span>
          </div>

          {/* 테이블 */}
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full min-w-[960px]">
              <thead>
                <tr className="bg-slate-800 border-b border-slate-700">
                  {['날짜', '총매출', '순매출', '객수', '반품', '할인', '날씨', '이슈/프로모션', '수정이력', '액션'].map(h => (
                    <th key={h} className={`px-4 py-3 text-slate-400 text-sm font-medium whitespace-nowrap
                      ${['날짜', '이슈/프로모션'].includes(h) ? 'text-left' : ''}
                      ${['날씨', '수정이력', '액션'].includes(h) ? 'text-center' : ''}
                      ${!['날짜', '이슈/프로모션', '날씨', '수정이력', '액션'].includes(h) ? 'text-right' : ''}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reports.map((report, idx) => {
                  const isPOS = report.source === 'pos_bridge' || report.source === 'pos_bridge_migration';
                  return (
                    <tr key={report.id}
                      className={`border-b border-slate-800 hover:bg-slate-800/50 transition-colors ${idx % 2 !== 0 ? 'bg-slate-900/30' : ''}`}>

                      {/* 날짜 + 출처 배지 */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="text-white font-medium text-sm">
                            {report.reportDate
                              ? new Date(report.reportDate + 'T00:00:00').toLocaleDateString('ko-KR', {
                                  month: 'long', day: 'numeric', weekday: 'short',
                                })
                              : '-'}
                          </p>
                          {isPOS ? (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-900/40 border border-red-500/30 text-red-400">
                              🔴 POS
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-900/40 border border-blue-500/30 text-blue-400">
                              🔵 수동
                            </span>
                          )}
                          {isPOS && report.isClosed === false && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-yellow-900/40 border border-yellow-500/30 text-yellow-400">
                              미마감
                            </span>
                          )}
                        </div>
                        <p className="text-slate-500 text-xs font-mono">{report.serialNumber}</p>
                      </td>

                      {/* 총매출 */}
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <Link href={`/dashboard/report/view/${report.id}`}
                          className="text-teal-400 hover:text-teal-300 font-bold text-sm hover:underline">
                          {(report.totalSales || 0).toLocaleString()}원
                        </Link>
                      </td>

                      {/* 순매출 */}
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <span className="text-emerald-400 font-bold text-sm">
                          {(report.netSales || 0).toLocaleString()}원
                        </span>
                      </td>

                      {/* 객수 */}
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <span className="text-blue-400 font-bold text-sm">
                          {report.customerCount ? `${report.customerCount}명` : '-'}
                        </span>
                      </td>

                      {/* 반품 */}
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <span className={`text-sm font-medium ${(report.returnAmount || 0) > 0 ? 'text-red-400' : 'text-slate-600'}`}>
                          {(report.returnAmount || 0) > 0 ? `${report.returnAmount!.toLocaleString()}원` : '-'}
                        </span>
                      </td>

                      {/* 할인 */}
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <span className={`text-sm font-medium ${(report.discountAmount || 0) > 0 ? 'text-yellow-400' : 'text-slate-600'}`}>
                          {(report.discountAmount || 0) > 0 ? `${report.discountAmount!.toLocaleString()}원` : '-'}
                        </span>
                      </td>

                      {/* 날씨 */}
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <span className="text-slate-300 text-sm">{fmtWeather(report.weather)}</span>
                      </td>

                      {/* 이슈/프로모션 */}
                      <td className="px-4 py-3 max-w-[200px]">
                        <div className="space-y-1">
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
                          {!report.issues && !report.promotions?.length && !report.promotion && (
                            <span className="text-slate-600 text-xs">-</span>
                          )}
                        </div>
                      </td>

                      {/* 수정이력 */}
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        {(report.editHistory?.length ?? 0) > 0 ? (
                          <span className="inline-flex items-center gap-1 bg-amber-900/30 border border-amber-500/30 text-amber-400 text-xs px-2 py-0.5 rounded-full">
                            <Pencil className="w-3 h-3" />{report.editHistory!.length}회
                          </span>
                        ) : (
                          <span className="text-slate-600 text-xs">-</span>
                        )}
                      </td>

                      {/* 액션 */}
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          <Link href={`/dashboard/report/view/${report.id}`}
                            className="inline-flex items-center gap-1 bg-slate-700 hover:bg-slate-600 text-slate-300 px-2.5 py-1.5 rounded-lg text-xs transition-colors">
                            상세 <ChevronRight className="w-3 h-3" />
                          </Link>
                          <Link href={`/dashboard/report/input?editDate=${report.reportDate}`}
                            className="inline-flex items-center gap-1 bg-amber-900/40 hover:bg-amber-800/60 text-amber-400 px-2.5 py-1.5 rounded-lg text-xs transition-colors">
                            <Pencil className="w-3 h-3" />수정
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              {/* 합계 행 */}
              <tfoot>
                <tr className="bg-slate-800 border-t-2 border-slate-600">
                  <td className="px-4 py-3 text-slate-300 font-bold text-sm">합계 ({reports.length}일)</td>
                  <td className="px-4 py-3 text-right text-teal-400 font-bold text-sm">{totalSales.toLocaleString()}원</td>
                  <td className="px-4 py-3 text-right text-emerald-400 font-bold text-sm">{totalNetSales.toLocaleString()}원</td>
                  <td className="px-4 py-3 text-right text-blue-400 font-bold text-sm">{totalCustomer}명</td>
                  <td className="px-4 py-3 text-right text-red-400 font-bold text-sm">
                    {totalReturn > 0 ? `${totalReturn.toLocaleString()}원` : '-'}
                  </td>
                  <td className="px-4 py-3 text-right text-yellow-400 font-bold text-sm">
                    {totalDiscount > 0 ? `${totalDiscount.toLocaleString()}원` : '-'}
                  </td>
                  <td colSpan={4} className="px-4 py-3 text-right text-slate-400 text-xs">
                    일평균 <span className="text-blue-300 font-semibold">{avgSales.toLocaleString()}원</span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
