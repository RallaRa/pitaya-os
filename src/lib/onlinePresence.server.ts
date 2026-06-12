/** 매장명·지역 기준 인터넷 언급 수집 (네이버 검색 + Google News RSS) */

import type {
  OnlinePresenceResult,
  PresenceCategory,
  PresenceItem,
  SourceStatus,
} from '@/lib/onlinePresence.types';

export type { OnlinePresenceResult, PresenceCategory, PresenceItem, SourceStatus };
export { CATEGORY_LABELS } from '@/lib/onlinePresence.types';

function stripHtml(s: string) {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function formatPubDate(raw: string): string {
  if (!raw) return '';
  try {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return raw.slice(0, 16);
    const now = Date.now();
    const diffMin = (now - d.getTime()) / 60000;
    if (diffMin < 60) return `${Math.max(1, Math.round(diffMin))}분 전`;
    if (diffMin < 1440) return `${Math.round(diffMin / 60)}시간 전`;
    return `${d.getMonth() + 1}/${d.getDate()}`;
  } catch {
    return raw.slice(0, 16);
  }
}

function hostnameFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function buildQueries(storeName: string, regionSigungu?: string, regionSido?: string): string[] {
  const name = storeName.trim() || '강서 정육점';
  const queries = new Set<string>([name]);
  if (regionSigungu) queries.add(`${regionSigungu} ${name}`);
  if (regionSigungu) queries.add(`${regionSigungu} 정육점`);
  if (regionSido && regionSigungu) queries.add(`${regionSido} ${regionSigungu} 정육점`);
  return [...queries].slice(0, 4);
}

type NaverEndpoint = 'news' | 'blog' | 'webkr' | 'local' | 'cafearticle';

async function fetchNaverSearch(
  endpoint: NaverEndpoint,
  query: string,
  display: number,
): Promise<{ items: Record<string, string>[]; status: SourceStatus }> {
  const id = process.env.NAVER_CLIENT_ID;
  const sec = process.env.NAVER_CLIENT_SECRET;
  if (!id || !sec) return { items: [], status: 'no_key' };

  try {
    const q = encodeURIComponent(query);
    const res = await fetch(
      `https://openapi.naver.com/v1/search/${endpoint}.json?query=${q}&display=${display}&sort=date`,
      {
        headers: { 'X-Naver-Client-Id': id, 'X-Naver-Client-Secret': sec },
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!res.ok) return { items: [], status: 'error' };
    const data = await res.json();
    const items = (data.items || []) as Record<string, string>[];
    return { items, status: items.length > 0 ? 'ok' : 'empty' };
  } catch {
    return { items: [], status: 'error' };
  }
}

function mapNaverItem(
  raw: Record<string, string>,
  category: PresenceCategory,
  query: string,
): PresenceItem | null {
  const title = stripHtml(raw.title || '');
  const link = raw.link || raw.originallink || '';
  if (!title || !link) return null;

  const description = stripHtml(
    raw.description || raw.address || raw.roadAddress || raw.category || '',
  );

  let source = hostnameFromUrl(link);
  if (category === 'local') {
    source = [raw.category, raw.address || raw.roadAddress].filter(Boolean).join(' · ').slice(0, 80) || source;
  }

  const pubDate = formatPubDate(raw.pubDate || raw.postdate || '');

  return {
    id: `${category}:${link}`,
    category,
    title,
    link,
    description,
    pubDate,
    source,
    query,
  };
}

async function fetchGoogleNewsRss(query: string): Promise<{ items: PresenceItem[]; status: SourceStatus }> {
  const q = encodeURIComponent(query);
  const url = `https://news.google.com/rss/search?q=${q}&hl=ko&gl=KR&ceid=KR:ko`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return { items: [], status: 'error' };
    const xml = await res.text();
    const blocks = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
    const items: PresenceItem[] = blocks.slice(0, 8).flatMap(block => {
      const get = (tag: string) => {
        const m = block.match(new RegExp(`<${tag}(?:[^>]*)>([\\s\\S]*?)<\\/${tag}>`, 'i'));
        return m ? stripHtml(m[1]) : '';
      };
      const title = get('title');
      const link = get('link') || block.match(/<link><!\[CDATA\[(.*?)\]\]>/)?.[1] || '';
      if (!title || !link) return [];
      return [{
        id: `news:google:${link}`,
        category: 'news' as PresenceCategory,
        title,
        link,
        description: get('description').slice(0, 200),
        pubDate: formatPubDate(get('pubDate')),
        source: hostnameFromUrl(link) || 'Google News',
        query,
      }];
    });

    return { items, status: items.length > 0 ? 'ok' : 'empty' };
  } catch {
    return { items: [], status: 'error' };
  }
}

function dedupeItems(items: PresenceItem[]): PresenceItem[] {
  const seen = new Set<string>();
  const out: PresenceItem[] = [];
  for (const item of items) {
    const key = item.link.replace(/\?.*$/, '') || item.title.slice(0, 60);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export async function fetchStoreOnlinePresence(input: {
  storeName: string;
  regionSigungu?: string;
  regionSido?: string;
}): Promise<OnlinePresenceResult> {
  const storeName = input.storeName.trim() || '강서 정육점';
  const queries = buildQueries(storeName, input.regionSigungu, input.regionSido);
  const primaryQuery = queries[0];

  const sourceStatus: OnlinePresenceResult['sourceStatus'] = {
    news: 'empty',
    blog: 'empty',
    web: 'empty',
    local: 'empty',
    cafe: 'empty',
    google_news: 'empty',
  };

  const collected: PresenceItem[] = [];

  const endpoints: { key: PresenceCategory; endpoint: NaverEndpoint; perQuery: number }[] = [
    { key: 'news', endpoint: 'news', perQuery: 5 },
    { key: 'blog', endpoint: 'blog', perQuery: 5 },
    { key: 'web', endpoint: 'webkr', perQuery: 5 },
    { key: 'local', endpoint: 'local', perQuery: 5 },
    { key: 'cafe', endpoint: 'cafearticle', perQuery: 4 },
  ];

  await Promise.all(
    endpoints.flatMap(({ key, endpoint, perQuery }) =>
      queries.map(async (query) => {
        const { items, status } = await fetchNaverSearch(endpoint, query, perQuery);
        if (status === 'ok') sourceStatus[key] = 'ok';
        else if (status === 'no_key') sourceStatus[key] = 'no_key';
        else if (sourceStatus[key] !== 'ok' && status === 'error') sourceStatus[key] = 'error';

        for (const raw of items) {
          const mapped = mapNaverItem(raw, key, query);
          if (mapped) collected.push(mapped);
        }
      }),
    ),
  );

  const google = await fetchGoogleNewsRss(primaryQuery);
  if (google.status === 'ok') sourceStatus.google_news = 'ok';
  else if (google.status === 'error') sourceStatus.google_news = 'error';
  collected.push(...google.items);

  const items = dedupeItems(collected).sort((a, b) => {
    const catOrder: PresenceCategory[] = ['local', 'news', 'blog', 'cafe', 'web'];
    const ca = catOrder.indexOf(a.category);
    const cb = catOrder.indexOf(b.category);
    if (ca !== cb) return ca - cb;
    return (b.pubDate || '').localeCompare(a.pubDate || '');
  });

  const counts: Record<PresenceCategory, number> = {
    news: 0,
    blog: 0,
    web: 0,
    local: 0,
    cafe: 0,
  };
  for (const item of items) counts[item.category] += 1;

  return {
    storeName,
    primaryQuery,
    queries,
    items,
    counts,
    sourceStatus,
    fetchedAt: new Date().toISOString(),
  };
}
