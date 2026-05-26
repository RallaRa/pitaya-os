'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase/firebase';
import { doc, getDoc } from 'firebase/firestore';
import {
  ArrowLeft, ShoppingCart, TrendingUp,
  Users, RotateCcw, Loader2, Tag, Pencil,
  ChevronDown, ChevronUp, Clock,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

const WEATHER_ICONS: Record<string, string> = {
  '맑음': '☀️', '구름': '⛅', '안개': '🌫️', '비': '🌧️',
  '눈': '❄️', '소나기': '🌦️', '뇌우': '⛈️',
};

function fmtTs(ts: any): string {
  if (!ts) return '-';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString('ko-KR', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function ReportDetailPage() {
  const { id } = useParams();
  const [report, setReport] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    const fetchReport = async () => {
      const snap = await getDoc(doc(db, 'daily_reports', id as string));
      if (snap.exists()) setReport({ id: snap.id, ...snap.data() });
      setIsLoading(false);
    };
    fetchReport();
  }, [id]);

  if (isLoading) return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="w-6 h-6 text-teal-400 animate-spin" />
    </div>
  );

  if (!report) return (
    <div className="p-6 text-slate-400">보고서를 찾을 수 없습니다.</div>
  );

  const editHistory: any[] = Array.isArray(report.editHistory) ? [...report.editHistory].reverse() : [];

  return (
    <div className="p-6 max-w-5xl mx-auto">

      {/* 뒤로가기 */}
      <Link href="/dashboard/report/view"
        className="flex items-center gap-2 text-slate-400 hover:text-teal-400 text-sm mb-6 transition-colors w-fit">
        <ArrowLeft className="w-4 h-4" />
        목록으로
      </Link>

      {/* 헤더 */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">
            {report.reportDate
              ? new Date(report.reportDate + 'T00:00:00').toLocaleDateString('ko-KR', {
                  year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'
                })
              : report.serialNumber
            }
          </h1>
          <p className="text-slate-500 text-sm font-mono mt-1">{report.serialNumber}</p>
          {report.lastModifiedAt && (
            <p className="text-slate-500 text-xs mt-1 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              마지막 수정: {fmtTs(report.lastModifiedAt)}
              {report.lastModifiedBy?.name && ` · ${report.lastModifiedBy.name}`}
            </p>
          )}
        </div>
        <Link
          href={`/dashboard/report/input?editDate=${report.reportDate}`}
          className="flex items-center gap-2 bg-amber-700/40 hover:bg-amber-700/60 border border-amber-500/30 text-amber-400 px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
        >
          <Pencil className="w-4 h-4" />
          이 보고서 수정
        </Link>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: '총 매출',  value: `${(report.totalSales   || 0).toLocaleString()}원`, color: 'text-teal-400',    icon: <TrendingUp className="w-5 h-5" /> },
          { label: '순 매출',  value: `${(report.netSales     || 0).toLocaleString()}원`, color: 'text-emerald-400', icon: <TrendingUp className="w-5 h-5" /> },
          { label: '객수',     value: `${report.customerCount || 0}명`,                   color: 'text-blue-400',   icon: <Users      className="w-5 h-5" /> },
          { label: '반품',     value: `${(report.returnAmount || 0).toLocaleString()}원`, color: 'text-red-400',    icon: <RotateCcw  className="w-5 h-5" /> },
          { label: '할인',     value: `${(report.discountAmount || 0).toLocaleString()}원`, color: 'text-yellow-400', icon: <Tag       className="w-5 h-5" /> },
        ].map(card => (
          <div key={card.label} className="bg-slate-900 border border-slate-700 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className={card.color}>{card.icon}</span>
              <span className="text-slate-400 text-xs">{card.label}</span>
            </div>
            <p className={`text-xl font-bold ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* 날씨/이슈/프로모션 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* 날씨 */}
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-4">
          <p className="text-slate-400 text-xs mb-2">날씨</p>
          {typeof report.weather === 'object' && report.weather ? (
            <div className="flex items-center gap-2">
              <span className="text-2xl">
                {WEATHER_ICONS[report.weather.condition as string] || '🌡️'}
              </span>
              <div>
                <p className="text-white font-medium">{report.weather.condition}</p>
                <p className="text-slate-400 text-sm">{report.weather.tempMin}°~{report.weather.tempMax}°</p>
              </div>
            </div>
          ) : (
            <p className="text-slate-500">{(report.weather as string) || '-'}</p>
          )}
        </div>

        {/* 이슈 */}
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-4">
          <p className="text-slate-400 text-xs mb-2">이슈</p>
          {Array.isArray(report.issues) && report.issues.length > 0 ? (
            <div className="space-y-2">
              {report.issues.map((issue: any, i: number) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-yellow-400 mt-0.5 flex-shrink-0">🔔</span>
                  <div>
                    {issue.url ? (
                      <a href={issue.url} target="_blank" rel="noopener noreferrer"
                        className="text-yellow-300 text-sm hover:underline">{issue.title}</a>
                    ) : (
                      <p className="text-yellow-300 text-sm">{issue.title}</p>
                    )}
                    {issue.source && <p className="text-slate-500 text-xs">{issue.source}</p>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-500 text-sm">{typeof report.issues === 'string' ? report.issues : '-'}</p>
          )}
        </div>

        {/* 프로모션 */}
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-4">
          <p className="text-slate-400 text-xs mb-2">프로모션/이벤트</p>
          {Array.isArray(report.promotions) && report.promotions.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {report.promotions.map((p: string, i: number) => (
                <span key={i} className="bg-emerald-900/30 border border-emerald-500/30 text-emerald-300 text-xs px-2.5 py-1 rounded-full">
                  🎯 {p}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-emerald-400 text-sm">{report.promotion || '-'}</p>
          )}
        </div>
      </div>

      {/* 품목별 매출 테이블 */}
      <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-slate-700">
          <h2 className="text-white font-bold flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-teal-400" />
            품목별 매출 ({report.items?.length || 0}건)
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-800 border-b border-slate-700">
                {['순번', '시간', '상품명', '구분', '판매금액', '반품금액', '할인금액', '수량', '순매출'].map(h => (
                  <th key={h} className="px-4 py-2 text-slate-400 text-xs font-medium whitespace-nowrap text-right first:text-left">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(report.items || []).map((item: any, idx: number) => (
                <tr key={idx} className={`border-b border-slate-800 text-sm ${idx % 2 === 0 ? '' : 'bg-slate-800/20'}`}>
                  <td className="px-4 py-2 text-slate-500">{idx + 1}</td>
                  <td className="px-4 py-2 text-slate-400 whitespace-nowrap">{item.time || '-'}</td>
                  <td className="px-4 py-2 text-slate-200 whitespace-nowrap">{item.name}</td>
                  <td className="px-4 py-2 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full
                      ${item.type === '정상' ? 'bg-slate-700 text-slate-300' : 'bg-red-900/50 text-red-400'}`}>
                      {item.type || '정상'}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right text-white whitespace-nowrap">
                    {(item.amount || 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <span className={item.returnAmount > 0 ? 'text-red-400' : 'text-slate-600'}>
                      {(item.returnAmount || 0).toLocaleString()}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <span className={item.discountAmount > 0 ? 'text-yellow-400' : 'text-slate-600'}>
                      {(item.discountAmount || 0).toLocaleString()}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right text-slate-300">{item.qty || 1}</td>
                  <td className="px-4 py-2 text-right text-teal-400 font-medium whitespace-nowrap">
                    {(item.netSales || 0).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-800 border-t-2 border-slate-600">
                <td colSpan={4} className="px-4 py-3 text-slate-300 font-bold text-sm">합계</td>
                <td className="px-4 py-3 text-right text-white font-bold text-sm">
                  {(report.totalSales || 0).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right text-red-400 font-bold text-sm">
                  {(report.returnAmount || 0).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right text-yellow-400 font-bold text-sm">
                  {(report.discountAmount || 0).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right text-slate-300 font-bold text-sm">
                  {report.items?.reduce((s: number, i: any) => s + (i.qty || 1), 0) || 0}
                </td>
                <td className="px-4 py-3 text-right text-teal-400 font-bold text-sm">
                  {(report.netSales || 0).toLocaleString()}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* 수정 이력 */}
      {editHistory.length > 0 && (
        <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
          <button
            onClick={() => setHistoryOpen(v => !v)}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-800/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400" />
              <span className="text-white font-bold">수정 이력</span>
              <span className="bg-amber-900/40 border border-amber-500/30 text-amber-400 text-xs px-2 py-0.5 rounded-full">
                {editHistory.length}회
              </span>
            </div>
            {historyOpen
              ? <ChevronUp className="w-4 h-4 text-slate-400" />
              : <ChevronDown className="w-4 h-4 text-slate-400" />
            }
          </button>

          {historyOpen && (
            <div className="border-t border-slate-700 divide-y divide-slate-800">
              {editHistory.map((entry: any, i: number) => (
                <div key={i} className="px-6 py-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="bg-slate-700 text-slate-300 text-xs px-2 py-0.5 rounded-full font-mono">
                        #{editHistory.length - i}차 수정
                      </span>
                      <span className="text-slate-300 text-sm font-medium">
                        {entry.editedBy?.name || '알 수 없음'}
                      </span>
                    </div>
                    <span className="text-slate-500 text-xs flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {fmtTs(entry.editedAt)}
                    </span>
                  </div>

                  {/* 수정 전 스냅샷 */}
                  {entry.snapshot && (
                    <div className="bg-slate-800/60 rounded-lg p-3">
                      <p className="text-slate-500 text-xs mb-2">수정 전 값</p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                        {[
                          { label: '총매출',  val: entry.snapshot.totalSales,    color: 'text-teal-400' },
                          { label: '순매출',  val: entry.snapshot.netSales,      color: 'text-emerald-400' },
                          { label: '객수',    val: entry.snapshot.customerCount, color: 'text-blue-400', suffix: '명' },
                          { label: '반품',    val: entry.snapshot.returnAmount,  color: 'text-red-400' },
                          { label: '할인',    val: entry.snapshot.discountAmount,color: 'text-yellow-400' },
                        ].map(f => (
                          <div key={f.label} className="flex flex-col gap-0.5">
                            <span className="text-slate-500">{f.label}</span>
                            <span className={`font-medium ${f.color}`}>
                              {f.val != null
                                ? f.suffix
                                  ? `${f.val}${f.suffix}`
                                  : `${Number(f.val).toLocaleString()}원`
                                : '-'
                              }
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
