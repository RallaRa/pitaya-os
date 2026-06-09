'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { getAuthJsonHeaders, getAuthHeaders } from '@/lib/getAuthHeaders';
import { isSuperuserEmail } from '@/lib/auth/permissions';
import {
  Files, Bot, Plus, X, Send, Loader2, ExternalLink, Square,
  PanelLeft, PanelBottom, ChevronDown, AlertCircle,
} from 'lucide-react';
import FileExplorer from './FileExplorer';
import TerminalPanel from './TerminalPanel';
import type {
  AgentTab, ChatMessage, FileTreeNode, SidePanel, TerminalLine,
} from './types';

const STORAGE_KEY = 'pitaya-cursor-agents';

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function loadStoredTabs(): AgentTab[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AgentTab[];
    return parsed.map(t => ({ ...t, isStreaming: false, runStatus: undefined }));
  } catch {
    return [];
  }
}

function saveTabs(tabs: AgentTab[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs.map(t => ({
      ...t,
      isStreaming: false,
    }))));
  } catch { /* quota */ }
}

export default function CursorWebConsole() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const isSU = isSuperuserEmail(user?.email);

  const [sidePanel, setSidePanel] = useState<SidePanel>('explorer');
  const [showSidebar, setShowSidebar] = useState(true);
  const [showTerminal, setShowTerminal] = useState(true);
  const [terminalTab, setTerminalTab] = useState<'terminal' | 'output'>('terminal');
  const [terminalLines, setTerminalLines] = useState<TerminalLine[]>([]);
  const [tree, setTree] = useState<FileTreeNode[]>([]);
  const [treeLoading, setTreeLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [fileLoading, setFileLoading] = useState(false);
  const [tabs, setTabs] = useState<AgentTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [models, setModels] = useState<{ id: string; name?: string }[]>([]);
  const [modelId, setModelId] = useState('composer-2.5');
  const [error, setError] = useState('');
  const [terminalHeight, setTerminalHeight] = useState(220);

  const streamAbortRef = useRef<AbortController | null>(null);
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  const addTerminalLine = useCallback((kind: TerminalLine['kind'], text: string) => {
    setTerminalLines(prev => [...prev.slice(-500), { id: uid(), kind, text, ts: Date.now() }]);
  }, []);

  const updateTab = useCallback((id: string, patch: Partial<AgentTab>) => {
    setTabs(prev => {
      const next = prev.map(t => t.id === id ? { ...t, ...patch } : t);
      saveTabs(next);
      return next;
    });
  }, []);

  const appendMessage = useCallback((tabId: string, msg: ChatMessage) => {
    setTabs(prev => {
      const next = prev.map(t => {
        if (t.id !== tabId) return t;
        const exists = t.messages.find(m => m.id === msg.id);
        if (exists && msg.role === 'assistant') {
          return {
            ...t,
            messages: t.messages.map(m => m.id === msg.id ? { ...m, content: m.content + msg.content } : m),
          };
        }
        if (exists && msg.role === 'tool') {
          return {
            ...t,
            messages: t.messages.map(m => m.id === msg.id ? { ...m, ...msg } : m),
          };
        }
        return { ...t, messages: [...t.messages, msg] };
      });
      saveTabs(next);
      return next;
    });
  }, []);

  const loadTree = useCallback(async () => {
    setTreeLoading(true);
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/cursor/files/tree', { headers });
      const data = await res.json();
      if (data.tree) setTree(data.tree);
      if (data.error) setError(data.error);
    } catch {
      setError('파일 트리 로드 실패');
    } finally {
      setTreeLoading(false);
    }
  }, []);

  const loadFile = useCallback(async (path: string) => {
    setSelectedFile(path);
    setFileLoading(true);
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch(`/api/cursor/files/content?path=${encodeURIComponent(path)}`, { headers });
      const data = await res.json();
      if (data.content != null) setFileContent(data.content);
      else setError(data.error || '파일 로드 실패');
    } catch {
      setError('파일 로드 실패');
    } finally {
      setFileLoading(false);
    }
  }, []);

  const loadModels = useCallback(async () => {
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/cursor/models', { headers });
      const data = await res.json();
      if (data.models?.length) setModels(data.models);
    } catch { /* fallback */ }
  }, []);

  const syncAgentsFromApi = useCallback(async () => {
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/cursor/agents', { headers });
      const data = await res.json();
      if (data.error && !data.agents?.length) {
        setError(data.error);
        return;
      }
      const remote: AgentTab[] = (data.agents || []).slice(0, 10).map((a: { id: string; name: string; status: string; url?: string; latestRunId?: string }) => {
        const existing = tabsRef.current.find(t => t.id === a.id);
        return existing || {
          id: a.id,
          name: a.name || 'Agent',
          status: a.status,
          cursorUrl: a.url,
          messages: [],
          activeRunId: a.latestRunId,
        };
      });
      if (remote.length && tabsRef.current.length === 0) {
        setTabs(remote);
        setActiveTabId(remote[0].id);
        saveTabs(remote);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!isSU) {
      router.push('/dashboard');
      return;
    }
    const stored = loadStoredTabs();
    if (stored.length) {
      setTabs(stored);
      setActiveTabId(stored[0].id);
    }
    loadTree();
    loadModels();
    syncAgentsFromApi();
  }, [authLoading, isSU, router, loadTree, loadModels, syncAgentsFromApi]);

  const connectStream = useCallback(async (
    tabId: string,
    agentId: string,
    runId: string,
    assistantMsgId: string,
  ) => {
    streamAbortRef.current?.abort();
    updateTab(tabId, { isStreaming: true, activeRunId: runId, runStatus: 'RUNNING' });

    const abort = new AbortController();
    streamAbortRef.current = abort;

    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`/api/cursor/runs/${agentId}/${runId}/stream`, {
        headers: authHeaders,
        signal: abort.signal,
      });
      if (!res.ok || !res.body) {
        const err = await res.text();
        throw new Error(err || '스트림 연결 실패');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let eventType = 'message';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() || '';

        for (const block of blocks) {
          const lines = block.split('\n');
          eventType = 'message';
          let data = '';
          for (const line of lines) {
            if (line.startsWith('event:')) eventType = line.slice(6).trim();
            else if (line.startsWith('data:')) data += line.slice(5).trim();
          }
          if (!data) continue;

          if (eventType === 'assistant') {
            try {
              const parsed = JSON.parse(data);
              if (parsed.text) appendMessage(tabId, { id: assistantMsgId, role: 'assistant', content: parsed.text });
            } catch { /* skip */ }
          } else if (eventType === 'thinking') {
            try {
              const parsed = JSON.parse(data);
              if (parsed.text) appendMessage(tabId, { id: `${assistantMsgId}-think`, role: 'system', content: parsed.text });
            } catch { /* skip */ }
          } else if (eventType === 'tool_call') {
            try {
              const parsed = JSON.parse(data);
              const toolId = `tool-${parsed.callId}`;
              const argsStr = parsed.args ? JSON.stringify(parsed.args, null, 2) : '';
              const resultStr = parsed.result ? JSON.stringify(parsed.result, null, 2) : '';
              if (parsed.name === 'run_terminal_cmd' || parsed.name?.includes('terminal') || parsed.name?.includes('shell')) {
                const cmd = typeof parsed.args === 'object' && parsed.args && 'command' in parsed.args
                  ? String((parsed.args as { command?: string }).command)
                  : argsStr.slice(0, 200);
                if (cmd) addTerminalLine('cmd', cmd);
                if (resultStr) addTerminalLine('out', resultStr.slice(0, 4000));
              } else {
                appendMessage(tabId, {
                  id: toolId,
                  role: 'tool',
                  content: `${parsed.name}${argsStr ? `\n${argsStr}` : ''}${resultStr ? `\n→ ${resultStr.slice(0, 800)}` : ''}`,
                  toolName: parsed.name,
                  status: parsed.status,
                });
              }
            } catch { /* skip */ }
          } else if (eventType === 'status') {
            try {
              const parsed = JSON.parse(data);
              updateTab(tabId, { runStatus: parsed.status });
              addTerminalLine('info', `[run ${parsed.runId?.slice(-8)}] ${parsed.status}`);
            } catch { /* skip */ }
          } else if (eventType === 'result') {
            try {
              const parsed = JSON.parse(data);
              updateTab(tabId, { runStatus: parsed.status, isStreaming: false });
              if (parsed.text) {
                appendMessage(tabId, { id: `${assistantMsgId}-final`, role: 'assistant', content: parsed.text });
              }
              addTerminalLine('info', `Run finished: ${parsed.status}${parsed.durationMs ? ` (${Math.round(parsed.durationMs / 1000)}s)` : ''}`);
            } catch { /* skip */ }
          } else if (eventType === 'error') {
            try {
              const parsed = JSON.parse(data);
              setError(parsed.message || '스트림 오류');
            } catch {
              setError('스트림 오류');
            }
          } else if (eventType === 'done') {
            updateTab(tabId, { isStreaming: false });
          }
        }
      }
      updateTab(tabId, { isStreaming: false });
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') return;
      const msg = e instanceof Error ? e.message : '스트림 오류';
      setError(msg);
      updateTab(tabId, { isStreaming: false });
    }
  }, [updateTab, appendMessage, addTerminalLine]);

  const sendPrompt = async () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    setError('');

    const headers = await getAuthJsonHeaders();
    const userMsg: ChatMessage = { id: uid(), role: 'user', content: text };
    let tabId = activeTabId;

    try {
      if (!tabId) {
        addTerminalLine('info', 'Creating new Cursor cloud agent...');
        const res = await fetch('/api/cursor/agents', {
          method: 'POST',
          headers,
          body: JSON.stringify({ text, modelId, mode: 'agent' }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '에이전트 생성 실패');

        const newTab: AgentTab = {
          id: data.agent.id,
          name: data.agent.name || text.slice(0, 40),
          status: data.agent.status,
          cursorUrl: data.agent.url,
          messages: [userMsg],
          activeRunId: data.run.id,
          isStreaming: true,
        };
        setTabs(prev => {
          const next = [newTab, ...prev];
          saveTabs(next);
          return next;
        });
        setActiveTabId(newTab.id);
        tabId = newTab.id;
        await connectStream(tabId, data.agent.id, data.run.id, uid());
        return;
      }

      const tab = tabs.find(t => t.id === tabId);
      if (!tab) return;

      appendMessage(tabId, userMsg);
      updateTab(tabId, { isStreaming: true });

      const res = await fetch(`/api/cursor/agents/${tabId}/runs`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ text, mode: 'agent' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'run 생성 실패');

      await connectStream(tabId, tabId, data.run.id, uid());
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '전송 실패';
      setError(msg);
      addTerminalLine('err', msg);
      if (tabId) updateTab(tabId, { isStreaming: false });
    }
  };

  const newAgentTab = () => {
    setActiveTabId(null);
    setInput('');
    setSidePanel('agents');
  };

  const closeTab = (id: string) => {
    if (streamAbortRef.current && activeTabId === id) {
      streamAbortRef.current.abort();
    }
    setTabs(prev => {
      const next = prev.filter(t => t.id !== id);
      saveTabs(next);
      if (activeTabId === id) setActiveTabId(next[0]?.id || null);
      return next;
    });
  };

  const activeTab = tabs.find(t => t.id === activeTabId);

  if (authLoading || !isSU) {
    return (
      <div className="flex items-center justify-center h-full bg-[#1e1e1e]">
        <Loader2 className="w-6 h-6 animate-spin text-[#007acc]" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#1e1e1e] text-[#cccccc] select-none">
      {/* Title bar */}
      <div className="shrink-0 h-9 flex items-center justify-between px-3 bg-[#323233] border-b border-[#3c3c3c] text-[12px]">
        <div className="flex items-center gap-2">
          <span className="text-white font-medium">커서웹콘솔</span>
          <span className="text-[#858585]">· RallaRa/pitaya-os · Cursor Cloud Agent</span>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setShowSidebar(v => !v)} className="p-1 hover:bg-[#3c3c3c] rounded" title="Sidebar">
            <PanelLeft className="w-4 h-4" />
          </button>
          <button type="button" onClick={() => setShowTerminal(v => !v)} className="p-1 hover:bg-[#3c3c3c] rounded" title="Terminal">
            <PanelBottom className="w-4 h-4" />
          </button>
          {activeTab?.cursorUrl && (
            <a href={activeTab.cursorUrl} target="_blank" rel="noreferrer" className="p-1 hover:bg-[#3c3c3c] rounded text-[#007acc]" title="Cursor에서 열기">
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
        </div>
      </div>

      {error && (
        <div className="shrink-0 mx-2 mt-1 flex items-center gap-2 bg-red-900/40 border border-red-500/30 rounded px-2 py-1 text-red-300 text-xs">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span className="flex-1 truncate">{error}</span>
          <button type="button" onClick={() => setError('')}>✕</button>
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* Activity bar */}
        <div className="w-12 shrink-0 bg-[#333333] flex flex-col items-center py-2 gap-2 border-r border-[#3c3c3c]">
          <button
            type="button"
            onClick={() => { setSidePanel('explorer'); setShowSidebar(true); }}
            className={`p-2 rounded ${sidePanel === 'explorer' && showSidebar ? 'text-white border-l-2 border-[#007acc] bg-[#2a2d2e]' : 'text-[#858585] hover:text-white'}`}
            title="Explorer"
          >
            <Files className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => { setSidePanel('agents'); setShowSidebar(true); }}
            className={`p-2 rounded ${sidePanel === 'agents' && showSidebar ? 'text-white border-l-2 border-[#007acc] bg-[#2a2d2e]' : 'text-[#858585] hover:text-white'}`}
            title="Agents"
          >
            <Bot className="w-5 h-5" />
          </button>
        </div>

        {/* Side panel */}
        {showSidebar && (
          <div className="w-56 shrink-0 border-r border-[#3c3c3c] flex flex-col min-h-0">
            {sidePanel === 'explorer' ? (
              <FileExplorer
                tree={tree}
                loading={treeLoading}
                selectedPath={selectedFile}
                onSelect={loadFile}
                onRefresh={loadTree}
              />
            ) : (
              <div className="flex flex-col h-full bg-[#252526]">
                <div className="px-3 py-2 text-[11px] font-semibold uppercase text-[#bbbbbb]">Agents</div>
                <div className="flex-1 overflow-y-auto">
                  {tabs.map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setActiveTabId(t.id)}
                      className={`w-full text-left px-3 py-2 text-[12px] hover:bg-[#2a2d2e] flex items-center gap-2 ${
                        activeTabId === t.id ? 'bg-[#37373d]' : ''
                      }`}
                    >
                      <Bot className="w-3.5 h-3.5 shrink-0 text-[#007acc]" />
                      <span className="truncate flex-1">{t.name}</span>
                      {t.isStreaming && <Loader2 className="w-3 h-3 animate-spin text-[#007acc]" />}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={newAgentTab}
                    className="w-full text-left px-3 py-2 text-[12px] text-[#007acc] hover:bg-[#2a2d2e] flex items-center gap-2"
                  >
                    <Plus className="w-3.5 h-3.5" /> 새 에이전트
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Main editor + chat */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {/* Agent tabs */}
          <div className="shrink-0 flex items-center bg-[#252526] border-b border-[#3c3c3c] overflow-x-auto">
            {tabs.map(t => (
              <div
                key={t.id}
                className={`flex items-center gap-1 px-3 py-1.5 text-[12px] border-r border-[#3c3c3c] cursor-pointer min-w-0 max-w-[180px] ${
                  activeTabId === t.id ? 'bg-[#1e1e1e] text-white' : 'text-[#969696] hover:bg-[#2a2d2e]'
                }`}
                onClick={() => setActiveTabId(t.id)}
              >
                <Bot className="w-3 h-3 shrink-0" />
                <span className="truncate">{t.name}</span>
                {t.isStreaming && <Loader2 className="w-3 h-3 animate-spin shrink-0" />}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); closeTab(t.id); }}
                  className="p-0.5 hover:bg-[#3c3c3c] rounded shrink-0"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            <button type="button" onClick={newAgentTab} className="px-2 py-1.5 text-[#858585] hover:text-white">
              <Plus className="w-4 h-4" />
            </button>
            <div className="flex-1" />
            {models.length > 0 && (
              <div className="relative px-2">
                <select
                  value={modelId}
                  onChange={e => setModelId(e.target.value)}
                  className="bg-[#3c3c3c] text-[11px] px-2 py-1 rounded border border-[#555] appearance-none pr-6"
                >
                  {models.map(m => (
                    <option key={m.id} value={m.id}>{m.name || m.id}</option>
                  ))}
                </select>
                <ChevronDown className="w-3 h-3 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[#858585]" />
              </div>
            )}
          </div>

          <div className="flex flex-1 min-h-0">
            {/* File preview / editor */}
            {selectedFile && (
              <div className="w-[45%] shrink-0 border-r border-[#3c3c3c] flex flex-col min-h-0">
                <div className="shrink-0 px-3 py-1 bg-[#252526] text-[11px] text-[#858585] border-b border-[#3c3c3c] truncate">
                  {selectedFile}
                </div>
                <div className="flex-1 overflow-auto">
                  {fileLoading ? (
                    <div className="p-4 text-[#858585] text-sm">로딩...</div>
                  ) : (
                    <pre className="p-3 text-[12px] font-mono leading-relaxed text-[#d4d4d4] whitespace-pre-wrap">{fileContent}</pre>
                  )}
                </div>
              </div>
            )}

            {/* Chat panel */}
            <div className="flex-1 flex flex-col min-w-0 min-h-0">
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {!activeTab && (
                  <div className="text-center py-12 text-[#858585]">
                    <Bot className="w-10 h-10 mx-auto mb-3 text-[#007acc]" />
                    <p className="text-sm">새 에이전트를 시작하세요</p>
                    <p className="text-xs mt-1">Cursor Cloud Agent가 pitaya-os 저장소에서 코드를 수정합니다</p>
                  </div>
                )}
                {activeTab?.messages.map(msg => (
                  <div
                    key={msg.id}
                    className={`rounded-lg px-3 py-2 text-[13px] leading-relaxed ${
                      msg.role === 'user' ? 'bg-[#264f78] ml-8' :
                      msg.role === 'tool' ? 'bg-[#2d2d30] border border-[#3c3c3c] font-mono text-[11px]' :
                      msg.role === 'system' ? 'bg-[#1a1a1a] text-[#858585] italic text-[11px]' :
                      'bg-[#2d2d30] mr-4'
                    }`}
                  >
                    {msg.role === 'tool' && msg.toolName && (
                      <div className="text-[#4ec9b0] mb-1 flex items-center gap-1">
                        <Square className="w-3 h-3" /> {msg.toolName}
                        {msg.status === 'running' && <Loader2 className="w-3 h-3 animate-spin" />}
                      </div>
                    )}
                    <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                  </div>
                ))}
              </div>

              {/* Input */}
              <div className="shrink-0 p-3 border-t border-[#3c3c3c] bg-[#252526]">
                <div className="flex gap-2 items-end">
                  <textarea
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        if (!activeTab?.isStreaming) sendPrompt();
                      }
                    }}
                    placeholder={activeTab ? '에이전트에게 지시... (Enter 전송)' : '첫 프롬프트로 새 에이전트 생성...'}
                    rows={2}
                    disabled={activeTab?.isStreaming}
                    className="flex-1 bg-[#3c3c3c] border border-[#555] rounded px-3 py-2 text-[13px] text-white resize-none focus:outline-none focus:border-[#007acc] disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={sendPrompt}
                    disabled={!input.trim() || activeTab?.isStreaming}
                    className="p-2.5 bg-[#007acc] hover:bg-[#1a8ad4] disabled:opacity-40 rounded text-white"
                  >
                    {activeTab?.isStreaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Terminal */}
          {showTerminal && (
            <div style={{ height: terminalHeight }} className="shrink-0 relative">
              <div
                className="absolute top-0 left-0 right-0 h-1 cursor-ns-resize hover:bg-[#007acc] z-10"
                onMouseDown={(e) => {
                  const startY = e.clientY;
                  const startH = terminalHeight;
                  const onMove = (ev: MouseEvent) => setTerminalHeight(Math.max(120, Math.min(500, startH + startY - ev.clientY)));
                  const onUp = () => {
                    document.removeEventListener('mousemove', onMove);
                    document.removeEventListener('mouseup', onUp);
                  };
                  document.addEventListener('mousemove', onMove);
                  document.addEventListener('mouseup', onUp);
                }}
              />
              <TerminalPanel
                lines={terminalLines}
                onClear={() => setTerminalLines([])}
                activeTab={terminalTab}
                onTabChange={setTerminalTab}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
