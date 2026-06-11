import { ensureSalesAlertChannel, postMessengerText } from '@/lib/messenger/channels.server';

export async function postDailyBriefingToMessenger(storeId: string, summary: string, actions?: string[]) {
  const roomId = await ensureSalesAlertChannel(storeId);
  const actionLines = (actions || []).slice(0, 3).map((a, i) => `${i + 1}. ${a}`).join('\n');
  const text = [
    '🌅 AI 오늘 브리핑',
    summary.slice(0, 500),
    actionLines ? `\n📌 액션\n${actionLines}` : '',
  ].filter(Boolean).join('\n\n');

  await postMessengerText({ roomId, text });
  return roomId;
}
