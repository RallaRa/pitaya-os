'use client';

import { useCallback, useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import WidgetWrapper from './WidgetWrapper';
import EmptyState from '@/components/suspense/EmptyState';
import SkeletonTable from '@/components/suspense/SkeletonTable';
import { useNews } from '@/lib/queries';
import WidgetAnalysisPanel from './WidgetAnalysisPanel';
import { useWidgetAnalysis } from '@/hooks/useWidgetAnalysis';

function NewsWidgetContent({
  editMode, onRemove, storeId,
}: {
  editMode: boolean; onRemove: () => void; storeId?: string;
}) {
  const { data: news = [], isLoading, isError, refetch, dataUpdatedAt } = useNews();
  const [updatedAt, setUpdatedAt] = useState(() => new Date());
  const analysis = useWidgetAnalysis('news', storeId, { news });

  useEffect(() => {
    if (dataUpdatedAt) setUpdatedAt(new Date(dataUpdatedAt));
  }, [dataUpdatedAt]);

  const refresh = useCallback(() => {
    void refetch();
  }, [refetch]);

  if (isLoading && news.length === 0) {
    return (
      <WidgetWrapper title="🗞️ 정육 최신 뉴스" editMode={editMode} onRemove={onRemove}>
        <SkeletonTable />
      </WidgetWrapper>
    );
  }

  if (isError) {
    return (
      <WidgetWrapper title="🗞️ 정육 최신 뉴스" editMode={editMode} onRemove={onRemove} onRefresh={refresh}>
        <EmptyState reason="뉴스를 불러오지 못했습니다." compact />
      </WidgetWrapper>
    );
  }

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
        <div className="px-3 pb-2">
          <WidgetAnalysisPanel analysis={analysis} />
        </div>
      </div>
    </WidgetWrapper>
  );
}

export default function NewsWidget(props: { editMode: boolean; onRemove: () => void; storeId?: string }) {
  return <NewsWidgetContent {...props} />;
}
