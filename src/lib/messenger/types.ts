/** Pitaya 업무 메신저 — 메시지/카드 타입 */

export type MessengerMessageType =
  | 'text'
  | 'sales_report'
  | 'order_request'
  | 'stock_alert'
  | 'customer_alert'
  | 'cctv_alert'
  | 'calendar_event'
  | 'poll';

export type MessengerCardActionId = 'approve' | 'reject' | 'detail' | 'dismiss';

export interface MessengerCardAction {
  id: MessengerCardActionId;
  label: string;
  style?: 'primary' | 'danger' | 'ghost';
}

export interface MessengerCardField {
  label: string;
  value: string;
}

export interface MessengerCardData {
  title: string;
  subtitle?: string;
  fields?: MessengerCardField[];
  footer?: string;
}

export interface MessengerActionStateEntry {
  by: string;
  byName?: string;
  at: string;
  status: 'done' | 'pending';
  note?: string;
}

export type MessengerActionState = Partial<Record<MessengerCardActionId, MessengerActionStateEntry>>;

export const CARD_TYPE_LABELS: Record<MessengerMessageType, string> = {
  text: '텍스트',
  sales_report: '매출 리포트',
  order_request: '발주 요청',
  stock_alert: '재고 알림',
  customer_alert: '고객 알림',
  cctv_alert: 'CCTV 알림',
  calendar_event: '일정',
  poll: '투표',
};

export function isCardMessageType(type?: string): type is MessengerMessageType {
  return !!type && type !== 'text';
}

export function cardPreviewText(type: MessengerMessageType, cardData?: { title?: string }): string {
  const label = CARD_TYPE_LABELS[type] || '카드';
  const title = cardData?.title?.slice(0, 30) || '';
  return title ? `[${label}] ${title}` : `[${label}]`;
}
