'use client';

import { useState, useEffect, useCallback } from 'react';
import { useStore } from '@/context/StoreContext';
import { db } from '@/lib/firebase/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import {
  ShoppingCart, ChevronRight, Loader2, Calendar, Search,
  TrendingUp, Users, RotateCcw, Tag, Pencil,
} from 'lucide-react';
import Link from 'next/link';

interface WeatherData {
  condition: string;
  tempMax: number;
  tempMin: number;
}

interface DailyReport {
  id: string;
  storeId?: string;
  serialNumber: string;
  reportDate: string;
  totalSales: number;
  customerCount: number;
  itemCount: number;
  returnAmount: number;
  discountAmount: number;
  netSales: number;
  promotions?: string[];
  promotion?: string;
  weather?: WeatherData | string | null;
  issues?: any[] | string | null;
  items: any[];
  createdAt: any;
  editHistory?: any[];
}

type Preset = 'week' | 'month' | 'lastMonth' | 'custom';

function toYMD(d: Date): string {
  return d.toISOString().split('T')[0];
}

function getThisWeek() {
  const today = new Date();
  const dow = today.getDay();
  const diffToMon = dow === 0 ? -6 : 1 - dow;
  const mon = new Date(today);
  mon.setDate(today.getDate() + diffToMon);
  return { start: toYMD(mon), end: toYMD(today) };
}

function getThisMonth() {
  const today = new Date();
  return {
    start: toYMD(new Date(today.getFullYear(), today.getMonth(), 1)),
    end: toYMD(today),
  };
}

