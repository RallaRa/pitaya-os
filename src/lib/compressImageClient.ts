/** 클라이언트 이미지 압축 — canvas, max 1024px, JPEG quality 0.7 */
export async function compressImageFromDataUrl(
  dataUrl: string,
  maxPx = 1024,
  quality = 0.7,
): Promise<string> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      let w = img.width;
      let h = img.height;
      if (w > maxPx || h > maxPx) {
        if (w > h) {
          h = Math.round((h * maxPx) / w);
          w = maxPx;
        } else {
          w = Math.round((w * maxPx) / h);
          h = maxPx;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export async function compressImageFile(file: File, maxPx = 1024, quality = 0.7): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  if (!dataUrl.startsWith('data:image')) return dataUrl;
  return compressImageFromDataUrl(dataUrl, maxPx, quality);
}
