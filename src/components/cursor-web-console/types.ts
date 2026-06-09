export interface FileTreeNode {
  path: string;
  name: string;
  type: 'file' | 'dir';
  children?: FileTreeNode[];
}

export interface CursorAgentSummary {
  id: string;
  name: string;
  status: string;
  url?: string;
  latestRunId?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  toolName?: string;
  status?: 'running' | 'completed';
}

export interface AgentTab {
  id: string;
  name: string;
  status: string;
  cursorUrl?: string;
  messages: ChatMessage[];
  activeRunId?: string;
  runStatus?: string;
  isStreaming?: boolean;
}

export interface TerminalLine {
  id: string;
  kind: 'cmd' | 'out' | 'err' | 'info';
  text: string;
  ts: number;
}

export type SidePanel = 'explorer' | 'agents';
export type BottomPanel = 'terminal' | 'output';
