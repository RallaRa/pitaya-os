import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { verifyToken, getActualGroupId, isAdminGroup } from '@/lib/authVerify';
import { getAdminStorageBucket } from '@/lib/firebase/admin';
import { buildStoredFileUrl, formatStorageError } from '@/lib/firebase/storageBucket';
import { buildCouponImagePrompt } from '@/lib/coupons/buildCouponPrompt';
import { renderCouponCard } from '@/lib/coupons/renderCouponCard';
import { generateSignageBackgroundImage } from '@/lib/signage/generateBackgroundImage';
import { discountLabel, type CouponDiscountType } from '@/lib/coupons/types';

export const maxDuration = 120;

export async function POST(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: {
    storeId?: string;
    code?: string;
    title?: string;
    type?: CouponDiscountType;
    value?: number;
    imagePrompt?: string;
    backgroundUrl?: string;
    backgroundBase64?: string;
    includeBarcode?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const storeId = body.storeId?.trim() || '';
  const code = String(body.code || '').trim().toUpperCase();
  if (!storeId || !code) {
    return NextResponse.json({ error: 'storeId와 code가 필요합니다' }, { status: 400 });
  }

  const groupId = await getActualGroupId(authUser.uid, storeId);
  if (!isAdminGroup(groupId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    let background: Buffer;

    if (body.backgroundBase64) {
      const b64 = body.backgroundBase64.includes(',')
        ? body.backgroundBase64.split(',')[1]
        : body.backgroundBase64;
      background = Buffer.from(b64, 'base64');
    } else if (body.backgroundUrl) {
      const res = await fetch(body.backgroundUrl);
      if (!res.ok) throw new Error('배경 이미지를 불러오지 못했습니다');
      background = Buffer.from(await res.arrayBuffer());
    } else {
      const prompt = buildCouponImagePrompt({
        title: body.title || code,
        imagePrompt: body.imagePrompt || '',
        type: body.type === 'fixed' ? 'fixed' : 'percent',
        value: Number(body.value) || 10,
      });
      const generated = await generateSignageBackgroundImage(prompt);
      background = generated.buffer;
    }

    const includeBarcode = body.includeBarcode === true;

    const cardBuffer = await renderCouponCard({
      background,
      code,
      title: body.title || code,
      discountText: discountLabel(
        body.type === 'fixed' ? 'fixed' : 'percent',
        Number(body.value) || 0,
      ),
      includeBarcode,
    });

    const token = uuidv4();
    const storagePath = `stores/${storeId}/coupons/${Date.now()}_${code.slice(0, 12)}.png`;
    const bucket = getAdminStorageBucket();
    await bucket.file(storagePath).save(cardBuffer, {
      metadata: {
        contentType: 'image/png',
        metadata: { firebaseStorageDownloadTokens: token },
      },
    });

    const url = buildStoredFileUrl(bucket.name, storagePath, token);

    return NextResponse.json({
      ok: true,
      imageUrl: url,
      barcodeValue: includeBarcode ? code : '',
      includeBarcode,
    });
  } catch (e: unknown) {
    const msg = formatStorageError(e);
    console.error('[coupons generate-image]', e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
