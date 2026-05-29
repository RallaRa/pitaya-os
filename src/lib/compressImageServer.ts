import sharp from 'sharp';

const MAX_PX = 1024;
const JPEG_QUALITY = 70;

/** 서버 base64/dataURL 이미지 → JPEG 1024px 이하로 재압축 */
export async function compressBase64Image(content: string): Promise<{ data: string; mimeType: string }> {
  const match = content.match(/^data:([^;]+);base64,([\s\S]+)$/);
  const mimeType = match?.[1] || 'image/jpeg';
  const raw = match?.[2] || content.replace(/^data:[^;]+;base64,/, '');

  const input = Buffer.from(raw, 'base64');
  const compressed = await sharp(input)
    .rotate()
    .resize(MAX_PX, MAX_PX, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();

  return { data: compressed.toString('base64'), mimeType: 'image/jpeg' };
}

export function estimateBase64Bytes(base64: string): number {
  const raw = base64.includes(',') ? base64.split(',')[1] : base64;
  return Math.ceil((raw.length * 3) / 4);
}
