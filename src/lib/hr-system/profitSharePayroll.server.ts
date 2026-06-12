import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { fetchPeriodTotals } from '@/lib/dashboardSalesData';
import { parseFixedCosts } from '@/lib/fixedCosts';
import { ensureSalesAlertChannel, postMessengerText } from '@/lib/messenger/channels.server';
import {
  buildProfitShareRun,
  DEFAULT_BASE_SALARY,
  formatProfitSharePayslipText,
  type ProfitShareRunResult,
} from '@/lib/hr-system/profitShareCalc';
import {
  buildEmployeePayrollInputs,
  listPayrollSlips,
  runPayrollCalculation,
} from '@/lib/hr-system/payrollService';
import type { PayrollSlip } from '@/lib/hr-system/types';

function monthBounds(period: string): { start: string; end: string } {
  const [y, m] = period.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  return {
    start: `${period}-01`,
    end: `${period}-${String(daysInMonth).padStart(2, '0')}`,
  };
}

async function loadCostInputs(storeId: string) {
  const doc = await adminDb.collection('store_settings').doc(storeId).get();
  const fixed = parseFixedCosts(doc.data()?.fixed_costs);
  return {
    rent: fixed.rent,
    admin: fixed.admin,
    operatingCost: fixed.other,
  };
}

export async function previewProfitShare(
  storeId: string,
  period: string,
): Promise<ProfitShareRunResult> {
  const { start, end } = monthBounds(period);
  const [totals, costs, inputs] = await Promise.all([
    fetchPeriodTotals(storeId, start, end, period),
    loadCostInputs(storeId),
    buildEmployeePayrollInputs(storeId, period),
  ]);

  return buildProfitShareRun({
    period,
    asOfYmd: end,
    netSales: totals.net || 0,
    rent: costs.rent,
    admin: costs.admin,
    operatingCost: costs.operatingCost,
    employees: inputs.map(e => ({
      empNo: e.empNo,
      empName: e.empName,
      hireDate: e.hireDate,
      baseSalary: e.salary.baseSalary || DEFAULT_BASE_SALARY,
      status: e.status,
    })),
  });
}

async function applyProfitShareToSlips(
  storeId: string,
  period: string,
  result: ProfitShareRunResult,
): Promise<number> {
  const slips = await listPayrollSlips(storeId, period);
  const byEmpNo = new Map(slips.map(s => [s.empNo, s]));
  const batch = adminDb.batch();
  let updated = 0;

  for (const alloc of result.allocations) {
    const slip = byEmpNo.get(alloc.empNo);
    if (!slip) continue;

    const earnings = slip.earnings.filter(e => e.code !== 'PROFIT');
    if (alloc.profitShareBonus > 0) {
      earnings.push({
        code: 'PROFIT',
        label: '영업이익분배',
        amount: alloc.profitShareBonus,
        type: 'earning',
      });
    }

    const grossPay = earnings.reduce((s, e) => s + e.amount, 0);
    const netPay = grossPay - slip.totalDeductions;

    batch.set(
      adminDb.collection('hr_payroll_slips').doc(slip.id),
      {
        earnings,
        grossPay,
        netPay,
        profitShareBonus: alloc.profitShareBonus,
        profitShareTenureYears: alloc.tenureYears,
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
    updated++;
  }

  if (updated > 0) await batch.commit();
  return updated;
}

export async function runProfitSharePayroll(
  storeId: string,
  period: string,
  createdBy: string,
  options?: { skipPayrollCalc?: boolean; skipMessenger?: boolean },
): Promise<{
  result: ProfitShareRunResult;
  slipUpdates: number;
  payrollCreated: boolean;
}> {
  const result = await previewProfitShare(storeId, period);

  let payrollCreated = false;
  const existingSlips = await listPayrollSlips(storeId, period);
  if (!options?.skipPayrollCalc && existingSlips.length === 0) {
    await runPayrollCalculation(storeId, period, createdBy);
    payrollCreated = true;
  }

  const docId = `${storeId}_${period}`;
  await adminDb.collection('hr_profit_share_runs').doc(docId).set({
    id: docId,
    storeId,
    period,
    ...result,
    createdBy,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  for (const alloc of result.allocations) {
    await adminDb.collection('payroll').doc(period).collection('employees').doc(alloc.empNo).set({
      storeId,
      period,
      empNo: alloc.empNo,
      empName: alloc.empName,
      baseSalary: alloc.baseSalary,
      profitShareBonus: alloc.profitShareBonus,
      tenureYears: alloc.tenureYears,
      operatingProfit: result.operatingProfit,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  const slipUpdates = await applyProfitShareToSlips(storeId, period, result);

  if (!options?.skipMessenger && result.allocations.some(a => a.profitShareBonus > 0 || a.baseSalary > 0)) {
    try {
      const roomId = await ensureSalesAlertChannel(storeId);
      const lines = [
        `📋 ${period} 자동 급여·이익분배`,
        `월 매출: ${result.netSales.toLocaleString()}원`,
        `영업이익: ${result.operatingProfit.toLocaleString()}원`,
        `분배 기준: ${result.shareRates.tenureYears}년차 (${Math.round(result.shareRates.employee * 100)}/${Math.round(result.shareRates.owner * 100)})`,
        '',
        ...result.allocations.map(a => formatProfitSharePayslipText(period, a)),
      ];
      await postMessengerText({ roomId, text: lines.join('\n\n') });
    } catch { /* ignore */ }
  }

  return { result, slipUpdates, payrollCreated };
}

export async function getProfitShareRun(
  storeId: string,
  period: string,
): Promise<(ProfitShareRunResult & { id: string; storeId: string }) | null> {
  const snap = await adminDb.collection('hr_profit_share_runs').doc(`${storeId}_${period}`).get();
  if (!snap.exists) return null;
  return { id: snap.id, storeId, ...(snap.data() as ProfitShareRunResult) };
}

export async function runProfitShareAllStores(createdBy: string): Promise<Array<{
  storeId: string;
  ok: boolean;
  operatingProfit?: number;
  error?: string;
}>> {
  const storesSnap = await adminDb.collection('stores').where('status', '==', 'active').limit(30).get();
  const period = new Date().toISOString().slice(0, 7);
  const results = [];

  for (const doc of storesSnap.docs) {
    try {
      const { result } = await runProfitSharePayroll(doc.id, period, createdBy, {});
      results.push({ storeId: doc.id, ok: true, operatingProfit: result.operatingProfit });
    } catch (e: unknown) {
      results.push({
        storeId: doc.id,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return results;
}

export type { PayrollSlip };
