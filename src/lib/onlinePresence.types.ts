export type PresenceCategory = 'news' | 'blog' | 'web' | 'local' | 'cafe';

export interface PresenceItem {
  id: string;
  category: PresenceCategory;
  title: string;
  link: string;
  description: string;
  pubDate: string;
  source: string;
  query: string;
}

export type SourceStatus = 'ok' | 'empty' | 'error' | 'no_key';

export interface OnlinePresenceResult {
  storeName: string;
  primaryQuery: string;
  queries: string[];
  items: PresenceItem[];
  counts: Record<PresenceCategory, number>;
  sourceStatus: Record<PresenceCategory | 'google_news', SourceStatus>;
  fetchedAt: string;
  cached?: boolean;
}

export const CATEGORY_LABELS: Record<PresenceCategory, string> = {
  news: '뉴스',
  blog: '블로그',
  web: '웹',
  local: '플레이스',
  cafe: '카페',
};
