'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, TrendingUp, BarChart3, Send } from 'lucide-react';
import { getAuthHeaders } from '@/lib/getAuthHeaders';

interface Props {
  storeId: string;
}

interface AnalyticsData {
  summary: {
    totalRedemptions: number;
    totalDiscount: number;
    totalOrderAmount: number;
    avgDiscount: number;
    avgOrderAmount: number;
    activeCoupons: number;
  };
  dailyTrend: { date: string; count: number; discount: number }[];
  byCoupon: {
    couponId: string;
    code: string;
    title: string;
    redemptions: number;
    totalDiscount: number;
    avgDiscount: number;
    avgOrderAmount: number;
    usageRate: number | null;
    isActive: boolean;
    endDate: string | null;
  }[];
  byCampaign?: {
    campaignKey: string;
    couponCode: string;
    sent: number;
    applied: number;
    applyRate: number | null;
    totalDiscount: number;
    lastSentAt: string;
    requestedByEmail: string;
  }[];
  campaignSummary?: {
    campaignCount: number;
    totalSent: number;
    totalApplied: number;
    overallApplyRate: number | null;
    totalDiscount: number;
  };
}

interface RedemptionLog {
  id: string;
  code: string;
  title: string;
  orderAmount: number;
  discountAmount: number;
  appliedByEmail: string;
  note: string;
  customerCusCode: string;
  appliedAt: string;
}

