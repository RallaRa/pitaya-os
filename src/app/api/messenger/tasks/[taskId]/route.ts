import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import {
  deleteMessengerTask,
  getMessengerTask,
  updateMessengerTask,
} from '@/lib/messenger/tasks.server';
import type { TaskStatus } from '@/lib/messenger/taskTypes';

export const dynamic = 'force-dynamic';

type RouteCtx = { params: Promise<{ taskId: string }> };

/** GET /api/messenger/tasks/[taskId]?storeId= */
export async function GET(req: Request, ctx: RouteCtx) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { taskId } = await ctx.params;
  const storeId = new URL(req.url).searchParams.get('storeId') || '';
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  try {
    const task = await getMessengerTask(storeId, taskId);
    if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ ok: true, task });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** PUT /api/messenger/tasks/[taskId] */
export async function PUT(req: Request, ctx: RouteCtx) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { taskId } = await ctx.params;
  try {
    const body = await req.json();
    const storeId = String(body.storeId || '');
    if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

    const task = await updateMessengerTask(
      storeId,
      taskId,
      {
        title: body.title,
        description: body.description,
        status: body.status as TaskStatus | undefined,
        assignee: body.assignee,
        assigneeName: body.assigneeName,
        dueDate: body.dueDate,
        priority: body.priority,
      },
      { uid: user.uid, name: user.email || '사용자' },
    );
    return NextResponse.json({ ok: true, task });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** DELETE /api/messenger/tasks/[taskId]?storeId= */
export async function DELETE(req: Request, ctx: RouteCtx) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { taskId } = await ctx.params;
  const storeId = new URL(req.url).searchParams.get('storeId') || '';
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  try {
    await deleteMessengerTask(storeId, taskId);
    return NextResponse.json({ ok: true, taskId });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
