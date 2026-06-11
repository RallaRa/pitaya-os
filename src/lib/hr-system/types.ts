export interface PayrollInsuranceRates {
  nationalPensionEmployee: number;
  nationalPensionEmployer: number;
  healthInsuranceEmployee: number;
  healthInsuranceEmployer: number;
  longTermCareRate: number;
  employmentInsuranceEmployee: number;
  employmentInsuranceEmployer: number;
  industrialAccidentEmployer: number;
  /** 국민연금 기준소득월액 상한 (원) */
  pensionCap: number;
}

export interface PayrollTaxSettings {
  /** 간이세액표 미적용 시 기본 원천징수율 */
  defaultWithholdingRate: number;
  /** 지방소득세 = 소득세 × */
  localTaxRate: number;
  /** 비과세 식대 한도 (원) */
  mealTaxFreeLimit: number;
}

export interface PayrollSettings {
  storeId: string;
  payDayDefault: number;
  fiscalYearStart: number;
  insurance: PayrollInsuranceRates;
  tax: PayrollTaxSettings;
  updatedAt?: string;
  updatedBy?: string;
}

export interface EmployeeSalaryBase {
  type: string;
  baseSalary: number;
  mealAllowance: number;
  transportAllowance: number;
  otherAllowances: { name: string; amount: number }[];
  totalMonthly: number;
  payDay: number;
  bankName: string;
}

export interface PayrollSlipLine {
  code: string;
  label: string;
  amount: number;
  type: 'earning' | 'deduction' | 'employer';
}

export interface PayrollSlip {
  id: string;
  storeId: string;
  period: string;
  empNo: string;
  empName: string;
  department: string;
  position: string;
  status: 'draft' | 'confirmed';
  earnings: PayrollSlipLine[];
  deductions: PayrollSlipLine[];
  employerContributions: PayrollSlipLine[];
  grossPay: number;
  totalDeductions: number;
  netPay: number;
  workDays: number;
  actualWorkDays: number;
  leaveDays: number;
  absenceDays: number;
  lateCount: number;
  bankName: string;
  payDay: number;
  createdAt: string;
  updatedAt: string;
}

export interface PayrollRun {
  id: string;
  storeId: string;
  period: string;
  status: 'draft' | 'confirmed' | 'cancelled';
  employeeCount: number;
  totalGross: number;
  totalDeductions: number;
  totalNet: number;
  totalEmployerCost: number;
  confirmedAt?: string;
  confirmedBy?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  memo?: string;
}

export interface HrAppointment {
  id: string;
  storeId: string;
  empNo: string;
  empName: string;
  type: 'hire' | 'promotion' | 'transfer' | 'position' | 'resign';
  effectiveDate: string;
  fromDepartment?: string;
  toDepartment?: string;
  fromPosition?: string;
  toPosition?: string;
  memo?: string;
  createdAt: string;
  createdBy: string;
}

export const DEFAULT_PAYROLL_SETTINGS: Omit<PayrollSettings, 'storeId'> = {
  payDayDefault: 25,
  fiscalYearStart: 1,
  insurance: {
    nationalPensionEmployee: 0.045,
    nationalPensionEmployer: 0.045,
    healthInsuranceEmployee: 0.03545,
    healthInsuranceEmployer: 0.03545,
    longTermCareRate: 0.1281,
    employmentInsuranceEmployee: 0.009,
    employmentInsuranceEmployer: 0.009,
    industrialAccidentEmployer: 0.0085,
    pensionCap: 6370000,
  },
  tax: {
    defaultWithholdingRate: 0.033,
    localTaxRate: 0.1,
    mealTaxFreeLimit: 200000,
  },
};
