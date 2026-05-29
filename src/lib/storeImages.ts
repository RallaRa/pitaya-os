export const STORE_IMAGE_TYPES = [
  { id: 'logo', label: '매장 로고', icon: '🏪' },
  { id: 'storefront', label: '매장 외관', icon: '🏬' },
  { id: 'interior', label: '매장 내부', icon: '🏠' },
  { id: 'businessLicense', label: '사업자등록증', icon: '📄' },
  { id: 'hygieneLicense', label: '위생허가증', icon: '🧹' },
  { id: 'meatLicense', label: '축산물판매업허가증', icon: '🥩' },
  { id: 'etc', label: '기타', icon: '📎' },
] as const;

export type StoreImageCategory = (typeof STORE_IMAGE_TYPES)[number]['id'];

export interface StoreImageMeta {
  fileName: string;
  storagePath: string;
  fileUrl: string;
  category: string;
  fileSize: number;
  mimeType: string;
  uploadedAt: string | null;
  uploadedBy?: string;
}

export function formatFileSize(bytes: number): string {
  if (!bytes || bytes < 1024) return `${bytes || 0}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export async function compressStoreImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  if (file.size <= 5 * 1024 * 1024) return file;

  return new Promise(resolve => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    const img = new Image();
    img.onload = () => {
      const maxSize = 1920;
      let { width, height } = img;
      if (width > maxSize || height > maxSize) {
        if (width > height) {
          height = (height / width) * maxSize;
          width = maxSize;
        } else {
          width = (width / height) * maxSize;
          height = maxSize;
        }
      }
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(blob => {
        if (!blob) { resolve(file); return; }
        resolve(new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }));
      }, 'image/jpeg', 0.85);
    };
    img.onerror = () => resolve(file);
    img.src = URL.createObjectURL(file);
  });
}

export function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
