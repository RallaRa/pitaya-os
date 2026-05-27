import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';

interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
}

// 30분 인메모리 캐시
let cache: { data: NewsItem[]; ts: number } | null = null;
const CACHE_TTL = 30 * 60 * 1000;

function parseRSS(xml: string): NewsItem[] {
  const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
  return items.slice(0, 10).map(item => {
    const get = (tag: string) => {
      const m = item.match(new RegExp(`<${tag}(?:[^>]*)>([\\s\\S]*?)<\\/${tag}>`, 'i'));
      return m ? m[1].replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '').replace(/<[^>]+>/g, '').trim() : '';
    };
    const rawLink = get('link') || item.match(/<link><!\[CDATA\[(.*?)\]\]>/)?.[1] || '';
    return {
      title:   get('title')   || '(제목 없음)',
      link:    rawLink,
      pubDate: get('pubDate') || get('dc:date') || '',
      source:  get('source')  || get('dc:creator') || '',
    };
  }).filter(n => n.title !== '(제목 없음)' && n.link);
}

function formatPubDate(raw: string): string {
  if (!raw) return '';
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return raw;
    const now = new Date();
    const diff = (now.getTime() - d.getTime()) / 1000 / 60;
    if (diff < 60)   return `${Math.round(diff)}분 전`;
    if (diff < 1440) return `${Math.round(diff / 60)}시간 전`;
    return `${d.getMonth() + 1}/${d.getDate()}`;
  } catch {
    return raw;
  }
}

async function fetchNaverNews(): Promise<NewsItem[] | null> {
  const id     = process.env.NAVER_CLIENT_ID;
  const secret = process.env.NAVER_CLIENT_SECRET;
  if (!id || !secret) return null;

  const keywords = ['정육', '축산', '한우', '돼지고기', '육가공'];
  const query    = encodeURIComponent(keywords.join(' OR '));

  try {
    const res = await fetch(
      `https://openapi.naver.com/v1/search/news.json?query=${query}&display=7&sort=date`,
      {
        headers: {
          'X-Naver-Client-Id':     id,
          'X-Naver-Client-Secret': secret,
        },
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!res.ok) return null;
    const data  = await res.json();
    return (data.items || []).map((item: any) => ({
      title:   item.title.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"'),
      link:    item.link || item.originallink,
      pubDate: formatPubDate(item.pubDate),
      source:  item.originallink ? new URL(item.originallink).hostname.replace('www.', '') : '',
    }));
  } catch {
    return null;
  }
}

async function fetchGoogleNewsRSS(): Promise<NewsItem[]> {
  const query = encodeURIComponent('정육 OR 축산 OR 한우 OR 돼지고기 OR 육가공');
  const url   = `https://news.google.com/rss/search?q=${query}&hl=ko&gl=KR&ceid=KR:ko`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const xml   = await res.text();
    const items = parseRSS(xml);
    return items.map(n => ({ ...n, pubDate: formatPubDate(n.pubDate) }));
  } catch {
    return [];
  }
}

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (cache && Date.now() - cache.ts < CACHE_TTL) {
    return NextResponse.json({ news: cache.data, cached: true });
  }

  const naver  = await fetchNaverNews();
  const news   = naver?.length ? naver : await fetchGoogleNewsRSS();
  const result = news.slice(0, 5);

  if (result.length) {
    cache = { data: result, ts: Date.now() };
  }

  return NextResponse.json({ news: result, cached: false });
}
