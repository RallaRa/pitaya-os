'use client';

import { useState, useEffect } from 'react';
import { useStore } from '@/context/StoreContext';
import { db } from '@/lib/firebase/firebase';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import {
  ShoppingCart, ChevronRight, Loader2, Calendar
} from 'lucide-react';
import Link from 'next/link';

interface WeatherData {
  condition: string;
  tempMax: number;
  tempMin: number;
}

interface IssueItem {
  title: string;
  url?: string;
  source?: string;
}

interface DailyReport {
  id: string;
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
  issues?: IssueItem[] | string | null;
  items: any[];
  createdAt: any;
}

export default function ReportViewPage() {
  const { currentStore } = useStore();
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchReports = async () => {
      try {
        const q = query(
          collection(db, 'daily_reports'),
          orderBy('reportDate', 'desc'),
          limit(30)
        );
        const snap = await getDocs(q);
        const data = snap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as DailyReport[];
        setReports(data);
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchReports();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 text-teal-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-full">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-teal-400 flex items-center gap-2">
          <Calendar className="w-6 h-6" />
          일일 마감 보고서
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          {currentStore?.storeName} · 최근 30일
        </p>
      </div>

      {reports.length === 0 ? (
        <div className="text-center py-20 text-slate-500">
          <ShoppingCart className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p>저장된 마감 보고서가 없습니다.</p>
          <Link href="/dashboard/report/input"
            className="text-teal-400 text-sm mt-2 block hover:underline">
            마감 보고서 작성하기 →
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px]">
            <thead>
              <tr className="bg-slate-800 border-b border-slate-700">
                <th className="px-4 py-3 text-left text-slate-400 text-sm font-medium whitespace-nowrap">날짜</th>
                <th className="px-4 py-3 text-right text-slate-400 text-sm font-medium whitespace-nowrap">
                  <button className="hover:text-teal-400 transition-colors">매출 ↕</button>
                </th>
                <th className="px-4 py-3 text-right text-slate-400 text-sm font-medium whitespace-nowrap">객수</th>
                <th className="px-4 py-3 text-right text-slate-400 text-sm font-medium whitespace-nowrap">건수</th>
                <th className="px-4 py-3 text-right text-slate-400 text-sm font-medium whitespace-nowrap">반품</th>
                <th className="px-4 py-3 text-center text-slate-400 text-sm font-medium whitespace-nowrap">날씨</th>
                <th className="px-4 py-3 text-center text-slate-400 text-sm font-medium whitespace-nowrap">최저/최고</th>
                <th className="px-4 py-3 text-left text-slate-400 text-sm font-medium whitespace-nowrap">이슈/프로모션</th>
                <th className="px-4 py-3 text-center text-slate-400 text-sm font-medium whitespace-nowrap">상세</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((report, idx) => (
                <tr key={report.id}
                  className={`border-b border-slate-800 hover:bg-slate-800/50 transition-colors
                    ${idx % 2 === 0 ? '' : 'bg-slate-900/30'}`}>

                  {/* 날짜 */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div>
                      <p className="text-white font-medium text-sm">
                        {report.reportDate
                          ? new Date(report.reportDate).toLocaleDateString('ko-KR', {
                              month: 'long', day: 'numeric', weekday: 'short'
                            })
                          : '-'
                        }
                      </p>
                      <p className="text-slate-500 text-xs font-mono">{report.serialNumber}</p>
                    </div>
                  </td>

                  {/* 매출 */}
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <Link
                      href={`/dashboard/report/view/${report.id}`}
                      className="text-teal-400 hover:text-teal-300 font-bold text-sm hover:underline transition-colors"
                    >
                      {(report.totalSales || 0).toLocaleString()}원
                    </Link>
                  </td>

                  {/* 객수 */}
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <Link
                      href={`/dashboard/report/view/${report.id}`}
                      className="text-blue-400 hover:text-blue-300 font-bold text-sm hover:underline transition-colors"
                    >
                      {report.customerCount || 0}명
                    </Link>
                  </td>

                  {/* 건수 */}
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <Link
                      href={`/dashboard/report/view/${report.id}`}
                      className="text-purple-400 hover:text-purple-300 font-bold text-sm hover:underline transition-colors"
                    >
                      {report.itemCount || report.items?.length || 0}건
                    </Link>
                  </td>

                  {/* 반품 */}
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <span className={`text-sm font-medium
                      ${(report.returnAmount || 0) > 0 ? 'text-red-400' : 'text-slate-500'}`}>
                      {(report.returnAmount || 0) > 0
                        ? `${(report.returnAmount || 0).toLocaleString()}원`
                        : '-'
                      }
                    </span>
                  </td>

                  {/* 날씨 */}
                  <td className="px-4 py-3 text-center whitespace-nowrap">
                    <span className="text-slate-300 text-sm">
                      {typeof report.weather === 'object' && report.weather
                        ? report.weather.condition
                        : (report.weather as string) || '-'}
                    </span>
                  </td>

                  {/* 기온 */}
                  <td className="px-4 py-3 text-center whitespace-nowrap">
                    <span className="text-slate-300 text-sm">
                      {typeof report.weather === 'object' && report.weather
                        ? `${report.weather.tempMin}°↑${report.weather.tempMax}°`
                        : '-'}
                    </span>
                  </td>

                  {/* 이슈/프로모션 */}
                  <td className="px-4 py-3 max-w-[250px]">
                    <div className="space-y-1">
                      {Array.isArray(report.issues) && report.issues.length > 0 && (
                        <p className="text-yellow-400 text-xs truncate" title={report.issues[0]?.title}>
                          🔔 {report.issues[0]?.title}
                        </p>
                      )}
                      {typeof report.issues === 'string' && report.issues && (
                        <p className="text-yellow-400 text-xs truncate" title={report.issues}>
                          🔔 {report.issues}
                        </p>
                      )}
                      {(report.promotions?.length ?? 0) > 0 && (
                        <p className="text-emerald-400 text-xs truncate">
                          🎯 {report.promotions!.join(', ')}
                        </p>
                      )}
                      {!report.promotions?.length && report.promotion && (
                        <p className="text-emerald-400 text-xs truncate" title={report.promotion}>
                          🎯 {report.promotion}
                        </p>
                      )}
                      {!report.issues && !report.promotions?.length && !report.promotion && (
                        <span className="text-slate-600 text-xs">-</span>
                      )}
                    </div>
                  </td>

                  {/* 상세 */}
                  <td className="px-4 py-3 text-center">
                    <Link
                      href={`/dashboard/report/view/${report.id}`}
                      className="inline-flex items-center gap-1 bg-slate-700 hover:bg-slate-600 text-slate-300 px-3 py-1.5 rounded-lg text-xs transition-colors"
                    >
                      상세
                      <ChevronRight className="w-3 h-3" />
                    </Link>
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
                  {reports.reduce((s, r) => s + (r.totalSales || 0), 0).toLocaleString()}원
                </td>
                <td className="px-4 py-3 text-right text-blue-400 font-bold text-sm">
                  {reports.reduce((s, r) => s + (r.customerCount || 0), 0)}명
                </td>
                <td className="px-4 py-3 text-right text-purple-400 font-bold text-sm">
                  {reports.reduce((s, r) => s + (r.itemCount || r.items?.length || 0), 0)}건
                </td>
                <td className="px-4 py-3 text-right text-red-400 font-bold text-sm">
                  {reports.reduce((s, r) => s + (r.returnAmount || 0), 0).toLocaleString()}원
                </td>
                <td colSpan={4}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
