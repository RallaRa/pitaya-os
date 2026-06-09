import { NextResponse } from 'next/server';
import { requireSuperuser } from '@/lib/devAuth';
import { fetchRepoTree } from '@/lib/cursor/github';

export const dynamic = 'force-dynamic';
export const revalidate = 60;

export async function GET(req: Request) {
  const auth = await requireSuperuser(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const tree = await fetchRepoTree();
    return NextResponse.json({ tree, repo: 'RallaRa/pitaya-os', branch: 'main' });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '파일 트리 로드 실패';
    return NextResponse.json({ error: msg, tree: [] }, { status: 503 });
  }
}
