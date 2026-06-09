import type { DevContext, DevTask } from '@/lib/devContext';

const QUEUE_PATH = 'docs/tasks/queue.md';

function formatTask(task: DevTask): string {
  const lines = [`- [ ] ${task.title}`];
  if (task.detail?.trim()) {
    for (const line of task.detail.trim().split('\n')) {
      lines.push(`  - ${line.trim()}`);
    }
  }
  if (task.createdAt) {
    lines.push(`  - _added: ${task.createdAt.slice(0, 10)}_`);
  }
  return lines.join('\n');
}

function formatDone(task: DevTask): string {
  return `- [x] ${task.title}`;
}

export function buildQueueMarkdown(ctx: DevContext, syncedAt?: string): string {
  const urgent = ctx.currentTasks.filter(t => t.priority === 'urgent' && t.status === 'open');
  const active = ctx.currentTasks.filter(t => t.priority === 'in_progress' && t.status === 'open');
  const pending = ctx.pendingTasks.filter(t => t.status === 'open');
  const done = ctx.completedTasks.slice(0, 15);

  const ts = syncedAt || new Date().toISOString();

  return `# Pitaya Dev Queue

> PC Cursor **Auto** + \`/loop 2m\` · **365일 무휴 정육 소매** · 11–21 유인 / 21–11 무인
> API 과금 없음 — 설치형 Cursor에서만 실행

_synced: ${ts}_

## PENDING (urgent)

${urgent.length ? urgent.map(formatTask).join('\n\n') : '_없음_'}

## PENDING (in progress)

${active.length ? active.map(formatTask).join('\n\n') : '_없음_'}

## PENDING (backlog)

${pending.length ? pending.map(formatTask).join('\n\n') : '_없음_'}

## DONE (recent)

${done.length ? done.map(formatDone).join('\n') : '_없음_'}

---

## Cursor 실행 (Mac, Auto 모드)

**한 번 설정 (2분마다 자동):**
\`\`\`
/loop 2m docs/tasks/queue.md에 - [ ] 항목 있으면 첫 번째 실행하고 완료 시 [x]로 바꿔. AGENTS.md와 docs/ 참고.
\`\`\`

**즉시 1회:**
\`\`\`
docs/tasks/queue.md PENDING 실행해. 끝나면 [x] 처리하고 git commit.
\`\`\`
`;
}

export { QUEUE_PATH };

export const CURSOR_LOOP_PROMPT =
  '/loop 2m docs/tasks/queue.md에 - [ ] 항목 있으면 첫 번째 실행하고 완료 시 [x]로 바꿔. AGENTS.md와 docs/ 참고.';

export const CURSOR_ONCE_PROMPT =
  'docs/tasks/queue.md PENDING 실행해. 끝나면 [x] 처리하고 git commit.';
