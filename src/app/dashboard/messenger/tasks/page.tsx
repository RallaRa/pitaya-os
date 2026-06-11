'use client';

import { overlay } from '@/components/overlay';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Kanban, LayoutGrid, Link2, Loader2, MessageCircle, Plus, Trash2,
} from 'lucide-react';
import {
  DragDropContext, Droppable, Draggable, type DropResult,
} from '@hello-pangea/dnd';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useAuth } from '@/context/AuthContext';
import { useStore } from '@/context/StoreContext';
import { db } from '@/lib/firebase/firebase';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import { useIsMobileView } from '@/hooks/useIsMobileView';
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  type MessengerTask,
  type TaskPriority,
  type TaskStatus,
} from '@/lib/messenger/taskTypes';

interface UserProfile { uid: string; name: string; email: string; }

const PRIORITY_COLOR: Record<TaskPriority, string> = {
  high: 'border-red-500/50 text-red-300',
  medium: 'border-amber-500/40 text-amber-200',
  low: 'border-slate-600 text-slate-400',
};

type AssigneeFilter = 'all' | 'mine';

export default function MessengerTasksPage() {
  const { user } = useAuth();
  const { currentStore } = useStore();
  const storeId = currentStore?.storeId || '';
  const isMobile = useIsMobileView();
  const [mobileColumn, setMobileColumn] = useState<TaskStatus>('todo');

  const [tasks, setTasks] = useState<MessengerTask[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [tasksChannelId, setTasksChannelId] = useState<string | null>(null);
  const [assigneeFilter, setAssigneeFilter] = useState<AssigneeFilter>('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: '',
    description: '',
    status: 'todo' as TaskStatus,
    assignee: '',
    dueDate: '',
    priority: 'medium' as TaskPriority,
  });

  useEffect(() => {
    if (!storeId) { setLoading(false); return; }
    const q = query(collection(db, 'tasks'), where('storeId', '==', storeId));
    const unsub = onSnapshot(q, snap => {
      const rows = snap.docs.map(d => ({ id: d.id, ...d.data() } as MessengerTask));
      const order: TaskStatus[] = ['todo', 'in_progress', 'done', 'on_hold'];
      rows.sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
      setTasks(rows);
      setLoading(false);
    });
    return () => unsub();
  }, [storeId]);

  useEffect(() => {
    if (!storeId || !user) return;
    getAuthJsonHeaders()
      .then(async headers => {
        const [usersRes, tasksRes] = await Promise.all([
          fetch(`/api/users?storeId=${encodeURIComponent(storeId)}`, { headers }),
          fetch(`/api/messenger/tasks?storeId=${encodeURIComponent(storeId)}`, { headers }),
        ]);
        const usersData = await usersRes.json();
        const tasksData = await tasksRes.json();
        setUsers(usersData.users || []);
        if (tasksData.tasksChannelId) setTasksChannelId(tasksData.tasksChannelId);
      })
      .catch(() => {});
  }, [storeId, user]);

  const visibleTasks = useMemo(() => {
    if (assigneeFilter === 'mine' && user?.uid) {
      return tasks.filter(t => t.assignee === user.uid || t.createdBy === user.uid);
    }
    return tasks;
  }, [tasks, assigneeFilter, user?.uid]);

  const tasksByStatus = useMemo(() => {
    const map: Record<TaskStatus, MessengerTask[]> = {
      todo: [], in_progress: [], done: [], on_hold: [],
    };
    for (const t of visibleTasks) {
      const st = TASK_STATUSES.includes(t.status) ? t.status : 'todo';
      map[st].push(t);
    }
    return map;
  }, [visibleTasks]);

  const resetForm = async () => {
    setForm({ title: '', description: '', status: 'todo', assignee: '', dueDate: '', priority: 'medium' });
    setEditId(null);
    setShowForm(false);
  };

  const openEdit = (task: MessengerTask) => {
    setEditId(task.id);
    setForm({
      title: task.title,
      description: task.description,
      status: task.status,
      assignee: task.assignee,
      dueDate: task.dueDate,
      priority: task.priority,
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!storeId || !form.title.trim()) return;
    setSaving(true);
    try {
      const headers = await getAuthJsonHeaders();
      const assigneeUser = users.find(u => u.uid === form.assignee);
      const payload = {
        storeId,
        ...form,
        assigneeName: assigneeUser?.name || assigneeUser?.email || '',
      };
      const url = editId ? `/api/messenger/tasks/${editId}` : '/api/messenger/tasks';
      const res = await fetch(url, {
        method: editId ? 'PUT' : 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      resetForm();
    } catch (e: unknown) {
      await overlay.alert(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (taskId: string) => {
    if (!storeId || !(await overlay.confirm('태스크를 삭제할까요?'))) return;
    const headers = await getAuthJsonHeaders();
    await fetch(`/api/messenger/tasks/${taskId}?storeId=${encodeURIComponent(storeId)}`, {
      method: 'DELETE',
      headers,
    });
  };

  const onDragEnd = useCallback(async (result: DropResult) => {
    if (!result.destination || !storeId) return;
    const taskId = result.draggableId;
    const newStatus = result.destination.droppableId as TaskStatus;
    const task = tasks.find(t => t.id === taskId);
    if (!task || task.status === newStatus) return;

    const headers = await getAuthJsonHeaders();
    await fetch(`/api/messenger/tasks/${taskId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ storeId, status: newStatus }),
    });
  }, [storeId, tasks]);

  return (
    <div className="flex flex-col h-[calc(100dvh-4rem-2.5rem)] min-h-0 bg-slate-950 text-slate-200">
      <header className="shrink-0 px-4 py-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Kanban className="w-5 h-5 text-teal-400" />
          <div>
            <h1 className="text-sm font-semibold text-slate-100">업무 칸반</h1>
            <p className="text-[10px] text-slate-500">드래그 이동 · 완료 시 업무태스크 채널 알림</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={assigneeFilter}
            onChange={e => setAssigneeFilter(e.target.value as AssigneeFilter)}
            className="px-2.5 py-2 text-xs bg-slate-950 border border-slate-700 rounded-lg touch-target"
          >
            <option value="all">전체 태스크</option>
            <option value="mine">내 태스크</option>
          </select>
          {tasksChannelId && (
            <Link
              href={`/dashboard/messenger?roomId=${encodeURIComponent(tasksChannelId)}`}
              className="px-2.5 py-1.5 text-xs bg-slate-800 border border-slate-700 rounded-lg hover:border-teal-500 inline-flex items-center gap-1"
            >
              <MessageCircle className="w-3.5 h-3.5" /> 업무태스크 채널
            </Link>
          )}
          <button
            type="button"
            onClick={() => { resetForm(); setShowForm(true); }}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs bg-teal-600 rounded-lg hover:bg-teal-500"
          >
            <Plus className="w-3.5 h-3.5" /> 새 태스크
          </button>
        </div>
      </header>

      <div className="shrink-0 px-4 py-2 border-b border-slate-800/80 bg-slate-900/40 flex flex-wrap gap-3 text-xs text-slate-400">
        <span className="inline-flex items-center gap-1 text-teal-400">
          <LayoutGrid className="w-3.5 h-3.5" />
          {visibleTasks.length}건
        </span>
        <span>할일 {tasksByStatus.todo.length}</span>
        <span>진행 {tasksByStatus.in_progress.length}</span>
        <span>완료 {tasksByStatus.done.length}</span>
        <span>보류 {tasksByStatus.on_hold.length}</span>
      </div>

      {showForm && (
        <div className="shrink-0 border-b border-slate-800 bg-slate-900/80 p-4 grid grid-cols-1 md:grid-cols-6 gap-2">
          <input
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="제목"
            className="md:col-span-2 px-3 py-2 text-sm bg-slate-950 border border-slate-700 rounded-lg"
          />
          <select
            value={form.status}
            onChange={e => setForm(f => ({ ...f, status: e.target.value as TaskStatus }))}
            className="px-2 py-2 text-sm bg-slate-950 border border-slate-700 rounded-lg"
          >
            {TASK_STATUSES.map(s => <option key={s} value={s}>{TASK_STATUS_LABELS[s]}</option>)}
          </select>
          <select
            value={form.assignee}
            onChange={e => setForm(f => ({ ...f, assignee: e.target.value }))}
            className="px-2 py-2 text-sm bg-slate-950 border border-slate-700 rounded-lg"
          >
            <option value="">담당자</option>
            {users.map(u => <option key={u.uid} value={u.uid}>{u.name || u.email}</option>)}
          </select>
          <input
            type="date"
            value={form.dueDate}
            onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
            className="px-2 py-2 text-sm bg-slate-950 border border-slate-700 rounded-lg"
          />
          <select
            value={form.priority}
            onChange={e => setForm(f => ({ ...f, priority: e.target.value as TaskPriority }))}
            className="px-2 py-2 text-sm bg-slate-950 border border-slate-700 rounded-lg"
          >
            {TASK_PRIORITIES.map(p => <option key={p} value={p}>{TASK_PRIORITY_LABELS[p]}</option>)}
          </select>
          <textarea
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="설명"
            rows={1}
            className="md:col-span-6 px-3 py-2 text-sm bg-slate-950 border border-slate-700 rounded-lg resize-none"
          />
          <div className="md:col-span-6 flex gap-2 justify-end">
            <button type="button" onClick={resetForm} className="px-3 py-1.5 text-sm rounded-lg hover:bg-slate-800">취소</button>
            <button type="button" onClick={handleSave} disabled={saving} className="px-3 py-1.5 text-sm bg-teal-600 rounded-lg disabled:opacity-50">
              {saving ? '저장 중…' : '저장'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
        </div>
      ) : isMobile ? (
        <>
          <div className="shrink-0 px-3 py-2 border-b border-slate-800/80 flex gap-1 overflow-x-auto scrollbar-thin-x">
            {TASK_STATUSES.map(status => (
              <button
                key={status}
                type="button"
                onClick={() => setMobileColumn(status)}
                className={`shrink-0 px-3 py-2 rounded-lg text-xs font-medium touch-target whitespace-nowrap ${
                  mobileColumn === status
                    ? 'bg-teal-600/25 text-teal-300 border border-teal-500/30'
                    : 'bg-slate-900 text-slate-400 border border-slate-800'
                }`}
              >
                {TASK_STATUS_LABELS[status]} ({tasksByStatus[status].length})
              </button>
            ))}
          </div>
          <DragDropContext onDragEnd={onDragEnd}>
            <div className="flex-1 overflow-y-auto p-3 min-h-0">
              <div className="flex flex-col bg-slate-900/50 border border-slate-800 rounded-xl min-h-[280px]">
                <div className="px-3 py-2 border-b border-slate-800 flex justify-between items-center">
                  <span className="text-sm font-semibold text-teal-400">{TASK_STATUS_LABELS[mobileColumn]}</span>
                  <span className="text-xs text-slate-500">{tasksByStatus[mobileColumn].length}</span>
                </div>
                <Droppable droppableId={mobileColumn}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`flex-1 p-2 space-y-2 min-h-[200px] ${snapshot.isDraggingOver ? 'bg-teal-500/5' : ''}`}
                    >
                      {tasksByStatus[mobileColumn].map((task, index) => (
                        <Draggable key={task.id} draggableId={task.id} index={index}>
                          {(dragProvided, dragSnapshot) => (
                            <div
                              ref={dragProvided.innerRef}
                              {...dragProvided.draggableProps}
                              {...dragProvided.dragHandleProps}
                              className={`p-3 rounded-lg border bg-slate-950 cursor-grab active:cursor-grabbing touch-target ${
                                dragSnapshot.isDragging ? 'border-teal-500 shadow-lg' : `border-slate-800 ${PRIORITY_COLOR[task.priority] || PRIORITY_COLOR.medium}`
                              }`}
                            >
                              <p className="text-sm font-medium text-slate-100">{task.title}</p>
                              {task.description && (
                                <p className="text-xs text-slate-500 mt-1 line-clamp-2">{task.description}</p>
                              )}
                              <div className="flex flex-wrap gap-1 mt-2 text-[10px] text-slate-500">
                                {task.assigneeName && <span>{task.assigneeName}</span>}
                                {task.dueDate && <span>· {task.dueDate}</span>}
                                <span>· {TASK_PRIORITY_LABELS[task.priority]}</span>
                              </div>
                              <div className="flex flex-wrap gap-2 mt-2">
                                {task.sourceRoomId && (
                                  <Link
                                    href={`/dashboard/messenger?roomId=${encodeURIComponent(task.sourceRoomId)}`}
                                    className="text-[10px] text-sky-400 hover:underline inline-flex items-center gap-0.5"
                                    onClick={e => e.stopPropagation()}
                                  >
                                    <Link2 className="w-3 h-3" /> 원본 메시지
                                  </Link>
                                )}
                                <button type="button" onClick={() => openEdit(task)} className="text-xs text-teal-400 hover:underline touch-target">편집</button>
                                <button type="button" onClick={() => handleDelete(task.id)} className="text-xs text-red-400 hover:underline inline-flex items-center gap-0.5 touch-target">
                                  <Trash2 className="w-3 h-3" /> 삭제
                                </button>
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            </div>
          </DragDropContext>
        </>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex-1 overflow-x-auto p-4 min-h-0">
            <div className="flex gap-3 min-w-max h-full">
              {TASK_STATUSES.map(status => (
                <div key={status} className="w-72 flex flex-col bg-slate-900/50 border border-slate-800 rounded-xl min-h-[280px]">
                  <div className="px-3 py-2 border-b border-slate-800 flex justify-between items-center">
                    <span className="text-sm font-semibold text-teal-400">{TASK_STATUS_LABELS[status]}</span>
                    <span className="text-xs text-slate-500">{tasksByStatus[status].length}</span>
                  </div>
                  <Droppable droppableId={status}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`flex-1 p-2 space-y-2 min-h-[200px] ${snapshot.isDraggingOver ? 'bg-teal-500/5' : ''}`}
                      >
                        {tasksByStatus[status].map((task, index) => (
                          <Draggable key={task.id} draggableId={task.id} index={index}>
                            {(dragProvided) => (
                              <div
                                ref={dragProvided.innerRef}
                                {...dragProvided.draggableProps}
                                {...dragProvided.dragHandleProps}
                                className={`bg-slate-950 border rounded-lg p-3 cursor-grab active:cursor-grabbing ${PRIORITY_COLOR[task.priority] || PRIORITY_COLOR.medium}`}
                              >
                                <p className="text-sm font-medium text-slate-100">{task.title}</p>
                                {task.description && (
                                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">{task.description}</p>
                                )}
                                <div className="flex flex-wrap gap-1 mt-2 text-[10px] text-slate-500">
                                  {task.assigneeName && <span>{task.assigneeName}</span>}
                                  {task.dueDate && <span>· {task.dueDate}</span>}
                                  <span>· {TASK_PRIORITY_LABELS[task.priority]}</span>
                                </div>
                                <div className="flex flex-wrap gap-2 mt-2">
                                  {task.sourceRoomId && (
                                    <Link
                                      href={`/dashboard/messenger?roomId=${encodeURIComponent(task.sourceRoomId)}`}
                                      className="text-[10px] text-sky-400 hover:underline inline-flex items-center gap-0.5"
                                      onClick={e => e.stopPropagation()}
                                    >
                                      <Link2 className="w-3 h-3" /> 원본 메시지
                                    </Link>
                                  )}
                                  <button type="button" onClick={() => openEdit(task)} className="text-xs text-teal-400 hover:underline">편집</button>
                                  <button type="button" onClick={() => handleDelete(task.id)} className="text-xs text-red-400 hover:underline inline-flex items-center gap-0.5">
                                    <Trash2 className="w-3 h-3" /> 삭제
                                  </button>
                                </div>
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </div>
              ))}
            </div>
          </div>
        </DragDropContext>
      )}
    </div>
  );
}
