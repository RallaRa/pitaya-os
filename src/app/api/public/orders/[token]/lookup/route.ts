import { NextResponse } from 'next/server';

/** 손님용 주문 내역 조회는 제공하지 않습니다 (매장 직원만 대시보드에서 확인). */
export async function POST() {
  return NextResponse.json(
    { error: '주문 내역은 매장에서만 확인할 수 있습니다' },
    { status: 403 },
  );
}
