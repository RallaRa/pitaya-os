'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Search, ShoppingCart, CalendarDays, Lightbulb } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { getAuthHeaders } from '@/lib/getAuthHeaders';
import type { CoPurchasePair, DowItemAnalysis, PurchaseAnalyticsResult } from '@/lib/customerPurchaseAnalytics';

const DOW_COLORS = ['#fb7185', '#60a5fa', '#34d399', '#fbbf24', '#a78bfa', '#f97316', '#14b8a6'];

export default function CustomerPurchaseAnalyticsTab({ storeId }: { storeId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<PurchaseAnalyticsResult | null>(null);
  const [anchorDraft, setAnchorDraft] = useState('삼겹');
  const [anchor, setAnchor] = useState('삼겹');
  const [selectedDow, setSelectedDow] = useState(1);

  const load = useCallback(async (keyword: string) => {
    if (!storeId) return;
    setLoading(true);
    setError('');
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(
        `/api/customers/purchase-analytics?storeId=${encodeURIComponent(storeId)}&anchor=${encodeURIComponent(keyword)}`,
        { headers },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '조회 실패');
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : '조회 실패');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    load(anchor);
  }, [anchor, load]);

  const applyAnchor = () => {
    const next = anchorDraft.trim() || '삼겹';
    setAnchor(next);
  };

  const dow = data?.dowItems.find(d => d.dowIndex === selectedDow);

  if (loading && !data) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-teal-400" />
      </div>
    );
  }

  if (error && !data) {
    return <p className="text-center py-16 text-red-400 text-sm">{error}</p>;
  }

  if (!data || data.lineCount === 0) {
    return (
      <div className="text-center py-16 space-y-2">
        <p className="text-sm text-slate-400">동기화된 품목 구매 이력이 없습니다.</p>
        <p className="text-[11px] text-slate-500">
          POS PC: <code className="text-amber-300">node bridge.js migrate YYYY-MM-DD YYYY-MM-DD</code>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatBox label="분석 기간" value={`${data.sinceYmd}~`} sub="최근 90일" />
        <StatBox label="품목 라인" value={data.lineCount.toLocaleString()} sub="건" />
        <StatBox label="회원 영수증" value={data.receiptCount.toLocaleString()} sub="건" />
        <StatBox label="기준 품목 영수증" value={data.coPurchase.anchorReceiptCount.toLocaleString()} sub={`"${data.coPurchase.anchorKeyword}" 포함`} />
      </div>

      {/* 6. 복합 구매 패턴 */}
      <section className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-4">
        <div className="flex items-start gap-2">
          <ShoppingCart className="w-4 h-4 text-teal-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-slate-200">복합 구매 패턴</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              특정 품목 구매 시 같이 담기는 품목 · 진열 최적화 · 세트 기획 · 추천 멘트 근거
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <input
              value={anchorDraft}
              onChange={e => setAnchorDraft(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && applyAnchor()}
              placeholder="기준 품목 (예: 삼겹, 한우, 대패)"
              className="w-full pl-8 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 outline-none focus:border-teal-500"
            />
          </div>
          <button
            type="button"
            onClick={applyAnchor}
            disabled={loading}
            className="px-3 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-xs font-medium disabled:opacity-50"
          >
            {loading ? '분석 중…' : '분석'}
          </button>
          <div className="flex flex-wrap gap-1.5">
            {data.popularItems.slice(0, 6).map(item => (
              <button
                key={item.name}
                type="button"
                onClick={() => { setAnchorDraft(item.name.slice(0, 6)); setAnchor(item.name.slice(0, 6)); }}
                className="px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-400 border border-slate-700"
              >
                {item.name.length > 10 ? `${item.name.slice(0, 10)}…` : item.name}
              </button>
            ))}
          </div>
        </div>

        {data.coPurchase.matchedAnchors.length > 0 && (
          <p className="text-[10px] text-slate-500">
            매칭 품목: {data.coPurchase.matchedAnchors.slice(0, 8).join(' · ')}
            {data.coPurchase.matchedAnchors.length > 8 ? ` 외 ${data.coPurchase.matchedAnchors.length - 8}개` : ''}
          </p>
        )}

        {data.coPurchase.anchorReceiptCount === 0 ? (
          <p className="text-xs text-amber-400/90 bg-amber-950/30 border border-amber-800/40 rounded-lg px-3 py-2">
            &quot;{data.coPurchase.anchorKeyword}&quot; 포함 영수증이 없습니다. 다른 키워드를 입력해 보세요.
          </p>
        ) : (
          <>
            <CoPurchaseTable pairs={data.coPurchase.pairs} anchorCount={data.coPurchase.anchorReceiptCount} />
            {data.coPurchase.pairs[0] && (
              <div className="flex items-start gap-2 bg-teal-950/20 border border-teal-800/30 rounded-lg px-3 py-2.5">
                <Lightbulb className="w-3.5 h-3.5 text-teal-400 mt-0.5 shrink-0" />
                <p className="text-[11px] text-teal-200/90 leading-relaxed">
                  추천 멘트 예: &quot;{data.coPurchase.matchedAnchors[0] || data.coPurchase.anchorKeyword} 구매하시면{' '}
                  {data.coPurchase.pairs[0].item}도 {Math.round(data.coPurchase.pairs[0].anchorRate)}% 고객이 함께 구매합니다.&quot;
                </p>
              </div>
            )}
          </>
        )}
      </section>

      {/* 7. 요일별 품목 교차분석 */}
      <section className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-4">
        <div className="flex items-start gap-2">
          <CalendarDays className="w-4 h-4 text-violet-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-slate-200">요일별 품목 교차분석</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              월요일·금요일 등 요일별 인기 품목 · 요일별 발주·진열 최적화
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {data.dowItems.map(d => (
            <button
              key={d.dow}
              type="button"
              onClick={() => setSelectedDow(d.dowIndex)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                selectedDow === d.dowIndex
                  ? 'bg-violet-600/30 border-violet-500/50 text-violet-200'
                  : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-slate-300'
              }`}
            >
              {d.dow} ({d.receiptCount})
            </button>
          ))}
        </div>

        {dow && dow.topItems.length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart
                data={dow.topItems.slice(0, 6).map(it => ({
                  name: it.name.length > 8 ? `${it.name.slice(0, 8)}…` : it.name,
                  fullName: it.name,
                  qty: it.qty,
                  share: it.share,
                }))}
                margin={{ top: 0, right: 0, left: -20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                  labelStyle={{ color: '#e2e8f0', fontSize: 11 }}
                  formatter={(v: number, _n, p) => [
                    `${v.toLocaleString()}개 (${(p.payload as { share: number }).share}%)`,
                    '판매량',
                  ]}
                  labelFormatter={(_l, p) => (p?.[0]?.payload as { fullName?: string })?.fullName || _l}
                />
                <Bar dataKey="qty" fill={DOW_COLORS[selectedDow]} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>

            <DowItemTable dow={dow} />
          </>
        ) : (
          <p className="text-xs text-slate-500 text-center py-6">해당 요일 회원 구매 데이터가 없습니다.</p>
        )}

        <DowHeatSummary dowItems={data.dowItems} />
      </section>
    </div>
  );
}

function StatBox({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 text-center">
      <p className="text-lg font-bold text-slate-100">{value}</p>
      <p className="text-[10px] text-slate-500 mt-1">{label}</p>
      <p className="text-[9px] text-slate-600">{sub}</p>
    </div>
  );
}

function CoPurchaseTable({ pairs, anchorCount }: { pairs: CoPurchasePair[]; anchorCount: number }) {
  if (!pairs.length) {
    return <p className="text-xs text-slate-500">함께 구매된 다른 품목이 없습니다.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-800">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-800 text-slate-500 bg-slate-900/80">
            <th className="text-left px-3 py-2.5">함께 구매 품목</th>
            <th className="text-right px-3 py-2.5">동시구매</th>
            <th className="text-right px-3 py-2.5">비율</th>
            <th className="text-right px-3 py-2.5">Lift</th>
            <th className="text-left px-3 py-2.5 hidden md:table-cell">활용</th>
          </tr>
        </thead>
        <tbody>
          {pairs.map(p => (
            <tr key={p.item} className="border-b border-slate-800/50 hover:bg-slate-800/20">
              <td className="px-3 py-2 text-slate-200">{p.item}</td>
              <td className="px-3 py-2 text-right text-slate-300">{p.togetherCount.toLocaleString()}건</td>
              <td className="px-3 py-2 text-right text-teal-300">{p.anchorRate}%</td>
              <td className="px-3 py-2 text-right text-violet-300">{p.lift}x</td>
              <td className="px-3 py-2 text-[10px] text-slate-500 hidden md:table-cell">
                {p.lift >= 1.5 ? '세트·진열 추천' : p.lift >= 1.1 ? '크로스셀' : '참고'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[10px] text-slate-600 px-3 py-2">
        기준 품목 영수증 {anchorCount.toLocaleString()}건 · 비율 = 동시구매 ÷ 기준 영수증 · Lift = 연관도 (1.0 이상이면 함께 살 확률 높음)
      </p>
    </div>
  );
}

function DowItemTable({ dow }: { dow: DowItemAnalysis }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-800">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-800 text-slate-500 bg-slate-900/80">
            <th className="text-left px-3 py-2.5">{dow.dow}요일 TOP 품목</th>
            <th className="text-right px-3 py-2.5">수량</th>
            <th className="text-right px-3 py-2.5">매출</th>
            <th className="text-right px-3 py-2.5">비중</th>
          </tr>
        </thead>
        <tbody>
          {dow.topItems.map(it => (
            <tr key={it.name} className="border-b border-slate-800/50 hover:bg-slate-800/20">
              <td className="px-3 py-2 text-slate-200">{it.name}</td>
              <td className="px-3 py-2 text-right text-slate-300">{it.qty.toLocaleString()}</td>
              <td className="px-3 py-2 text-right text-teal-300">{it.amount.toLocaleString()}원</td>
              <td className="px-3 py-2 text-right text-violet-300">{it.share}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DowHeatSummary({ dowItems }: { dowItems: DowItemAnalysis[] }) {
  const topByDow = dowItems
    .filter(d => d.topItems[0])
    .map(d => ({ dow: d.dow, item: d.topItems[0].name, qty: d.topItems[0].qty }));

  if (!topByDow.length) return null;

  return (
    <div className="bg-violet-950/20 border border-violet-800/30 rounded-lg px-3 py-2.5">
      <p className="text-[10px] text-violet-300/90 font-medium mb-1.5">요일별 1위 품목 요약</p>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {topByDow.map(row => (
          <span key={row.dow} className="text-[11px] text-slate-300">
            <span className="text-violet-300">{row.dow}</span> {row.item}{' '}
            <span className="text-slate-500">({row.qty})</span>
          </span>
        ))}
      </div>
    </div>
  );
}
