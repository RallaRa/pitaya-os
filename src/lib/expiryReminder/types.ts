/** 유통기한 알림 — 별도 기능으로 분리 가능한 독립 도메인 */

export type ExpiryReminderSource = 'ai_chat' | 'manual' | 'api';

export type ExpiryReminderStatus = 'active' | 'cancelled';

/** Firestore: expiry_reminders */
export interface ExpiryReminderRecord {
  id?: string;
  storeId: string;
  createdBy: string;
  itemName: string;
  expiryDate: string;
  calendarEventId: string;
  source: ExpiryReminderSource;
  reminderOffsetsDays: number[];
  /** offset 일수 → 발송 완료 여부 (키: "7", "3", "1") */
  notificationsSent: Record<string, boolean>;
  status: ExpiryReminderStatus;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ParsedExpiryInput {
  itemName: string;
  expiryDate: string;
}

export interface CreateExpiryReminderResult {
  id: string;
  calendarEventId: string;
  itemName: string;
  expiryDate: string;
  reminderOffsetsDays: number[];
  isUpdate: boolean;
}

export interface ExpiryReminderFromChatResult {
  created: boolean;
  result?: CreateExpiryReminderResult;
  parseError?: string;
}
