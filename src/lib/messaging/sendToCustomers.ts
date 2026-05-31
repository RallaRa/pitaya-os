import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { queryCustomers, type CustomerQueryParams } from '@/lib/customerQuery';
import { fetchCustomerPiiBulk, normalizePhoneForMessaging } from '@/lib/customerPii';
import { getSolapiConfig, isSolapiConfigured } from '@/lib/solapi/config';
import { sendSolapiAlimtalkBatch } from '@/lib/solapi/sendAlimtalk';
import { getDhnConfig, isDhnConfigured } from '@/lib/dhn/config';
import { sendDhnAlimtalk } from '@/lib/dhn/sendAlimtalk';

const SOLAPI_BATCH_SIZE = 100;
const DHN_SEND_DELAY_MS = 80;
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
  templateId?: string;
  smsFallback?: boolean;
  variables?: CustomerMessageVariables;
  campaignKey?: string;
  dryRun?: boolean;
  requestedBy: string;
  requestedByEmail: string;
  groupId: string;
}

export interface SendCustomerMessagesResult {
  ok: boolean;
  dryRun: boolean;
  provider: 'solapi' | 'dhn' | 'none';
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

function getProvider(): 'solapi' | 'dhn' {
  const env = process.env.MESSAGE_PROVIDER?.trim().toLowerCase();
  if (env === 'dhn') return 'dhn';
  if (env === 'solapi') return 'solapi';
  return isSolapiConfigured() ? 'solapi' : 'dhn';
}

export function isMessagingConfigured(): boolean {
  return isSolapiConfigured() || isDhnConfigured();
}

function buildSolapiVariables(
  name: string,
  base: CustomerMessageVariables | undefined,
  customer: {
    cusCode: string;
    grade: string;
    point: number;
    lastVisitDate: string;
    totalPurchase: number;
  },
): Record<string, string> {
  const vars: Record<string, string> = {
    '#{고객명}': name,
    '#{추가정보1}': base?.add1 || '',
    '#{추가정보2}': base?.add2 || '',
    '#{추가정보3}': base?.add3 || '',
    '#{추가정보4}': base?.add4 || customer.grade || '',
    '#{추가정보5}': base?.add5 || String(customer.point || 0),
    '#{추가정보6}': base?.add6 || (customer.lastVisitDate || '').slice(0, 10),
    '#{추가정보7}': base?.add7 || String(customer.totalPurchase || 0),
    '#{추가정보8}': base?.add8 || customer.cusCode,
  };
  if (base?.add9) vars['#{추가정보9}'] = base.add9;
  if (base?.add10) vars['#{추가정보10}'] = base.add10;
  return vars;
}

function buildDhnVariables(
  base: CustomerMessageVariables | undefined,
  customer: {
    cusCode: string;
    grade: string;
    point: number;
    lastVisitDate: string;
    totalPurchase: number;
  },
) {
  return {
    add1: base?.add1,
    add2: base?.add2,
    add3: base?.add3,
    add4: base?.add4 || customer.grade || '',
    add5: base?.add5 || String(customer.point || 0),
    add6: base?.add6 || (customer.lastVisitDate || '').slice(0, 10),
    add7: base?.add7 || String(customer.totalPurchase || 0),
    add8: base?.add8 || customer.cusCode,
    add9: base?.add9,
    add10: base?.add10,
  };
}

export async function sendCustomerMessages(
  opts: SendCustomerMessagesOptions,
): Promise<SendCustomerMessagesResult> {
  const provider = getProvider();
  const solapiConfig = getSolapiConfig({
    templateId: opts.templateId || opts.templateCode,
    smsFallback: opts.smsFallback,
  });
  const dhnConfig = getDhnConfig({
    defaultTemplateCode: opts.templateCode,
    smsFallback: opts.smsFallback,
  });

  if (provider === 'solapi' && !solapiConfig && !opts.dryRun) {
    return {
      ok: false,
      dryRun: false,
      provider,
      totalMatched: 0,
      attempted: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      skipReasons: {},
      failures: [],
      message: 'SOLAPI 설정이 없습니다. .env에 SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_PF_ID, SOLAPI_SENDER_PHONE을 설정하세요.',
    };
  }

  if (provider === 'dhn' && !dhnConfig && !opts.dryRun) {
    return {
      ok: false,
      dryRun: false,
      provider,
      totalMatched: 0,
      attempted: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      skipReasons: {},
      failures: [],
      message: 'DHN API 설정이 없습니다.',
    };
  }

  const templateId = opts.templateId || opts.templateCode || solapiConfig?.templateId || dhnConfig?.defaultTemplateCode || '';
  if (!templateId && !opts.dryRun) {
    return {
      ok: false,
      dryRun: false,
      provider,
      totalMatched: 0,
      attempted: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      skipReasons: {},
      failures: [],
      message: '템플릿 ID/코드가 필요합니다 (SOLAPI_TEMPLATE_ID)',
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
  let skipped = 0;

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
      provider,
      totalMatched: queryResult.total,
      attempted: recipients.length,
      sent: 0,
      skipped,
      failed: 0,
      skipReasons,
      failures: [],
      message: `${recipients.length}명 발송 가능 (${provider}, 전체 ${queryResult.total}명)`,
    };
  }

  let attempted = 0;
  let sent = 0;
  let failed = 0;

  if (provider === 'solapi' && solapiConfig) {
    for (let i = 0; i < recipients.length; i += SOLAPI_BATCH_SIZE) {
      const chunk = recipients.slice(i, i + SOLAPI_BATCH_SIZE);
      attempted += chunk.length;

      const batchResult = await sendSolapiAlimtalkBatch(
        chunk.map(r => ({
          to: r.phone,
          smsFallback: opts.smsFallback,
          variables: buildSolapiVariables(r.name, opts.variables, r),
        })),
        templateId,
        solapiConfig,
      );

      if (batchResult.success) {
        sent += chunk.length;
        if (opts.campaignKey) {
          const batch = adminDb.batch();
          for (const r of chunk) {
            batch.set(
              adminDb.collection('customer_message_sent').doc(
                `${opts.storeId}_${r.cusCode}_${opts.campaignKey}`,
              ),
              {
                storeId: opts.storeId,
                cusCode: r.cusCode,
                campaignKey: opts.campaignKey,
                phone: r.phone.replace(/\d(?=\d{4})/g, '*'),
                templateCode: templateId,
                provider: 'solapi',
                sentAt: FieldValue.serverTimestamp(),
              },
            );
          }
          await batch.commit();
        }
      } else {
        failed += chunk.length;
        for (const r of chunk.slice(0, 5)) {
          failures.push({
            cusCode: r.cusCode,
            phone: r.phone,
            error: `[${batchResult.responseCode}] ${batchResult.responseMessage}`,
          });
        }
      }

      if (i + SOLAPI_BATCH_SIZE < recipients.length) {
        await sleep(200);
      }
    }
  } else if (dhnConfig) {
    for (const recipient of recipients) {
      attempted++;
      const result = await sendDhnAlimtalk({
        templateCode: templateId,
        recipientPhone: recipient.phone,
        recipientName: recipient.name,
        variables: buildDhnVariables(opts.variables, recipient),
        smsFallback: opts.smsFallback,
      }, dhnConfig);

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
            templateCode: templateId,
            provider: 'dhn',
            sentAt: FieldValue.serverTimestamp(),
          });
        }
      } else {
        failed++;
        if (failures.length < 20) {
          failures.push({
            cusCode: recipient.cusCode,
            phone: recipient.phone,
            error: `[${result.responseCode}] ${result.responseMessage}`,
          });
        }
      }

      if (attempted < recipients.length) {
        await sleep(DHN_SEND_DELAY_MS);
      }
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
    provider,
    templateCode: templateId,
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
    smsFallback: opts.smsFallback ?? solapiConfig?.smsFallback ?? dhnConfig?.smsFallback ?? true,
    failures: failures.slice(0, 20),
    createdAt: FieldValue.serverTimestamp(),
  });

  return {
    ok: failed === 0 || sent > 0,
    dryRun: false,
    provider,
    totalMatched: queryResult.total,
    attempted,
    sent,
    skipped,
    failed,
    skipReasons,
    failures: failures.slice(0, 20),
    logId: logRef.id,
    message: `${sent}명 발송 완료 (${provider}), ${failed}명 실패, ${skipped}명 제외`,
  };
}
