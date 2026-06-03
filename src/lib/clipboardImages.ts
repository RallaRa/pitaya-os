/** 클립보드에서 이미지 File 추출 (데스크톱·모바일 Chrome/Safari) */
export function extractImageFilesFromClipboard(
  dt: DataTransfer | null | undefined,
): File[] {
  if (!dt) return [];

  const out: File[] = [];
  const seen = new Set<string>();

  const push = (f: File | null) => {
    if (!f) return;
    const key = `${f.name}-${f.size}-${f.lastModified}`;
    if (seen.has(key)) return;
    const isImage =
      f.type.startsWith('image/') ||
      /\.(png|jpe?g|gif|webp|heic|heif|bmp)$/i.test(f.name) ||
      (!f.type && f.size > 0);
    if (isImage) {
      seen.add(key);
      out.push(f);
    }
  };

  if (dt.files?.length) {
    for (let i = 0; i < dt.files.length; i++) {
      push(dt.files[i]);
    }
  }

  for (const item of Array.from(dt.items || [])) {
    if (item.kind === 'file' || item.type.startsWith('image/')) {
      push(item.getAsFile());
    }
  }

  return out;
}
