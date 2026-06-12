export const DEFAULT_BASE_SALARY = 3_100_000;
export const SYMBOLIC_EQUITY_RATE = 0.01;

export interface ProfitShareRates {
  employee: number;
  owner: number;
  tenureYears: number;
}

export interface OperatingProfitInput {
  netSales: number;
  rent: number;
  admin: number;
  operatingCost: number;
  totalBaseSalary: number;
}

export interface ProfitShareAllocation {
  empNo: string;
  empName: string;
  tenureYears: number;
  baseSalary: number;
  profitShareBonus: number;
  employeeRate: number;
}

export interface ProfitShareRunResult {
  period: string;
  netSales: number;
  rent: number;
  admin: number;
  operatingCost: number;
  totalBaseSalary: number;
  operatingProfit: number;
  distributableProfit: number;
  symbolicEquity: number;
  shareRates: ProfitShareRates;
  ownerShare: number;
  totalEmployeeBonus: number;
  allocations: ProfitShareAllocation[];
}

/** 입사일 기준 근속 연수 (만 N년차) */
export function calcTenureYears(hireDate: string, asOfYmd: string): number {
  if (!hireDate || hireDate.length < 10) return 0;
  const h = hireDate.slice(0, 10);
  const a = asOfYmd.slice(0, 10);
  const [hy, hm, hd] = h.split('-').map(Number);
  const [ay, am, ad] = a.split('-').map(Number);
  if (!hy || !ay) return 0;
  let years = ay - hy;
  if (am < hm || (am === hm && ad < hd)) years -= 1;
  return Math.max(0, years);
}

/** 근속 연수별 영업이익 분배율 (직원 / 사장) */
export function profitShareRatesForTenure(tenureYears: number): { employee: number; owner: number } {
  if (tenureYears >= 3) return { employee: 0.30, owner: 0.70 };
  if (tenureYears >= 2) return { employee: 0.50, owner: 0.50 };
  if (tenureYears >= 1) return { employee: 0.70, owner: 0.30 };
  return { employee: 0, owner: 1 };
}

export function calcOperatingProfit(input: OperatingProfitInput): number {
  const profit = input.netSales
    - input.rent
    - input.admin
    - input.operatingCost
    - input.totalBaseSalary;
  return Math.round(profit);
}

export function buildProfitShareRun(params: {
  period: string;
  asOfYmd: string;
  netSales: number;
  rent: number;
  admin: number;
  operatingCost: number;
  employees: Array<{
    empNo: string;
    empName: string;
    hireDate: string;
    baseSalary: number;
    status: string;
  }>;
}): ProfitShareRunResult {
  const active = params.employees.filter(e =>
    e.empNo && e.status !== '퇴직' && e.status !== '삭제',
  );
  const totalBaseSalary = active.reduce((s, e) => s + (e.baseSalary || DEFAULT_BASE_SALARY), 0);
  const operatingProfit = calcOperatingProfit({
    netSales: params.netSales,
    rent: params.rent,
    admin: params.admin,
    operatingCost: params.operatingCost,
    totalBaseSalary,
  });

  const distributableProfit = Math.max(0, Math.round(operatingProfit * (1 - SYMBOLIC_EQUITY_RATE)));
  const symbolicEquity = Math.max(0, operatingProfit - distributableProfit);

  const tenureList = active.map(e => calcTenureYears(e.hireDate, params.asOfYmd));
  const determiningTenure = tenureList.length ? Math.max(...tenureList) : 0;
  const rates = profitShareRatesForTenure(determiningTenure);

  const totalEmployeeBonus = Math.round(distributableProfit * rates.employee);
  const ownerShare = Math.round(distributableProfit * rates.owner);
  const eligible = active.filter((_, i) => tenureList[i] >= 1);
  const perHead = eligible.length > 0
    ? Math.round(totalEmployeeBonus / eligible.length)
    : 0;

  const allocations: ProfitShareAllocation[] = active.map((e, i) => {
    const tenureYears = tenureList[i];
    const employeeRate = profitShareRatesForTenure(tenureYears).employee;
    return {
      empNo: e.empNo,
      empName: e.empName,
      tenureYears,
      baseSalary: e.baseSalary || DEFAULT_BASE_SALARY,
      profitShareBonus: tenureYears >= 1 ? perHead : 0,
      employeeRate,
    };
  });

  return {
    period: params.period,
    netSales: params.netSales,
    rent: params.rent,
    admin: params.admin,
    operatingCost: params.operatingCost,
    totalBaseSalary,
    operatingProfit,
    distributableProfit,
    symbolicEquity,
    shareRates: { ...rates, tenureYears: determiningTenure },
    ownerShare,
    totalEmployeeBonus,
    allocations,
  };
}

export function formatProfitSharePayslipText(
  period: string,
  alloc: ProfitShareAllocation,
): string {
  const total = alloc.baseSalary + alloc.profitShareBonus;
  return [
    `💰 ${period} 급여명세`,
    `기본급: ${alloc.baseSalary.toLocaleString()}원`,
    alloc.profitShareBonus > 0
      ? `이익분배 (${Math.round(alloc.employeeRate * 100)}%): ${alloc.profitShareBonus.toLocaleString()}원`
      : '이익분배: 0원',
    `합계(세전): ${total.toLocaleString()}원`,
    alloc.tenureYears >= 1 ? `근속: ${alloc.tenureYears}년차` : '근속 1년 미만 — 이익분배 제외',
  ].join('\n');
}
