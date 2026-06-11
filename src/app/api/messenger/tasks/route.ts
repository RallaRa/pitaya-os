import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { ensureTasksChannel } from '@/lib/messenger/channels.server';
import {
  createMessengerTask,
  createTaskFromMessage,
  listMessengerTasks,
} from '@/lib/messenger/tasks.server';

export const dynamic = 'force-dynamic';

/** GET /api/messenger/tasks?storeId= */
export async function GET(req: Request) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const storeId = new URL(req.url).searchParams.get('storeId') || '';
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  try {
    const [tasks, tasksChannelId] = await Promise.all([
      listMessengerTasks(storeId),
      ensureTasksChannel(storeId).catch(() => null),
    ]);
    return NextResponse.json({ ok: true, tasks, tasksChannelId });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** POST /api/messenger/tasks — 생성 / 메시지→태스크 */
export async function POST(req: Request) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const storeId = String(body.storeId || '');
    if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

    const actor = { uid: user.uid, name: user.email || '사용자' };

    if (body.fromMessage) {
      const task = await createTaskFromMessage(
        storeId,
        {
          messageId: String(body.messageId || ''),
          roomId: String(body.roomId || ''),
          text: String(body.text || ''),
          assignee: body.assignee ? String(body.assignee) : undefined,
          assigneeName: body.assigneeName ? String(body.assigneeName) : undefined,
        },
        actor,
      );
      return NextResponse.json({ ok: true, task });
    }

    const title = String(body.title || '').trim();
    if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 });

    const task = await createMessengerTask(
      storeId,
      {
        title,
        description: body.description ? String(body.description) : '',
        status: body.status,
        assignee: body.assignee ? String(body.assignee) : '',
        assigneeName: body.assigneeName ? String(body.assigneeName) : '',
        dueDate: body.dueDate ? String(body.dueDate) : '',
        priority: body.priority,
      },
      actor,
    );
    return NextResponse.json({ ok: true, task });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
