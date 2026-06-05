import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { verifyToken } from '@/lib/authVerify';
import { getAdminStorageBucket } from '@/lib/firebase/admin';
import { buildStoredFileUrl, formatStorageError } from '@/lib/firebase/storageBucket';
import { generateSignageBackgroundImage } from '@/lib/signage/generateBackgroundImage';

/** Cloudflare FLUX → DALL-E 폴백 + Firebase 업로드 */
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { prompt, title, storeId, includeBase64 } = await req.json() as {
      prompt?: string;
      title?: string;
      storeId?: string;
      includeBase64?: boolean;
    };

    if (!prompt?.trim()) {
      return NextResponse.json({ error: 'prompt required' }, { status: 400 });
    }

    const { buffer, provider, contentType } = await generateSignageBackgroundImage(prompt);

    const token = uuidv4();
    const sid = storeId || 'global';
    const ext = contentType === 'image/jpeg' ? 'jpg' : 'png';
    const storagePath = `stores/${sid}/signage/${Date.now()}_${token.slice(0, 8)}.${ext}`;

    const bucket = getAdminStorageBucket();
    await bucket.file(storagePath).save(buffer, {
      metadata: {
        contentType,
        metadata: { firebaseStorageDownloadTokens: token },
      },
    });

    const url = buildStoredFileUrl(bucket.name, storagePath, token);
    const mimePrefix = contentType === 'image/jpeg' ? 'image/jpeg' : 'image/png';

    return NextResponse.json({
      url,
      thumbnailUrl: url,
      success: true,
      title,
      imageProvider: provider,
      ...(includeBase64
        ? { backgroundDataUrl: `data:${mimePrefix};base64,${buffer.toString('base64')}` }
        : {}),
    });
  } catch (e: unknown) {
    const msg = formatStorageError(e);
    console.error('[signage generate-image]', e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
