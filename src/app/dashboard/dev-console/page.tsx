'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import { isSuperuserEmail } from '@/lib/auth/permissions';
import type { DevContext, DevTask } from '@/lib/devContext';
import { extractCodeBlocks } from '@/lib/devContext';
import {
  Code, Send, Loader2, Mic, MicOff, Paperclip, Copy, GitBranch,
  Rocket, CheckCircle2, Circle, Plus, MessageSquare, ListTodo,
  RefreshCw, ExternalLink, AlertCircle,
} from 'lucide-react';

type Tab = 'chat' | 'tasks' | 'deploy';
type Model = 'groq' | 'claude' | 'gemini';

interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
  usedModel?: string;
}

const QUICK_PROMPTS = [
  { label: '🐛 버그수정', text: '현재 Pitaya OS 버그를 분석하고 수정 코드를 작성해줘. 파일 경로와 변경 diff 포함.' },
  { label: '✨ 기능추가', text: 'Pitaya OS에 새 기능을 추가하는 코드를 작성해줘. Next.js 16 + Firebase 패턴 준수.' },
  { label: '🔄 리팩토링', text: '현재 코드를 분석하고 리팩토링 방안과 코드를 제안해줘.' },
  { label: '📝 프롬프트작성', text: 'Cursor/Claude Code용 실행 프롬프트를 작성해줘. 자동 실행 규칙 포함.' },
  { label: '🔍 분석해줘', text: 'Pitaya OS 코드베이스 구조를 분석하고 개선점을 알려줘.' },
  { label: '🚀 배포해줘', text: '배포 전 체크리스트와 npm run build 확인 항목을 정리해줘.' },
];

const MODELS: { id: Model; label: string; color: string }[] = [
  { id: 'groq', label: 'Groq', color: 'bg-orange-600' },
  { id: 'claude', label: 'Claude', color: 'bg-purple-600' },
  { id: 'gemini', label: 'Gemini', color: 'bg-blue-600' },
];

function CodeBlock({ code, lang, onCommit }: { code: string; lang: string; onCommit: () => void }) {
  return (
    <div className="my-2 rounded-lg overflow-hidden border border-slate-700">
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-800 text-xs text-slate-400">
        <span>{lang || 'code'}</span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(code)}
            className="flex items-center gap-1 text-teal-400 hover:text-teal-300"
          >
            <Copy className="w-3 h-3" /> 복사
          </button>
          <button
            type="button"
            onClick={onCommit}
            className="flex items-center gap-1 text-green-400 hover:text-green-300"
          >
            <GitBranch className="w-3 h-3" /> GitHub 커밋
          </button>
        </div>
      </div>
      <pre className="p-3 overflow-x-auto text-xs text-slate-200 bg-slate-950 max-h-64">{code}</pre>
    </div>
  );
}

function renderMessage(content: string, onCommit: (code: string) => void) {
  const parts = content.split(/(```[\s\S]*?```)/g);
  return parts.map((part, i) => {
    const m = part.match(/```(\w*)\n([\s\S]*?)```/);
    if (m) {
      return <CodeBlock key={i} lang={m[1]} code={m[2].trim()} onCommit={() => onCommit(m[2].trim())} />;
    }
    if (!part.trim()) return null;
    return <p key={i} className="whitespace-pre-wrap text-sm leading-relaxed">{part}</p>;
  });
}

