import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import type { ImageGenerateParamsNonStreaming } from 'openai/resources/images';
import { v4 as uuidv4 } from 'uuid';
import { verifyToken } from '@/lib/authVerify';
import { getAdminStorageBucket } from '@/lib/firebase/admin';
import { formatStorageError } from '@/lib/firebase/storageBucket';

/** GPT Image 생성 + Firebase 업로드 (보통 30초~2분) */
export const maxDuration = 120;

function isGptImageModel(model: string): boolean {
  return model.startsWith('gpt-image');
}

async function imageBufferFromResponse(data: OpenAI.Images.ImagesResponse['data']): Promise<Buffer> {
  const item = data?.[0];
  if (item?.b64_json) {
    return Buffer.from(item.b64_json, 'base64');
  }
  if (item?.url) {
    const imgRes = await fetch(item.url);
    if (!imgRes.ok) throw new Error('생성 이미지 다운로드 실패');
    return Buffer.from(await imgRes.arrayBuffer());
  }
  throw new Error('이미지 생성 실패');
}

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

    const model = process.env.OPENAI_IMAGE_MODEL?.trim() || 'gpt-image-1';
    const gptImage = isGptImageModel(model);

    const genParams: ImageGenerateParamsNonStreaming = {
      model,
      prompt: `정육점 사이니지용 이미지. ${prompt}. 고품질, 상업용, 가로형 16:9, 선명하고 식욕을 돋우는 이미지`,
      n: 1,
      size: gptImage ? '1536x1024' : '1792x1024',
      quality: gptImage
        ? (process.env.OPENAI_IMAGE_QUALITY as 'low' | 'medium' | 'high' | undefined) || 'medium'
        : 'standard',
      ...(gptImage
        ? { output_format: 'png' }
        : { response_format: 'url' }),
    };

    const openai = new OpenAI({ apiKey });
    const response = await openai.images.generate(genParams);
    const buffer = await imageBufferFromResponse(response.data);

    const token = uuidv4();
    const sid = storeId || 'global';
    const storagePath = `stores/${sid}/signage/${Date.now()}_${token.slice(0, 8)}.png`;

    const bucket = getAdminStorageBucket();
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
    const msg = formatStorageError(e);
    console.error('[signage generate-image]', e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
