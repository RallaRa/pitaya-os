import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';

const API_KEY  = process.env.PUBLIC_DATA_API_KEY;
const BASE     = 'http://apis.data.go.kr/1390802/MeatTraceInfoService';

function yyyymmdd(date: Date) {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
}

async function fetchXml(endpoint: string, extra: Record<string, string>) {
  const params = new URLSearchParams({
    serviceKey: API_KEY!,
    numOfRows: '10',
    pageNo: '1',
    resultType: 'json',
    ...extra,
  });
  const res = await fetch(`${BASE}/${endpoint}?${params}`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const raw = json?.response?.body?.items?.item;
  return Array.isArray(raw) ? raw : raw ? [raw] : [];
}

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!API_KEY) {
    return NextResponse.json({ error: 'PUBLIC_DATA_API_KEY 미설정' }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const traceNo = searchParams.get('traceNo')?.replace(/\D/g, ''); // 숫자만 추출

  if (!traceNo || traceNo.length < 12) {
    return NextResponse.json(
      { error: '이력번호 12자리를 입력해주세요 (예: ?traceNo=123456789012)' },
      { status: 400 }
    );
  }

  try {
    // 1. 이력정보 (도축·농장 기본)
    const [traceItems, gradeItems] = await Promise.allSettled([
      fetchXml('getMeatTraceInfoList',  { meatTraceNo: traceNo }),
      fetchXml('getGradeInfoListIndi',  { meatTraceNo: traceNo }),
    ]);

    const trace = traceItems.status === 'fulfilled' ? traceItems.value : [];
    const grade = gradeItems.status === 'fulfilled' ? gradeItems.value : [];

    if (trace.length === 0 && grade.length === 0) {
      return NextResponse.json({ found: false, message: '조회된 이력정보가 없습니다.' });
    }

    const t = trace[0] || {};
    const g = grade[0] || {};

    const result = {
      found:      true,
      traceNo,
      /* 원산지·축종 */
      cattleNo:    t.cattleNo    || t.meatTraceNo || traceNo,
      cattleType:  t.lsTypeNm   || t.cattleTypeNm || '',
      origin:      t.nationNm   || t.birthPlaceNm || '',
      farmName:    t.farmNm     || t.breedFarmNm  || '',
      farmAddr:    t.farmAddr   || '',
      /* 도축 */
      slaughterDate: t.slaughterDt  || t.butcheryDt  || '',
      slaughterPlace: t.butcheryPlaceNm || t.slaughterPlaceNm || '',
      /* 등급 */
      gradeNo:    g.gradeNo     || '',
      gradeDatetime: g.gradeDt  || '',
      qgrade:     g.qgradeNm   || g.qgrade       || '',   // 육질등급 (1++, 1+, 1, 2, 3)
      ygrade:     g.ygradeNm   || g.ygrade       || '',   // 육량등급 (A, B, C)
      weight:     g.carcassWt  || g.weight       || '',   // 도체중(kg)
      /* 판매 */
      processPlaceNm: t.processPlaceNm || '',
      inspectPassDt:  t.inspectPassDt  || '',
    };

    return NextResponse.json(
      { ...result, fetchedAt: new Date().toISOString() },
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=600' } }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
