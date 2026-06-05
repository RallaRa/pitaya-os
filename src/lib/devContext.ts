export const DEV_CONTEXT_DOC_ID = 'pitaya-os-main';

export type TaskPriority = 'urgent' | 'in_progress' | 'pending';
export type TaskStatus = 'open' | 'done';

export interface DevTask {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  createdAt?: string;
}

export interface DevContext {
  currentTasks: DevTask[];
  completedTasks: DevTask[];
  pendingTasks: DevTask[];
  conventions: Record<string, string>;
  recentDecisions: { date: string; decision: string; reason?: string }[];
  recentConversations: { role: string; content: string; at: string }[];
  lastUpdated?: string;
}

export const DEFAULT_DEV_CONTEXT: DevContext = {
  currentTasks: [
    { id: 'u1', title: '매입등록 이미지 첨부 413/500 오류', status: 'open', priority: 'urgent' },
    { id: 'u2', title: '메인 대시보드 값 미표시', status: 'open', priority: 'urgent' },
    { id: 'u3', title: 'AI 대화 Gemini만 표시 버그', status: 'open', priority: 'urgent' },
    { id: 'u4', title: '권한 저장 미반영 버그', status: 'open', priority: 'urgent' },
    { id: 'u5', title: '보고서 순매출 이상', status: 'open', priority: 'urgent' },
    { id: 'u6', title: '캘린더 연차/휴무 로직', status: 'open', priority: 'urgent' },
    { id: 'p1', title: 'Groq AI 대화 추가', status: 'open', priority: 'in_progress' },
    { id: 'p2', title: '슈퍼유저 권한 전체 반영', status: 'open', priority: 'in_progress' },
    { id: 'p3', title: 'AI 운영 파트너·오늘 브리핑 분리', status: 'open', priority: 'in_progress' },
    { id: 'p4', title: '위생점검일지 자동화', status: 'open', priority: 'in_progress' },
    { id: 'p5', title: 'HR 사원정보', status: 'open', priority: 'in_progress' },
    { id: 'p6', title: 'AI 매입관리 전체', status: 'open', priority: 'in_progress' },
    { id: 'p7', title: '품목관리', status: 'open', priority: 'in_progress' },
  ],
  completedTasks: [
    { id: 'c1', title: '일마감 날씨연동', status: 'done', priority: 'in_progress' },
    { id: 'c2', title: '메인 대시보드 위젯 시스템', status: 'done', priority: 'in_progress' },
    { id: 'c3', title: '설정 > 사원관리 기본', status: 'done', priority: 'in_progress' },
    { id: 'c4', title: '포스 DB 연결', status: 'done', priority: 'in_progress' },
    { id: 'c5', title: '보고서 화면 기본 구조', status: 'done', priority: 'in_progress' },
    { id: 'c6', title: '스플래시 페이지', status: 'done', priority: 'in_progress' },
  ],
  pendingTasks: [
    { id: 'w1', title: '사이드바 리소스 모니터', status: 'open', priority: 'pending' },
    { id: 'w2', title: '메신저 고도화', status: 'open', priority: 'pending' },
    { id: 'w3', title: '캘린더 고도화', status: 'open', priority: 'pending' },
    { id: 'w4', title: '거래처 관리', status: 'open', priority: 'pending' },
    { id: 'w5', title: '저울 코드 관리', status: 'open', priority: 'pending' },
    { id: 'w6', title: '쿠폰 검증 레이어', status: 'open', priority: 'pending' },
    { id: 'w7', title: '포스 자동 동기화', status: 'open', priority: 'pending' },
    { id: 'w8', title: '모바일 AI 개발 콘솔', status: 'open', priority: 'in_progress' },
    { id: 'sec1', title: '[보안·나중] GitHub PAT workflow scope 재발급 (cron workflow push용)', status: 'open', priority: 'pending' },
    { id: 'sec2', title: '[보안·나중] deploy.yml 스케줄 cron GitHub 반영 (PAT 또는 웹 편집)', status: 'open', priority: 'pending' },
  ],
  conventions: {
    stack: 'Next.js 16 + Firebase + Vercel',
    styling: 'Tailwind CSS',
    icons: 'Lucide React',
    storeId: 'STR-1779194754785',
    deployUrl: 'https://pitaya-osv1.vercel.app',
    github: 'https://github.com/RallaRa/pitaya-os',
    superuser: 'hipona00@gmail.com',
  },
  recentDecisions: [
    { date: '2026-06-02', decision: 'cron 스케줄: Vercel에서 시간민감 job 제거, GitHub Actions·로컬 스크립트로 대체', reason: 'Hobby 오차·skip 방지' },
    { date: '2026-06-02', decision: '보안 후속(PAT 재발급·workflow push)은 보류', reason: '사용자 요청 — 기록만' },
  ],
  recentConversations: [],
};

export function buildDevSystemPrompt(ctx: DevContext): string {
  const tasks = [
    ...ctx.currentTasks.filter(t => t.priority === 'urgent').map(t => `🔴 ${t.title}`),
    ...ctx.currentTasks.filter(t => t.priority === 'in_progress').map(t => `🔄 ${t.title}`),
    ...ctx.pendingTasks.map(t => `🟢 ${t.title}`),
  ].join('\n');

  const decisions = ctx.recentDecisions.slice(-5)
    .map(d => `- [${d.date}] ${d.decision}${d.reason ? ` (${d.reason})` : ''}`)
    .join('\n');

  return `너는 Pitaya OS 전담 개발 AI야.
프로젝트: Next.js 16 + Firebase + Vercel (App Router, TypeScript)
배포URL: https://pitaya-osv1.vercel.app
GitHub: https://github.com/RallaRa/pitaya-os
storeId: STR-1779194754785
슈퍼유저: hipona00@gmail.com

코드 컨벤션:
- Tailwind CSS, Lucide React, recharts
- 'use client' + dynamic import SSR false (클라이언트 컴포넌트)
- Firebase Admin SDK는 API route에서만 사용
- superuser: hipona00@gmail.com

현재 개발 작업:
${tasks || '(없음)'}

최근 결정사항:
${decisions || '(없음)'}

코드 생성 시 현재 프로젝트 구조(src/app, src/components, src/lib)에 맞게 작성.
한국어로 답변. 코드는 \`\`\`typescript 또는 \`\`\`tsx 블록으로 제공.`;
}

export function extractCodeBlocks(text: string): { lang: string; code: string }[] {
  const blocks: { lang: string; code: string }[] = [];
  const re = /```(\w*)\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    blocks.push({ lang: m[1] || 'txt', code: m[2].trim() });
  }
  return blocks;
}
