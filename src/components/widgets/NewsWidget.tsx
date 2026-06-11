'use client';

import { useCallback, useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import WidgetWrapper from './WidgetWrapper';
import WidgetAsyncBoundary from '@/components/suspense/WidgetAsyncBoundary';
import EmptyState from '@/components/suspense/EmptyState';
import { fetchAuthJson } from '@/components/suspense/fetchJson';
import { useSuspenseInvalidate, useSuspenseResource } from '@/components/suspense/useSuspenseResource';

interface NewsItem { title: string; link: string; pubDate: string; source: string; }

const CACHE_KEY = 'dashboard:news';

async function fetchNews() {
  const data = await fetchAuthJson<{ news?: NewsItem[]; error?: string }>('/api/dashboard/news');
  if (data.error) throw new Error(data.error);
  return data.news ?? [];
}

function NewsWidgetContent({
  editMode, onRemove,
}: {
  editMode: boolean; onRemove: () => void;
}) {
  const invalidate = useSuspenseInvalidate(CACHE_KEY);
  const news = useSuspenseResource(CACHE_KEY, fetchNews);
  const [updatedAt, setUpdatedAt] = useState(() => new Date());

  useEffect(() => {
    setUpdatedAt(new Date());
  }, [news]);

  const refresh = useCallback(() => {
    invalidate();
  }, [invalidate]);

  useEffect(() => {
    const t = setInterval(refresh, 30 * 60 * 1000);
    return () => clearInterval(t);
  }, [refresh]);

  return (
    <WidgetWrapper
      title="🗞️ 정육 최신 뉴스"
      editMode={editMode}
      onRemove={onRemove}
      onRefresh={refresh}
      updatedAt={updatedAt}
    >
      <div className="h-full overflow-y-auto">
        {news.length === 0 ? (
          <EmptyState reason="표시할 뉴스가 없습니다." compact />
        ) : (
          <ul className="divide-y divide-slate-800/60">
            {news.map((n, i) => (
              <li key={i}>
                <a
                  href={n.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-2 px-4 py-2.5 hover:bg-slate-800/40 transition-colors group"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-200 text-xs font-medium leading-snug line-clamp-2 group-hover:text-teal-300 transition-colors">
                      {n.title}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      {n.source && <span className="text-slate-600 text-[9px] truncate max-w-[80px]">{n.source}</span>}
                      {n.pubDate && <span className="text-slate-600 text-[9px]">{n.pubDate}</span>}
                    </div>
                  </div>
                  <ExternalLink className="w-3 h-3 text-slate-700 group-hover:text-teal-400 shrink-0 mt-0.5 transition-colors" />
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </WidgetWrapper>
  );
}

export default function NewsWidget(props: { editMode: boolean; onRemove: () => void }) {
  return (
    <WidgetAsyncBoundary skeleton="table" widgetName="뉴스">
      <NewsWidgetContent {...props} />
    </WidgetAsyncBoundary>
  );
}
