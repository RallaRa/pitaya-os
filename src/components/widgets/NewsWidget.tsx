'use client';

import { useState, useEffect, useCallback } from 'react';
import { ExternalLink } from 'lucide-react';
import WidgetWrapper from './WidgetWrapper';
import { getAuthHeaders } from '@/lib/getAuthHeaders';

interface NewsItem { title: string; link: string; pubDate: string; source: string; }

export default function NewsWidget({ editMode, onRemove }: { editMode: boolean; onRemove: () => void }) {
  const [news,      setNews]      = useState<NewsItem[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch('/api/dashboard/news', { headers: await getAuthHeaders() });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setNews(data.news || []);
      setUpdatedAt(new Date());
    } catch (e: any) {
      setError('뉴스를 불러오지 못했습니다');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30 * 60 * 1000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <WidgetWrapper
      title="🗞️ 정육 최신 뉴스"
      editMode={editMode}
      onRemove={onRemove}
      onRefresh={load}
      updatedAt={updatedAt}
      loading={loading}
      error={error}
    >
      <div className="h-full overflow-y-auto">
        {news.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-600 text-xs">뉴스 없음</div>
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
