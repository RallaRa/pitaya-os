import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { requireSuperuser } from '@/lib/devAuth';
import {
  DEFAULT_DEV_CONTEXT,
  DEV_CONTEXT_DOC_ID,
  type DevContext,
} from '@/lib/devContext';

const ref = () => adminDb.collection('dev_context').doc(DEV_CONTEXT_DOC_ID);

export async function GET(req: Request) {
  const auth = await requireSuperuser(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const snap = await ref().get();
  if (!snap.exists) {
    const initial = { ...DEFAULT_DEV_CONTEXT, lastUpdated: new Date().toISOString() };
    await ref().set(initial);
    return NextResponse.json({ context: initial });
  }
  return NextResponse.json({ context: snap.data() as DevContext });
}

export async function POST(req: Request) {
  const auth = await requireSuperuser(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await req.json();
    const { context, action, taskId, task, decision } = body;

    const snap = await ref().get();
    let data: DevContext = snap.exists
      ? (snap.data() as DevContext)
      : { ...DEFAULT_DEV_CONTEXT };

    if (action === 'completeTask' && taskId) {
      const all = [...data.currentTasks, ...data.pendingTasks];
      const found = all.find(t => t.id === taskId);
      if (found) {
        data.currentTasks = data.currentTasks.filter(t => t.id !== taskId);
        data.pendingTasks = data.pendingTasks.filter(t => t.id !== taskId);
        data.completedTasks = [{ ...found, status: 'done' as const }, ...data.completedTasks].slice(0, 50);
      }
    } else if (action === 'addTask' && task?.title) {
      const newTask = {
        id: `t_${Date.now()}`,
        title: task.title,
        detail: task.detail?.trim() || undefined,
        status: 'open' as const,
        priority: (task.priority || 'pending') as 'urgent' | 'in_progress' | 'pending',
        createdAt: new Date().toISOString(),
      };
      if (newTask.priority === 'urgent' || newTask.priority === 'in_progress') {
        data.currentTasks = [newTask, ...data.currentTasks];
      } else {
        data.pendingTasks = [newTask, ...data.pendingTasks];
      }
    } else if (action === 'addDecision' && decision) {
      data.recentDecisions = [
        { date: new Date().toISOString().slice(0, 10), decision, reason: body.reason },
        ...data.recentDecisions,
      ].slice(0, 20);
    } else if (context) {
      data = { ...data, ...context };
    }

    data.lastUpdated = new Date().toISOString();
    await ref().set({ ...data, lastUpdated: FieldValue.serverTimestamp() }, { merge: true });

    return NextResponse.json({ ok: true, context: data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
