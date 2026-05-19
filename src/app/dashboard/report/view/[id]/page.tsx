'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase/firebase';
import { doc, getDoc } from 'firebase/firestore';
import {
  ArrowLeft, ShoppingCart, TrendingUp,
  Users, RotateCcw, Loader2
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

export default function ReportDetailPage() {
  const { id } = useParams();
  const [report, setReport] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

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

  return (
    <div className="p-6 max-w-5xl mx-auto">

      {/* 뒤로가기 */}
      <Link href="/dashboard/report/view"
        className="flex items-center gap-2 text-slate-400 hover:text-teal-400 text-sm mb-6 transition-colors w-fit">
        <ArrowLeft className="w-4 h-4" />
        목록으로
      </Link>

      {/* 헤더 */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">
          {report.reportDate
            ? new Date(report.reportDate).toLocaleDateString('ko-KR', {
                year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'
              })
            : report.serialNumber
          }
        </h1>
        <p className="text-slate-500 text-sm font-mono mt-1">{report.serialNumber}</p>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: '총 매출', value: `${(report.totalSales || 0).toLocaleString()}원`, color: 'text-teal-400', icon: <TrendingUp className="w-5 h-5" /> },
          { label: '순 매출', value: `${(report.netSales || 0).toLocaleString()}원`, color: 'text-emerald-400', icon: <TrendingUp className="w-5 h-5" /> },
          { label: '객수', value: `${report.customerCount || 0}명`, color: 'text-blue-400', icon: <Users className="w-5 h-5" /> },
          { label: '반품', value: `${(report.returnAmount || 0).toLocaleString()}원`, color: 'text-red-400', icon: <RotateCcw className="w-5 h-5" /> },
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
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-4">
          <p className="text-slate-400 text-xs mb-2">날씨</p>
          <p className="text-white font-medium">
            {report.weather || '-'}
            {report.tempLow !== undefined && ` / ${report.tempLow}°~${report.tempHigh}°`}
          </p>
        </div>
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-4">
          <p className="text-slate-400 text-xs mb-2">이슈</p>
          <p className="text-yellow-400 text-sm">{report.issues || '-'}</p>
        </div>
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-4">
          <p className="text-slate-400 text-xs mb-2">프로모션/이벤트</p>
          <p className="text-emerald-400 text-sm">{report.promotion || '-'}</p>
        </div>
      </div>

      {/* 품목별 매출 테이블 */}
      <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
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
    </div>
  );
}
