'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import { isSuperuserEmail } from '@/lib/auth/permissions';
import type { DevContext, DevTask, TaskPriority } from '@/lib/devContext';
import {
  CURSOR_LOOP_PROMPT,
  CURSOR_ONCE_PROMPT,
} from '@/lib/devQueue/buildQueueMd';
import {
  ListTodo, Plus, CheckCircle2, Copy, RefreshCw, GitBranch, Terminal,
  Loader2, AlertCircle, Rocket, BookOpen, ChevronRight,
} from 'lucide-react';

type Tab = 'tasks' | 'sync' | 'guide';

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  urgent: '긴급',
  in_progress: '진행',
  pending: '대기',
};

const PRIORITY_COLOR: Record<TaskPriority, string> = {
  urgent: 'text-red-400 border-red-500/30 bg-red-900/20',
  in_progress: 'text-amber-400 border-amber-500/30 bg-amber-900/20',
  pending: 'text-slate-400 border-slate-600/30 bg-slate-800/40',
};

function copyText(text: string, setMsg: (m: string) => void) {
  navigator.clipboard.writeText(text).then(() => {
    setMsg('복사됨');
    setTimeout(() => setMsg(''), 2000);
  });
}

function TaskSection({
  title,
  tasks,
  onComplete,
  onSelect,
}: {
  title: string;
  tasks: DevTask[];
  onComplete: (id: string) => void;
  onSelect: (task: DevTask) => void;
}) {
  if (!tasks.length) return null;
  return (
    <div className="mb-4">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">{title}</h3>
      <div className="space-y-2">
        {tasks.map(t => (
          <div
            key={t.id}
            className={`rounded-lg border px-3 py-2 ${PRIORITY_COLOR[t.priority]}`}
          >
            <div className="flex items-start gap-2">
              <button
                type="button"
                onClick={() => onComplete(t.id)}
                className="mt-0.5 text-slate-500 hover:text-green-400 shrink-0"
                title="완료"
              >
                <CheckCircle2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => onSelect(t)}
                className="flex-1 text-left min-w-0"
              >
                <p className="text-sm text-white font-medium truncate">{t.title}</p>
                {t.detail && (
                  <p className="text-xs text-slate-400 mt-1 line-clamp-2">{t.detail}</p>
                )}
              </button>
              <span className="text-[10px] shrink-0 opacity-70">{PRIORITY_LABEL[t.priority]}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DevQueueConsole() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const isSU = isSuperuserEmail(user?.email);

  const [tab, setTab] = useState<Tab>('tasks');
  const [context, setContext] = useState<DevContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [markdown, setMarkdown] = useState('');
  const [githubUrl, setGithubUrl] = useState('');
  const [lastSync, setLastSync] = useState('');
  const [error, setError] = useState('');
  const [copyMsg, setCopyMsg] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newDetail, setNewDetail] = useState('');
  const [newPriority, setNewPriority] = useState<TaskPriority>('pending');
  const [selectedTask, setSelectedTask] = useState<DevTask | null>(null);

  const loadContext = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/dev/context', { headers });
      const data = await res.json();
      if (data.context) setContext(data.context);
      else if (data.error) setError(data.error);
    } catch {
      setError('작업 목록 로드 실패');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPreview = useCallback(async () => {
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/dev/queue', { headers });
      const data = await res.json();
      if (data.markdown) setMarkdown(data.markdown);
      if (data.githubUrl) setGithubUrl(data.githubUrl);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!isSU) {
      router.push('/dashboard');
      return;
    }
    loadContext();
    loadPreview();
  }, [authLoading, isSU, router, loadContext, loadPreview]);

  const postContext = async (body: Record<string, unknown>) => {
    const headers = await getAuthJsonHeaders();
    const res = await fetch('/api/dev/context', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '저장 실패');
    if (data.context) setContext(data.context);
    return data;
  };

  const addTask = async () => {
    if (!newTitle.trim()) return;
    setError('');
    try {
      await postContext({
        action: 'addTask',
        task: { title: newTitle.trim(), detail: newDetail.trim(), priority: newPriority },
      });
      setNewTitle('');
      setNewDetail('');
      await loadPreview();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '추가 실패');
    }
  };

  const completeTask = async (taskId: string) => {
    try {
      await postContext({ action: 'completeTask', taskId });
      await loadPreview();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '완료 처리 실패');
    }
  };

  const syncGithub = async () => {
    setSyncing(true);
    setError('');
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/dev/queue', {
        method: 'POST',
        headers,
        body: JSON.stringify({ message: `chore: dev queue sync ${new Date().toISOString().slice(0, 10)}` }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '동기화 실패');
      setLastSync(data.syncedAt || new Date().toISOString());
      if (data.githubUrl) setGithubUrl(data.githubUrl);
      await loadPreview();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'GitHub 동기화 실패');
    } finally {
      setSyncing(false);
    }
  };

  const taskPrompt = selectedTask
    ? `docs/tasks/queue.md에서 "${selectedTask.title}" 작업 실행해. ${selectedTask.detail || ''} AGENTS.md 참고.`
    : CURSOR_ONCE_PROMPT;

  if (authLoading || !isSU) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-950">
        <Loader2 className="w-6 h-6 animate-spin text-teal-400" />
      </div>
    );
  }

  const openUrgent = context?.currentTasks.filter(t => t.priority === 'urgent' && t.status === 'open') || [];
  const openActive = context?.currentTasks.filter(t => t.priority === 'in_progress' && t.status === 'open') || [];
  const openPending = context?.pendingTasks.filter(t => t.status === 'open') || [];
  const pendingTotal = openUrgent.length + openActive.length + openPending.length;

  const tasksPanel = (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 overflow-y-auto p-4 space-y-1">
        {loading ? (
          <p className="text-slate-500 text-sm">로딩...</p>
        ) : (
          <>
            <TaskSection title="긴급" tasks={openUrgent} onComplete={completeTask} onSelect={setSelectedTask} />
            <TaskSection title="진행중" tasks={openActive} onComplete={completeTask} onSelect={setSelectedTask} />
            <TaskSection title="대기" tasks={openPending} onComplete={completeTask} onSelect={setSelectedTask} />
            {!pendingTotal && (
              <p className="text-slate-500 text-sm text-center py-8">등록된 작업 없음</p>
            )}
            {context?.completedTasks.slice(0, 5).map(t => (
              <div key={t.id} className="text-xs text-slate-600 line-through px-2 py-1">
                {t.title}
              </div>
            ))}
          </>
        )}
      </div>

      <div className="shrink-0 border-t border-slate-800 p-4 space-y-2 bg-slate-900/80">
        <input
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          placeholder="작업 제목"
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
        />
        <textarea
          value={newDetail}
          onChange={e => setNewDetail(e.target.value)}
          placeholder="Cursor용 상세 지시 (선택)"
          rows={2}
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white resize-none"
        />
        <div className="flex gap-2">
          <select
            value={newPriority}
            onChange={e => setNewPriority(e.target.value as TaskPriority)}
            className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-sm text-white"
          >
            <option value="urgent">긴급</option>
            <option value="in_progress">진행</option>
            <option value="pending">대기</option>
          </select>
          <button
            type="button"
            onClick={addTask}
            disabled={!newTitle.trim()}
            className="flex items-center gap-1 px-4 py-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-40 rounded-lg text-sm font-medium text-white"
          >
            <Plus className="w-4 h-4" /> 추가
          </button>
        </div>
      </div>
    </div>
  );

  const syncPanel = (
    <div className="flex flex-col h-full min-h-0 p-4 space-y-4 overflow-y-auto">
      <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 space-y-3">
        <p className="text-sm text-slate-300">
          작업을 <code className="text-teal-400">docs/tasks/queue.md</code>로 GitHub에 push합니다.
          Mac Cursor에서 <strong className="text-white">git pull</strong> 후 Auto로 실행하세요.
        </p>
        <button
          type="button"
          onClick={syncGithub}
          disabled={syncing}
          className="w-full flex items-center justify-center gap-2 py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-xl text-white font-medium"
        >
          {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitBranch className="w-4 h-4" />}
          GitHub 동기화 ({pendingTotal}건 대기)
        </button>
        {lastSync && (
          <p className="text-xs text-slate-500">마지막 동기화: {new Date(lastSync).toLocaleString('ko-KR')}</p>
        )}
        {githubUrl && (
          <a
            href={githubUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300"
          >
            queue.md GitHub에서 보기 <ChevronRight className="w-3 h-3" />
          </a>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-slate-500 uppercase">미리보기</span>
          <button type="button" onClick={loadPreview} className="text-slate-500 hover:text-white">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
        <pre className="text-[11px] text-slate-400 bg-slate-950 border border-slate-800 rounded-lg p-3 overflow-x-auto max-h-64 whitespace-pre-wrap">
          {markdown || '(미리보기 없음)'}
        </pre>
      </div>
    </div>
  );

  const guidePanel = (
    <div className="p-4 space-y-4 overflow-y-auto h-full">
      <div className="rounded-xl border border-teal-500/30 bg-teal-900/10 p-4">
        <p className="text-sm text-teal-200 font-medium mb-1">비용 0 — 설치형 Cursor Auto</p>
        <p className="text-xs text-slate-400">Cloud API 사용 안 함. Mac Cursor가 켜져 있어야 합니다.</p>
      </div>

      {[
        { label: '2분마다 자동 (/loop)', text: CURSOR_LOOP_PROMPT, icon: Terminal },
        { label: '즉시 1회 실행', text: CURSOR_ONCE_PROMPT, icon: Rocket },
        ...(selectedTask ? [{ label: '선택한 작업', text: taskPrompt, icon: ListTodo }] : []),
      ].map(({ label, text, icon: Icon }) => (
        <div key={label} className="rounded-lg border border-slate-700 bg-slate-900/50 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-300 flex items-center gap-1">
              <Icon className="w-3.5 h-3.5" /> {label}
            </span>
            <button
              type="button"
              onClick={() => copyText(text, setCopyMsg)}
              className="flex items-center gap-1 text-xs text-teal-400 hover:text-teal-300"
            >
              <Copy className="w-3 h-3" /> 복사
            </button>
          </div>
          <pre className="text-[11px] text-slate-400 whitespace-pre-wrap break-words">{text}</pre>
        </div>
      ))}

      <div className="text-xs text-slate-500 space-y-2 border-t border-slate-800 pt-4">
        <p className="font-medium text-slate-400">순서</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>피타야에서 작업 추가</li>
          <li>동기화 탭 → GitHub push</li>
          <li>Mac: <code className="text-teal-500">git pull</code></li>
          <li>Cursor Auto → 위 프롬프트 붙여넣기</li>
        </ol>
        <p className="flex items-center gap-1 pt-2">
          <BookOpen className="w-3.5 h-3.5" />
          <a href="https://github.com/RallaRa/pitaya-os/blob/main/AGENTS.md" target="_blank" rel="noreferrer" className="text-purple-400 hover:underline">
            AGENTS.md
          </a>
          · Cursor가 자동으로 읽음
        </p>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full min-h-0 bg-slate-950 text-slate-100">
      <div className="shrink-0 px-4 py-3 border-b border-slate-800 flex items-center justify-between">
        <div>
          <h1 className="text-sm font-bold text-white flex items-center gap-2">
            <ListTodo className="w-4 h-4 text-teal-400" />
            개발 큐
          </h1>
          <p className="text-[10px] text-slate-500">queue.md → PC Cursor Auto · API 과금 없음</p>
        </div>
        {copyMsg && <span className="text-xs text-teal-400">{copyMsg}</span>}
        {pendingTotal > 0 && (
          <span className="text-xs bg-amber-900/40 text-amber-300 px-2 py-0.5 rounded-full">
            {pendingTotal} pending
          </span>
        )}
      </div>

      {error && (
        <div className="mx-4 mt-2 flex items-center gap-2 bg-red-900/30 border border-red-500/30 rounded-lg px-3 py-2 text-red-300 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
          <button type="button" onClick={() => setError('')} className="ml-auto">✕</button>
        </div>
      )}

      <div className="hidden lg:flex flex-1 min-h-0">
        <div className="w-[45%] border-r border-slate-800 min-h-0">{tasksPanel}</div>
        <div className="w-[30%] border-r border-slate-800 min-h-0 overflow-hidden">{syncPanel}</div>
        <div className="w-[25%] min-h-0 overflow-hidden">{guidePanel}</div>
      </div>

      <div className="lg:hidden flex-1 min-h-0 flex flex-col">
        <div className="flex-1 min-h-0 overflow-hidden">
          {tab === 'tasks' && tasksPanel}
          {tab === 'sync' && syncPanel}
          {tab === 'guide' && guidePanel}
        </div>
        <div className="shrink-0 flex border-t border-slate-800 bg-slate-900">
          {([
            { id: 'tasks' as Tab, icon: ListTodo, label: '작업' },
            { id: 'sync' as Tab, icon: GitBranch, label: '동기화' },
            { id: 'guide' as Tab, icon: Terminal, label: 'Cursor' },
          ]).map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex-1 flex flex-col items-center py-3 text-[10px] gap-0.5 ${
                tab === t.id ? 'text-teal-400' : 'text-slate-500'
              }`}
            >
              <t.icon className="w-5 h-5" />
              {t.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
