import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireSuperuser } from '@/lib/devAuth';
import {
  DEFAULT_DEV_CONTEXT,
  DEV_CONTEXT_DOC_ID,
  type DevContext,
} from '@/lib/devContext';
import { buildQueueMarkdown, QUEUE_PATH } from '@/lib/devQueue/buildQueueMd';
import { commitQueueFile, queueFileUrl } from '@/lib/devQueue/githubQueueSync';

export const dynamic = 'force-dynamic';

const ref = () => adminDb.collection('dev_context').doc(DEV_CONTEXT_DOC_ID);

async function loadContext(): Promise<DevContext> {
  const snap = await ref().get();
  return snap.exists ? (snap.data() as DevContext) : { ...DEFAULT_DEV_CONTEXT };
}

export async function GET(req: Request) {
  const auth = await requireSuperuser(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const ctx = await loadContext();
  const syncedAt = new Date().toISOString();
  const markdown = buildQueueMarkdown(ctx, syncedAt);

  return NextResponse.json({
    markdown,
    path: QUEUE_PATH,
    githubUrl: queueFileUrl(QUEUE_PATH),
    pendingCount:
      ctx.currentTasks.filter(t => t.status === 'open').length +
      ctx.pendingTasks.filter(t => t.status === 'open').length,
  });
}

export async function POST(req: Request) {
  const auth = await requireSuperuser(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  if (!process.env.GITHUB_TOKEN) {
    return NextResponse.json({
      error: 'GITHUB_TOKEN 미설정 — Vercel 환경변수에 추가 필요',
    }, { status: 503 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const message = body.message || 'chore: sync dev queue from Pitaya';

    const ctx = await loadContext();
    const syncedAt = new Date().toISOString();
    const markdown = buildQueueMarkdown(ctx, syncedAt);

    const result = await commitQueueFile(QUEUE_PATH, markdown, message);

    return NextResponse.json({
      ok: true,
      path: QUEUE_PATH,
      sha: result.commit?.sha?.slice(0, 7),
      githubUrl: queueFileUrl(QUEUE_PATH),
      syncedAt,
      message: 'queue.md GitHub 동기화 완료. Mac에서 git pull 후 Cursor Auto 실행.',
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '동기화 실패';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
