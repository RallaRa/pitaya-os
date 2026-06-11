import type {
  EmployeeSalaryBase,
  PayrollSettings,
  PayrollSlip,
  PayrollSlipLine,
} from '@/lib/hr-system/types';
import { DEFAULT_PAYROLL_SETTINGS } from '@/lib/hr-system/types';

export interface AttendanceSummary {
  workDays: number;
  actualWorkDays: number;
  leaveDays: number;
  absenceDays: number;
  lateCount: number;
}

export interface EmployeePayrollInput {
  empNo: string;
  empName: string;
  department: string;
  position: string;
  status: string;
  hireDate: string;
  resignDate?: string;
  salary: EmployeeSalaryBase;
  attendance: AttendanceSummary;
}

function roundWon(n: number): number {
  return Math.round(n);
}

function monthBounds(period: string): { start: string; end: string; daysInMonth: number } {
  const [y, m] = period.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const start = `${period}-01`;
  const end = `${period}-${String(daysInMonth).padStart(2, '0')}`;
  return { start, end, daysInMonth };
}

function isActiveInMonth(emp: EmployeePayrollInput, period: string): boolean {
  const { start, end } = monthBounds(period);
  if (emp.status === '퇴직' && emp.resignDate && emp.resignDate < start) return false;
  if (emp.hireDate && emp.hireDate > end) return false;
  return emp.status !== '삭제';
}

function taxableBase(salary: EmployeeSalaryBase, settings: PayrollSettings): number {
  const mealTaxable = Math.max(0, salary.mealAllowance - settings.tax.mealTaxFreeLimit);
  const other = (salary.otherAllowances || []).reduce((s, a) => s + (Number(a.amount) || 0), 0);
  return salary.baseSalary + mealTaxable + salary.transportAllowance + other;
}

function calcInsurance(
  taxable: number,
  settings: PayrollSettings,
): { deductions: PayrollSlipLine[]; employer: PayrollSlipLine[] } {
  const ins = settings.insurance;
  const pensionBase = Math.min(taxable, ins.pensionCap);
  const npEmp = roundWon(pensionBase * ins.nationalPensionEmployee);
  const npEr = roundWon(pensionBase * ins.nationalPensionEmployer);
  const hiEmp = roundWon(taxable * ins.healthInsuranceEmployee);
  const hiEr = roundWon(taxable * ins.healthInsuranceEmployer);
  const ltcEmp = roundWon(hiEmp * ins.longTermCareRate);
  const ltcEr = roundWon(hiEr * ins.longTermCareRate);
  const eiEmp = roundWon(taxable * ins.employmentInsuranceEmployee);
  const eiEr = roundWon(taxable * ins.employmentInsuranceEmployer);
  const iaEr = roundWon(taxable * ins.industrialAccidentEmployer);

  return {
    deductions: [
      { code: 'NP', label: '국민연금', amount: npEmp, type: 'deduction' },
      { code: 'HI', label: '건강보험', amount: hiEmp, type: 'deduction' },
      { code: 'LTC', label: '장기요양', amount: ltcEmp, type: 'deduction' },
      { code: 'EI', label: '고용보험', amount: eiEmp, type: 'deduction' },
    ],
    employer: [
      { code: 'NP_ER', label: '국민연금(회사)', amount: npEr, type: 'employer' },
      { code: 'HI_ER', label: '건강보험(회사)', amount: hiEr, type: 'employer' },
      { code: 'LTC_ER', label: '장기요양(회사)', amount: ltcEr, type: 'employer' },
      { code: 'EI_ER', label: '고용보험(회사)', amount: eiEr, type: 'employer' },
      { code: 'IA_ER', label: '산재보험(회사)', amount: iaEr, type: 'employer' },
    ],
  };
}

export function mergePayrollSettings(
  storeId: string,
  stored?: Partial<PayrollSettings> | null,
): PayrollSettings {
  const base = DEFAULT_PAYROLL_SETTINGS;
  return {
    storeId,
    payDayDefault: stored?.payDayDefault ?? base.payDayDefault,
    fiscalYearStart: stored?.fiscalYearStart ?? base.fiscalYearStart,
    insurance: { ...base.insurance, ...(stored?.insurance || {}) },
    tax: { ...base.tax, ...(stored?.tax || {}) },
    updatedAt: stored?.updatedAt,
    updatedBy: stored?.updatedBy,
  };
}

