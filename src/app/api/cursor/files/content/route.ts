import { NextResponse } from 'next/server';
import { requireSuperuser } from '@/lib/devAuth';
import { fetchFileContent } from '@/lib/cursor/github';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const auth = await requireSuperuser(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const path = new URL(req.url).searchParams.get('path');
  if (!path) return NextResponse.json({ error: 'path 필요' }, { status: 400 });

  try {
    const file = await fetchFileContent(path);
    return NextResponse.json({ path, ...file });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '파일 로드 실패';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
