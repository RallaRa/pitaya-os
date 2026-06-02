import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import {
  generateJsonWithFallback,
  hasAnyAiProvider,
} from '@/lib/aiProviderFallback';
import { aiMetaJson } from '@/lib/aiProviderMeta';
import {
  executePublicOrderActions,
  loadPublicOrderChatContext,
  type PublicOrderAiAction,
} from '@/lib/publicOrderChatExecutor';
import { analyzePublicOrderImages } from '@/lib/publicOrderImageAnalyze';
import {
  uploadPublicOrderPhoto,
  ensureSessionForPhotos,
  type ChatImageInput,
} from '@/lib/publicOrderImageUpload';

const SYSTEM = `당신은 정육점 「공개 주문(손님 링크 주문)」 관리 AI입니다.
사용자의 자연어 요청을 분석해 Firestore에 반영할 작업(actions)과 친절한 한국어 reply를 JSON으로만 반환하세요.

가능한 action.type:
- create_session: 새 주문 회차 생성 (title 필수, description/orderDeadline/status 선택)
- select_session: 회차 선택 (sessionId 또는 sessionTitle)
- update_session: 회차 수정·접수시작(open)·마감(closed) (sessionId 또는 sessionTitle)
- add_lines: 품목 추가 (lines 배열, sessionId 없으면 현재/방금 만든 회차)
- update_line: 품목 수정 (lineName + lineUpdates, photoUrl 포함 가능)
- remove_line: 품목 삭제 (lineName)

lines[] 필드: name(필수), description, origin, normalPrice, discountPrice, unit(기본 kg), totalQty(기본 10), photoUrl(이미지 URL)

규칙:
- "접수 시작/오픈/열어줘" → update_session status: open
- "마감/닫아줘" → update_session status: closed
- 사진 분석 결과가 [사진 분석]에 있으면 add_lines에 photoUrl 반영
- 한 번에 회차+품목 여러 개 요청 가능 → actions 배열에 순서대로
- JSON만 반환, 마크다운 코드블록 금지

반환 형식:
{
  "reply": "사용자에게 보여줄 한국어 메시지",
  "actions": [ { "type": "...", ... } ]
}`;

interface AiChatJson {
  reply?: string;
  actions?: PublicOrderAiAction[];
}

function isValidChatJson(parsed: unknown): parsed is AiChatJson {
  if (!parsed || typeof parsed !== 'object') return false;
  const p = parsed as AiChatJson;
  return typeof p.reply === 'string' && p.reply.trim().length > 0;
}

export async function POST(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const storeId = String(body.storeId || '').trim();
    const message = String(body.message || '').trim();
    const sessionId = body.sessionId ? String(body.sessionId) : undefined;
    const history = (body.history || []) as { role: string; content: string }[];
    const images = (body.images || []) as ChatImageInput[];

    if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });
    if (!message && images.length === 0) {
      return NextResponse.json({ error: '메시지 또는 사진을 입력해 주세요' }, { status: 400 });
    }

    if (!hasAnyAiProvider()) {
      return NextResponse.json({ error: 'AI API 키가 설정되지 않았습니다' }, { status: 503 });
    }

    const context = await loadPublicOrderChatContext(storeId, sessionId);
    const historyText = history.slice(-8).map(m => `${m.role}: ${m.content}`).join('\n');

    let visionBlock = '';
    let photoActions: PublicOrderAiAction[] = [];
    let visionReply = '';
    let activeAfterPhotos = sessionId;

    if (images.length > 0) {
      const vision = await analyzePublicOrderImages(images, message);
      visionReply = vision.reply;

      const targetSessionId = await ensureSessionForPhotos(
        storeId,
        sessionId,
        vision.sessionTitle,
      );
      activeAfterPhotos = targetSessionId;

      const photoUrls: string[] = [];
      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        try {
          const url = await uploadPublicOrderPhoto(
            storeId,
            targetSessionId,
            img.fileContent,
            img.fileName || `photo_${i}.jpg`,
            img.mimeType || 'image/jpeg',
          );
          photoUrls.push(url);
        } catch {
          photoUrls.push('');
        }
      }

      const linesWithPhotos = (vision.lines.length ? vision.lines : images.map((_, i) => ({
        imageIndex: i,
        name: message.trim() || `사진 품목 ${i + 1}`,
        totalQty: 10,
        unit: 'kg',
      }))).map(line => {
        const idx = line.imageIndex ?? 0;
        const { imageIndex: _, ...rest } = line;
        return {
          ...rest,
          photoUrl: photoUrls[idx] || '',
        };
      });

      if (linesWithPhotos.length > 0) {
        photoActions.push({
          type: 'add_lines',
          sessionId: targetSessionId,
          lines: linesWithPhotos,
        });
      }

      visionBlock = `[사진 분석 — ${images.length}장]
${visionReply}
인식 품목: ${linesWithPhotos.map(l => `${l.name}${l.photoUrl ? ' (사진첨부)' : ''}`).join(', ')}`;
    }

    const prompt = `[매장 storeId: ${storeId}]
[현재 선택 회차 sessionId: ${activeAfterPhotos || sessionId || '없음'}]

[등록된 회차 목록]
${context.sessions.length
  ? context.sessions.map(s =>
    `- id=${s.id} | ${s.title} | status=${s.status} | 마감=${s.orderDeadline || '없음'}`,
  ).join('\n')
  : '(회차 없음)'}

[현재 회차 상세]
${context.current
  ? `제목: ${context.current.session.title}
