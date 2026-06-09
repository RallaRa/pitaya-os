import { NextResponse } from 'next/server';
import { requireSuperuser } from '@/lib/devAuth';
import { getAgent } from '@/lib/cursor/api';

export const dynamic = 'force-dynamic';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireSuperuser(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  try {
    const agent = await getAgent(id);
    return NextResponse.json({ agent });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '조회 실패';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
