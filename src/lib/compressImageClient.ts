/** 클라이언트 이미지 압축 — canvas, 문서 OCR용 고해상도 옵션 지원 */
export async function compressImageFromDataUrl(
  dataUrl: string,
  maxPx = 1024,
  quality = 0.7,
  enhanceDocument = false,
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
      const ctx = canvas.getContext('2d')!;
      if (enhanceDocument) {
        ctx.filter = 'contrast(1.2) brightness(1.06)';
      }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/** File → JPEG dataURL */
export async function compressImageFile(
  file: File,
  maxPx = 1024,
  quality = 0.7,
  enhanceDocument = false,
): Promise<string> {
  if (!file.type.startsWith('image/')) {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    return dataUrl;
  }

  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
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
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      if (enhanceDocument) {
        ctx.filter = 'contrast(1.2) brightness(1.06)';
      }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('이미지 로드 실패'));
    };
    img.src = objectUrl;
  });
}
