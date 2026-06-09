import { NextResponse } from 'next/server';
import { requireSuperuser } from '@/lib/devAuth';
import { createAgent, listAgents } from '@/lib/cursor/api';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  const auth = await requireSuperuser(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const data = await listAgents(50);
    return NextResponse.json({ agents: data.items || [] });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Cursor API 오류';
    return NextResponse.json({ error: msg, agents: [] }, { status: 503 });
  }
}

export async function POST(req: Request) {
  const auth = await requireSuperuser(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { text, name, modelId, mode, autoCreatePR } = await req.json();
    if (!text?.trim()) {
      return NextResponse.json({ error: 'prompt.text 필요' }, { status: 400 });
    }
    const result = await createAgent({
      text: text.trim(),
      name,
      modelId,
      mode,
      autoCreatePR,
    });
    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '에이전트 생성 실패';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
