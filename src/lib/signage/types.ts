export type SignageContentType = 'image' | 'video' | 'text' | 'slide';
export type SignageContentStatus = 'pending' | 'approved' | 'rejected';
export type SignageScreenKind = 'entrance' | 'counter' | 'waiting' | 'kitchen' | 'other';

export const SIGNAGE_CONTENT_TYPES: {
  id: SignageContentType;
  label: string;
  desc: string;
}[] = [
  { id: 'image', label: '🖼️ 이미지', desc: 'DALL-E' },
  { id: 'text', label: '📝 텍스트', desc: 'Groq' },
  { id: 'slide', label: '🎨 슬라이드', desc: 'Groq' },
  { id: 'video', label: '📹 영상', desc: '업로드' },
];

export const SIGNAGE_SCREEN_KINDS: { id: SignageScreenKind; label: string }[] = [
  { id: 'entrance', label: '입구' },
  { id: 'counter', label: '카운터' },
  { id: 'waiting', label: '대기실' },
  { id: 'kitchen', label: '작업장' },
  { id: 'other', label: '기타' },
];

export interface SignageSettings {
  storeId: string;
  defaultContentType: SignageContentType;
  updatedAt?: unknown;
}

export interface SignageContentDoc {
  id: string;
  storeId: string;
  type: SignageContentType;
  title: string;
  url?: string;
  thumbnailUrl?: string;
  duration: number;
  order: number;
  status: SignageContentStatus;
  aiPrompt?: string;
  bgColor?: string;
  textColor?: string;
  createdAt?: unknown;
}

export interface SignageScreenDoc {
  id: string;
  storeId: string;
  name: string;
  slug: string;
  screenKind: SignageScreenKind;
  contentIds: string[];
  isActive: boolean;
}
