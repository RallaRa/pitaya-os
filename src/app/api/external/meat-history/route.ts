import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { fetchMeatTraceByNo, isValidMeatTraceNo, normalizeMeatTraceNo } from '@/lib/meatTrace/fetchMeatTrace';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

function unauthorizedResponse(req: Request) {
  const hasBearer = req.headers.get('Authorization')?.startsWith('Bearer ');
  return NextResponse.json(
    {
      error: hasBearer
        ? '로그인 인증에 실패했습니다. 로그아웃 후 다시 로그인해 주세요.'
        : '로그인이 필요합니다.',
      code: hasBearer ? 'invalid_token' : 'missing_token',
    },
    { status: 401, headers: NO_STORE },
  );
}

async function lookupTrace(req: Request, rawTraceNo: string) {
  const authUser = await verifyToken(req);
  if (!authUser) return unauthorizedResponse(req);

  const traceNo = normalizeMeatTraceNo(rawTraceNo);

  if (!isValidMeatTraceNo(traceNo)) {
    return NextResponse.json(
      { error: '이력번호 12자리 이상을 입력해주세요 (숫자·영문 L 등 포함 가능)' },
      { status: 400, headers: NO_STORE },
    );
  }

  try {
    const result = await fetchMeatTraceByNo(traceNo);

    if (!result.found) {
      return NextResponse.json(
        {
          found: false,
          message: result.message || '조회된 이력정보가 없습니다.',
        },
        { headers: NO_STORE },
      );
    }

    return NextResponse.json(
      {
        found: true,
        traceNo: result.traceNo,
        cattleNo: result.traceNo,
        cattleType: result.cattleType,
        origin: result.origin,
        farmName: result.farmName,
        farmAddr: '',
        slaughterDate: result.slaughterDate,
        slaughterPlace: result.slaughterPlace,
        qgrade: result.qgrade,
        ygrade: result.ygrade,
        weight: result.weight,
        processPlaceNm: result.processPlaceNm,
        inspectPassDt: result.inspectPassDt,
        expiryDate: result.expiryDate || null,
        expirySourceField: result.expirySourceField || null,
        fetchedAt: result.fetchedAt,
      },
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=600' } },
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500, headers: NO_STORE });
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  return lookupTrace(req, searchParams.get('traceNo') || '');
}

export async function POST(req: Request) {
  let body: { traceNo?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers: NO_STORE });
  }
  return lookupTrace(req, body.traceNo || '');
}