export default function DevConsolePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [tab, setTab] = useState<Tab>('chat');
  const [model, setModel] = useState<Model>('groq');
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [context, setContext] = useState<DevContext | null>(null);
  const [ctxLoading, setCtxLoading] = useState(true);
  const [listening, setListening] = useState(false);
  const [deployments, setDeployments] = useState<any[]>([]);
  const [commits, setCommits] = useState<any[]>([]);
  const [deploying, setDeploying] = useState(false);
  const [deployMsg, setDeployMsg] = useState('');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [error, setError] = useState('');

  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  const isSU = isSuperuserEmail(user?.email);

  const loadContext = useCallback(async () => {
    setCtxLoading(true);
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/dev/context', { headers });
      const data = await res.json();
      if (data.context) setContext(data.context);
    } catch {
      setError('맥락 로드 실패');
    } finally {
      setCtxLoading(false);
    }
  }, []);

  const loadDeployInfo = useCallback(async () => {
    try {
      const headers = await getAuthJsonHeaders();
      const [dRes, cRes] = await Promise.all([
        fetch('/api/dev/deploy', { headers }),
        fetch('/api/dev/commit', { headers }),
      ]);
      const [dData, cData] = await Promise.all([dRes.json(), cRes.json()]);
      setDeployments(dData.deployments || []);
      setCommits(cData.commits || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!authLoading && user && !isSU) router.replace('/dashboard');
  }, [authLoading, user, isSU, router]);

  useEffect(() => {
    if (isSU) {
      loadContext();
      loadDeployInfo();
    }
  }, [isSU, loadContext, loadDeployInfo]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (text?: string, imageBase64?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || sending) return;

    setInput('');
    setSending(true);
    setError('');
    const userMsg: ChatMsg = { role: 'user', content: msg };
    setMessages(prev => [...prev, userMsg]);

    try {
      const headers = await getAuthJsonHeaders();
      const history = messages.slice(-10).map(m => ({ role: m.role, content: m.content }));
      const res = await fetch('/api/dev/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({ message: msg, model, history, imageBase64 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setMessages(prev => [...prev, { role: 'assistant', content: data.text, usedModel: data.usedModel }]);
      loadContext();
    } catch (e: any) {
      setError(e.message);
      setMessages(prev => prev.slice(0, -1));
      setInput(msg);
    } finally {
      setSending(false);
    }
  };

  const handleCommit = async (code: string, aiResponse?: string) => {
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/dev/commit', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message: `feat: dev-console ${new Date().toISOString().slice(0, 10)}`,
          code,
          aiResponse,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDeployMsg(data.message);
      loadDeployInfo();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleDeploy = async () => {
    setDeploying(true);
    setDeployMsg('');
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/dev/deploy', {
        method: 'POST',
        headers,
        body: JSON.stringify({ message: 'feat: dev-console deploy' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDeployMsg(data.message || '배포 시작');
      setTimeout(loadDeployInfo, 3000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDeploying(false);
    }
  };

  const completeTask = async (taskId: string) => {
    const headers = await getAuthJsonHeaders();
    await fetch('/api/dev/context', {
      method: 'POST',
      headers,
      body: JSON.stringify({ action: 'completeTask', taskId }),
    });
    loadContext();
  };

  const addTask = async () => {
    if (!newTaskTitle.trim()) return;
    const headers = await getAuthJsonHeaders();
    await fetch('/api/dev/context', {
      method: 'POST',
      headers,
      body: JSON.stringify({ action: 'addTask', task: { title: newTaskTitle, priority: 'pending' } }),
    });
    setNewTaskTitle('');
    loadContext();
  };

  const startVoice = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setError('음성 입력 미지원 브라우저'); return; }
    const rec = new SR();
    rec.lang = 'ko-KR';
    rec.onresult = (e: any) => {
      const t = e.results[0][0].transcript;
      setInput(prev => prev + t);
      setListening(false);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  };

  const selectTask = (task: DevTask) => {
    setTab('chat');
    setInput(`Pitaya OS에서 "${task.title}" 구현/수정해줘. 현재 코드 분석 후 수정 코드 작성.`);
  };

  if (authLoading || ctxLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[50vh]">
        <Loader2 className="w-8 h-8 text-teal-400 animate-spin" />
      </div>
    );
  }

  if (!isSU) return null;

  const urgent = context?.currentTasks.filter(t => t.priority === 'urgent') || [];
  const inProgress = [
    ...(context?.currentTasks.filter(t => t.priority === 'in_progress') || []),
    ...(context?.pendingTasks.filter(t => t.priority === 'in_progress') || []),
  ];
  const pending = context?.pendingTasks.filter(t => t.priority === 'pending') || [];

  const chatPanel = (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex gap-2 p-3 border-b border-slate-800 shrink-0 overflow-x-auto">
        {MODELS.map(m => (
          <button
            key={m.id}
            type="button"
            onClick={() => setModel(m.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 ${
              model === m.id ? `${m.color} text-white` : 'bg-slate-800 text-slate-400'
            }`}
          >
            {m.label}
          </button>
        ))}
        <button type="button" onClick={loadContext} className="ml-auto p-1.5 text-slate-500 hover:text-teal-400">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        {messages.length === 0 && (
          <div className="text-center text-slate-500 text-sm py-8">
            <Code className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>Pitaya OS 개발 AI</p>
            <p className="text-xs mt-1">아이디어를 말하면 코드 생성 → GitHub 커밋</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[90%] rounded-2xl px-4 py-3 ${
              m.role === 'user'
                ? 'bg-teal-600/20 border border-teal-500/30 text-teal-100'
                : 'bg-slate-800/80 border border-slate-700 text-slate-200'
            }`}>
              {m.usedModel && (
                <span className="text-[10px] text-slate-500 block mb-1">{m.usedModel}</span>
              )}
              {m.role === 'assistant'
                ? renderMessage(m.content, code => handleCommit(code, m.content))
                : <p className="text-sm whitespace-pre-wrap">{m.content}</p>}
              {m.role === 'assistant' && extractCodeBlocks(m.content).length > 0 && (
                <button
                  type="button"
                  onClick={() => handleCommit('', m.content)}
                  className="mt-2 flex items-center gap-1 text-xs text-green-400 hover:text-green-300"
                >
                  <GitBranch className="w-3.5 h-3.5" /> 전체 GitHub 커밋
                </button>
              )}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex items-center gap-2 text-slate-500 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> 생성 중...
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 p-3 border-t border-slate-800 space-y-2">
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {QUICK_PROMPTS.map(q => (
            <button
              key={q.label}
              type="button"
              onClick={() => sendMessage(q.text)}
              className="shrink-0 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[11px]"
            >
              {q.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2 items-end">
          <button
            type="button"
            onClick={() => (listening ? recognitionRef.current?.stop() : startVoice())}
            className={`p-2.5 rounded-xl shrink-0 ${listening ? 'bg-red-600/30 text-red-400' : 'bg-slate-800 text-slate-400'}`}
          >
            {listening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => {
                const base64 = (reader.result as string).split(',')[1];
                sendMessage(input || '이 이미지 분석해줘', base64);
              };
              reader.readAsDataURL(file);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="p-2.5 rounded-xl bg-slate-800 text-slate-400 shrink-0"
          >
            <Paperclip className="w-5 h-5" />
          </button>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder="아이디어 입력... (Shift+Enter 줄바꿈)"
            rows={2}
            className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white resize-none focus:outline-none focus:border-teal-500/50"
          />
          <button
            type="button"
            onClick={() => sendMessage()}
            disabled={sending || !input.trim()}
            className="p-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-40 text-white shrink-0"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );

  const tasksPanel = (
    <div className="p-4 space-y-4 overflow-y-auto h-full">
      <div className="flex gap-2">
        <input
          value={newTaskTitle}
          onChange={e => setNewTaskTitle(e.target.value)}
          placeholder="새 작업 추가..."
          className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
        />
        <button type="button" onClick={addTask} className="p-2 bg-teal-600 rounded-lg text-white">
          <Plus className="w-5 h-5" />
        </button>
      </div>

      {[
        { label: '🔴 긴급', tasks: urgent, color: 'text-red-400' },
        { label: '🔄 진행중', tasks: inProgress, color: 'text-yellow-400' },
        { label: '🟢 대기', tasks: pending, color: 'text-green-400' },
      ].map(section => section.tasks.length > 0 && (
        <div key={section.label}>
          <h3 className={`text-xs font-bold uppercase mb-2 ${section.color}`}>{section.label}</h3>
          <div className="space-y-1.5">
            {section.tasks.map(task => (
              <div
                key={task.id}
                className="flex items-center gap-2 bg-slate-800/60 border border-slate-700/50 rounded-xl px-3 py-2.5"
              >
                <button type="button" onClick={() => completeTask(task.id)} className="text-slate-500 hover:text-green-400">
                  <Circle className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => selectTask(task)}
                  className="flex-1 text-left text-sm text-slate-200 hover:text-teal-300"
                >
                  {task.title}
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}

      {(context?.completedTasks.length || 0) > 0 && (
        <div>
          <h3 className="text-xs font-bold uppercase mb-2 text-slate-500">✅ 완료</h3>
          <div className="space-y-1">
            {context!.completedTasks.slice(0, 10).map(task => (
              <div key={task.id} className="flex items-center gap-2 px-3 py-1.5 text-slate-500 text-sm line-through">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-600 shrink-0" />
                {task.title}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const deployPanel = (
    <div className="p-4 space-y-4 overflow-y-auto h-full">
      <button
        type="button"
        onClick={handleDeploy}
        disabled={deploying}
        className="w-full flex items-center justify-center gap-2 py-4 bg-gradient-to-r from-teal-600 to-purple-600 hover:from-teal-500 hover:to-purple-500 disabled:opacity-50 rounded-xl font-bold text-white"
      >
        {deploying ? <Loader2 className="w-5 h-5 animate-spin" /> : <Rocket className="w-5 h-5" />}
        Vercel Production 배포
      </button>

      {deployMsg && (
        <div className="bg-teal-900/30 border border-teal-500/30 rounded-lg p-3 text-teal-300 text-sm">
          {deployMsg}
        </div>
      )}

      <div>
        <h3 className="text-xs font-bold text-slate-500 uppercase mb-2">최근 배포</h3>
        {deployments.length === 0 ? (
          <p className="text-slate-600 text-sm">배포 정보 없음</p>
        ) : (
          <div className="space-y-2">
            {deployments.map((d: any) => (
              <div key={d.id} className="flex items-center justify-between bg-slate-800/60 rounded-lg px-3 py-2 text-sm">
                <span className={
                  d.state === 'READY' ? 'text-green-400' :
                  d.state === 'ERROR' ? 'text-red-400' : 'text-yellow-400'
                }>
                  {d.state === 'READY' ? '✅' : d.state === 'ERROR' ? '❌' : '🔄'} {d.state}
                </span>
                {d.url && (
                  <a href={d.url} target="_blank" rel="noreferrer" className="text-teal-400 flex items-center gap-1 text-xs">
                    열기 <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="text-xs font-bold text-slate-500 uppercase mb-2">최근 커밋</h3>
        {commits.length === 0 ? (
          <p className="text-slate-600 text-sm">GITHUB_TOKEN 설정 시 표시</p>
        ) : (
          <div className="space-y-2">
            {commits.map((c: any) => (
              <a
                key={c.sha}
                href={c.url}
                target="_blank"
                rel="noreferrer"
                className="block bg-slate-800/60 rounded-lg px-3 py-2 text-xs text-slate-300 hover:text-teal-300"
              >
                <span className="font-mono text-teal-500">{c.sha}</span> {c.message?.split('\n')[0]}
              </a>
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={loadDeployInfo}
        className="w-full py-2 text-slate-400 hover:text-white text-sm flex items-center justify-center gap-1"
      >
        <RefreshCw className="w-4 h-4" /> 새로고침
      </button>
    </div>
  );

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] md:h-[calc(100vh-2rem)] bg-slate-950">
      <div className="shrink-0 px-4 py-3 border-b border-slate-800 flex items-center gap-2">
        <Code className="w-5 h-5 text-purple-400" />
        <div>
          <h1 className="text-sm font-bold text-white">개발 콘솔</h1>
          <p className="text-[10px] text-slate-500">모바일 AI 개발 · superuser</p>
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-2 flex items-center gap-2 bg-red-900/30 border border-red-500/30 rounded-lg px-3 py-2 text-red-300 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
          <button type="button" onClick={() => setError('')} className="ml-auto">✕</button>
        </div>
      )}

      {/* Desktop: split */}
      <div className="hidden lg:flex flex-1 min-h-0">
        <div className="w-[60%] border-r border-slate-800 flex flex-col min-h-0">{chatPanel}</div>
        <div className="w-[40%] flex flex-col min-h-0">
          <div className="flex-1 min-h-0 overflow-hidden border-b border-slate-800">{tasksPanel}</div>
          <div className="h-[45%] min-h-0 overflow-hidden">{deployPanel}</div>
        </div>
      </div>

      {/* Mobile: tabs */}
      <div className="lg:hidden flex-1 min-h-0 flex flex-col">
        <div className="flex-1 min-h-0 overflow-hidden">
          {tab === 'chat' && chatPanel}
          {tab === 'tasks' && tasksPanel}
          {tab === 'deploy' && deployPanel}
        </div>
        <div className="shrink-0 flex border-t border-slate-800 bg-slate-900 safe-area-pb">
          {([
            { id: 'chat' as Tab, icon: MessageSquare, label: 'AI채팅' },
            { id: 'tasks' as Tab, icon: ListTodo, label: '작업목록' },
            { id: 'deploy' as Tab, icon: Rocket, label: '배포' },
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
