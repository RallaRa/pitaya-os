export type WikiDocStatus = 'published' | 'draft';

export interface WikiDoc {
  id: string;
  slug: string;
  title: string;
  content: string;
  category: string;
  relatedModule?: string;
  relatedPath?: string;
  status: WikiDocStatus;
  /** global = 전 매장 공통, 그 외 = 매장 전용 */
  storeId: string;
  order: number;
  updatedAt?: string;
}

export interface WikiDocIndexItem {
  slug: string;
  title: string;
  category: string;
  relatedPath?: string;
}
