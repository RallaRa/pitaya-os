import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { fetchMeatTraceByNo } from '@/lib/meatTrace/fetchMeatTrace';

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const traceNo = searchParams.get('traceNo')?.replace(/\D/g, '');

  if (!traceNo || traceNo.length < 12) {
    return NextResponse.json(
      { error: '이력번호 12자리를 입력해주세요 (예: ?traceNo=123456789012)' },
      { status: 400 },
    );
  }

  try {
    const result = await fetchMeatTraceByNo(traceNo);

    if (!result.found) {
      return NextResponse.json({
        found: false,
        message: result.message || '조회된 이력정보가 없습니다.',
      });
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
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