export function calculateEmployeeSlip(
  storeId: string,
  period: string,
  emp: EmployeePayrollInput,
  settings: PayrollSettings,
): PayrollSlip | null {
  if (!isActiveInMonth(emp, period)) return null;

  const salary = emp.salary;
  const otherTotal = (salary.otherAllowances || []).reduce((s, a) => s + (Number(a.amount) || 0), 0);
  const { daysInMonth } = monthBounds(period);

  const dailyRate = daysInMonth > 0
    ? (salary.totalMonthly || salary.baseSalary + salary.mealAllowance + salary.transportAllowance + otherTotal) / daysInMonth
    : 0;
  const unpaidAbsenceDeduction = roundWon(dailyRate * emp.attendance.absenceDays);

  const earnings: PayrollSlipLine[] = [
    { code: 'BASE', label: '기본급', amount: roundWon(salary.baseSalary), type: 'earning' },
  ];
  if (salary.mealAllowance) {
    earnings.push({ code: 'MEAL', label: '식대', amount: roundWon(salary.mealAllowance), type: 'earning' });
  }
  if (salary.transportAllowance) {
    earnings.push({ code: 'TRANS', label: '교통비', amount: roundWon(salary.transportAllowance), type: 'earning' });
  }
  (salary.otherAllowances || []).forEach((a, i) => {
    if (a.amount) {
      earnings.push({ code: `OTH${i}`, label: a.name || '기타수당', amount: roundWon(Number(a.amount)), type: 'earning' });
    }
  });

  const grossPay = earnings.reduce((s, e) => s + e.amount, 0) - unpaidAbsenceDeduction;
  if (unpaidAbsenceDeduction > 0) {
    earnings.push({ code: 'ABS', label: '결근공제', amount: -unpaidAbsenceDeduction, type: 'earning' });
  }

  const taxable = Math.max(0, taxableBase(salary, settings) - unpaidAbsenceDeduction);
  const { deductions: insDed, employer } = calcInsurance(taxable, settings);

  const incomeTax = roundWon(taxable * settings.tax.defaultWithholdingRate);
  const localTax = roundWon(incomeTax * settings.tax.localTaxRate);

  const deductions: PayrollSlipLine[] = [
    ...insDed,
    { code: 'IT', label: '소득세', amount: incomeTax, type: 'deduction' },
    { code: 'LT', label: '지방소득세', amount: localTax, type: 'deduction' },
  ];

  const totalDeductions = deductions.reduce((s, d) => s + d.amount, 0);
  const netPay = grossPay - totalDeductions;
  const now = new Date().toISOString();

  return {
    id: `${storeId}_${period}_${emp.empNo}`,
    storeId,
    period,
    empNo: emp.empNo,
    empName: emp.empName,
    department: emp.department,
    position: emp.position,
    status: 'draft',
    earnings,
    deductions,
    employerContributions: employer,
    grossPay,
    totalDeductions,
    netPay,
    workDays: emp.attendance.workDays,
    actualWorkDays: emp.attendance.actualWorkDays,
    leaveDays: emp.attendance.leaveDays,
    absenceDays: emp.attendance.absenceDays,
    lateCount: emp.attendance.lateCount,
    bankName: salary.bankName || '',
    payDay: salary.payDay || settings.payDayDefault,
    createdAt: now,
    updatedAt: now,
  };
}

export function calculatePayrollRun(
  storeId: string,
  period: string,
  employees: EmployeePayrollInput[],
  settings: PayrollSettings,
  createdBy: string,
) {
  const slips: PayrollSlip[] = [];
  for (const emp of employees) {
    const slip = calculateEmployeeSlip(storeId, period, emp, settings);
    if (slip) slips.push(slip);
  }

  const totalGross = slips.reduce((s, x) => s + x.grossPay, 0);
  const totalDeductions = slips.reduce((s, x) => s + x.totalDeductions, 0);
  const totalNet = slips.reduce((s, x) => s + x.netPay, 0);
  const totalEmployerCost = slips.reduce(
    (s, x) => s + x.employerContributions.reduce((a, c) => a + c.amount, 0),
    0,
  );
  const now = new Date().toISOString();

  return {
    run: {
      id: `${storeId}_${period}`,
      storeId,
      period,
      status: 'draft' as const,
      employeeCount: slips.length,
      totalGross,
      totalDeductions,
      totalNet,
      totalEmployerCost,
      createdAt: now,
      updatedAt: now,
      createdBy,
    },
    slips,
  };
}

/** YYYY-MM 월 근무일수 (토·일 제외) */
export function countWorkDaysInMonth(period: string): number {
  const [y, m] = period.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  let count = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const wd = new Date(y, m - 1, d).getDay();
    if (wd !== 0 && wd !== 6) count++;
  }
  return count;
}
