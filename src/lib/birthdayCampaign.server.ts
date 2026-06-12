import { adminDb } from '@/lib/firebase/admin';
import { FieldValue, Timestamp, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { addDaysYMD, getKSTTodayYMD } from '@/lib/dateUtils';
import { decryptCustomerFields } from '@/lib/customerPii';
import { getBirthdayCampaignSettings } from '@/lib/birthdaySettings';
import {
  birthdayCouponCode,
  birthdayYmdForYear,
  birthMonthDayLabel,
  campaignDocId,
  d3TargetYmd,
  getKstYear,
  isBirthdayOnYmd,
  maskPhoneForDisplay,
  parseBirthMonthDay,
} from '@/lib/birthdayCampaign';
import { discountLabel } from '@/lib/coupons/types';
import { ensureSalesAlertChannel, postMessengerText } from '@/lib/messenger/channels.server';

export interface BirthdayCustomerMatch {
  cusCode: string;
  name: string;
  phone: string;
  phoneMasked: string;
  birthMd: string;
  birthdayYmd: string;
}

export interface BirthdayRunResult {
  storeId: string;
  todayYmd: string;
  d3TargetYmd: string;
  d3Issued: number;
  d3Skipped: number;
  d0Notified: number;
  d0Customers: number;
  disabled?: boolean;
  processedAt: string;
}

function kstScheduledTimestamp(ymd: string, hour = 10): Timestamp {
  const h = String(hour).padStart(2, '0');
  return Timestamp.fromDate(new Date(`${ymd}T${h}:00:00+09:00`));
}

async function fetchAllCustomerDocs(storeId: string) {
  const docs: QueryDocumentSnapshot[] = [];
  let last: QueryDocumentSnapshot | undefined;
  while (true) {
    let q = adminDb.collection('pos_customers').where('storeId', '==', storeId).limit(1000);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    docs.push(...snap.docs);
    if (snap.docs.length < 1000) break;
    last = snap.docs[snap.docs.length - 1];
  }
  return docs;
}

function findBirthdayMatches(
  customerDocs: QueryDocumentSnapshot[],
  targetYmd: string,
): BirthdayCustomerMatch[] {
  const year = getKstYear(targetYmd);
  const matches: BirthdayCustomerMatch[] = [];

  for (const doc of customerDocs) {
    const r = doc.data();
    const cusCode = String(r.cusCode || '');
    if (!cusCode) continue;

    const pii = decryptCustomerFields(r);
    const md = parseBirthMonthDay(pii.birth);
    if (!md || !isBirthdayOnYmd(md, targetYmd)) continue;

    matches.push({
      cusCode,
      name: pii.name || cusCode,
      phone: pii.phone || '',
      phoneMasked: String(r.phoneMasked || ''),
      birthMd: birthMonthDayLabel(md),
      birthdayYmd: birthdayYmdForYear(md, year),
    });
  }

  return matches;
}

async function createBirthdayCoupon(
  storeId: string,
  cusCode: string,
  year: number,
  settings: Awaited<ReturnType<typeof getBirthdayCampaignSettings>>,
  startDate: string,
  endDate: string,
): Promise<{ couponId: string; code: string }> {
  const code = birthdayCouponCode(cusCode, year);
  const dup = await adminDb.collection('coupons')
    .where('storeId', '==', storeId)
    .where('code', '==', code)
    .limit(1)
    .get();

  if (!dup.empty) {
    return { couponId: dup.docs[0].id, code };
  }

  const title = `${year} 생일 축하 쿠폰`;
  const description = `생일 고객 전용 · ${discountLabel(settings.couponType, settings.couponValue)}`;
  const ref = await adminDb.collection('coupons').add({
    storeId,
    code,
    type: settings.couponType,
    value: settings.couponValue,
    minAmount: settings.couponMinAmount,
    maxDiscount: settings.couponType === 'percent' ? settings.couponValue * 1000 : 0,
    maxUse: 1,
    usedCount: 0,
    startDate,
    endDate,
    title,
    description,
    bodyLines: [description],
    isActive: true,
    source: 'birthday_campaign',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { couponId: ref.id, code };
}

async function hasActiveBirthdayQueue(
  storeId: string,
  cusCode: string,
  year: number,
): Promise<boolean> {
  const snap = await adminDb.collection('notification_queue')
    .where('storeId', '==', storeId)
    .where('customerId', '==', cusCode)
    .where('source', '==', 'birthday_d3')
    .limit(20)
    .get();

  return snap.docs.some(d => {
    const st = String(d.data().status || '');
    const y = Number(d.data().campaignYear || 0);
    return y === year && (st === 'pending' || st === 'sent');
  });
}

async function processD3(
  storeId: string,
  todayYmd: string,
  targetYmd: string,
  customers: BirthdayCustomerMatch[],
  settings: Awaited<ReturnType<typeof getBirthdayCampaignSettings>>,
): Promise<{ issued: number; skipped: number }> {
  if (!settings.d3QueueEnabled) return { issued: 0, skipped: customers.length };

  const year = getKstYear(targetYmd);
  const startDate = todayYmd;
  const endDate = addDaysYMD(targetYmd, settings.couponValidDays);
  let issued = 0;
  let skipped = 0;

  for (const c of customers) {
    const campId = campaignDocId(storeId, c.cusCode, year);
    const campRef = adminDb.collection('birthday_campaigns').doc(campId);
    const campSnap = await campRef.get();
    if (campSnap.exists && campSnap.data()?.d3ProcessedAt) {
      skipped++;
      continue;
    }

    if (await hasActiveBirthdayQueue(storeId, c.cusCode, year)) {
      skipped++;
      continue;
    }

    const { couponId, code } = await createBirthdayCoupon(
      storeId, c.cusCode, year, settings, startDate, endDate,
    );

    const message = `[Pitaya] ${c.name}님, 생일을 축하드립니다! ${discountLabel(settings.couponType, settings.couponValue)} 쿠폰이 준비되었습니다.`;
    const queueRef = adminDb.collection('notification_queue').doc();

    await queueRef.set({
      storeId,
      customerId: c.cusCode,
      customerName: c.name,
      phone: c.phoneMasked || c.phone,
      journeyStep: 'STEP4',
      source: 'birthday_d3',
      campaignYear: year,
      couponId,
      couponCode: code,
      message,
      status: 'pending',
      scheduledAt: kstScheduledTimestamp(todayYmd),
      createdAt: FieldValue.serverTimestamp(),
    });

    await campRef.set({
      storeId,
      cusCode: c.cusCode,
      year,
      customerName: c.name,
      phoneMasked: maskPhoneForDisplay(c.phone, c.phoneMasked),
      birthMd: c.birthMd,
      targetBirthdayYmd: c.birthdayYmd,
      phase: 'd3',
      couponId,
      couponCode: code,
      queueId: queueRef.id,
      redeemed: false,
      d3ProcessedAt: FieldValue.serverTimestamp(),
      createdAt: campSnap.exists ? campSnap.data()?.createdAt : FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    issued++;
  }

  return { issued, skipped };
}

async function processD0(
  storeId: string,
  todayYmd: string,
  customers: BirthdayCustomerMatch[],
  settings: Awaited<ReturnType<typeof getBirthdayCampaignSettings>>,
): Promise<{ notified: number; count: number }> {
  if (!settings.d0MessengerEnabled || !customers.length) {
    return { notified: 0, count: customers.length };
  }

  const dedupeRef = adminDb.collection('birthday_d0_sent').doc(`${storeId}_${todayYmd}`);
  if ((await dedupeRef.get()).exists) {
    return { notified: 0, count: customers.length };
  }

  const year = getKstYear(todayYmd);
  const lines = customers.map(c =>
    `${c.name} (${maskPhoneForDisplay(c.phone, c.phoneMasked)})\n방문 시 특별 응대 부탁드립니다`,
  );

  const text = [
    '⭐ 오늘 생일 고객',
    '',
    ...lines,
  ].join('\n');

  const roomId = await ensureSalesAlertChannel(storeId);
  await postMessengerText({ roomId, text });

  const batch = adminDb.batch();
  for (const c of customers) {
    const campId = campaignDocId(storeId, c.cusCode, year);
    batch.set(adminDb.collection('birthday_campaigns').doc(campId), {
      storeId,
      cusCode: c.cusCode,
      year,
      customerName: c.name,
      phoneMasked: maskPhoneForDisplay(c.phone, c.phoneMasked),
      birthMd: c.birthMd,
      targetBirthdayYmd: c.birthdayYmd,
      phase: 'd0',
      d0NotifiedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  batch.set(dedupeRef, {
    storeId,
    date: todayYmd,
    customerCount: customers.length,
    sentAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();

  return { notified: 1, count: customers.length };
}

export async function runBirthdayMarketingForStore(
  storeId: string,
  todayYmd = getKSTTodayYMD(),
): Promise<BirthdayRunResult> {
  const settings = await getBirthdayCampaignSettings(storeId);
  if (!settings.enabled) {
    return {
      storeId,
      todayYmd,
      d3TargetYmd: d3TargetYmd(todayYmd),
      d3Issued: 0,
      d3Skipped: 0,
      d0Notified: 0,
      d0Customers: 0,
      disabled: true,
      processedAt: new Date().toISOString(),
    };
  }

  const customerDocs = await fetchAllCustomerDocs(storeId);
  const d3Date = d3TargetYmd(todayYmd);
  const d3Customers = findBirthdayMatches(customerDocs, d3Date);
  const d0Customers = findBirthdayMatches(customerDocs, todayYmd);

  const d3 = await processD3(storeId, todayYmd, d3Date, d3Customers, settings);
  const d0 = await processD0(storeId, todayYmd, d0Customers, settings);

  return {
    storeId,
    todayYmd,
    d3TargetYmd: d3Date,
    d3Issued: d3.issued,
    d3Skipped: d3.skipped,
    d0Notified: d0.notified,
    d0Customers: d0.count,
    processedAt: new Date().toISOString(),
  };
}

export async function runBirthdayMarketingAllStores(): Promise<BirthdayRunResult[]> {
  const storesSnap = await adminDb.collection('stores').limit(100).get();
  const results: BirthdayRunResult[] = [];
  for (const storeDoc of storesSnap.docs) {
    results.push(await runBirthdayMarketingForStore(storeDoc.id));
  }
  return results;
}

export async function markBirthdayCouponRedeemed(
  storeId: string,
  cusCode: string,
  redemptionLogId: string,
  couponId: string,
): Promise<void> {
  const year = getKstYear();
  const campId = campaignDocId(storeId, cusCode, year);
  const ref = adminDb.collection('birthday_campaigns').doc(campId);
  const snap = await ref.get();
  if (!snap.exists) return;
  const data = snap.data()!;
  if (String(data.couponId || '') !== couponId) return;
  if (data.redeemed) return;

  await ref.update({
    redeemed: true,
    redeemedAt: FieldValue.serverTimestamp(),
    redemptionLogId,
    phase: 'redeemed',
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function listBirthdayCampaigns(
  storeId: string,
  opts: { year?: number; limit?: number } = {},
) {
  const year = opts.year ?? getKstYear();
  const limit = Math.min(200, Math.max(1, opts.limit ?? 50));

  const snap = await adminDb.collection('birthday_campaigns')
    .where('storeId', '==', storeId)
    .limit(500)
    .get();

  const items = snap.docs
    .map(d => {
      const r = d.data();
      return {
        id: d.id,
        cusCode: String(r.cusCode || ''),
        customerName: String(r.customerName || ''),
        phoneMasked: String(r.phoneMasked || ''),
        birthMd: String(r.birthMd || ''),
        targetBirthdayYmd: String(r.targetBirthdayYmd || ''),
        couponCode: String(r.couponCode || ''),
        couponId: String(r.couponId || ''),
        phase: String(r.phase || ''),
        redeemed: !!r.redeemed,
        year: Number(r.year || 0),
        d3ProcessedAt: r.d3ProcessedAt,
        d0NotifiedAt: r.d0NotifiedAt,
        redeemedAt: r.redeemedAt,
      };
    })
    .filter(r => r.year === year);

  items.sort((a, b) => String(b.targetBirthdayYmd).localeCompare(String(a.targetBirthdayYmd)));
  return { year, items: items.slice(0, limit), total: items.length };
}
