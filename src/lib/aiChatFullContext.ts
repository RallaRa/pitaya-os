import { adminDb } from '@/lib/firebase/admin';
import { getKSTTodayYMD } from '@/lib/dateUtils';
import { fetchNaverTrendData } from '@/lib/naverTrendServer';
import { fetchCommercialArea, fetchNaverNewsHeadlines } from '@/lib/areaContext';
import {
  fetchRecentLivestockDisease,
  summarizeLivestockDiseaseForAi,
} from '@/lib/mafra/fetchLivestockDisease';
import { fetchMeatPrices, fetchMeatAuction } from '@/lib/external/meatMarketData.server';
import { fetchStoreItemSales } from '@/lib/dashboardSalesData';

export const AI_EMPLOYEE_DATA_POLICY = `

=== 사원·HR 데이터 정책 (절대 준수) ===
- 사원·직원·HR·출퇴근·급여·연차·휴가·부서·개인 연락처·재직 여부는 **조회·요약·추론·비교 금지**
- 해당 질문에는 「사원 정보는 AI 대화에서 제공하지 않습니다. HR 메뉴를 이용해 주세요」라고만 답변
- hr_employees, hr_attendance, hr_leave, hr_dayoff, pos_employees 등 HR 컬렉션은 시스템 컨텍스트에 포함되지 않음
- 매장 운영·매출·고객·매입·쿠폰·주문·위생·캘린더(업무)·사이니지·위키 등 **그 외 Pitaya OS 데이터는 참조 가능**`;

export const AI_API_CATALOG_APPENDIX = `

=== Pitaya OS API·데이터 참조 (사원 정보 제외) ===
답변 시 아래 Pitaya OS 내부 API·Firestore 데이터를 1차 근거로 사용하세요. 추측보다 주입된 스냅샷·수치를 우선 인용하세요.

【매출·POS】
- GET /api/dashboard/today-sales, sales-compare, sales-forecast, sales-prediction, sales-review
- GET /api/dashboard/yesterday-analysis, weekly-analysis, prediction-analysis, total-partner
- Firestore: pos_daily_sales, daily_reports, pos_sales_header, pos_sales_detail, pos_finish_total, store_daily_item_stats, store_sales_targets, pos_sync_meta

【고객】
- GET /api/customers, /api/customers/analysis, /api/customers/purchase-analytics, /api/customers/purchase-history
- GET /api/dashboard/customer-visit-summary, /api/pos/customer-requests
- Firestore: pos_customers, pos_customer_sales, pos_customer_purchase_lines, customer_request_logs

【매입·품목·이력】
- GET /api/purchases, /api/purchases/item-price-history, /api/purchases/analyze-multi
- GET /api/scale/codes, /api/external/meat-history
- Firestore: purchase_records, item_prices, scale_codes, scale_code_pending, trace_records, suppliers/{storeId}/list, expiry_reminders

【쿠폰·주문】
- GET /api/coupons, /api/coupons/analytics, /api/coupons/validate
- GET /api/public-orders/sessions, /api/public/orders/[token]
- Firestore: coupons, coupon_layouts, coupon_redemption_logs, public_order_sessions, public_order_entries

【운영·콘텐츠】
- GET /api/wiki, /api/signage, /api/dashboard/comprehensive-opinion, /api/dashboard/ai-insight
- GET /api/ai/analysis-pack (분석 팩)
- Firestore: wiki_docs, signage_content, signage_playlist, calendar_events, hygiene_checklists, predictions, ai_partner_predictions

【외부·시장】
- GET /api/external/summary, /api/external/livestock-disease, /api/market-prices, /api/dashboard/weather

【AI 대화 본 채널】
- POST /api/ai — 일반·분석·토론 (현재 세션)
- 이력번호(12–15자리)는 자동 축산물 이력 조회 결과를 시스템 프롬프트에 주입함`;

function fmt(n: unknown): string {
  const v = Number(n);
  return Number.isFinite(v) ? v.toLocaleString('ko-KR') : '0';
}

async function safeCount(collection: string, field: string, value: string): Promise<number> {
  try {
    const snap = await adminDb.collection(collection).where(field, '==', value).limit(500).get();
    return snap.size;
  } catch {
    return 0;
  }
}

