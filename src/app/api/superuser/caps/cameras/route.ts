import { NextResponse } from 'next/server';
import { requireSuperuser } from '@/lib/devAuth';
import { getCapsConfig, listPublicCapsCameras, saveCapsConfig } from '@/lib/caps/capsConfig.server';
import type { CapsCamera } from '@/lib/caps/capsTypes';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const auth = await requireSuperuser(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const data = await listPublicCapsCameras();
  const full = await getCapsConfig();

  return NextResponse.json({
    ...data,
    /** 설정 편집용 — streamUrl 포함 (슈퍼유저만) */
    camerasFull: full.cameras,
  });
}

export async function PUT(req: Request) {
  const auth = await requireSuperuser(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await req.json();
    const cameras = (Array.isArray(body.cameras) ? body.cameras : []) as CapsCamera[];
    const capsliveUrl = body.capsliveUrl ? String(body.capsliveUrl) : undefined;

    const saved = await saveCapsConfig({
      cameras,
      capsliveUrl,
      uid: auth.user!.uid,
    });

    return NextResponse.json({ success: true, ...saved });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '저장 실패';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
