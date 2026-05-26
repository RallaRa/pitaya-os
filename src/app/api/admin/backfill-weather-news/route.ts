import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { verifyToken, getActualGroupId, isMasterGroup } from '@/lib/authVerify';
import { fetchWeather, getStoreCoords } from '@/lib/weather';

// ── 뉴스 fetch (네이버) ───────────────────────────────────────────
interface NaverNewsItem { title: string; link: string; pubDate: string; description: string; }

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
}

async function fetchNaverNews(): Promise<NaverNewsItem | null> {
  const clientId     = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const keywords = ['정육', '축산', '한우', '돼지고기'];
  for (const kw of keywords) {
    try {
      const q = encodeURIComponent(`${kw} 뉴스`);
      const res = await fetch(
        `https://openapi.naver.com/v1/search/news.json?query=${q}&display=1&sort=date`,
        {
          headers: {
            'X-Naver-Client-Id':     clientId,
            'X-Naver-Client-Secret': clientSecret,
          },
          signal: AbortSignal.timeout(5000),
        },
      );
      if (!res.ok) continue;
      const json = await res.json();
      const item = json.items?.[0];
      if (!item?.title) continue;
      return {
        title:       stripHtml(item.title       || ''),
        link:        item.link || item.originallink || '',
        pubDate:     item.pubDate || '',
        description: stripHtml(item.description || ''),
      };
    } catch { continue; }
  }
  return null;
}

// ── POST /api/admin/backfill-weather-news ─────────────────────────
// 기존 pos_bridge daily_reports에 weather/news 필드 채우기
// 권한: master만
export async function POST(req: Request) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { storeId } = body as { storeId?: string };
  if (!storeId) return NextResponse.json({ error: 'storeId is required' }, { status: 400 });

  const groupId = await getActualGroupId(user.uid, storeId);
  if (!isMasterGroup(groupId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // 매장 위치 조회
  const storeDoc = await adminDb.collection('stores').doc(storeId).get();
  const regionSido = storeDoc.exists ? (storeDoc.data() as any)?.regionSido : undefined;
  const coords = getStoreCoords(regionSido);

  // pos_bridge 문서에서 weather/news 중 null인 것 조회
  const snap = await adminDb
    .collection('daily_reports')
    .where('storeId', '==', storeId)
    .where('source', 'in', ['pos_bridge', 'pos_bridge_migration'])
    .get();

  if (snap.empty) {
    return NextResponse.json({ success: true, updated: 0, failed: 0, message: '대상 문서 없음' });
  }

  // 뉴스는 API 키 있을 때 1회만 조회 (날짜별 중복 호출 방지)
  let cachedNews: NaverNewsItem | null | undefined = undefined;

  let updated = 0;
  let failed  = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const needWeather = data.weather == null;
    const needNews    = data.news    == null;
    if (!needWeather && !needNews) continue;

    const date = data.reportDate as string;
    if (!date) continue;

    try {
      const updateData: Record<string, any> = {};

      if (needWeather) {
        const weather = await fetchWeather(date, coords);
        updateData.weather = weather ?? null;
      }

      if (needNews) {
        if (cachedNews === undefined) {
          cachedNews = await fetchNaverNews();
        }
        updateData.news = cachedNews ?? null;
      }

      if (Object.keys(updateData).length > 0) {
        await doc.ref.update(updateData);
        updated++;
      }
    } catch {
      failed++;
    }
  }

  return NextResponse.json({
    success: true,
    updated,
    failed,
    message: `${updated}건 업데이트, ${failed}건 실패`,
  });
}