async function fetchRecentPurchaseRecords(storeId: string) {
  try {
    const snap = await adminDb.collection('purchase_records')
      .where('storeId', '==', storeId)
      .orderBy('purchaseDate', 'desc')
      .limit(5)
      .get();
    return snap.docs.map(d => d.data());
  } catch {
    const snap = await adminDb.collection('purchase_records')
      .where('storeId', '==', storeId)
      .limit(30)
      .get();
    return [...snap.docs]
      .map(d => d.data())
      .sort((a, b) => String(b.purchaseDate || '').localeCompare(String(a.purchaseDate || '')))
      .slice(0, 5);
  }
}

async function fetchTopItems(storeId: string) {
  const today = getKSTTodayYMD();
  try {
    const snap = await adminDb.collection('store_daily_item_stats')
      .where('storeId', '==', storeId)
      .where('date', '==', today)
      .limit(1)
      .get();
    if (!snap.empty) {
      const items = (snap.docs[0].data().items || []) as Array<{ name?: string; qty?: number; amount?: number }>;
      return items.slice(0, 8);
    }
  } catch { /* ignore */ }
  try {
    const snap = await adminDb.collection('pos_sales_detail')
      .where('storeId', '==', storeId)
      .where('saleDate', '==', today)
      .limit(200)
      .get();
    const map = new Map<string, { qty: number; amount: number }>();
    for (const doc of snap.docs) {
      const d = doc.data();
      const name = String(d.goodsName || d.itemName || '품목');
      const cur = map.get(name) || { qty: 0, amount: 0 };
      cur.qty += Number(d.qty || d.quantity || 0);
      cur.amount += Number(d.amount || d.saleAmount || 0);
      map.set(name, cur);
    }
    return [...map.entries()]
      .sort((a, b) => b[1].amount - a[1].amount)
      .slice(0, 8)
      .map(([name, v]) => ({ name, qty: v.qty, amount: v.amount }));
  } catch {
    return [];
  }
}

async function fetchActiveCoupons(storeId: string) {
  try {
    const snap = await adminDb.collection('coupons')
      .where('storeId', '==', storeId)
      .limit(20)
      .get();
    return snap.docs
      .map(d => d.data())
      .filter(c => c.status === 'active' || c.status === 'published' || !c.status)
      .slice(0, 5)
      .map(c => ({
        title: c.title || c.name || '쿠폰',
        discount: c.discountValue ?? c.discountAmount,
        type: c.discountType,
      }));
  } catch {
    return [];
  }
}

async function fetchUpcomingCalendar(storeId: string) {
  try {
    const snap = await adminDb.collection('calendar_events')
      .where('storeId', '==', storeId)
      .limit(30)
      .get();
    const today = getKSTTodayYMD();
    return [...snap.docs]
      .map(d => d.data())
      .filter(e => String(e.startDate || e.date || '') >= today)
      .sort((a, b) => String(a.startDate || a.date).localeCompare(String(b.startDate || b.date)))
      .slice(0, 5)
      .map(e => ({
        title: e.title || '일정',
        date: e.startDate || e.date,
      }));
  } catch {
    return [];
  }
}

