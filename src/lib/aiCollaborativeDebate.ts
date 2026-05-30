export interface DebateEntry {
  model: string;
  name: string;
  emoji: string;
  text: string;
  error?: string;
  round?: number;
}

export interface DebateRoundResult {
  round: number;
  label: string;
  entries: DebateEntry[];
}

export interface CollaborativeDebateResult {
  rounds: DebateRoundResult[];
  summary: string;
  summaryModel: string;
  debate: DebateEntry[];
}

export type DebateCallFn = (
  message: string,
  history: Array<{ role: string; content: string }>,
  system: string,
) => Promise<{ text: string }>;

export interface DebateProvider {
  id: string;
  name: string;
  emoji: string;
  call: DebateCallFn;
}

const ROUND_LABELS = ['1라운드 · 초기 의견', '2라운드 · 의견 교환', '3라운드 · 심화 토론'] as const;

const DEBATE_SYSTEM = `당신은 정육점·외식 사업 전문 AI 토론자입니다.
다른 AI들과 함께 주제에 대해 토론합니다.
- 자신의 고유 관점을 유지하세요.
- 다른 AI 의견을 인용·반박·보완할 수 있습니다.
- 3~5문장, 핵심만 한국어로 답하세요.
- 마크다운 없이 plain text만.`;

const SUMMARY_SYSTEM = `당신은 AI 토론 종합 moderator입니다.
여러 AI의 3라운드 토론을 읽고 정육점 사장님에게 실용적인 최종 권고안을 작성하세요.
- 5~8문장, 실행 가능한 조언 중심
- 찬반을 균형 있게 반영
- 📋 [종합]으로 시작`;

export function friendlyAiError(msg: string): string {
  const m = msg || '알 수 없는 오류';
  if (/credit balance|insufficient.*quota|billing/i.test(m)) return 'API 크레딧/결제 한도 초과';
  if (/invalid.*api.*key|authentication|unauthorized/i.test(m)) return 'API 키 오류';
  if (/503|overloaded|capacity/i.test(m)) return '서버 혼잡 — 잠시 후 재시도';
  if (/429|rate limit/i.test(m)) return '요청 한도 초과';
  if (/model.*not found|does not exist/i.test(m)) return '모델명 오류';
  return m.length > 120 ? m.slice(0, 120) + '…' : m;
}

function buildTranscript(rounds: DebateRoundResult[], currentRoundEntries: DebateEntry[] = []): string {
  const lines: string[] = [];
  for (const r of rounds) {
    lines.push(`--- ${r.label} ---`);
    for (const e of r.entries) {
      if (e.text) lines.push(`[${e.name}] ${e.text}`);
      else if (e.error) lines.push(`[${e.name}] (응답 실패: ${e.error})`);
    }
  }
  if (currentRoundEntries.length) {
    lines.push('--- 현재 라운드 (진행 중) ---');
    for (const e of currentRoundEntries) {
      if (e.text) lines.push(`[${e.name}] ${e.text}`);
    }
  }
  return lines.join('\n');
}

function buildRoundPrompt(
  topic: string,
  round: number,
  provider: DebateProvider,
  transcript: string,
  userNote?: string,
): string {
  const base = `[토론 주제] ${topic}\n[당신] ${provider.name}\n[라운드] ${round}/3`;
  const user = userNote?.trim() ? `\n[사용자 참고] ${userNote}` : '';

  if (round === 1) {
    return `${base}${user}\n\n주제에 대한 당신의 초기 의견을 제시하세요.`;
  }
  return `${base}${user}\n\n지금까지 토론:\n${transcript || '(아직 없음)'}\n\n다른 AI 의견을 참고해 ${provider.name} 관점에서 보완·반박·동의 의견을 주세요.`;
}

export async function runCollaborativeDebate(
  topic: string,
  providers: DebateProvider[],
  userNote?: string,
  extraSystem?: string,
): Promise<CollaborativeDebateResult> {
  if (providers.length === 0) {
    throw new Error('사용 가능한 AI API 키가 없습니다.');
  }

  const debateSystem = extraSystem?.trim()
    ? `${DEBATE_SYSTEM}\n\n[매장 데이터 참고]\n${extraSystem.trim()}`
    : DEBATE_SYSTEM;

  const rounds: DebateRoundResult[] = [];

  for (let round = 1; round <= 3; round++) {
    const roundEntries: DebateEntry[] = [];

    for (const provider of providers) {
      const transcript = buildTranscript(rounds, roundEntries);
      const prompt = buildRoundPrompt(topic, round, provider, transcript, userNote);

      try {
        const result = await provider.call(prompt, [], debateSystem);
        roundEntries.push({
          model:  provider.id,
          name:   provider.name,
          emoji:  provider.emoji,
          text:   result.text.trim(),
          round,
        });
      } catch (err: unknown) {
        const raw = err instanceof Error ? err.message : String(err);
        roundEntries.push({
          model:  provider.id,
          name:   provider.name,
          emoji:  provider.emoji,
          text:   '',
          error:  friendlyAiError(raw),
          round,
        });
      }
    }

    rounds.push({
      round,
      label: ROUND_LABELS[round - 1] || `${round}라운드`,
      entries: roundEntries,
    });
  }

  const fullTranscript = buildTranscript(rounds);
  const summarizer = providers.find(p => p.id === 'gemini') ?? providers[0];
  let summary = '';
  try {
    const summaryPrompt = `[토론 주제] ${topic}\n\n${fullTranscript}\n\n위 3라운드 토론을 종합해 최종 권고안을 작성하세요.`;
    summary = (await summarizer.call(summaryPrompt, [], `${SUMMARY_SYSTEM}\n\n${extraSystem?.trim() || ''}`)).text.trim();
  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : String(err);
    summary = `📋 [종합] 토론 요약 생성 실패 (${friendlyAiError(raw)}). 위 라운드 의견을 참고해주세요.`;
  }

  const debate = rounds.flatMap(r => r.entries);
  return { rounds, summary, summaryModel: summarizer.name, debate };
}
