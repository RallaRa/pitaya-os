import type { QueryDocumentSnapshot } from 'firebase-admin/firestore';
import type { Timestamp } from 'firebase-admin/firestore';

export interface MessageLogRow {
  id: string;
  campaignKey: string;
  couponCode: string;
  sent: number;
  failed: number;
  skipped: number;
  sentAtMs: number;
  sentYmd: string;
  requestedByEmail: string;
}

export interface RedemptionRow {
  id: string;
  code: string;
  campaignKey: string;
  discountAmount: number;
  orderAmount: number;
  appliedAtMs: number;
  appliedYmd: string;
}

export interface CampaignStatView {
  campaignKey: string;
  couponCode: string;
  sent: number;
  failed: number;
  sendCount: number;
  applied: number;
  applyRate: number | null;
  totalDiscount: number;
  totalOrderAmount: number;
  lastSentAt: string;
  requestedByEmail: string;
}

interface CampaignStatAcc {
  campaignKey: string;
  couponCode: string;
  sent: number;
  failed: number;
  sendCount: number;
  applied: number;
  applyRate: number | null;
  totalDiscount: number;
  totalOrderAmount: number;
  lastSentAtMs: number;
  requestedByEmail: string;
}

function tsToMs(ts: unknown): number {
  if (!ts) return 0;
  if (typeof ts === 'object' && ts !== null && 'toDate' in ts) {
    return (ts as Timestamp).toDate().getTime();
  }
  if (typeof ts === 'string') return new Date(ts).getTime() || 0;
  return 0;
}

function tsToIso(ts: unknown): string {
  const ms = tsToMs(ts);
  return ms ? new Date(ms).toISOString() : '';
}

export function normalizeCouponCode(raw: unknown): string {
  return String(raw || '').trim().toUpperCase();
}

export function parseMessageLogs(
  docs: QueryDocumentSnapshot[],
): MessageLogRow[] {
  return docs.map(doc => {
    const d = doc.data();
    const vars = (d.variables || {}) as Record<string, string>;
    return {
      id: doc.id,
      campaignKey: String(d.campaignKey || '').trim(),
      couponCode: normalizeCouponCode(vars.add1 || vars.add2 || ''),
      sent: Number(d.sent) || 0,
      failed: Number(d.failed) || 0,
      skipped: Number(d.skipped) || 0,
      sentAtMs: tsToMs(d.createdAt),
      sentYmd: tsToIso(d.createdAt).slice(0, 10),
      requestedByEmail: String(d.requestedByEmail || ''),
    };
  });
}

export function parseRedemptionLogs(
  docs: QueryDocumentSnapshot[],
): RedemptionRow[] {
  return docs.map(doc => {
    const d = doc.data();
    return {
      id: doc.id,
      code: normalizeCouponCode(d.code),
      campaignKey: String(d.campaignKey || '').trim(),
      discountAmount: Number(d.discountAmount) || 0,
      orderAmount: Number(d.orderAmount) || 0,
      appliedAtMs: tsToMs(d.appliedAt),
      appliedYmd: String(d.ymd || tsToIso(d.appliedAt).slice(0, 10)),
    };
  });
}

/** 발송 로그 기준 쿠폰 코드·시각에 맞는 캠페인 키 추론 */
export function inferCampaignKey(
  couponCode: string,
  appliedAtMs: number,
  messageLogs: MessageLogRow[],
): string {
  const code = normalizeCouponCode(couponCode);
  if (!code) return '';

  let bestKey = '';
  let bestMs = 0;

  for (const log of messageLogs) {
    if (!log.campaignKey || log.couponCode !== code) continue;
    if (log.sentAtMs > appliedAtMs) continue;
    if (log.sentAtMs >= bestMs) {
      bestMs = log.sentAtMs;
      bestKey = log.campaignKey;
    }
  }

  return bestKey;
}

export function attributeRedemptions(
  redemptions: RedemptionRow[],
  messageLogs: MessageLogRow[],
): RedemptionRow[] {
  return redemptions.map(r => {
    if (r.campaignKey) return r;
    const inferred = inferCampaignKey(r.code, r.appliedAtMs, messageLogs);
    return inferred ? { ...r, campaignKey: inferred } : r;
  });
}

export function buildCampaignStats(
  messageLogs: MessageLogRow[],
  redemptions: RedemptionRow[],
  sinceYmd: string,
): CampaignStatView[] {
  const byCampaign = new Map<string, CampaignStatAcc>();

  for (const log of messageLogs) {
    if (!log.campaignKey) continue;
    if (log.sentYmd && log.sentYmd < sinceYmd) continue;

    const existing = byCampaign.get(log.campaignKey) || {
      campaignKey: log.campaignKey,
      couponCode: log.couponCode,
      sent: 0,
      failed: 0,
      sendCount: 0,
      applied: 0,
      applyRate: null,
      totalDiscount: 0,
      totalOrderAmount: 0,
      lastSentAtMs: 0,
      requestedByEmail: log.requestedByEmail,
    };

    existing.sent += log.sent;
    existing.failed += log.failed;
    existing.sendCount += 1;
    if (log.couponCode && !existing.couponCode) existing.couponCode = log.couponCode;
    if (log.sentAtMs >= existing.lastSentAtMs) {
      existing.lastSentAtMs = log.sentAtMs;
      existing.requestedByEmail = log.requestedByEmail || existing.requestedByEmail;
    }

    byCampaign.set(log.campaignKey, existing);
  }

  const attributed = attributeRedemptions(redemptions, messageLogs);

  for (const r of attributed) {
    if (!r.campaignKey) continue;
    if (r.appliedYmd < sinceYmd) continue;

    const row = byCampaign.get(r.campaignKey) || {
      campaignKey: r.campaignKey,
      couponCode: r.code,
      sent: 0,
      failed: 0,
      sendCount: 0,
      applied: 0,
      applyRate: null,
      totalDiscount: 0,
      totalOrderAmount: 0,
      lastSentAtMs: 0,
      requestedByEmail: '',
    };

    row.applied += 1;
    row.totalDiscount += r.discountAmount;
    row.totalOrderAmount += r.orderAmount;
    if (!row.couponCode) row.couponCode = r.code;

    byCampaign.set(r.campaignKey, row);
  }

  return [...byCampaign.values()]
    .map(row => ({
      campaignKey: row.campaignKey,
      couponCode: row.couponCode,
      sent: row.sent,
      failed: row.failed,
      sendCount: row.sendCount,
      applied: row.applied,
      applyRate: row.sent > 0 ? Math.round((row.applied / row.sent) * 1000) / 10 : null,
      totalDiscount: row.totalDiscount,
      totalOrderAmount: row.totalOrderAmount,
      lastSentAt: row.lastSentAtMs ? new Date(row.lastSentAtMs).toISOString() : '',
      requestedByEmail: row.requestedByEmail,
    }))
    .sort((a, b) => b.sent - a.sent || b.applied - a.applied);
}

export function campaignSummary(campaigns: CampaignStatView[]) {
  const totalSent = campaigns.reduce((s, c) => s + c.sent, 0);
  const totalApplied = campaigns.reduce((s, c) => s + c.applied, 0);
  const totalDiscount = campaigns.reduce((s, c) => s + c.totalDiscount, 0);
  return {
    campaignCount: campaigns.length,
    totalSent,
    totalApplied,
    overallApplyRate: totalSent > 0 ? Math.round((totalApplied / totalSent) * 1000) / 10 : null,
    totalDiscount,
  };
}
