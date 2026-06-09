const CURSOR_API = 'https://api.cursor.com';

export const PITAYA_REPO = {
  url: 'https://github.com/RallaRa/pitaya-os',
  startingRef: 'main',
};

function getApiKey(): string {
  const key = process.env.CURSOR_API_KEY?.trim();
  if (!key) throw new Error('CURSOR_API_KEY 미설정 — Cursor Dashboard → API Keys');
  return key;
}

function authHeader(): string {
  const key = getApiKey();
  return `Basic ${Buffer.from(`${key}:`).toString('base64')}`;
}

export async function cursorFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${CURSOR_API}${path}`, {
    ...init,
    headers: {
      Authorization: authHeader(),
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  return res;
}

export async function cursorJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await cursorFetch(path, init);
  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try {
      const j = JSON.parse(text);
      msg = j.message || j.error || text;
    } catch { /* raw text */ }
    throw new Error(`Cursor API ${res.status}: ${msg}`);
  }
  return text ? JSON.parse(text) : ({} as T);
}

export interface CursorAgentSummary {
  id: string;
  name: string;
  status: string;
  url?: string;
  createdAt?: string;
  updatedAt?: string;
  latestRunId?: string;
}

export interface CursorRun {
  id: string;
  agentId: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
}

export async function listAgents(limit = 50) {
  return cursorJson<{ items: CursorAgentSummary[]; nextCursor?: string }>(
    `/v1/agents?limit=${limit}&includeArchived=false`,
  );
}

export async function createAgent(opts: {
  text: string;
  name?: string;
  modelId?: string;
  mode?: 'agent' | 'plan';
  autoCreatePR?: boolean;
}) {
  return cursorJson<{ agent: CursorAgentSummary; run: CursorRun }>('/v1/agents', {
    method: 'POST',
    body: JSON.stringify({
      prompt: { text: opts.text },
      name: opts.name?.slice(0, 100),
      model: opts.modelId ? { id: opts.modelId } : undefined,
      mode: opts.mode || 'agent',
      repos: [PITAYA_REPO],
      autoCreatePR: opts.autoCreatePR ?? false,
      skipReviewerRequest: true,
    }),
  });
}

export async function getAgent(id: string) {
  return cursorJson<CursorAgentSummary & { repos?: unknown[] }>(`/v1/agents/${id}`);
}

export async function createRun(agentId: string, text: string, mode?: 'agent' | 'plan') {
  return cursorJson<{ run: CursorRun }>(`/v1/agents/${agentId}/runs`, {
    method: 'POST',
    body: JSON.stringify({
      prompt: { text },
      mode,
    }),
  });
}

export async function getRun(agentId: string, runId: string) {
  return cursorJson<CursorRun & { result?: { text?: string }; git?: unknown }>(
    `/v1/agents/${agentId}/runs/${runId}`,
  );
}

export async function cancelRun(agentId: string) {
  return cursorFetch(`/v1/agents/${agentId}/cancel`, { method: 'POST' });
}

export async function listModels() {
  return cursorJson<{ items?: { id: string; name?: string }[]; models?: { id: string; name?: string }[] }>(
    '/v1/models',
  );
}

export function streamRunUrl(agentId: string, runId: string) {
  return `${CURSOR_API}/v1/agents/${agentId}/runs/${runId}/stream`;
}

export function streamAuthHeader() {
  return authHeader();
}
