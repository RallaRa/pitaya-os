/**
 * 축산물 이력 API (공공데이터 MeatTraceInfoService)
 * — 유통기한 필드 추출·매입·알림 모듈에서 공통 사용
 */

const API_KEY = process.env.PUBLIC_DATA_API_KEY;
const BASE = 'http://apis.data.go.kr/1390802/MeatTraceInfoService';

/** API 응답에서 유통기한으로 쓸 수 있는 필드명 (우선순위 순) */
const EXPIRY_FIELD_KEYS = [
  'distbTmlmt',
  'distbTmlmtDt',
  'distbTmlmtYmd',
  'consumeDt',
  'consumeYmd',
  'consumeDate',
  'validityYmd',
  'validityDt',
  'shelfLifeDt',
  'shelfLifeYmd',
  'limitDt',
  'limitYmd',
  'expirationDt',
  'expirationYmd',
  '유통기한',
  '소비기한',
] as const;

export interface MeatTraceLookupResult {
  found: boolean;
  traceNo: string;
  cattleType?: string;
  origin?: string;
  farmName?: string;
  slaughterDate?: string;
  slaughterPlace?: string;
  qgrade?: string;
  ygrade?: string;
  weight?: string;
  processPlaceNm?: string;
  inspectPassDt?: string;
  /** YYYY-MM-DD */
  expiryDate?: string;
  expirySourceField?: string;
  message?: string;
  fetchedAt: string;
}

function ymdFromRaw(raw: unknown): string | null {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim();
  if (!s) return null;

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const digits = s.replace(/\D/g, '');
  if (digits.length === 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  }
  if (digits.length === 6) {
    const yy = Number(digits.slice(0, 2));
    const year = yy >= 70 ? 1900 + yy : 2000 + yy;
    return `${year}-${digits.slice(2, 4)}-${digits.slice(4, 6)}`;
  }
  return null;
}

export function extractExpiryDateFromRecords(
  records: Record<string, unknown>[],
): { expiryDate: string; field: string } | null {
  for (const key of EXPIRY_FIELD_KEYS) {
    for (const rec of records) {
      if (rec[key] == null || rec[key] === '') continue;
      const ymd = ymdFromRaw(rec[key]);
      if (ymd) return { expiryDate: ymd, field: key };
    }
  }

  for (const rec of records) {
    for (const [k, v] of Object.entries(rec)) {
      if (!/유통|소비|만료|consume|distb|valid|limit|shelf|expir/i.test(k)) continue;
      const ymd = ymdFromRaw(v);
      if (ymd) return { expiryDate: ymd, field: k };
    }
  }
  return null;
}

async function fetchXml(endpoint: string, extra: Record<string, string>): Promise<Record<string, unknown>[]> {
  if (!API_KEY) throw new Error('PUBLIC_DATA_API_KEY 미설정');

  const params = new URLSearchParams({
    serviceKey: API_KEY,
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
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return list as Record<string, unknown>[];
}

const TRACE_ENDPOINTS = [
  { endpoint: 'getMeatTraceInfoList', param: 'meatTraceNo' },
  { endpoint: 'getGradeInfoListIndi', param: 'meatTraceNo' },
  { endpoint: 'getDistbInfoList', param: 'meatTraceNo' },
  { endpoint: 'getProcessInfoList', param: 'meatTraceNo' },
  { endpoint: 'getCattleDistbInfoList', param: 'cattleNo' },
] as const;

export async function fetchMeatTraceByNo(traceNo: string): Promise<MeatTraceLookupResult> {
  const normalized = traceNo.replace(/\D/g, '');
  const fetchedAt = new Date().toISOString();

  if (!normalized || normalized.length < 12) {
    return { found: false, traceNo: normalized, message: '이력번호 12자리 이상 필요', fetchedAt };
  }

  if (!API_KEY) {
    return { found: false, traceNo: normalized, message: 'PUBLIC_DATA_API_KEY 미설정', fetchedAt };
  }

  const allRecords: Record<string, unknown>[] = [];
  const results = await Promise.allSettled(
    TRACE_ENDPOINTS.map(({ endpoint, param }) =>
      fetchXml(endpoint, { [param]: normalized }),
    ),
  );

  for (const r of results) {
    if (r.status === 'fulfilled') allRecords.push(...r.value);
  }

  if (allRecords.length === 0) {
    return { found: false, traceNo: normalized, message: '조회된 이력정보가 없습니다.', fetchedAt };
  }

  const trace = allRecords[0] || {};
  const grade = allRecords.find(r => r.qgradeNm || r.qgrade || r.gradeNo) || allRecords[1] || {};
  const expiry = extractExpiryDateFromRecords(allRecords);

  return {
    found: true,
    traceNo: normalized,
    cattleType: String(trace.lsTypeNm || trace.cattleTypeNm || ''),
    origin: String(trace.nationNm || trace.birthPlaceNm || ''),
    farmName: String(trace.farmNm || trace.breedFarmNm || ''),
    slaughterDate: String(trace.slaughterDt || trace.butcheryDt || trace.butcheryYmd || ''),
    slaughterPlace: String(trace.butcheryPlaceNm || trace.slaughterPlaceNm || ''),
    qgrade: String(grade.qgradeNm || grade.qgrade || ''),
    ygrade: String(grade.ygradeNm || grade.ygrade || ''),
    weight: String(grade.carcassWt || grade.weight || ''),
    processPlaceNm: String(trace.processPlaceNm || ''),
    inspectPassDt: String(trace.inspectPassDt || ''),
    expiryDate: expiry?.expiryDate,
    expirySourceField: expiry?.field,
    fetchedAt,
  };
}
