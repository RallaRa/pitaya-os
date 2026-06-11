import { adminDb } from '@/lib/firebase/admin';
import { FieldValue, type DocumentData } from 'firebase-admin/firestore';
import {
  ensureTasksChannel,
  postMessengerCard,
} from '@/lib/messenger/channels.server';
import type { MessengerTask, TaskInput, TaskStatus } from '@/lib/messenger/taskTypes';
import { TASK_STATUS_LABELS } from '@/lib/messenger/taskTypes';

const COL = 'tasks';

function tsToIso(v: unknown): string | undefined {
  if (!v) return undefined;
  if (typeof v === 'object' && v !== null && 'toDate' in v) {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  return String(v);
}

function taskFromSnap(id: string, data: DocumentData): MessengerTask {
  return {
    id,
    storeId: String(data.storeId || ''),
    title: String(data.title || ''),
    description: String(data.description || ''),
    status: (data.status || 'todo') as TaskStatus,
    assignee: String(data.assignee || ''),
    assigneeName: data.assigneeName ? String(data.assigneeName) : undefined,
    dueDate: String(data.dueDate || ''),
    priority: (data.priority || 'medium') as MessengerTask['priority'],
    sourceMessageId: data.sourceMessageId ? String(data.sourceMessageId) : undefined,
    sourceRoomId: data.sourceRoomId ? String(data.sourceRoomId) : undefined,
    createdBy: String(data.createdBy || ''),
    createdByName: data.createdByName ? String(data.createdByName) : undefined,
    createdAt: tsToIso(data.createdAt),
    updatedAt: tsToIso(data.updatedAt),
  };
}

export async function listMessengerTasks(storeId: string): Promise<MessengerTask[]> {
  const snap = await adminDb.collection(COL).where('storeId', '==', storeId).get();
  const order: TaskStatus[] = ['todo', 'in_progress', 'done', 'on_hold'];
  return snap.docs
    .map(d => taskFromSnap(d.id, d.data()))
    .sort((a, b) => {
      const si = order.indexOf(a.status) - order.indexOf(b.status);
      if (si !== 0) return si;
      return (a.dueDate || '9999').localeCompare(b.dueDate || '9999');
    });
}

export async function getMessengerTask(storeId: string, taskId: string): Promise<MessengerTask | null> {
  const snap = await adminDb.collection(COL).doc(taskId).get();
  if (!snap.exists) return null;
  const task = taskFromSnap(snap.id, snap.data()!);
  if (task.storeId !== storeId) return null;
  return task;
}

async function notifyTaskCompleted(task: MessengerTask, actorName: string) {
  try {
    const roomId = await ensureTasksChannel(task.storeId);
    await postMessengerCard({
      roomId,
      type: 'calendar_event',
      calendarKey: `task_done_${task.id}_${Date.now()}`,
      text: `✅ 태스크 완료: ${task.title}`,
      cardData: {
        title: `✅ 태스크 완료: ${task.title}`,
        subtitle: TASK_STATUS_LABELS.done,
        fields: [
          { label: '담당', value: task.assigneeName || task.assignee || '-' },
          { label: '처리', value: actorName },
        ],
        footer: task.description?.slice(0, 80) || '',
      },
    });
  } catch (e) {
    console.error('[tasks] notify complete:', e);
  }
}

export async function createMessengerTask(
  storeId: string,
  input: TaskInput,
  actor: { uid: string; name: string },
): Promise<MessengerTask> {
  const ref = adminDb.collection(COL).doc();
  const payload = {
    storeId,
    title: input.title.trim(),
    description: String(input.description || ''),
    status: input.status || 'todo',
    assignee: input.assignee || '',
    assigneeName: input.assigneeName || '',
    dueDate: input.dueDate || '',
    priority: input.priority || 'medium',
    sourceMessageId: input.sourceMessageId || null,
    sourceRoomId: input.sourceRoomId || null,
    createdBy: actor.uid,
    createdByName: actor.name,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  await ref.set(payload);
  const snap = await ref.get();
  return taskFromSnap(snap.id, snap.data()!);
}

export async function updateMessengerTask(
  storeId: string,
  taskId: string,
  input: Partial<TaskInput> & { status?: TaskStatus },
  actor: { uid: string; name: string },
): Promise<MessengerTask> {
  const existing = await getMessengerTask(storeId, taskId);
  if (!existing) throw new Error('태스크를 찾을 수 없습니다');

  const updates: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (input.title !== undefined) updates.title = input.title.trim();
  if (input.description !== undefined) updates.description = input.description;
  if (input.status !== undefined) updates.status = input.status;
  if (input.assignee !== undefined) updates.assignee = input.assignee;
  if (input.assigneeName !== undefined) updates.assigneeName = input.assigneeName;
  if (input.dueDate !== undefined) updates.dueDate = input.dueDate;
  if (input.priority !== undefined) updates.priority = input.priority;

  await adminDb.collection(COL).doc(taskId).update(updates);
  const updated = await getMessengerTask(storeId, taskId);
  if (!updated) throw new Error('업데이트 실패');

  if (existing.status !== 'done' && updated.status === 'done') {
    await notifyTaskCompleted(updated, actor.name);
  }
  return updated;
}

export async function deleteMessengerTask(storeId: string, taskId: string): Promise<void> {
  const existing = await getMessengerTask(storeId, taskId);
  if (!existing) throw new Error('태스크를 찾을 수 없습니다');
  await adminDb.collection(COL).doc(taskId).delete();
}

export async function createTaskFromMessage(
  storeId: string,
  params: {
    messageId: string;
    roomId: string;
    text: string;
    assignee?: string;
    assigneeName?: string;
  },
  actor: { uid: string; name: string },
): Promise<MessengerTask> {
  const title = params.text.trim().slice(0, 120) || '메시지에서 생성된 태스크';
  return createMessengerTask(
    storeId,
    {
      title,
      description: params.text,
      sourceMessageId: params.messageId,
      sourceRoomId: params.roomId,
      assignee: params.assignee,
      assigneeName: params.assigneeName,
    },
    actor,
  );
}
