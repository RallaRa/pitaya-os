import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { queryCustomers, type CustomerQueryParams } from '@/lib/customerQuery';
import { fetchCustomerPiiBulk, normalizePhoneForMessaging } from '@/lib/customerPii';
import { getDhnConfig } from '@/lib/dhn/config';
import { sendDhnAlimtalk, type DhnAlimtalkParams } from '@/lib/dhn/sendAlimtalk';

const SEND_DELAY_MS = 80;
const MAX_RECIPIENTS = 5000;

export interface CustomerMessageVariables {
  add1?: string;
  add2?: string;
  add3?: string;
  add4?: string;
  add5?: string;
  add6?: string;
  add7?: string;
  add8?: string;
  add9?: string;
  add10?: string;
}

export interface SendCustomerMessagesOptions {
  storeId: string;
  filters: Omit<CustomerQueryParams, 'storeId'>;
  templateCode?: string;
  smsFallback?: boolean;
  /** 공통 템플릿 변수 — 고객명(kakao_name)은 자동 주입 */
  variables?: CustomerMessageVariables;
  /** 동일 캠페인 재발송 방지 키 */
  campaignKey?: string;
  dryRun?: boolean;
  requestedBy: string;
  requestedByEmail: string;
  groupId: string;
}

export interface SendCustomerMessagesResult {
  ok: boolean;
  dryRun: boolean;
  totalMatched: number;
  attempted: number;
  sent: number;
  skipped: number;
  failed: number;
  skipReasons: Record<string, number>;
  failures: { cusCode: string; phone: string; error: string }[];
  logId?: string;
  message?: string;
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function buildPerCustomerVariables(
  base: CustomerMessageVariables | undefined,
  customer: {
    cusCode: string;
    grade: string;
    point: number;
    lastVisitDate: string;
    totalPurchase: number;
  },
): DhnAlimtalkParams['variables'] {
  const vars: DhnAlimtalkParams['variables'] = { ...base };
  // add 필드에 #{고객명} 대신 kakao_name 사용. 추가정보는 사용자 입력 + 자동 보조값
  if (!vars.add4) vars.add4 = customer.grade || '';
  if (!vars.add5) vars.add5 = String(customer.point || 0);
  if (!vars.add6) vars.add6 = (customer.lastVisitDate || '').slice(0, 10);
  if (!vars.add7) vars.add7 = String(customer.totalPurchase || 0);
  if (!vars.add8) vars.add8 = customer.cusCode;
  return vars;
}

export async function sendCustomerMessages(
  opts: SendCustomerMessagesOptions,
): Promise<SendCustomerMessagesResult> {
  const config = getDhnConfig({
    defaultTemplateCode: opts.templateCode,
    smsFallback: opts.smsFallback,
  });

  if (!config && !opts.dryRun) {
    return {
      ok: false,
      dryRun: false,
      totalMatched: 0,
      attempted: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      skipReasons: {},
      failures: [],
      message: 'DHN API 설정이 없습니다. .env에 DHN_SENDER_PROFILE_KEY, DHN_SENDER_PHONE을 설정하세요.',
    };
  }

  const templateCode = opts.templateCode || config?.defaultTemplateCode || '';
  if (!templateCode && !opts.dryRun) {
    return {
      ok: false,
      dryRun: false,
      totalMatched: 0,
      attempted: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      skipReasons: {},
      failures: [],
      message: '템플릿 코드가 필요합니다 (DHN_TEMPLATE_CODE 또는 요청 templateCode)',
    };
  }

  const queryResult = await queryCustomers({
    storeId: opts.storeId,
    ...opts.filters,
    exportAll: true,
    page: 1,
    limit: MAX_RECIPIENTS,
  });

  const cusCodes = queryResult.customers.map(c => c.cusCode);
  const piiMap = await fetchCustomerPiiBulk(opts.storeId, cusCodes);

  const skipReasons: Record<string, number> = {};
  const failures: SendCustomerMessagesResult['failures'] = [];
  let attempted = 0;
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  const seenPhones = new Set<string>();
  const recipients: {
    cusCode: string;
    name: string;
    phone: string;
    grade: string;
    point: number;
    lastVisitDate: string;
    totalPurchase: number;
  }[] = [];

  for (const row of queryResult.customers) {
    const pii = piiMap.get(row.cusCode);
    if (!pii?.phone || pii.phone.includes('복호화')) {
      skipped++;
      skipReasons.no_phone = (skipReasons.no_phone || 0) + 1;
      continue;
    }

    const phone = normalizePhoneForMessaging(pii.phone);
    if (!phone) {
      skipped++;
      skipReasons.invalid_phone = (skipReasons.invalid_phone || 0) + 1;
      continue;
    }

    const phoneKey = phone.replace(/\D/g, '');
    if (seenPhones.has(phoneKey)) {
      skipped++;
      skipReasons.duplicate_phone = (skipReasons.duplicate_phone || 0) + 1;
      continue;
    }
    seenPhones.add(phoneKey);

    if (opts.campaignKey) {
      const dedupeId = `${opts.storeId}_${row.cusCode}_${opts.campaignKey}`;
      const dedupeSnap = await adminDb.collection('customer_message_sent').doc(dedupeId).get();
      if (dedupeSnap.exists) {
        skipped++;
        skipReasons.already_sent = (skipReasons.already_sent || 0) + 1;
        continue;
      }
    }

    recipients.push({
      cusCode: row.cusCode,
      name: pii.name,
      phone,
      grade: row.grade,
      point: row.point,
      lastVisitDate: row.lastVisit || row.lastVisitDate || '',
      totalPurchase: row.totalSales || row.totalPurchase || 0,
    });
  }

  if (opts.dryRun) {
    return {
      ok: true,
      dryRun: true,
      totalMatched: queryResult.total,
      attempted: recipients.length,
      sent: 0,
      skipped,
      failed: 0,
      skipReasons,
      failures: [],
      message: `${recipients.length}명 발송 가능 (전체 ${queryResult.total}명 중)`,
    };
  }

  for (const recipient of recipients) {
    attempted++;
    const result = await sendDhnAlimtalk({
      templateCode,
      recipientPhone: recipient.phone,
      recipientName: recipient.name,
      variables: buildPerCustomerVariables(opts.variables, recipient),
      smsFallback: opts.smsFallback,
    }, config);

    if (result.success) {
      sent++;
      if (opts.campaignKey) {
        await adminDb.collection('customer_message_sent').doc(
          `${opts.storeId}_${recipient.cusCode}_${opts.campaignKey}`,
        ).set({
          storeId: opts.storeId,
          cusCode: recipient.cusCode,
          campaignKey: opts.campaignKey,
          phone: recipient.phone.replace(/\d(?=\d{4})/g, '*'),
          templateCode,
          sentAt: FieldValue.serverTimestamp(),
        });
      }
    } else {
      failed++;
      failures.push({
        cusCode: recipient.cusCode,
        phone: recipient.phone,
        error: `[${result.responseCode}] ${result.responseMessage}`,
      });
      if (failures.length >= 20) {
        // cap stored failures
      }
    }

    if (attempted < recipients.length) {
      await sleep(SEND_DELAY_MS);
    }
  }

  const filterSnapshot = {
    grade: opts.filters.grade || '',
    search: opts.filters.search || '',
    joinFrom: opts.filters.joinFrom || '',
    joinTo: opts.filters.joinTo || '',
    visitFrom: opts.filters.visitFrom || '',
    visitTo: opts.filters.visitTo || '',
    cycleStatus: opts.filters.cycleStatus || '',
    sortBy: opts.filters.sortBy || 'lastVisitDate',
    sortOrder: opts.filters.sortOrder || 'desc',
  };

  const logRef = await adminDb.collection('customer_message_logs').add({
    storeId: opts.storeId,
    action: 'bulk_alimtalk',
    templateCode,
    campaignKey: opts.campaignKey || '',
    requestedBy: opts.requestedBy,
    requestedByEmail: opts.requestedByEmail,
    groupId: opts.groupId,
    totalMatched: queryResult.total,
    attempted,
    sent,
    skipped,
    failed,
    skipReasons,
    filters: filterSnapshot,
    variables: opts.variables || {},
    smsFallback: opts.smsFallback ?? config?.smsFallback ?? true,
    failures: failures.slice(0, 20),
    createdAt: FieldValue.serverTimestamp(),
  });

  return {
    ok: failed === 0 || sent > 0,
    dryRun: false,
    totalMatched: queryResult.total,
    attempted,
    sent,
    skipped,
    failed,
    skipReasons,
    failures: failures.slice(0, 20),
    logId: logRef.id,
    message: `${sent}명 발송 완료, ${failed}명 실패, ${skipped}명 제외`,
  };
}
