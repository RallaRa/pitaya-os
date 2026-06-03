'use client';

import { useState, useEffect, useCallback, Fragment } from 'react';
import { ExternalLink, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import MergeModal, { type MergeItem } from '@/components/purchases/MergeModal';

const ANIMAL_FILTERS = ['전체', '소 (Beef)', '돼지 (Pork)', '닭 (Chicken)'];
const ORIGIN_FILTERS = ['전체', '국내 (KOR)', '미국 (USA)', '호주 (AUS)', '캐나다 (CAN)', '덴마크 (DEN)', '스페인 (ESP)', '기타'];
const STORAGE_FILTERS = ['전체', '냉장', '냉동'];

const SOURCE_COLORS: Record<string, string> = {
  meatclub: '#3b82f6',
  topmeat: '#10b981',
  meatfriends: '#f59e0b',
  bondaero: '#ef4444',
  ekcm: '#8b5cf6',
};

interface PriceEntry {
  price: number;
  url: string;
  sourceName: string;
  originalName: string;
}

interface GroupedItem {
  groupKey: string;
  standardName: string;
  animalType?: { ko: string; en: string };
  origin?: { ko: string; en: string };
  brand?: string;
  grade?: string;
  storageType?: string;
  prices: Record<string, PriceEntry>;
  minPrice: number;
  minSource: string;
}

interface ScraperSource {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
}

export default function PriceAnalysisPage() {
  const [animalFilter, setAnimalFilter] = useState('전체');
  const [originFilter, setOriginFilter] = useState('전체');
  const [storageFilter, setStorageFilter] = useState('전체');
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'all' | 'pending'>('all');
  const [groupedItems, setGroupedItems] = useState<GroupedItem[]>([]);
  const [pendingItems, setPendingItems] = useState<any[]>([]);
  const [sources, setSources] = useState<ScraperSource[]>([]);
  const [lastRun, setLastRun] = useState('');
  const [dataDate, setDataDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [expandedChart, setExpandedChart] = useState<string | null>(null);
  const [chartData, setChartData] = useState<any[]>([]);
  const [mergeModal, setMergeModal] = useState<MergeItem | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await getAuthJsonHeaders();
      const [pricesRes, sourcesRes, metaRes, pendingRes] = await Promise.all([
        fetch('/api/market-prices?type=prices', { headers }),
        fetch('/api/scraper-sources', { headers }),
        fetch('/api/market-prices?type=meta', { headers }),
        fetch('/api/market-prices?type=pending', { headers }),
      ]);

      const [pricesData, sourcesData, metaData, pendingData] = await Promise.all([
        pricesRes.json(), sourcesRes.json(), metaRes.json(), pendingRes.json(),
      ]);

      setSources(sourcesData.sources || []);
      setPendingItems(pendingData.pending || []);

      if (pricesData.date) setDataDate(pricesData.date);
      if (pricesData.requestedDate && pricesData.requestedDate !== pricesData.date) {
        setDataDate(`${pricesData.date} (오늘 데이터 없음)`);
      }

      if (metaData.meta?.lastRun) {
        const d = metaData.meta.lastRun;
        setLastRun(typeof d === 'string' ? d : new Date(d._seconds * 1000).toLocaleString('ko-KR'));
      }

      const prices = pricesData.prices || [];
      const grouped: Record<string, GroupedItem> = {};

      for (const p of prices) {
        const key = p.groupKey || `${p.animalType?.ko}_${p.origin?.ko}_${p.standardName}_${p.storageType}`;
        if (!grouped[key]) {
          grouped[key] = {
            groupKey: key,
            standardName: p.standardName,
            animalType: p.animalType,
            origin: p.origin,
            brand: p.brand,
            grade: p.grade,
            storageType: p.storageType,
            prices: {},
            minPrice: Infinity,
            minSource: '',
          };
        }
        grouped[key].prices[p.source] = {
          price: p.price,
          url: p.url,
          sourceName: p.sourceName,
          originalName: p.originalName,
        };
        if (p.price < grouped[key].minPrice) {
          grouped[key].minPrice = p.price;
          grouped[key].minSource = p.source;
        }
      }

      setGroupedItems(Object.values(grouped));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function loadChartData(groupKey: string) {
    if (expandedChart === groupKey) {
      setExpandedChart(null);
      return;
    }
    setExpandedChart(groupKey);
    const headers = await getAuthJsonHeaders();
    const res = await fetch(`/api/market-prices?type=history&groupKey=${encodeURIComponent(groupKey)}`, { headers });
    const data = await res.json();

    const byDate: Record<string, any> = {};
    for (const p of data.history || []) {
      const date = p.scrapedAt;
      if (!byDate[date]) byDate[date] = { date };
      byDate[date][p.source] = p.price;
    }
    setChartData(Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date)));
  }

  async function handleMerge(item: MergeItem, standardName: string, animalType: string, origin: string) {
    const headers = await getAuthJsonHeaders();
    await fetch('/api/market-prices', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        action: 'mergeAlias',
        originalName: item.originalName,
        source: item.source,
        standardName,
        animalType,
        origin,
      }),
    });
    setMergeModal(null);
    await loadData();
  }

  const filteredItems = groupedItems.filter(item => {
    if (animalFilter !== '전체' && !animalFilter.includes(item.animalType?.ko || '')) return false;
    if (originFilter !== '전체' && !originFilter.includes(item.origin?.ko || '')) return false;
    if (storageFilter !== '전체' && item.storageType !== storageFilter) return false;
    if (search && !item.standardName.includes(search) &&
        !item.origin?.ko.includes(search) && !(item.brand || '').includes(search)) return false;
    return true;
  });

  const enabledSources = sources.filter(s => s.enabled);

  return (
    <div className="p-4 max-w-full overflow-x-auto min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-teal-400">매입단가 분석</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            갱신: {lastRun || '미실행'} · 데이터 기준: {dataDate || '없음'} · 매일 오전 6시 자동 갱신
          </p>
        </div>
        <button
          onClick={loadData}
          className="flex items-center gap-2 px-4 py-2 bg-teal-600 rounded-lg text-sm hover:bg-teal-500 text-white"
        >
          <RefreshCw size={14} />
          새로고침
        </button>
      </div>

      <div className="space-y-3 mb-6">
        <div className="flex gap-2 overflow-x-auto pb-1">
          <span className="text-xs text-slate-400 flex-shrink-0 self-center w-16">축종</span>
          {ANIMAL_FILTERS.map(f => (
            <button key={f} onClick={() => setAnimalFilter(f)}
              className={`px-3 py-1.5 rounded-full text-xs flex-shrink-0 ${
                animalFilter === f ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300'
              }`}>{f}</button>
          ))}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <span className="text-xs text-slate-400 flex-shrink-0 self-center w-16">원산지</span>
          {ORIGIN_FILTERS.map(f => (
            <button key={f} onClick={() => setOriginFilter(f)}
              className={`px-3 py-1.5 rounded-full text-xs flex-shrink-0 ${
                originFilter === f ? 'bg-green-600 text-white' : 'bg-slate-800 text-slate-300'
              }`}>{f}</button>
          ))}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <span className="text-xs text-slate-400 flex-shrink-0 self-center w-16">보관</span>
          {STORAGE_FILTERS.map(f => (
            <button key={f} onClick={() => setStorageFilter(f)}
              className={`px-3 py-1.5 rounded-full text-xs flex-shrink-0 ${
                storageFilter === f ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-300'
              }`}>{f}</button>
          ))}
        </div>
        <input
          type="text"
          placeholder="품목명, 원산지, 브랜드 검색..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full px-4 py-2.5 bg-slate-800 rounded-xl text-sm outline-none border border-slate-700 text-white"
        />
      </div>

      <div className="flex gap-2 mb-4">
        <button onClick={() => setTab('all')}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            tab === 'all' ? 'bg-teal-600 text-white' : 'bg-slate-800 text-slate-300'
          }`}>
          전체 품목 ({groupedItems.length})
        </button>
        <button onClick={() => setTab('pending')}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            tab === 'pending' ? 'bg-orange-600 text-white' : 'bg-slate-800 text-slate-300'
          }`}>
          미정의 품목 ({pendingItems.length})
        </button>
      </div>

      {tab === 'all' && (
        <div className="overflow-x-auto rounded-xl border border-slate-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800/80">
                <th className="text-left p-3 min-w-20">축종</th>
                <th className="text-left p-3 min-w-28">원산지<br /><span className="text-xs text-slate-400 font-normal">Origin</span></th>
                <th className="text-left p-3 min-w-32">품목명<br /><span className="text-xs text-slate-400 font-normal">Item</span></th>
                <th className="text-center p-3 min-w-16">보관</th>
                {enabledSources.map(s => (
                  <th key={s.id} className="text-center p-3 min-w-28">
                    <a href={s.url} target="_blank" rel="noopener noreferrer"
                      className="hover:text-teal-400 inline-flex flex-col items-center gap-0.5">
                      {s.name}
                      <ExternalLink size={10} className="text-slate-500" />
                    </a>
                  </th>
                ))}
                <th className="text-center p-3 min-w-24 text-green-400">최저가</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={99} className="text-center p-8 text-slate-400">로딩 중...</td></tr>
              ) : filteredItems.length === 0 ? (
                <tr><td colSpan={99} className="text-center p-8 text-slate-400">
                  <p>데이터 없음</p>
                  <p className="text-xs mt-2 text-slate-500">설정 → 스크래핑 소스에서 「수집」 실행 또는 POS PC에서 node dynamic-scraper.js</p>
                </td></tr>
              ) : filteredItems.map(item => (
                <Fragment key={item.groupKey}>
                  <tr
                    className="border-t border-slate-800 hover:bg-slate-800/40 cursor-pointer"
                    onClick={() => loadChartData(item.groupKey)}
                  >
                    <td className="p-3">
                      <div className="font-medium">{item.animalType?.ko}</div>
                      <div className="text-xs text-slate-400">{item.animalType?.en}</div>
                    </td>
                    <td className="p-3">
                      <div className="font-medium">{item.origin?.ko}</div>
                      <div className="text-xs text-slate-400">{item.origin?.en}</div>
                    </td>
                    <td className="p-3">
                      <p className="font-medium">{item.standardName}</p>
                      {item.brand && <p className="text-xs text-blue-400">{item.brand}</p>}
                      {item.grade && <p className="text-xs text-yellow-400">{item.grade}</p>}
                    </td>
                    <td className="p-3 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        item.storageType === '냉장' ? 'bg-blue-900/50 text-blue-300' : 'bg-slate-700 text-slate-300'
                      }`}>{item.storageType}</span>
                    </td>
                    {enabledSources.map(source => {
                      const priceData = item.prices[source.id];
                      const isLowest = source.id === item.minSource;
                      return (
                        <td key={source.id} className="p-3 text-center">
                          {priceData ? (
                            <a
                              href={priceData.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              className={`inline-flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg ${
                                isLowest ? 'bg-green-900/50 text-green-300 font-bold' : 'text-slate-300 hover:bg-slate-700'
                              }`}
                            >
                              <span>{priceData.price.toLocaleString()}원</span>
                              <ExternalLink size={9} className="opacity-50" />
                            </a>
                          ) : (
                            <span className="text-slate-600">-</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="p-3 text-center">
                      <div className="text-green-400 font-bold">
                        {item.minPrice === Infinity ? '-' : `${item.minPrice.toLocaleString()}원`}
                      </div>
                      {item.minSource && (
                        <div className="text-xs text-slate-400">
                          {sources.find(s => s.id === item.minSource)?.name}
                        </div>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      {expandedChart === item.groupKey
                        ? <ChevronDown size={14} className="text-teal-400 mx-auto" />
                        : <ChevronRight size={14} className="text-slate-500 mx-auto" />}
                    </td>
                  </tr>
                  {expandedChart === item.groupKey && (
                    <tr className="bg-slate-900/50">
                      <td colSpan={99} className="px-6 py-4">
                        <p className="text-sm font-medium mb-3 text-slate-300">
                          {item.origin?.ko} ({item.origin?.en}) {item.standardName} 가격 추이
                        </p>
                        {chartData.length === 0 ? (
                          <p className="text-sm text-slate-500">히스토리 데이터 없음</p>
                        ) : (
                          <ResponsiveContainer width="100%" height={200}>
                            <LineChart data={chartData}>
                              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}K`} />
                              <Tooltip formatter={(v: number) => [`${Number(v).toLocaleString()}원`]} />
                              <Legend />
                              {enabledSources.map(s => (
                                <Line key={s.id} type="monotone" dataKey={s.id} name={s.name}
                                  stroke={SOURCE_COLORS[s.id] || '#888'} dot={false} strokeWidth={2} />
                              ))}
                            </LineChart>
                          </ResponsiveContainer>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'pending' && (
        <div className="rounded-xl border border-orange-800/50 overflow-hidden">
          <div className="bg-orange-900/20 px-4 py-3 text-sm text-orange-300">
            알리아스 미정의 품목입니다. 표준명을 지정하면 다음 갱신부터 자동 적용됩니다.
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800">
                <th className="text-left p-3">원본 품목명</th>
                <th className="text-center p-3">출처</th>
                <th className="text-left p-3">원산지</th>
                <th className="text-left p-3">축종</th>
                <th className="text-center p-3">가격</th>
                <th className="text-center p-3">액션</th>
              </tr>
            </thead>
            <tbody>
              {pendingItems.filter(p => !search || p.originalName?.includes(search)).map((item, i) => (
                <tr key={i} className="border-t border-slate-800">
                  <td className="p-3 font-mono text-yellow-300 text-xs">{item.originalName}</td>
                  <td className="p-3 text-center text-slate-400 text-xs">{item.sourceName}</td>
                  <td className="p-3">
                    <div>{item.origin?.ko || '알 수 없음'}</div>
                    <div className="text-xs text-slate-400">{item.origin?.en || '-'}</div>
                  </td>
                  <td className="p-3">
                    <div>{item.animalType?.ko || '알 수 없음'}</div>
                    <div className="text-xs text-slate-400">{item.animalType?.en || '-'}</div>
                  </td>
                  <td className="p-3 text-center">
                    {item.url ? (
                      <a href={item.url} target="_blank" rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 inline-flex items-center gap-1">
                        {item.price?.toLocaleString()}원
                        <ExternalLink size={10} />
                      </a>
                    ) : (
                      <span>{item.price?.toLocaleString()}원</span>
                    )}
                  </td>
                  <td className="p-3 text-center">
                    <button
                      onClick={() => setMergeModal(item)}
                      className="px-3 py-1 bg-orange-600 text-white rounded text-xs hover:bg-orange-500"
                    >
                      표준명 지정
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {mergeModal && (
        <MergeModal
          item={mergeModal}
          definedItems={groupedItems}
          onMerge={handleMerge}
          onClose={() => setMergeModal(null)}
        />
      )}
    </div>
  );
}
