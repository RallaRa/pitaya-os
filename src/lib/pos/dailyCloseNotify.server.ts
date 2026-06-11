import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { addDaysYMD } from '@/lib/dateUtils';
import { generateTextWithFallback, hasAnyAiProvider } from '@/lib/aiProviderFallback';
import { ensureSalesAlertChannel, postMessengerCard } from '@/lib/messenger/channels.server';
import { getPosAlertSettings } from '@/lib/pos/posAlertSettings';
import { topItems } from '@/lib/reportCompare';

export interface DailyCloseInput {
  storeId: string;
  date: string;
  isClosed: boolean;
  wasClosed: boolean;
  netSales: number;
  customerCount: number;
  items: Array<{ name?: string; amount?: number; netSales?: number; qty?: number; categoryName?: string }>;
  storeName?: string;
}

export function buildDailyCloseMessage(params: {
  date: string;
  netSales: number;
  customerCount: number;
  bestItem: string;
  vsYesterdayLabel: string;
  aiComment: string;
}): string {
  return [
    `📊 ${params.date} 마감 리포트`,
    `매출: ${params.netSales.toLocaleString()}원`,
    `객수: ${params.customerCount}명`,
    `베스트: ${params.bestItem}`,
    `전일 대비: ${params.vsYesterdayLabel}`,
    `AI 코멘트: ${params.aiComment}`,
  ].join('\n');
}

export async function maybeTriggerDailyCloseReport(
  input: DailyCloseInput,
): Promise<{ triggered?: boolean; skipped?: boolean; reason?: string }> {
  if (!input.isClosed || input.wasClosed) {
    return { skipped: true, reason: input.isClosed ? 'already_closed' : 'not_closed' };
  }

  const settings = await getPosAlertSettings(input.storeId);
  if (!settings.dailyCloseEnabled) return { skipped: true, reason: 'disabled' };

  const dedupeId = `${input.storeId}_${input.date}`.replace(/[/\\#?]/g, '_').slice(0, 500);
  const dedupeRef = adminDb.collection('pos_daily_close_sent').doc(dedupeId);
  if ((await dedupeRef.get()).exists) return { skipped: true, reason: 'already_sent' };

  const yesterday = addDaysYMD(input.date, -1);
  const ySnap = await adminDb.collection('daily_reports').doc(`pos_${input.storeId}_${yesterday}`).get();
  const yesterdayNet = ySnap.exists ? Number(ySnap.data()?.netSales || 0) : 0;
  const vsYesterdayPct = yesterdayNet > 0
    ? Math.round(((input.netSales - yesterdayNet) / yesterdayNet) * 1000) / 10
    : null;
  const vsYesterdayLabel = yesterdayNet > 0
    ? `${(vsYesterdayPct ?? 0) >= 0 ? '+' : ''}${vsYesterdayPct}%`
    : '데이터 없음';

  const best = topItems(input.items as Parameters<typeof topItems>[0], 1)[0];
  const bestItem = best?.name || '-';

  let aiComment = 'AI API가 설정되지 않았습니다.';
  if (hasAnyAiProvider()) {
    try {
      const ai = await generateTextWithFallback({
        useCase: 'report',
        system: '정육점 매장 일 마감 분석가. 2~3문장 한국어. 실행 가능한 한 가지 제안 포함.',
        prompt: [
          `매장: ${input.storeName || input.storeId}`,
          `날짜: ${input.date}`,
          `순매출: ${input.netSales.toLocaleString()}원`,
          `객수: ${input.customerCount}명`,
          `베스트: ${bestItem}`,
          `전일 대비: ${vsYesterdayLabel}`,
        ].join('\n'),
        temperature: 0.5,
      });
      aiComment = ai.text.trim().slice(0, 500) || aiComment;
    } catch {
      aiComment = 'AI 분석 생성에 실패했습니다.';
    }
  }

  const reportMessage = buildDailyCloseMessage({
    date: input.date,
    netSales: input.netSales,
    customerCount: input.customerCount,
    bestItem,
    vsYesterdayLabel,
    aiComment,
  });

  await adminDb.collection('daily_closes').doc(dedupeId).set({
    storeId: input.storeId,
    date: input.date,
    netSales: input.netSales,
    customerCount: input.customerCount,
    bestItem,
    bestItemAmount: best?.amount ?? 0,
    vsYesterdayPct,
    aiComment,
    reportMessage,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  const roomId = await ensureSalesAlertChannel(input.storeId);
  await postMessengerCard({
    roomId,
    type: 'sales_report',
    text: reportMessage.replace(/\n/g, ' · '),
    cardData: {
      title: `📊 ${input.date} 마감 리포트`,
      fields: [
        { label: '매출', value: `${input.netSales.toLocaleString()}원` },
        { label: '객수', value: `${input.customerCount}명` },
        { label: '베스트', value: bestItem },
        { label: '전일 대비', value: vsYesterdayLabel },
        { label: 'AI', value: aiComment.slice(0, 100) },
      ],
    },
  });

  await dedupeRef.set({ storeId: input.storeId, date: input.date, sentAt: FieldValue.serverTimestamp() });
  return { triggered: true };
}
