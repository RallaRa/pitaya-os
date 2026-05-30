/** 상권·유동인구 컨텍스트 (공공데이터 + 지역 추정) */

const SIGUNGU_CODES: Record<string, string> = {
  '강서구': '11500', '강남구': '11680', '강동구': '11740', '강북구': '11305',
  '관악구': '11620', '광진구': '11215', '구로구': '11530', '금천구': '11545',
  '노원구': '11350', '도봉구': '11320', '동대문구': '11230', '동작구': '11590',
  '마포구': '11440', '서대문구': '11410', '서초구': '11650', '성동구': '11200',
  '성북구': '11290', '송파구': '11710', '양천구': '11470', '영등포구': '11560',
  '용산구': '11170', '은평구': '11380', '종로구': '11110', '중구': '11140', '중랑구': '11260',
};

const REGION_FOOT_INDEX: Record<string, number> = {
  '서울': 100, '서울특별시': 100,
  '부산': 72, '부산광역시': 72,
  '대구': 65, '대구광역시': 65,
  '인천': 70, '인천광역시': 70,
  '광주': 58, '광주광역시': 58,
  '대전': 60, '대전광역시': 60,
  '울산': 55, '울산광역시': 55,
  '경기': 85, '경기도': 85,
  '세종': 50, '세종특별자치시': 50,
};

const DOW_FACTOR = [0.85, 0.72, 0.75, 0.78, 0.82, 1.15, 1.25]; // 일~토

export interface FootTrafficContext {
  region: string;
  index: number;
  level: '높음' | '보통' | '낮음';
  dayOfWeek: string;
  summary: string;
  source: 'estimate' | 'api';
}

export interface CommercialAreaContext {
  region: string;
  storeDensity: string;
  businessSummary: string;
  competitiveLevel: '높음' | '보통' | '낮음';
  source: 'api' | 'estimate';
}

function stripHtml(s: string) {
  return s.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').trim();
}

export function estimateFootTraffic(regionSido: string, regionSigungu: string): FootTrafficContext {
  const now = new Date();
  const dow = now.getDay();
  const hour = now.getHours();
  const base = REGION_FOOT_INDEX[regionSido] || REGION_FOOT_INDEX[Object.keys(REGION_FOOT_INDEX).find(k => regionSido.startsWith(k)) || ''] || 60;
  const dowFactor = DOW_FACTOR[dow];
  const hourFactor = hour >= 10 && hour <= 20 ? 1.1 : hour >= 7 && hour < 10 ? 0.85 : 0.65;
  const index = Math.round(base * dowFactor * hourFactor);
  const level = index >= 90 ? '높음' : index >= 65 ? '보통' : '낮음';
  const DOW = ['일', '월', '화', '수', '목', '금', '토'];

  return {
    region: `${regionSido} ${regionSigungu}`.trim(),
    index,
    level,
    dayOfWeek: DOW[dow],
    summary: `${regionSigungu || regionSido} ${DOW[dow]}요일 ${hour}시 기준 유동지수 ${index} (${level}). ${dow === 0 || dow === 6 ? '주말·휴일 유입 증가 구간' : '평일 점심·저녁 피크 전후'}`,
    source: 'estimate',
  };
}

export async function fetchCommercialArea(
  regionSido: string,
  regionSigungu: string,
): Promise<CommercialAreaContext> {
  const apiKey = process.env.PUBLIC_DATA_API_KEY || '';
  const code = SIGUNGU_CODES[regionSigungu];

  if (apiKey && code) {
    try {
      const url =
        `http://apis.data.go.kr/B553077/api/open/sd/storeList` +
        `?serviceKey=${encodeURIComponent(apiKey)}` +
        `&divId=signguCd&key=${code}&type=json&numOfRows=5&pageNo=1`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      const text = await res.text();
      if (res.ok && text.includes('{')) {
        const json = JSON.parse(text);
        const items = json?.body?.items || json?.response?.body?.items?.item || [];
        const list = Array.isArray(items) ? items : items ? [items] : [];
        if (list.length > 0) {
          const names = list.slice(0, 3).map((i: { bizesNm?: string; indsLclsNm?: string }) =>
            i.bizesNm || i.indsLclsNm || '상가',
          ).join(', ');
          return {
            region: `${regionSido} ${regionSigungu}`,
            storeDensity: `${regionSigungu} 상권 활성`,
            businessSummary: `인근 상가 ${list.length}건+ (${names} 등). 정육·식품 유통 밀집 상권`,
            competitiveLevel: list.length >= 4 ? '높음' : list.length >= 2 ? '보통' : '낮음',
            source: 'api',
          };
        }
      }
    } catch { /* fallback */ }
  }

  const isMetro = /서울|부산|대구|인천|광주|대전|울산|경기/.test(regionSido);
  return {
    region: `${regionSido} ${regionSigungu}`.trim(),
    storeDensity: isMetro ? '도심 상권' : '지역 상권',
    businessSummary: `${regionSigungu || regionSido} 식품·정육 유통 밀집 추정. 동네 단골·배달 수요 혼재`,
    competitiveLevel: isMetro ? '높음' : '보통',
    source: 'estimate',
  };
}

export async function fetchNaverNewsHeadlines(limit = 6) {
  const id = process.env.NAVER_CLIENT_ID;
  const sec = process.env.NAVER_CLIENT_SECRET;
  if (!id || !sec) return [];

  const kws = ['정육', '한우', '돼지고기', '축산물'];
  const news: { keyword: string; title: string; description: string }[] = [];

  await Promise.allSettled(kws.map(async kw => {
    try {
      const q = encodeURIComponent(kw);
      const r = await fetch(`https://openapi.naver.com/v1/search/news.json?query=${q}&display=2&sort=date`, {
        headers: { 'X-Naver-Client-Id': id, 'X-Naver-Client-Secret': sec },
        signal: AbortSignal.timeout(5000),
      });
      const j = await r.json();
      (j.items || []).forEach((item: { title?: string; description?: string }) => {
        news.push({
          keyword: kw,
          title: stripHtml(item.title || ''),
          description: stripHtml(item.description || '').slice(0, 80),
        });
      });
    } catch { /* ignore */ }
  }));

  return news.slice(0, limit);
}