/** AI 대화용 모듈별 스냅샷 (사원·HR 제외) */
export async function loadModuleSnapshotsAppendix(storeId: string): Promise<string> {
  const today = getKSTTodayYMD();

  const [
    storeSnap,
    syncSnap,
    customerCount,
    purchaseLineCount,
    scaleCount,
    orderSessionCount,
    wikiCount,
    recentPurchases,
    topItems,
    activeCoupons,
    upcomingEvents,
    expirySnap,
  ] = await Promise.all([
    adminDb.collection('stores').doc(storeId).get().catch(() => null),
    adminDb.collection('pos_sync_meta').doc(storeId).get().catch(() => null),
    safeCount('pos_customers', 'storeId', storeId),
    safeCount('pos_customer_purchase_lines', 'storeId', storeId),
    safeCount('scale_codes', 'storeId', storeId),
    safeCount('public_order_sessions', 'storeId', storeId),
    safeCount('wiki_docs', 'storeId', storeId),
    fetchRecentPurchaseRecords(storeId),
    fetchTopItems(storeId),
    fetchActiveCoupons(storeId),
    fetchUpcomingCalendar(storeId),
    adminDb.collection('expiry_reminders').where('storeId', '==', storeId).limit(5).get().catch(() => null),
  ]);

  const store = storeSnap?.exists ? storeSnap.data() : null;
  const sync = syncSnap?.exists ? syncSnap.data() : null;

  let block = `\n\n=== Pitaya OS 모듈 스냅샷 (storeId=${storeId}, 기준일 ${today}) ===\n`;

  if (store) {
    block += `매장: ${store.storeName || store.name || storeId}`;
    if (store.region) block += ` | 지역: ${store.region}`;
    if (store.address) block += ` | ${String(store.address).slice(0, 40)}`;
    block += '\n';
  }

  if (sync) {
    const lastSales = sync.lastSalesSync || sync.lastSync || sync.updatedAt;
    block += `POS 동기화: ${lastSales ? String(lastSales).slice(0, 19) : '기록 없음'}\n`;
  }

  block += `고객 마스터: ${customerCount}명`;
  if (purchaseLineCount > 0) block += ` | 회원 구매이력 라인: ${fmt(purchaseLineCount)}건+`;
  block += `\n저울·PLU 코드: ${scaleCount}건 | 공개주문 세션: ${orderSessionCount}건 | 위키 문서: ${wikiCount}건\n`;

  if (topItems.length > 0) {
    block += `\n오늘 상위 품목:\n`;
    block += topItems.map((it, i) =>
      `${i + 1}. ${it.name || '품목'} | ${fmt(it.qty)}개 | ${fmt(it.amount)}원`,
    ).join('\n');
    block += '\n';
  }

  if (recentPurchases.length > 0) {
    block += `\n최근 매입 (purchase_records):\n`;
    block += recentPurchases.map(p =>
      `- ${p.purchaseDate || '?'} | ${p.vendor || p.supplierName || p.itemName || '거래처'} | ${fmt(p.totalAmount)}원`,
    ).join('\n');
    block += '\n';
  }

  if (activeCoupons.length > 0) {
    block += `\n활성 쿠폰:\n`;
    block += activeCoupons.map(c =>
      `- ${c.title}${c.discount != null ? ` (${c.type || '할인'} ${c.discount})` : ''}`,
    ).join('\n');
    block += '\n';
  }

  if (upcomingEvents.length > 0) {
    block += `\n다가오는 캘린더 일정:\n`;
    block += upcomingEvents.map(e => `- ${e.date} | ${e.title}`).join('\n');
    block += '\n';
  }

  if (expirySnap && !expirySnap.empty) {
    block += `\n유통기한 알림 (최근):\n`;
    block += expirySnap.docs.slice(0, 5).map(d => {
      const x = d.data();
      return `- ${x.itemName || '품목'} | ${x.expiryDate || '?'} | ${x.status || '등록'}`;
    }).join('\n');
    block += '\n';
  }

  block += `\n위 스냅샷·분석 팩·매장 컨텍스트·위키·API 카탈로그를 종합해 답변하세요. 사원·HR 데이터는 없습니다.`;

  return block;
}

