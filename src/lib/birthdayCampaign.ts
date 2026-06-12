import { addDaysYMD, getKSTTodayYMD, normDateYMD } from '@/lib/dateUtils';

export interface BirthMonthDay {
  month: number;
  day: number;
}

/** POS/암호화 생년월일 문자열 → 월·일 */
export function parseBirthMonthDay(raw: string): BirthMonthDay | null {
  const s = String(raw || '').trim();
  if (!s || s === '(복호화 실패)') return null;

  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) {
    const month = Number(m[2]);
    const day = Number(m[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return { month, day };
  }

  if (/^\d{8}$/.test(s)) {
    const month = Number(s.slice(4, 6));
    const day = Number(s.slice(6, 8));
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return { month, day };
  }

  if (/^\d{4}$/.test(s)) {
    const month = Number(s.slice(0, 2));
    const day = Number(s.slice(2, 4));
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return { month, day };
  }

  m = s.match(/^(\d{1,2})[-/.](\d{1,2})/);
  if (m) {
    const month = Number(m[1]);
    const day = Number(m[2]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return { month, day };
  }

  return null;
}

export function birthMonthDayLabel(md: BirthMonthDay): string {
  return `${String(md.month).padStart(2, '0')}-${String(md.day).padStart(2, '0')}`;
}

/** YYYY-MM-DD 날짜의 월·일이 생일과 일치하는지 */
export function isBirthdayOnYmd(md: BirthMonthDay, ymd: string): boolean {
  const n = normDateYMD(ymd);
  if (!n) return false;
  const parts = n.split('-').map(Number);
  if (parts.length < 3) return false;
  return parts[1] === md.month && parts[2] === md.day;
}

export function birthdayYmdForYear(md: BirthMonthDay, year: number): string {
  return `${year}-${String(md.month).padStart(2, '0')}-${String(md.day).padStart(2, '0')}`;
}

export function campaignDocId(storeId: string, cusCode: string, year: number): string {
  return `${storeId}_${cusCode}_${year}`.replace(/[/\\#?]/g, '_').slice(0, 500);
}

export function birthdayCouponCode(cusCode: string, year: number): string {
  const safe = String(cusCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(-8);
  return `BDAY${year}${safe || 'CUST'}`.slice(0, 24);
}

export function maskPhoneForDisplay(phone: string, phoneMasked: string): string {
  if (phoneMasked && phoneMasked.includes('*')) return phoneMasked;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-****-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-***-${digits.slice(6)}`;
  }
  return phoneMasked || phone || '-';
}

export function getKstYear(ymd = getKSTTodayYMD()): number {
  return Number(ymd.slice(0, 4));
}

export function d3TargetYmd(todayYmd = getKSTTodayYMD()): string {
  return addDaysYMD(todayYmd, 3);
}
