import { NextResponse } from 'next/server';
import { requireSuperuser } from '@/lib/devAuth';
import { listModels } from '@/lib/cursor/api';

export const dynamic = 'force-dynamic';

const FALLBACK_MODELS = [
  { id: 'composer-2.5', name: 'Composer 2.5' },
  { id: 'claude-4.6-sonnet-medium-thinking', name: 'Claude 4.6 Sonnet' },
  { id: 'auto', name: 'Auto' },
];

export async function GET(req: Request) {
  const auth = await requireSuperuser(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const data = await listModels();
    const models = data.items || data.models || FALLBACK_MODELS;
    return NextResponse.json({ models });
  } catch {
    return NextResponse.json({ models: FALLBACK_MODELS });
  }
}
