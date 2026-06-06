/**
 * 농림축산식품 공공데이터포털 — 가축질병발생정보
 * http://211.237.50.150:7080/openapi/{API_KEY}/json/Grid_20151204000000000316_1/{start}/{end}
 */

const BASE = 'http://211.237.50.150:7080/openapi';
const GRID = 'Grid_20151204000000000316_1';

export interface LivestockDiseaseRow {
  rowNum: number;
  outbreakNo: string;
  diseaseName: string;
  farmName: string;
  location: string;
  occurrenceDate: string;
  speciesCode: string;
  speciesName: string;
  livestockCount: number;
  diagnosisAgency: string;
  cessationDate: string;
}

export interface LivestockDiseaseResult {
  rows: LivestockDiseaseRow[];
  totalCount: number;
  fetchedAt: string;
  source: 'mafra';
}

function getMafraApiKey(): string {
  return (
    process.env.MAFRA_API_KEY?.trim()
    || process.env.LIVESTOCK_DIST_API_KEY?.trim()
    || ''
  );
}

function parseRow(raw: Record<string, unknown>): LivestockDiseaseRow {
  const ymd = String(raw.OCCRRNC_DE || '');
  const occurrenceDate = ymd.length === 8
    ? `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`
    : ymd;
  const cess = String(raw.CESSATION_DE || '');
  const cessationDate = cess.length === 8
    ? `${cess.slice(0, 4)}-${cess.slice(4, 6)}-${cess.slice(6, 8)}`
    : cess;

  return {
    rowNum: Number(raw.ROW_NUM || 0),
    outbreakNo: String(raw.ICTSD_OCCRRNC_NO || ''),
    diseaseName: String(raw.LKNTS_NM || ''),
    farmName: String(raw.FARM_NM || ''),
    location: String(raw.FARM_LOCPLC || ''),
    occurrenceDate,
    speciesCode: String(raw.LVSTCKSPC_CODE || ''),
    speciesName: String(raw.LVSTCKSPC_NM || ''),
    livestockCount: Number(raw.OCCRRNC_LVSTCKCNT || 0),
    diagnosisAgency: String(raw.DGNSS_ENGN_NM || ''),
    cessationDate,
  };
}

async function fetchPage(
  apiKey: string,
  start: number,
  end: number,
): Promise<{ totalCnt: number; rows: LivestockDiseaseRow[]; code: string; message: string }> {
  const url = `${BASE}/${encodeURIComponent(apiKey)}/json/${GRID}/${start}/${end}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(12000), cache: 'no-store' });
  if (!res.ok) throw new Error(`MAFRA HTTP ${res.status}`);

  const text = await res.text();
  if (text.includes('data.mafra.go.kr') && text.includes('location.href')) {
    throw new Error('MAFRA API 키가 유효하지 않습니다');
  }

  const json = JSON.parse(text) as Record<string, unknown>;
  const grid = json[GRID] as Record<string, unknown> | undefined;
  if (!grid) {
    const result = json.result as { code?: string; message?: string } | undefined;
    throw new Error(result?.message || 'MAFRA 응답 형식 오류');
  }

  const result = grid.result as { code?: string; message?: string } | undefined;
  const code = String(result?.code || '');
  if (code && code !== 'INFO-000') {
    throw new Error(String(result?.message || code));
  }

  const rawRows = grid.row;
  const list = Array.isArray(rawRows) ? rawRows : rawRows ? [rawRows] : [];

  return {
    totalCnt: Number(grid.totalCnt || 0),
    rows: list.map(r => parseRow(r as Record<string, unknown>)),
    code,
    message: String(result?.message || ''),
  };
}

/** 최근 발생 건 (목록 끝에서 limit건, daysBack 일 이내) */
export async function fetchRecentLivestockDisease(opts?: {
  limit?: number;
  daysBack?: number;
  regionKeyword?: string;
}): Promise<LivestockDiseaseResult> {
  const apiKey = getMafraApiKey();
  if (!apiKey) throw new Error('MAFRA_API_KEY 미설정');

  const limit = Math.min(Math.max(opts?.limit ?? 30, 1), 100);
  const daysBack = opts?.daysBack ?? 365;
  const regionKeyword = (opts?.regionKeyword || '').trim();

  const probe = await fetchPage(apiKey, 1, 1);
  const total = probe.totalCnt;
  if (total <= 0) {
    return { rows: [], totalCount: 0, fetchedAt: new Date().toISOString(), source: 'mafra' };
  }

  const start = Math.max(1, total - limit * 3 + 1);
  const page = await fetchPage(apiKey, start, total);

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysBack);
  const cutoffYmd = cutoff.toISOString().slice(0, 10);

  let rows = page.rows.filter(r => r.occurrenceDate && r.occurrenceDate >= cutoffYmd);
  if (regionKeyword) {
    rows = rows.filter(r => r.location.includes(regionKeyword));
  }

  rows.sort((a, b) => b.occurrenceDate.localeCompare(a.occurrenceDate));
  rows = rows.slice(0, limit);

  return {
    rows,
    totalCount: total,
    fetchedAt: new Date().toISOString(),
    source: 'mafra',
  };
}

export function summarizeLivestockDiseaseForAi(rows: LivestockDiseaseRow[]): string {
  if (!rows.length) return '최근 가축질병 발생 정보 없음';
  return rows.slice(0, 8).map(r =>
    `${r.occurrenceDate} ${r.diseaseName} (${r.speciesName}, ${r.location}, ${r.livestockCount}두)`,
  ).join('\n');
}