/** 일반 대화 모드 — DB·외부 API·뉴스·브리핑 캐시 종합 컨텍스트 */
export async function loadStrategicChatContextAppendix(storeId: string): Promise<string> {
  const today = getKSTTodayYMD();
  let regionSido = '서울';
  let regionSigungu = '';
  let regionKeyword = '';

  try {
    const storeSnap = await adminDb.collection('stores').doc(storeId).get();
    if (storeSnap.exists) {
      const d = storeSnap.data()!;
      regionSido = String(d.regionSido || regionSido);
      regionSigungu = String(d.regionSigungu || '');
      regionKeyword = regionSigungu || regionSido;
    }
  } catch { /* ignore */ }

  const briefingCacheId = `market_briefing_${storeId}_${today}`;
  const insightCacheId = `ai_insight_${storeId}_${today}`;

  const [
    briefingSnap,
    insightSnap,
    trendResult,
    news,
    livestock,
    meatPrices,
    meatAuction,
    salesItems,
    commercial,
  ] = await Promise.all([
    adminDb.collection('dashboard_cache').doc(briefingCacheId).get().catch(() => null),
    adminDb.collection('dashboard_cache').doc(insightCacheId).get().catch(() => null),
    fetchNaverTrendData(storeId),
    fetchNaverNewsHeadlines(6),
    fetchRecentLivestockDisease({ limit: 10, daysBack: 180, regionKeyword })
      .catch(() => ({ rows: [], totalCount: 0, fetchedAt: '', source: 'mafra' as const })),
    fetchMeatPrices(),
    fetchMeatAuction(),
    fetchStoreItemSales(storeId, 30, 12).catch(() => []),
    fetchCommercialArea(regionSido, regionSigungu).catch(() => null),
  ]);

  let block = `\n\n=== 전략 참조 컨텍스트 (DB·API·외부기사, ${today}) ===\n`;

  const briefing = briefingSnap?.exists ? (briefingSnap.data()?.result as Record<string, unknown> | undefined) : undefined;
  if (briefing?.summary || briefing?.opinion) {
    block += `\n[일일 마켓 브리핑 캐시]\n`;
    if (briefing.summary) block += `요약: ${String(briefing.summary).slice(0, 400)}\n`;
    if (briefing.opinion) block += `의견: ${String(briefing.opinion).slice(0, 400)}\n`;
    const actions = Array.isArray(briefing.actions) ? briefing.actions : [];
    if (actions.length > 0) {
      block += `조치: ${actions.slice(0, 3).map(a => typeof a === 'string' ? a : (a as { text?: string }).text || JSON.stringify(a)).join(' | ')}\n`;
    }
  }

  const insight = insightSnap?.exists ? (insightSnap.data()?.result as Record<string, unknown> | undefined) : undefined;
  if (insight?.summary) {
    block += `\n[AI 인사이트 캐시]\n${String(insight.summary).slice(0, 350)}\n`;
    const improvements = Array.isArray(insight.improvements) ? insight.improvements : [];
    if (improvements.length > 0) {
      block += improvements.slice(0, 3).map((imp: { category?: string; suggestion?: string }) =>
        `- ${imp.category || '개선'}: ${imp.suggestion || ''}`,
      ).join('\n');
      block += '\n';
    }
  }

  if (meatPrices.prices.length > 0) {
    block += `\n[축산 도매가 API]\n`;
    block += meatPrices.prices.slice(0, 6).map(p =>
      `${p.itemName}: ${Number(p.price).toLocaleString('ko-KR')}원/${p.unit}`,
    ).join('\n');
    block += '\n';
  } else if (meatPrices.error) {
    block += `\n[축산 도매가] ${meatPrices.error}\n`;
  }

  if (meatAuction.auction) {
    const a = meatAuction.auction;
    block += `[축산 경매] ${a.date} | ${a.count}두 | 평균 ${Number(a.avgPrice).toLocaleString('ko-KR')}원 (최고 ${Number(a.maxPrice).toLocaleString('ko-KR')} / 최저 ${Number(a.minPrice).toLocaleString('ko-KR')})\n`;
  }

  if (trendResult.trends.length > 0) {
    block += `\n[네이버 검색 트렌드]\n`;
    if (trendResult.marketKeywords?.length) {
      block += `키워드: ${trendResult.marketKeywords.join(', ')}\n`;
    }
    if (trendResult.operationHint) block += `운영힌트: ${trendResult.operationHint}\n`;
    block += trendResult.trends.slice(0, 5).map(t =>
      `${t.groupName}: 지수 ${t.current} (${t.change > 0 ? '+' : ''}${t.change}%)`,
    ).join('\n');
    block += '\n';
  } else if (trendResult.error) {
    block += `\n[네이버 트렌드] ${trendResult.error}\n`;
  }

  if (news.length > 0) {
    block += `\n[외부 뉴스 헤드라인]\n`;
    block += news.map(n => `· [${n.keyword}] ${n.title}`).join('\n');
    block += '\n';
  }

  if (livestock.rows.length > 0) {
    block += `\n[가축질병 MAFRA — ${regionKeyword || '전국'}]\n`;
    block += summarizeLivestockDiseaseForAi(livestock.rows.slice(0, 6));
    block += '\n';
  }

  if (commercial) {
    block += `\n[상권] ${commercial.region} | 밀도 ${commercial.storeDensity} | 경쟁 ${commercial.competitiveLevel} | ${commercial.businessSummary.slice(0, 120)} (${commercial.source})\n`;
  }

  if (salesItems.length > 0) {
    block += `\n[최근 30일 매출 TOP 품목 — Firestore]\n`;
    block += salesItems.slice(0, 10).map((it, i) =>
      `${i + 1}. ${it.name}: ${Number(it.qty || 0).toLocaleString('ko-KR')}개 / ${Number(it.amount || 0).toLocaleString('ko-KR')}원`,
    ).join('\n');
    block += '\n';
  }

  block += `\n※ 위 컨텍스트를 답변의 1차 근거로 사용하세요. 내부 DB·외부 API·뉴스를 **수치·헤드라인으로 인용**하고, 없는 항목은 「데이터 없음」이라고 하세요.\n`;

  return block;
}
