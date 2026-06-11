export const WIKI_PAGE_CATEGORIES = [
  '운영매뉴얼',
  '육류부위설명',
  '거래처정보',
  '위생체크리스트',
] as const;

export type WikiPageCategory = (typeof WIKI_PAGE_CATEGORIES)[number];

export interface WikiPage {
  id: string;
  storeId: string;
  title: string;
  content: string;
  category: WikiPageCategory | string;
  createdBy: string;
  createdByName?: string;
  updatedBy?: string;
  updatedByName?: string;
  roomId?: string;
  version: number;
  updatedAt?: string;
  createdAt?: string;
}

export interface WikiPageVersion {
  id: string;
  version: number;
  title: string;
  content: string;
  category: string;
  updatedBy: string;
  updatedByName?: string;
  updatedAt?: string;
}

export interface WikiPageInput {
  title: string;
  content: string;
  category: string;
  roomId?: string;
}
