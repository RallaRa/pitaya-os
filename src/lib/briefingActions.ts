export interface BriefingActionParams {
  coupon?: BriefingCouponParams;
  signage?: BriefingSignageParams;
  order?: BriefingOrderParams;
}

export interface BriefingAction {
  text: string;
  basis?: string;
  actionType?: BriefingActionType;
  params?: BriefingActionParams;
}

export interface ExecutableBriefingAction extends BriefingAction {
  actionType: BriefingActionType;
  params?: BriefingActionParams;
}

export interface BriefingCouponParams {
  title?: string;
  type?: 'percent' | 'fixed';
  value?: number;
  minAmount?: number;
  validDays?: number;
}

export interface BriefingSignageParams {
  prompt?: string;
}

export interface BriefingOrderParams {
  templateId?: string;
  templateName?: string;
}

export type BriefingActionType = 'coupon' | 'signage' | 'order' | 'none';

const ACTION_TYPES: BriefingActionType[] = ['coupon', 'signage', 'order', 'none'];

export const BRIEFING_EXECUTE_LABELS: Record<Exclude<BriefingActionType, 'none'>, string> = {
  coupon: '쿠폰 발행',
  signage: 'POP·사이니지',
  order: '발주',
};

function parseActionType(raw: unknown): BriefingActionType | undefined {
  if (typeof raw !== 'string') return undefined;
  const t = raw.trim().toLowerCase();
  return ACTION_TYPES.includes(t as BriefingActionType) ? t as BriefingActionType : undefined;
}

export function inferBriefingActionType(text: string): BriefingActionType {
  const lower = text.toLowerCase();
  if (/쿠폰|할인(?:율|가)?|프로모션|특가|세일|객단가/.test(text)) return 'coupon';
  if (/pop|사이니지|진열\s*문구|키오스크|전단|홍보\s*문구|tv\s*콘텐츠|슬라이드/.test(lower)) return 'signage';
  if (/발주|재고\s*보충|입고\s*요청/.test(text)) return 'order';
  return 'none';
}

function parseParams(raw: unknown): BriefingActionParams | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const params: BriefingActionParams = {};

  if (o.coupon && typeof o.coupon === 'object') {
    const c = o.coupon as Record<string, unknown>;
    params.coupon = {
      title: typeof c.title === 'string' ? c.title.trim() : undefined,
      type: c.type === 'fixed' ? 'fixed' : c.type === 'percent' ? 'percent' : undefined,
      value: typeof c.value === 'number' && c.value > 0 ? c.value : undefined,
      minAmount: typeof c.minAmount === 'number' && c.minAmount >= 0 ? c.minAmount : undefined,
      validDays: typeof c.validDays === 'number' && c.validDays > 0 ? c.validDays : undefined,
    };
  }

  if (o.signage && typeof o.signage === 'object') {
    const s = o.signage as Record<string, unknown>;
    params.signage = {
      prompt: typeof s.prompt === 'string' ? s.prompt.trim() : undefined,
    };
  }

  if (o.order && typeof o.order === 'object') {
    const ord = o.order as Record<string, unknown>;
    params.order = {
      templateId: typeof ord.templateId === 'string' ? ord.templateId.trim() : undefined,
      templateName: typeof ord.templateName === 'string' ? ord.templateName.trim() : undefined,
    };
  }

  return Object.keys(params).length > 0 ? params : undefined;
}

export function enrichBriefingAction(action: BriefingAction): ExecutableBriefingAction {
  const parsedType = parseActionType((action as { actionType?: string }).actionType);
  const actionType = parsedType && parsedType !== 'none'
    ? parsedType
    : inferBriefingActionType(action.text);
  const params = parseParams((action as { params?: unknown }).params);

  return {
    ...action,
    actionType,
    ...(params ? { params } : {}),
  };
}

export function getExecutableBriefingAction(action: BriefingAction): ExecutableBriefingAction {
  return enrichBriefingAction(action);
}

export function isBriefingActionExecutable(action: ExecutableBriefingAction): boolean {
  return action.actionType !== 'none';
}

export function parseBriefingActionFields(raw: Record<string, unknown>): Pick<BriefingAction, 'actionType' | 'params'> & {
  actionType?: BriefingActionType;
  params?: BriefingActionParams;
} {
  const actionType = parseActionType(raw.actionType);
  const params = parseParams(raw.params);
  return {
    ...(actionType ? { actionType } : {}),
    ...(params ? { params } : {}),
  };
}
