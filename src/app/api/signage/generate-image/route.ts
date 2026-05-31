import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import { verifyToken } from '@/lib/authVerify';
import { adminStorage } from '@/lib/firebase/admin';

export async function POST(req: NextRequest) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { prompt, title, storeId } = await req.json();
    if (!prompt?.trim()) {
      return NextResponse.json({ error: 'prompt required' }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'OPENAI_API_KEY 미설정' }, { status: 500 });
    }

    const openai = new OpenAI({ apiKey });
    const response = await openai.images.generate({
      model: 'dall-e-3',
      prompt: `정육점 사이니지용 이미지. ${prompt}. 고품질, 상업용, 가로형 16:9, 선명하고 식욕을 돋우는 이미지`,
      n: 1,
      size: '1792x1024',
      quality: 'standard',
      response_format: 'url',
    });

    const tempUrl = response.data?.[0]?.url;
    if (!tempUrl) {
      return NextResponse.json({ error: '이미지 생성 실패' }, { status: 500 });
    }

    const imgRes = await fetch(tempUrl);
    const buffer = Buffer.from(await imgRes.arrayBuffer());
    const token = uuidv4();
    const sid = storeId || 'global';
    const storagePath = `stores/${sid}/signage/${Date.now()}_${token.slice(0, 8)}.png`;

    const bucket = adminStorage.bucket();
    await bucket.file(storagePath).save(buffer, {
      metadata: {
        contentType: 'image/png',
        metadata: { firebaseStorageDownloadTokens: token },
      },
    });

    const url =
      `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media&token=${token}`;

    return NextResponse.json({ url, thumbnailUrl: url, success: true, title });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[signage generate-image]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
