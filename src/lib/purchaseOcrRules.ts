import { OCR_CATEGORY_RULES } from '@/lib/purchaseCategories';

/** OCR·구조화 공통 규칙 (앙상블·analyze-multi 공유) */
export const PURCHASE_OCR_FIELD_RULES = `
[거래처]
- supplierName = "공급자" 영역의 상호만 (판매한 업체).
- "공급받는자" 영역 상호는 supplierName에 넣지 말 것.

[품목 행]
- 품명·수량(숫자)·단가·공급가액·세액·이력번호를 우선 추출.
- "=== 이하여백 ===", "소 계", "합계", "비고" 행은 items에서 제외.
- unit(단위)은 확실할 때만 기재. 불확실하면 빈 문자열.

[금액]
- items의 supplyAmount·taxAmount 합이 이번 거래 합계의 기준.
- totalAmount 후보는 품목 합과 일치하는 값 (합계·소계·당일매출·출고액 등).
- 잔액·미수·전잔·금일잔·입금·수금 라벨 숫자는 totalAmount가 아니라 balanceFields에 분리.

[JSON 확장 필드]
- documentTotals: 문서에서 읽은 금액 숫자 후보 배열 (잔액 포함 가능).
- balanceFields: { "previousBalance": 0, "currentBalance": 0, "receivedAmount": 0 } 등.
`.trim();

export const ENSEMBLE_OCR_PROMPT = `거래명세서/세금계산서/매입전표를 분석해서 아래 JSON 배열로만 반환해.
마크다운 없이 순수 JSON만. 최소 1개 객체 포함.

[{
  "purchaseDate": "YYYY-MM-DD",
  "supplierName": "공급자 상호",
  "invoiceNumber": "",
  "items": [{
    "name": "품명",
    "category": "한돈|한우|수입육|계육및기타|박스|용기|봉투|케이스|스티커|기타원부자재",
    "qty": 0, "unit": "", "unitPrice": 0,
    "supplyAmount": 0, "taxAmount": 0, "traceNo": "", "origin": "", "cut": "", "grade": ""
  }],
  "supplyAmount": 0, "taxAmount": 0, "totalAmount": 0,
  "documentTotals": [],
  "balanceFields": {},
  "paymentMethod": "", "memo": ""
}]

${PURCHASE_OCR_FIELD_RULES}

${OCR_CATEGORY_RULES}`;

export const ANALYZE_MULTI_SYSTEM = `당신은 한국 정육점·식자재 매입 문서(거래명세서, 세금계산서, 매입전표, 영수증) 전문 OCR·분석 AI입니다.

작업:
1. 이미지/PDF에서 **모든 글자**를 읽는다 (작은 글씨, 표, 손글씨 포함).
2. 공급자·날짜·품목·수량·단가·공급가·세액을 추출한다.
3. 아래 JSON **배열**만 반환한다 (마크다운·설명 금지).

[
  {
    "purchaseDate": "YYYY-MM-DD",
    "supplierName": "공급자 상호",
    "invoiceNumber": "전표번호 (없으면 빈 문자열)",
    "items": [
      {
        "name": "품명",
        "category": "한돈|한우|수입육|계육및기타|박스|용기|봉투|케이스|스티커|기타원부자재",
        "qty": 수량(숫자),
        "unit": "단위 (불확실하면 빈 문자열)",
        "unitPrice": 단가(숫자),
        "supplyAmount": 공급가액(숫자),
        "taxAmount": 세액(숫자),
        "traceNo": "이력번호 (고기류만, 없으면 빈 문자열)",
        "origin": "원산지 (고기류만)",
        "cut": "부위 (고기류만)",
        "grade": "등급 (고기류만)"
      }
    ],
    "supplyAmount": 공급가액합계(숫자),
    "taxAmount": 세액합계(숫자),
    "totalAmount": 합계금액(숫자),
    "documentTotals": [문서 금액 후보 숫자들],
    "balanceFields": { "previousBalance": 0, "currentBalance": 0 },
    "paymentMethod": "현금|카드|외상|이체",
    "memo": "특이사항 (없으면 빈 문자열)"
  }
]

규칙:
- purchaseDate: 문서에서 날짜 추출, 형식은 YYYY-MM-DD. 추출 불가 시 오늘 날짜.
- items가 없으면 [] 반환.
- 금액은 콤마 제거한 순수 숫자 (예: 1,250,000 → 1250000).
- 여러 장/여러 업체 → 각각 별도 객체.
${PURCHASE_OCR_FIELD_RULES}
${OCR_CATEGORY_RULES}`;
