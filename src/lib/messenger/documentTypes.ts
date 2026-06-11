export const DOCUMENT_TYPES = ['발주서', '거래명세서', '위생일지', '자유양식'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  발주서: '발주서',
  거래명세서: '거래명세서',
  위생일지: '위생일지',
  자유양식: '자유양식',
};

export const DOCUMENT_TYPE_TEMPLATES: Record<DocumentType, string> = {
  발주서: `# 발주서

발주일: 
거래처: 
담당자: 

| 품목 | 규격 | 수량 | 단가 | 금액 | 비고 |
|------|------|------|------|------|------|
|      |      |      |      |      |      |

합계: 
납기요청일: 
`,
  거래명세서: `# 거래명세서

일자: 
공급자: 
공급받는자: 

| 품목 | 수량 | 단가 | 공급가액 | 세액 |
|------|------|------|----------|------|
|      |      |      |          |      |

합계금액: 
`,
  위생일지: `# 위생점검 일지

점검일: 
점검자: 

## 체크리스트
- [ ] 손 세척 · 장갑 착용
- [ ] 냉장 · 냉동 온도 기록
- [ ] 조리대 · 식기 살균
- [ ] 바닥 · 배수구 청소
- [ ] 폐기물 분리 · 처리

특이사항:

`,
  자유양식: `# 문서 제목

내용을 입력하세요.

`,
};

export interface MessengerDocument {
  id: string;
  storeId: string;
  title: string;
  type: DocumentType | string;
  content: string;
  collaborators: string[];
  roomId?: string;
  isTemplate?: boolean;
  createdBy: string;
  createdByName?: string;
  updatedBy?: string;
  updatedByName?: string;
  version: number;
  updatedAt?: string;
  createdAt?: string;
}

export interface DocumentVersion {
  id: string;
  version: number;
  title: string;
  content: string;
  type: string;
  updatedBy: string;
  updatedByName?: string;
  updatedAt?: string;
}

export interface DocumentInput {
  title: string;
  type: string;
  content?: string;
  roomId?: string;
  isTemplate?: boolean;
  collaborators?: string[];
}

export interface DocumentPresence {
  uid: string;
  name: string;
  color: string;
  cursor: number;
  updatedAt?: string;
}

export const COLLABORATOR_COLORS = [
  '#2dd4bf', '#f472b6', '#a78bfa', '#fb923c', '#38bdf8', '#facc15', '#4ade80',
];
