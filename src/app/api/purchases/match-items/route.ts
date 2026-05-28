import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { adminDb } from '@/lib/firebase/admin';
import { verifyToken } from '@/lib/authVerify';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

async function checkAlias(alias: string, supplierId: string | null, storeId: string) {
  const key = `${storeId}_${alias}`;
  const doc = await adminDb.collection('item_aliases').doc(key).get();
  if (doc.exists) return doc.data();

  if (supplierId) {
    const globalKey = `${storeId}_${alias}`;
    const q = await adminDb.collection('item_aliases')
      .where('storeId', '==', storeId)
      .where('alias', '==', alias)
      .where('supplierId', '==', null)
      .limit(1).get();
    if (!q.empty) return q.docs[0].data();
  }
  return null;
}

async function findSimilarViaGemini(itemName: string, supplierName: string, storeId: string) {
  const snap = await adminDb.collection('items')
    .where('storeId', '==', storeId)
    .limit(100).get();
  if (snap.empty) return [];

  const itemsList = snap.docs.map(d => ({ id: d.id, name: d.data().name || '' }));
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const prompt = `아래 품목명과 가장 유사한 항목을 목록에서 찾아줘.
유사도 점수(0-100)와 근거를 JSON 배열로만 반환해. score 70 이상만 포함.

입력: "${itemName}" (거래처: ${supplierName})
목록: ${JSON.stringify(itemsList.map(i => i.name))}

반환 형식(JSON 배열만):
[{"name":"항목명","score":85,"reason":"근거"}]`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return [];
    const parsed = JSON.parse(match[0]);
    return parsed.map((p: any) => {
      const found = itemsList.find(i => i.name === p.name);
      return found ? { ...found, score: p.score, reason: p.reason } : null;
    }).filter(Boolean);
  } catch {
    return [];
  }
}

async function suggestFromName(itemName: string) {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  const prompt = `정육점 품목명 "${itemName}"에서 정보를 추출해 JSON으로만 반환해.
{"category":"한우|한돈|수입우|수입돈|계육|기타","cut":"부위명","storage":"냉장|냉동","unit":"kg|개|박스"}`;
  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const match = text.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : {};
  } catch {
    return {};
  }
}

export async function POST(req: NextRequest) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { itemName, supplierId, supplierName, storeId } = await req.json();
    if (!itemName || !storeId) return NextResponse.json({ error: 'itemName, storeId 필수' }, { status: 400 });

    /* 1단계: 알리아스 정확 매칭 */
    const aliasMatch = await checkAlias(itemName, supplierId || null, storeId);
    if (aliasMatch) {
      return NextResponse.json({
        type: 'alias',
        confidence: 100,
        needConfirm: false,
        item: aliasMatch,
        message: `✅ ${itemName} → ${aliasMatch.normalizedName} 자동 매칭`,
      });
    }

    /* 2단계: Gemini 유사도 검색 */
    const similar = await findSimilarViaGemini(itemName, supplierName || '', storeId);
    if (similar.length > 0) {
      return NextResponse.json({
        type: 'similar',
        confidence: similar[0].score,
        needConfirm: true,
        candidates: similar.slice(0, 4),
        message: `유사 품목 ${similar.length}개를 찾았습니다. 선택해주세요.`,
      });
    }

    /* 3단계: 신규 등록 */
    const suggested = await suggestFromName(itemName);
    return NextResponse.json({
      type: 'new',
      confidence: 0,
      needConfirm: true,
      suggestedData: { name: itemName, ...suggested },
      message: '등록된 품목이 없습니다. 새 품목으로 추가하시겠습니까?',
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/* 알리아스 저장 */
export async function PUT(req: NextRequest) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { alias, normalizedName, itemId, supplierId, supplierName, confidence, storeId } = await req.json();
    if (!alias || !normalizedName || !storeId) return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 });

    const key = `${storeId}_${alias}`;
    await adminDb.collection('item_aliases').doc(key).set({
      alias, normalizedName, itemId: itemId || null,
      supplierId: supplierId || null, supplierName: supplierName || null,
      confidence: confidence || 100,
      confirmedBy: authUser.uid,
      storeId,
      createdAt: new Date().toISOString(),
    }, { merge: true });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
