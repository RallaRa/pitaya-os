'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ExternalLink,
  Globe,
  Loader2,
  MapPin,
  MessageSquare,
  Newspaper,
  RefreshCw,
  Search,
} from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { getAuthHeaders } from '@/lib/getAuthHeaders';
import { CATEGORY_LABELS, type PresenceCategory, type PresenceItem } from '@/lib/onlinePresence.types';

interface PresenceData {
  storeName: string;
  primaryQuery: string;
  queries: string[];
  items: PresenceItem[];
  counts: Record<PresenceCategory, number>;
  sourceStatus: Record<string, string>;
  fetchedAt: string;
  cached?: boolean;
}

const TAB_ALL = 'all' as const;
type TabKey = typeof TAB_ALL | PresenceCategory;

const TAB_META: { key: TabKey; label: string; icon: typeof Globe }[] = [
  { key: TAB_ALL, label: '전체', icon: Globe },
  { key: 'local', label: CATEGORY_LABELS.local, icon: MapPin },
  { key: 'news', label: CATEGORY_LABELS.news, icon: Newspaper },
  { key: 'blog', label: CATEGORY_LABELS.blog, icon: Search },
  { key: 'cafe', label: CATEGORY_LABELS.cafe, icon: MessageSquare },
  { key: 'web', label: CATEGORY_LABELS.web, icon: Globe },
];

const STATUS_LABEL: Record<string, string> = {
  ok: '수집됨',
  empty: '결과 없음',
  error: '오류',
  no_key: 'API 키 없음',
};

function CategoryBadge({ category }: { category: PresenceCategory }) {
  const colors: Record<PresenceCategory, string> = {
    local: 'bg-teal-500/15 text-teal-300 border-teal-500/30',
    news: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
    blog: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
    cafe: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    web: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
  };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${colors[category]}`}>
      {CATEGORY_LABELS[category]}
    </span>
  );
}

export default function OnlinePresencePage() {
  const { currentStore } = useStore();
  const storeId = currentStore?.storeId || '';
  const [data, setData] = useState<PresenceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<TabKey>(TAB_ALL);

  const load = useCallback(async (refresh = false) => {
    if (!storeId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const headers = await getAuthHeaders();
      const q = new URLSearchParams({ storeId });
      if (refresh) q.set('refresh', '1');
      const res = await fetch(`/api/dashboard/online-presence?${q}`, { headers });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '불러오기 실패');
      setData(json);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '불러오기 실패');
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!data?.items) return [];
    if (tab === TAB_ALL) return data.items;
    return data.items.filter(i => i.category === tab);
  }, [data, tab]);

  const totalCount = data?.items.length ?? 0;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">온라인 언급 대시보드</h1>
          <p className="text-sm text-slate-400 mt-1">
            {data?.storeName || currentStore?.storeName || '강서 정육점'} · 네이버·Google에서 수집한 관련 콘텐츠
          </p>
          {data?.queries?.length ? (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {data.queries.map(q => (
                <span key={q} className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                  검색: {q}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => load(true)}
          disabled={loading || !storeId}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm text-slate-200 disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          새로고침
        </button>
      </div>

      {!storeId && (
        <div className="rounded-xl border border-amber-800/40 bg-amber-950/30 px-4 py-3 text-sm text-amber-200">
          매장을 선택한 뒤 다시 시도해 주세요.
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-800/40 bg-red-950/30 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {TAB_META.filter(t => t.key !== TAB_ALL).map(t => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`rounded-xl border px-3 py-3 text-left transition-colors ${
                  tab === t.key
                    ? 'border-teal-500/50 bg-teal-900/20'
                    : 'border-slate-800 bg-slate-900/50 hover:border-slate-700'
                }`}
              >
                <p className="text-[10px] text-slate-500">{t.label}</p>
                <p className="text-lg font-bold text-white mt-0.5">{data.counts[t.key as PresenceCategory] ?? 0}</p>
              </button>
            ))}
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 px-3 py-3">
              <p className="text-[10px] text-slate-500">전체</p>
              <p className="text-lg font-bold text-teal-300 mt-0.5">{totalCount}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-2">
            {TAB_META.map(t => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  tab === t.key
                    ? 'bg-teal-600/30 text-teal-200 border border-teal-500/40'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {t.label}
                {t.key !== TAB_ALL && ` (${data.counts[t.key as PresenceCategory] ?? 0})`}
              </button>
            ))}
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
            {loading && !filtered.length ? (
              <div className="flex items-center justify-center py-16 text-slate-500 text-sm gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                인터넷에서 관련 내용을 수집하는 중…
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center text-slate-500 text-sm">
                <p>표시할 결과가 없습니다.</p>
                <p className="text-xs mt-2 text-slate-600">
                  NAVER_CLIENT_ID/SECRET 설정 시 뉴스·블로그·플레이스 수집이 가능합니다.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-800/70">
                {filtered.map(item => (
                  <li key={item.id}>
                    <a
                      href={item.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-3 px-4 py-3.5 hover:bg-slate-800/40 transition-colors group"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <CategoryBadge category={item.category} />
                          {item.pubDate && (
                            <span className="text-[10px] text-slate-600">{item.pubDate}</span>
                          )}
                          <span className="text-[10px] text-slate-600 truncate">검색어: {item.query}</span>
                        </div>
                        <p className="text-sm font-medium text-slate-200 group-hover:text-teal-300 leading-snug">
                          {item.title}
                        </p>
                        {item.description && (
                          <p className="text-xs text-slate-500 mt-1 line-clamp-2">{item.description}</p>
                        )}
                        {item.source && (
                          <p className="text-[10px] text-slate-600 mt-1 truncate">{item.source}</p>
                        )}
                      </div>
                      <ExternalLink className="w-4 h-4 text-slate-700 group-hover:text-teal-400 shrink-0 mt-1" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/30 px-4 py-3">
            <p className="text-xs font-semibold text-slate-400 mb-2">수집 채널 상태</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">
              {Object.entries(data.sourceStatus).map(([key, status]) => (
                <div key={key} className="flex items-center justify-between gap-2 text-slate-500">
                  <span>{key === 'google_news' ? 'Google News' : CATEGORY_LABELS[key as PresenceCategory] || key}</span>
                  <span className={
                    status === 'ok' ? 'text-green-400'
                      : status === 'no_key' ? 'text-amber-400'
                        : status === 'error' ? 'text-red-400'
                          : 'text-slate-600'
                  }>
                    {STATUS_LABEL[status] || status}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-slate-600 mt-2">
              {data.cached ? '캐시된 결과 · ' : ''}
              마지막 수집: {new Date(data.fetchedAt).toLocaleString('ko-KR')}
              {' · '}
              <Link href="/dashboard" className="text-teal-500 hover:underline">메인 대시보드</Link>
            </p>
          </div>
        </>
      )}
    </div>
  );
}