export default function CouponAnalyticsPanel({ storeId }: Props) {
  const [tab, setTab] = useState<'analytics' | 'campaigns' | 'logs'>('analytics');
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [logs, setLogs] = useState<RedemptionLog[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const [aRes, lRes] = await Promise.all([
        fetch(`/api/coupons/analytics?storeId=${encodeURIComponent(storeId)}&days=30`, { headers }),
        fetch(`/api/coupons/redemptions?storeId=${encodeURIComponent(storeId)}&limit=50`, { headers }),
      ]);
      const aData = await aRes.json();
      const lData = await lRes.json();
      if (!aData.error) setAnalytics(aData);
      if (!lData.error) setLogs(lData.logs || []);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { load(); }, [load]);

  const maxDaily = Math.max(1, ...(analytics?.dailyTrend.map(d => d.count) || [1]));

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTab('analytics')}
          className={`px-3 py-1.5 text-xs rounded-lg ${tab === 'analytics' ? 'bg-teal-700/40 text-teal-300 border border-teal-600/40' : 'text-slate-500'}`}
        >
          <BarChart3 className="w-3.5 h-3.5 inline mr-1" />
          효과 분석
        </button>
        <button
          type="button"
          onClick={() => setTab('campaigns')}
          className={`px-3 py-1.5 text-xs rounded-lg ${tab === 'campaigns' ? 'bg-teal-700/40 text-teal-300 border border-teal-600/40' : 'text-slate-500'}`}
        >
          <Send className="w-3.5 h-3.5 inline mr-1" />
          알림톡 전환
        </button>
        <button
          type="button"
          onClick={() => setTab('logs')}
          className={`px-3 py-1.5 text-xs rounded-lg ${tab === 'logs' ? 'bg-teal-700/40 text-teal-300 border border-teal-600/40' : 'text-slate-500'}`}
        >
          적용 이력
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 text-teal-400 animate-spin" />
        </div>
      ) : tab === 'analytics' && analytics ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="30일 적용" value={`${analytics.summary.totalRedemptions}건`} />
            <Stat label="총 할인액" value={`${analytics.summary.totalDiscount.toLocaleString()}원`} />
            <Stat label="건당 평균 할인" value={`${analytics.summary.avgDiscount.toLocaleString()}원`} />
            <Stat label="건당 평균 주문" value={`${analytics.summary.avgOrderAmount.toLocaleString()}원`} />
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
            <p className="text-xs text-slate-400 mb-3 flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5" /> 최근 30일 적용 추이
            </p>
            <div className="flex items-end gap-0.5 h-24">
              {analytics.dailyTrend.map(d => (
                <div key={d.date} className="flex-1 flex flex-col items-center justify-end h-full" title={`${d.date}: ${d.count}건`}>
                  <div
                    className="w-full bg-teal-600/70 rounded-t min-h-[2px]"
                    style={{ height: `${Math.max(4, (d.count / maxDaily) * 100)}%` }}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-500">
                  <th className="text-left px-3 py-2">쿠폰</th>
                  <th className="text-right px-3 py-2">적용</th>
                  <th className="text-right px-3 py-2">총 할인</th>
                  <th className="text-right px-3 py-2">평균 할인</th>
                  <th className="text-right px-3 py-2">한도 사용</th>
                </tr>
              </thead>
              <tbody>
                {analytics.byCoupon.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-8 text-slate-600">아직 적용 기록이 없습니다</td></tr>
                ) : analytics.byCoupon.map(c => (
                  <tr key={c.couponId} className="border-b border-slate-800/50">
                    <td className="px-3 py-2">
                      <span className="font-mono text-white">{c.code}</span>
                      {c.title && <span className="block text-slate-500 truncate max-w-[140px]">{c.title}</span>}
                    </td>
                    <td className="px-3 py-2 text-right text-teal-300">{c.redemptions}</td>
                    <td className="px-3 py-2 text-right">{c.totalDiscount.toLocaleString()}원</td>
                    <td className="px-3 py-2 text-right">{c.avgDiscount.toLocaleString()}원</td>
                    <td className="px-3 py-2 text-right text-slate-500">
                      {c.usageRate != null ? `${c.usageRate}%` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : tab === 'campaigns' && analytics ? (
        <div className="space-y-4">
          <p className="text-[11px] text-slate-500">
            알림톡 발송 시 <strong className="text-slate-400">캠페인 키</strong> + 추가정보1(쿠폰코드)를 넣으면 발송 대비 적용률을 집계합니다.
          </p>
          {analytics.campaignSummary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="캠페인" value={`${analytics.campaignSummary.campaignCount}건`} />
              <Stat label="알림톡 발송" value={`${analytics.campaignSummary.totalSent.toLocaleString()}명`} />
              <Stat label="쿠폰 적용" value={`${analytics.campaignSummary.totalApplied}건`} />
              <Stat
                label="전환율(적용/발송)"
                value={analytics.campaignSummary.overallApplyRate != null
                  ? `${analytics.campaignSummary.overallApplyRate}%`
                  : '-'}
              />
            </div>
          )}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-500">
                  <th className="text-left px-3 py-2">캠페인</th>
                  <th className="text-left px-3 py-2">쿠폰</th>
                  <th className="text-right px-3 py-2">발송</th>
                  <th className="text-right px-3 py-2">적용</th>
                  <th className="text-right px-3 py-2">전환율</th>
                  <th className="text-right px-3 py-2">할인액</th>
                </tr>
              </thead>
              <tbody>
                {(analytics.byCampaign || []).length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-slate-600">
                      캠페인 키가 있는 알림톡 발송 이력이 없습니다
                    </td>
                  </tr>
                ) : (analytics.byCampaign || []).map(c => (
                  <tr key={c.campaignKey} className="border-b border-slate-800/50">
                    <td className="px-3 py-2 text-slate-200">{c.campaignKey}</td>
                    <td className="px-3 py-2 font-mono text-teal-300/90">{c.couponCode || '-'}</td>
                    <td className="px-3 py-2 text-right">{c.sent.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-teal-300">{c.applied}</td>
                    <td className="px-3 py-2 text-right text-amber-300/90">
                      {c.applyRate != null ? `${c.applyRate}%` : '-'}
                    </td>
                    <td className="px-3 py-2 text-right">{c.totalDiscount.toLocaleString()}원</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : tab === 'logs' ? (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-500">
                <th className="text-left px-3 py-2">일시</th>
                <th className="text-left px-3 py-2">쿠폰</th>
                <th className="text-right px-3 py-2">주문</th>
                <th className="text-right px-3 py-2">할인</th>
                <th className="text-left px-3 py-2">처리자</th>
                <th className="text-left px-3 py-2">메모</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-slate-600">적용 이력이 없습니다</td></tr>
              ) : logs.map(log => (
                <tr key={log.id} className="border-b border-slate-800/50">
                  <td className="px-3 py-2 text-slate-400 whitespace-nowrap">
                    {log.appliedAt ? new Date(log.appliedAt).toLocaleString('ko-KR') : '-'}
                  </td>
                  <td className="px-3 py-2 font-mono text-white">{log.code}</td>
                  <td className="px-3 py-2 text-right">{log.orderAmount.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right text-teal-300">{log.discountAmount.toLocaleString()}</td>
                  <td className="px-3 py-2 text-slate-500">{log.appliedByEmail || '-'}</td>
                  <td className="px-3 py-2 text-slate-500 truncate max-w-[120px]">
                    {log.note || log.customerCusCode || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl px-3 py-3">
      <p className="text-[10px] text-slate-500">{label}</p>
      <p className="text-sm font-semibold text-slate-100 mt-0.5">{value}</p>
    </div>
  );
}
