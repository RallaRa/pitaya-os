/** 기본 알림: 유통기한 7일·3일·1일 전 (KST 기준 당일 오전 크론) */
export const DEFAULT_EXPIRY_REMINDER_OFFSETS_DAYS = [7, 3, 1] as const;

export const EXPIRY_CALENDAR_ID = 'expiry';
export const EXPIRY_EVENT_TYPE = 'expiry';

export const EXPIRY_KEYWORD_RE = /유통기한|소비기한|유효기한|만료일/;

export const EXPIRY_NOTIFICATION_TYPE = 'expiry_reminder';

export const CALENDAR_LINK = '/dashboard/report/calendar';
