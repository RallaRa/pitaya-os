import { NextResponse } from 'next/server';
import { requireSuperuser } from '@/lib/devAuth';
import { createRun, getRun } from '@/lib/cursor/api';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireSuperuser(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id: agentId } = await params;
  try {
    const { text, mode } = await req.json();
    if (!text?.trim()) {
      return NextResponse.json({ error: 'prompt.text 필요' }, { status: 400 });
    }
    const result = await createRun(agentId, text.trim(), mode);
    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'run 생성 실패';
    const status = msg.includes('409') || msg.includes('busy') ? 409 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireSuperuser(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id: agentId } = await params;
  const url = new URL(req.url);
  const runId = url.searchParams.get('runId');
  if (!runId) {
    return NextResponse.json({ error: 'runId query 필요' }, { status: 400 });
  }
  try {
    const run = await getRun(agentId, runId);
    return NextResponse.json({ run });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'run 조회 실패';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
