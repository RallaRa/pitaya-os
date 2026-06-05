import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { verifyToken, getActualGroupId, isAdminGroup } from '@/lib/authVerify';
import { todayKST } from '@/lib/coupons/couponRules';
import {
  buildCampaignStats,
  campaignSummary,
  parseMessageLogs,
  parseRedemptionLogs,
} from '@/lib/coupons/campaignAnalytics';

function daysAgoKST(n: number): string {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000 - n * 86400000);
  return d.toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  const days = Math.min(90, Math.max(7, Number(searchParams.get('days') || 30)));

  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  const groupId = await getActualGroupId(authUser.uid, storeId);
  if (!isAdminGroup(groupId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const sinceYmd = daysAgoKST(days - 1);
  const today = todayKST();

  const [logsSnap, couponsSnap, msgSnap] = await Promise.all([
    adminDb.collection('coupon_redemption_logs')
      .where('storeId', '==', storeId)
      .orderBy('appliedAt', 'desc')
      .limit(3000)
      .get(),
    adminDb.collection('coupons').where('storeId', '==', storeId).get(),
    adminDb.collection('customer_message_logs')
      .where('storeId', '==', storeId)
      .orderBy('createdAt', 'desc')
      .limit(500)
      .get(),
  ]);

  const couponMeta = new Map<string, {
    code: string;
    title: string;
    maxUse: number;
    usedCount: number;
    isActive: boolean;
    endDate: string | null;
  }>();
  for (const doc of couponsSnap.docs) {
    const d = doc.data();
    couponMeta.set(doc.id, {
      code: d.code || '',
      title: d.title || '',
      maxUse: d.maxUse || 0,
      usedCount: d.usedCount || 0,
      isActive: !!d.isActive,
      endDate: d.endDate || null,
    });
  }

  let totalRedemptions = 0;
  let totalDiscount = 0;
  let totalOrderAmount = 0;
  const byCoupon = new Map<string, {
    couponId: string;
    code: string;
    title: string;
    redemptions: number;
    totalDiscount: number;
    totalOrderAmount: number;
  }>();
  const daily = new Map<string, { date: string; count: number; discount: number }>();

  for (let i = 0; i < days; i++) {
    const d = daysAgoKST(days - 1 - i);
    daily.set(d, { date: d, count: 0, discount: 0 });
  }

  for (const doc of logsSnap.docs) {
    const d = doc.data();
    const ymd = String(d.ymd || '');
    if (ymd < sinceYmd || ymd > today) continue;

    const discount = Number(d.discountAmount) || 0;
    const orderAmount = Number(d.orderAmount) || 0;
    totalRedemptions++;
    totalDiscount += discount;
    totalOrderAmount += orderAmount;

    const cid = String(d.couponId || '');
    const meta = couponMeta.get(cid);
    const row = byCoupon.get(cid) || {
      couponId: cid,
      code: d.code || meta?.code || '',
      title: d.title || meta?.title || '',
      redemptions: 0,
      totalDiscount: 0,
      totalOrderAmount: 0,
    };
    row.redemptions++;
    row.totalDiscount += discount;
    row.totalOrderAmount += orderAmount;
    byCoupon.set(cid, row);

    if (daily.has(ymd)) {
      const day = daily.get(ymd)!;
      day.count++;
      day.discount += discount;
    }
  }

  const couponStats = [...byCoupon.values()]
    .map(c => {
      const meta = couponMeta.get(c.couponId);
      const maxUse = meta?.maxUse || 0;
      const usedCount = meta?.usedCount || c.redemptions;
      return {
        ...c,
        avgDiscount: c.redemptions ? Math.round(c.totalDiscount / c.redemptions) : 0,
        avgOrderAmount: c.redemptions ? Math.round(c.totalOrderAmount / c.redemptions) : 0,
        usageRate: maxUse > 0 ? Math.round((usedCount / maxUse) * 100) : null,
        isActive: meta?.isActive ?? true,
        endDate: meta?.endDate || null,
      };
    })
    .sort((a, b) => b.totalDiscount - a.totalDiscount);

  const messageLogs = parseMessageLogs(msgSnap.docs);
  const redemptionRows = parseRedemptionLogs(logsSnap.docs);
  const byCampaign = buildCampaignStats(messageLogs, redemptionRows, sinceYmd);
  const campaignStats = campaignSummary(byCampaign);

  return NextResponse.json({
    periodDays: days,
    sinceYmd,
    summary: {
      totalRedemptions,
      totalDiscount,
      totalOrderAmount,
      avgDiscount: totalRedemptions ? Math.round(totalDiscount / totalRedemptions) : 0,
      avgOrderAmount: totalRedemptions ? Math.round(totalOrderAmount / totalRedemptions) : 0,
      activeCoupons: couponsSnap.docs.filter(d => d.data().isActive).length,
    },
    dailyTrend: [...daily.values()],
    byCoupon: couponStats,
    byCampaign,
    campaignSummary: campaignStats,
  });
}
