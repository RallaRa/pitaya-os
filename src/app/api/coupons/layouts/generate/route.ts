import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyToken, getActualGroupId, isAdminGroup } from '@/lib/authVerify';
import { getAdminStorageBucket } from '@/lib/firebase/admin';
import { buildStoredFileUrl, formatStorageError } from '@/lib/firebase/storageBucket';
import { runCouponLayoutAi, generateLayoutBackgroundBuffer } from '@/lib/coupons/couponLayoutAi';

export const maxDuration = 120;

export async function POST(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: {
    storeId?: string;
    storeName?: string;
    message?: string;
    imagePrompt?: string;
    name?: string;
    save?: boolean;
    aiOnly?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const storeId = body.storeId?.trim() || '';
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  const groupId = await getActualGroupId(authUser.uid, storeId);
  if (!isAdminGroup(groupId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    let name = body.name?.trim() || '';
    let imagePrompt = body.imagePrompt?.trim() || '';
    let reply = '';

    if (body.message?.trim()) {
      const ai = await runCouponLayoutAi({
        message: body.message.trim(),
        storeName: body.storeName,
      });
      reply = ai.reply;
      if (!name) name = ai.name;
      if (!imagePrompt) imagePrompt = ai.imagePrompt;

      if (body.aiOnly) {
        return NextResponse.json({
          ok: true,
          reply,
          name: name || ai.name,
          imagePrompt,
        });
      }
    }

    if (!imagePrompt) {
      return NextResponse.json({ error: '레이아웃 설명(message) 또는 imagePrompt 필요' }, { status: 400 });
    }

    if (body.aiOnly) {
      return NextResponse.json({
        ok: true,
        reply,
        name: name || '새 레이아웃',
        imagePrompt,
      });
    }

    const buffer = await generateLayoutBackgroundBuffer(imagePrompt);
    const token = uuidv4();
    const storagePath = `stores/${storeId}/coupon_layouts/${Date.now()}_layout.png`;
    const bucket = getAdminStorageBucket();
    await bucket.file(storagePath).save(buffer, {
      metadata: {
        contentType: 'image/png',
        metadata: { firebaseStorageDownloadTokens: token },
      },
    });
    const backgroundUrl = buildStoredFileUrl(bucket.name, storagePath, token);

    if (body.save !== false) {
      const ref = await adminDb.collection('coupon_layouts').add({
        storeId,
        name: name || '새 레이아웃',
        backgroundUrl,
        imagePrompt,
        includeBarcodeDefault: true,
        isDefault: false,
        createdBy: authUser.uid,
        createdAt: FieldValue.serverTimestamp(),
      });
      return NextResponse.json({
        ok: true,
        reply,
        layout: { id: ref.id, name: name || '새 레이아웃', backgroundUrl, imagePrompt },
      });
    }

    return NextResponse.json({
      ok: true,
      reply,
      layout: { name, backgroundUrl, imagePrompt },
    });
  } catch (e: unknown) {
    const msg = formatStorageError(e);
    console.error('[coupons/layouts/generate]', e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