상태: ${context.current.session.status}
품목: ${context.current.lines.map(l =>
    `${l.name}${l.photoUrl ? '📷' : ''} ${l.discountPrice || l.normalPrice}원/${l.unit}`,
  ).join(' · ') || '없음'}`
  : '(선택된 회차 없음)'}

${visionBlock ? `${visionBlock}\n` : ''}
${historyText ? `[대화]\n${historyText}\n` : ''}
user: ${message || '(사진만 첨부)'}`;

    let reply: string;
    let textActions: PublicOrderAiAction[] = [];

    if (message || !images.length) {
      const aiResult = await generateJsonWithFallback({
        system: SYSTEM,
        prompt,
        json: true,
        temperature: 0.15,
        useCase: 'fast',
        validate: isValidChatJson,
      });
      reply = aiResult.data.reply!.trim();
      textActions = Array.isArray(aiResult.data.actions) ? aiResult.data.actions : [];

      const execPhoto = photoActions.length
        ? await executePublicOrderActions(storeId, photoActions, activeAfterPhotos)
        : { results: [], activeSessionId: activeAfterPhotos };

      const execText = textActions.length
        ? await executePublicOrderActions(
          storeId,
          textActions,
          execPhoto.activeSessionId || activeAfterPhotos,
        )
        : { results: [], activeSessionId: execPhoto.activeSessionId };

      const allResults = [...execPhoto.results, ...execText.results];
      const finalSessionId = execText.activeSessionId || execPhoto.activeSessionId || sessionId;
      const base = process.env.NEXT_PUBLIC_APP_URL || 'https://pitaya-osv1.vercel.app';

      let publicPath: string | undefined;
      if (finalSessionId) {
        const { adminDb } = await import('@/lib/firebase/admin');
        const doc = await adminDb.collection('public_order_sessions').doc(finalSessionId).get();
        const token = doc.data()?.publicToken;
        if (token) publicPath = `/order/${token}`;
      }

      const actionSummary = allResults
        .filter(r => r.message)
        .map(r => (r.ok ? `✅ ${r.message}` : `❌ ${r.message}`))
        .join('\n');

      const combinedReply = [
        images.length ? visionReply : '',
        reply,
        actionSummary,
      ].filter(Boolean).join('\n\n');

      return NextResponse.json({
        reply: combinedReply,
        sessionId: finalSessionId,
        publicUrl: publicPath ? `${base}${publicPath}` : undefined,
        publicPath,
        actionResults: allResults,
        photosProcessed: images.length,
        ...aiMetaJson(aiResult),
      });
    }

    // 사진만 전송
    const exec = await executePublicOrderActions(storeId, photoActions, activeAfterPhotos);
    const base = process.env.NEXT_PUBLIC_APP_URL || 'https://pitaya-osv1.vercel.app';
    const fullUrl = exec.publicUrl ? `${base}${exec.publicUrl}` : undefined;
    const actionSummary = exec.results
      .map(r => (r.ok ? `✅ ${r.message}` : `❌ ${r.message}`))
      .join('\n');

    return NextResponse.json({
      reply: [visionReply, actionSummary].filter(Boolean).join('\n\n'),
      sessionId: exec.activeSessionId || activeAfterPhotos,
      publicUrl: fullUrl,
      publicPath: exec.publicUrl,
      actionResults: exec.results,
      photosProcessed: images.length,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
