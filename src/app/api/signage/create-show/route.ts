import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyToken, isActiveStoreMember, canManageStore } from '@/lib/authVerify';
import { planToSignageContentUrl, type SignageSlidePlan } from '@/lib/signage/signageShowPlanner';

export async function POST(req: NextRequest) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const storeId = String(body.storeId || '');
    const slides = (body.slides || []) as SignageSlidePlan[];
    const autoApprove = Boolean(body.autoApprove);

    if (!storeId) {
      return NextResponse.json({ error: 'storeId 필요' }, { status: 400 });
    }
    if (!slides.length) {
      return NextResponse.json({ error: 'slides 필요' }, { status: 400 });
    }

    const member = await isActiveStoreMember(authUser.uid, storeId);
    if (!member && !await canManageStore(authUser.uid, storeId, authUser.email)) {
      return NextResponse.json({ error: '매장 접근 권한 없음' }, { status: 403 });
    }

    const countSnap = await adminDb.collection('signage_content')
      .where('storeId', '==', storeId)
      .get();
    let orderBase = countSnap.size;

    const batch = adminDb.batch();
    const createdIds: string[] = [];

    for (const slide of slides) {
      const ref = adminDb.collection('signage_content').doc();
      batch.set(ref, {
        storeId,
        type: 'text',
        title: slide.title,
        url: planToSignageContentUrl(slide),
        thumbnailUrl: '',
        duration: slide.duration,
        order: orderBase++,
        status: autoApprove ? 'approved' : 'pending',
        aiPrompt: `[${slide.topic}] ${slide.body}`,
        bgColor: slide.bgColor || '#1a1a2e',
        textColor: slide.textColor || '#ffffff',
        createdAt: FieldValue.serverTimestamp(),
        createdBy: authUser.uid,
        ...(autoApprove ? { approvedAt: FieldValue.serverTimestamp() } : {}),
      });
      createdIds.push(ref.id);
    }

    await batch.commit();

    if (autoApprove) {
      const approvedSnap = await adminDb.collection('signage_content')
        .where('storeId', '==', storeId)
        .where('status', '==', 'approved')
        .get();
      const approved = approvedSnap.docs
        .map(d => ({ id: d.id, order: (d.data().order as number) ?? 0 }))
        .sort((a, b) => a.order - b.order);
      await adminDb.collection('signage_playlist').doc(storeId).set({
        storeId,
        approvedIds: approved.map(a => a.id),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    return NextResponse.json({
      success: true,
      createdIds,
      count: createdIds.length,
      status: autoApprove ? 'approved' : 'pending',
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
