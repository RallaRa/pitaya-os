import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { verifyToken, getActualGroupId, isAdminGroup } from '@/lib/authVerify';
import { getAdminStorageBucket } from '@/lib/firebase/admin';
import { buildStoredFileUrl, formatStorageError } from '@/lib/firebase/storageBucket';
import { renderCouponCard } from '@/lib/coupons/renderCouponCard';
import { discountLabel, type CouponDiscountType } from '@/lib/coupons/types';

export const maxDuration = 60;

export async function POST(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: {
    storeId?: string;
    code?: string;
    title?: string;
    type?: CouponDiscountType;
    value?: number;
    fileContent?: string;
    fileName?: string;
    mimeType?: string;
    skipBarcode?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const storeId = body.storeId?.trim() || '';
  const code = String(body.code || '').trim().toUpperCase();
  if (!storeId || !code || !body.fileContent) {
    return NextResponse.json({ error: 'storeId, code, fileContent required' }, { status: 400 });
  }

  const groupId = await getActualGroupId(authUser.uid, storeId);
  if (!isAdminGroup(groupId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const b64 = body.fileContent.includes(',') ? body.fileContent.split(',')[1] : body.fileContent;
    const uploadBuffer = Buffer.from(b64, 'base64');
    if (uploadBuffer.length > 15 * 1024 * 1024) {
      return NextResponse.json({ error: '파일 크기는 15MB 이하여야 합니다' }, { status: 400 });
    }

    let finalBuffer: Buffer = uploadBuffer;
    if (!body.skipBarcode) {
      finalBuffer = Buffer.from(await renderCouponCard({
        background: uploadBuffer,
        code,
        title: body.title || code,
        discountText: discountLabel(
          body.type === 'fixed' ? 'fixed' : 'percent',
          Number(body.value) || 0,
        ),
      }));
    }

    const token = uuidv4();
    const ext = (body.fileName || 'upload.png').split('.').pop()?.toLowerCase() || 'png';
    const safeExt = ['png', 'jpg', 'jpeg', 'webp'].includes(ext) ? ext : 'png';
    const storagePath = `stores/${storeId}/coupons/upload_${Date.now()}_${code.slice(0, 8)}.${safeExt}`;
    const contentType = body.mimeType || (safeExt === 'jpg' || safeExt === 'jpeg' ? 'image/jpeg' : 'image/png');

    const bucket = getAdminStorageBucket();
    await bucket.file(storagePath).save(finalBuffer, {
      metadata: {
        contentType,
        metadata: { firebaseStorageDownloadTokens: token },
      },
    });

    const url = buildStoredFileUrl(bucket.name, storagePath, token);

    return NextResponse.json({
      ok: true,
      imageUrl: url,
      barcodeValue: code,
    });
  } catch (e: unknown) {
    const msg = formatStorageError(e);
    console.error('[coupons upload-image]', e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