function getLastMonth() {
  const today = new Date();
  return {
    start: toYMD(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
    end: toYMD(new Date(today.getFullYear(), today.getMonth(), 0)),
  };
}

const PRESET_LABELS: Record<Preset, string> = {
  week: '이번 주',
  month: '이번 달',
  lastMonth: '지난 달',
  custom: '직접입력',
};

export default function ReportViewPage() {
  const { currentStore } = useStore();

  const [preset, setPreset] = useState<Preset>('month');
  const initRange = getThisMonth();
  const [queriedRange, setQueriedRange] = useState(initRange);
  const [customStart, setCustomStart] = useState(initRange.start);
  const [customEnd, setCustomEnd] = useState(initRange.end);

  const [reports, setReports] = useState<DailyReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchReports = useCallback(async (start: string, end: string) => {
    setIsLoading(true);
    try {
      const q = query(
        collection(db, 'daily_reports'),
        where('reportDate', '>=', start),
        where('reportDate', '<=', end),
      );
      const snap = await getDocs(q);
      let data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as DailyReport[];

      if (currentStore?.storeId) {
        data = data.filter(r => r.storeId === currentStore.storeId);
      }
      data.sort((a, b) => b.reportDate.localeCompare(a.reportDate));
      setReports(data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }, [currentStore?.storeId]);

  useEffect(() => {
    fetchReports(queriedRange.start, queriedRange.end);
  }, [queriedRange, fetchReports]);

  const handlePreset = (p: Preset) => {
    setPreset(p);
    if (p === 'week')      { setQueriedRange(getThisWeek()); }
    if (p === 'month')     { setQueriedRange(getThisMonth()); }
    if (p === 'lastMonth') { setQueriedRange(getLastMonth()); }
  };

  const handleCustomSearch = () => {
    if (!customStart || !customEnd) return;
    setQueriedRange({ start: customStart, end: customEnd });
  };

  const totalSales      = reports.reduce((s, r) => s + (r.totalSales    || 0), 0);
  const totalNetSales   = reports.reduce((s, r) => s + (r.netSales      || 0), 0);
  const totalCustomer   = reports.reduce((s, r) => s + (r.customerCount || 0), 0);
  const totalReturn     = reports.reduce((s, r) => s + (r.returnAmount  || 0), 0);
  const totalDiscount   = reports.reduce((s, r) => s + (r.discountAmount|| 0), 0);
  const avgSales        = reports.length > 0 ? Math.round(totalSales / reports.length) : 0;

  return (
    <div className="p-4 md:p-6 max-w-full">
      {/* 헤더 */}
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-teal-400 flex items-center gap-2">
          <Calendar className="w-6 h-6" />
          일일 마감 보고서
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          {currentStore?.storeName} · {queriedRange.start} ~ {queriedRange.end}
        </p>
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
                preset === p
                  ? 'bg-teal-500 text-slate-950'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {PRESET_LABELS[p]}
            </button>
          ))}
        </div>

        {preset === 'custom' && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <input
              type="date"
              value={customStart}
              onChange={e => setCustomStart(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-500"
            />
            <span className="text-slate-500 text-sm">~</span>
            <input
              type="date"
              value={customEnd}
              onChange={e => setCustomEnd(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-500"
            />
            <button
              onClick={handleCustomSearch}
              className="flex items-center gap-1.5 px-4 py-2 bg-teal-500 hover:bg-teal-400 text-slate-950 rounded-lg text-sm font-semibold transition-colors"
            >
              <Search className="w-4 h-4" />
              조회
            </button>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-teal-400 animate-spin" />
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
          {/* 기간 요약 카드 */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center gap-1.5 mb-1">
                <TrendingUp className="w-3.5 h-3.5 text-teal-400" />
                <p className="text-xs text-slate-500">총 매출</p>
              </div>
              <p className="text-lg font-bold text-teal-400">{totalSales.toLocaleString()}원</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center gap-1.5 mb-1">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                <p className="text-xs text-slate-500">총 순매출</p>
              </div>
              <p className="text-lg font-bold text-emerald-400">{totalNetSales.toLocaleString()}원</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center gap-1.5 mb-1">
                <Users className="w-3.5 h-3.5 text-blue-400" />
                <p className="text-xs text-slate-500">평균 일매출</p>
              </div>
              <p className="text-lg font-bold text-blue-400">{avgSales.toLocaleString()}원</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center gap-1.5 mb-1">
                <RotateCcw className="w-3.5 h-3.5 text-red-400" />
                <p className="text-xs text-slate-500">총 반품</p>
              </div>
              <p className="text-lg font-bold text-red-400">
                {totalReturn > 0 ? `${totalReturn.toLocaleString()}원` : '-'}
              </p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center gap-1.5 mb-1">
                <Tag className="w-3.5 h-3.5 text-yellow-400" />
                <p className="text-xs text-slate-500">총 할인</p>
              </div>
              <p className="text-lg font-bold text-yellow-400">
                {totalDiscount > 0 ? `${totalDiscount.toLocaleString()}원` : '-'}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px]">
              <thead>
                <tr className="bg-slate-800 border-b border-slate-700">
                  <th className="px-4 py-3 text-left   text-slate-400 text-sm font-medium whitespace-nowrap">날짜</th>
                  <th className="px-4 py-3 text-right  text-slate-400 text-sm font-medium whitespace-nowrap">총매출</th>
                  <th className="px-4 py-3 text-right  text-slate-400 text-sm font-medium whitespace-nowrap">순매출</th>
                  <th className="px-4 py-3 text-right  text-slate-400 text-sm font-medium whitespace-nowrap">객수</th>
                  <th className="px-4 py-3 text-right  text-slate-400 text-sm font-medium whitespace-nowrap">반품</th>
                  <th className="px-4 py-3 text-right  text-slate-400 text-sm font-medium whitespace-nowrap">할인</th>
                  <th className="px-4 py-3 text-center text-slate-400 text-sm font-medium whitespace-nowrap">날씨</th>
                  <th className="px-4 py-3 text-left   text-slate-400 text-sm font-medium whitespace-nowrap">이슈/프로모션</th>
                  <th className="px-4 py-3 text-center text-slate-400 text-sm font-medium whitespace-nowrap">수정이력</th>
                  <th className="px-4 py-3 text-center text-slate-400 text-sm font-medium whitespace-nowrap">액션</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((report, idx) => (
                  <tr key={report.id}
                    className={`border-b border-slate-800 hover:bg-slate-800/50 transition-colors ${idx % 2 !== 0 ? 'bg-slate-900/30' : ''}`}>

                    {/* 날짜 */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="text-white font-medium text-sm">
                        {report.reportDate
                          ? new Date(report.reportDate + 'T00:00:00').toLocaleDateString('ko-KR', {
                              month: 'long', day: 'numeric', weekday: 'short',
                            })
                          : '-'}
                      </p>
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
                      <span className="text-blue-400 font-bold text-sm">{report.customerCount || 0}명</span>
                    </td>

                    {/* 반품 */}
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <span className={`text-sm font-medium ${(report.returnAmount || 0) > 0 ? 'text-red-400' : 'text-slate-600'}`}>
                        {(report.returnAmount || 0) > 0
                          ? `${(report.returnAmount || 0).toLocaleString()}원`
                          : '-'}
                      </span>
                    </td>

                    {/* 할인 */}
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <span className={`text-sm font-medium ${(report.discountAmount || 0) > 0 ? 'text-yellow-400' : 'text-slate-600'}`}>
                        {(report.discountAmount || 0) > 0
                          ? `${(report.discountAmount || 0).toLocaleString()}원`
                          : '-'}
                      </span>
                    </td>

                    {/* 날씨 */}
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <span className="text-slate-300 text-sm">
                        {typeof report.weather === 'object' && report.weather
                          ? `${report.weather.condition} ${report.weather.tempMin}°~${report.weather.tempMax}°`
                          : (report.weather as string) || '-'}
                      </span>
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
                          <Pencil className="w-3 h-3" />
                          {report.editHistory!.length}회
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
                        <Link
                          href={`/dashboard/report/input?editDate=${report.reportDate}`}
                          className="inline-flex items-center gap-1 bg-amber-900/40 hover:bg-amber-800/60 text-amber-400 px-2.5 py-1.5 rounded-lg text-xs transition-colors"
                        >
                          <Pencil className="w-3 h-3" />
                          수정
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>

              {/* 합계 행 */}
              <tfoot>
                <tr className="bg-slate-800 border-t-2 border-slate-600">
                  <td className="px-4 py-3 text-slate-300 font-bold text-sm">
                    합계 ({reports.length}일)
                  </td>
                  <td className="px-4 py-3 text-right text-teal-400 font-bold text-sm">
                    {totalSales.toLocaleString()}원
                  </td>
                  <td className="px-4 py-3 text-right text-emerald-400 font-bold text-sm">
                    {totalNetSales.toLocaleString()}원
                  </td>
                  <td className="px-4 py-3 text-right text-blue-400 font-bold text-sm">
                    {totalCustomer}명
                  </td>
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
