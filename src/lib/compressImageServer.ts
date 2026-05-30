// 클라이언트에서 이미 canvas 압축 후 전송 — 서버 재압축(sharp) 불필요

export async function compressBase64Image(
  content: string,
): Promise<{ data: string; mimeType: string }> {
  const match = content.match(/^data:([^;]+);base64,([\s\S]+)$/);
  const mimeType = match?.[1] || 'image/jpeg';
  const data = match?.[2] || content.replace(/^data:[^;]+;base64,/, '');
  return { data, mimeType };
}

export function estimateBase64Bytes(base64: string): number {
  const raw = base64.includes(',') ? base64.split(',')[1] : base64;
  return Math.ceil((raw.length * 3) / 4);
}
