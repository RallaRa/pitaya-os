import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import {
  generateTextWithFallback,
  hasAnyAiProvider,
  stripJsonMarkdown,
} from '@/lib/aiProviderFallback';
import { aiMetaJson } from '@/lib/aiProviderMeta';

const SYSTEM_PROMPT = `너는 정육점 매입관리 AI 도우미야.
사용자 입력을 분석해서 반드시 아래 JSON만 반환해. 다른 텍스트 없이 순수 JSON만.

처리 가능한 액션:
- 거래처 정보 조회/수정
- 발주 설정 수정 (발주요일, 수령요일, 리드타임 등)
- 매입 등록 도움
- 수령 완료 처리
- 일반 대화

반환 JSON 형식:
{
  "action": "query_supplier" | "update_supplier" | "add_order" | "complete_delivery" | "chat",
  "targetSupplier": "거래처명 또는 null",
  "updateFields": { "필드명": "값" },
  "changeMemo": "변경 사유",
  "confirmRequired": true | false,
  "confirmMessage": "확인이 필요한 경우 사용자에게 보여줄 메시지",
  "message": "사용자에게 보여줄 한국어 응답"
}

규칙:
- 정보 변경 시 confirmRequired: true
- 단순 조회/일반대화 시 confirmRequired: false
- message는 항상 친절한 한국어`;

export async function POST(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { message, history } = await req.json();
    if (!message?.trim()) return NextResponse.json({ error: '메시지를 입력해주세요' }, { status: 400 });

    if (!hasAnyAiProvider()) {
      return NextResponse.json({ error: 'AI API 키 미설정' }, { status: 503 });
    }

    const historyLines = ((history || []) as { role: string; content: string }[])
      .slice(-6)
      .map(m => `${m.role}: ${m.content}`)
      .join('\n');
    const prompt = historyLines ? `${historyLines}\nuser: ${message}` : message;

    const aiResult = await generateTextWithFallback({
      system: SYSTEM_PROMPT,
      prompt,
      json: true,
      temperature: 0.1,
      useCase: 'fast',
    });

    const raw = stripJsonMarkdown(aiResult.text) || '{}';
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { action: 'chat', targetSupplier: null, updateFields: {}, confirmRequired: false, message: raw };
    }

    return NextResponse.json({ ...parsed, ...aiMetaJson(aiResult) });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
