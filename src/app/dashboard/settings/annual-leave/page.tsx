'use client';

import { computeLeaveRemain, formatLeaveRemainLabel, leaveRemainClass } from '@/lib/hr/leaveRemainDisplay';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Loader2, CalendarPlus, RefreshCw, CheckCircle2, Info,
} from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { useAuth } from '@/context/AuthContext';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';

interface EmployeeLeave {
  empNo: string;
  name: string;
  department: string;
  hireDate: string;
  status: string;
  totalAnnualLeave: number;
  usedAnnualLeave: number;
  remainAnnualLeave: number;
  calculatedTotal: number;
  rule: string;
  completedYears: number;
  fullMonths: number;
  leaveYearStart: string;
  needsUpdate: boolean;
  error?: string;
}

export default function AnnualLeavePage() {
  const { currentStore } = useStore();
  const { user } = useAuth();
  const storeId = currentStore?.storeId || '';
  const isAdmin = ['master', 'superuser', 'admin', 'owner'].includes(currentStore?.role || '');

  const [employees, setEmployees] = useState<EmployeeLeave[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [asOf, setAsOf] = useState(() => new Date().toISOString().slice(0, 10));
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState<'ok' | 'err'>('ok');

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch(`/api/hr/annual-leave?storeId=${storeId}&asOf=${asOf}`, { headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEmployees(data.employees || []);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : '조회 실패';
      setMsg(message);
      setMsgType('err');
    } finally {
      setLoading(false);
    }
  }, [storeId, asOf]);

  useEffect(() => { load(); }, [load]);

  const toggleAll = () => {
    const targets = employees.filter(e => !e.error);
    if (selected.length === targets.length) setSelected([]);
    else setSelected(targets.map(e => e.empNo));
  };

  const handleGenerate = async (all = false) => {
    const empNos = all ? undefined : selected;
    if (!all && !selected.length) {
      setMsg('생성할 사원을 선택해주세요');
      setMsgType('err');
      return;
    }
    setGenerating(true);
    setMsg('');
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/hr/annual-leave', {
        method: 'POST',
        headers,
        body: JSON.stringify({ storeId, empNos, asOf, resetUsedOnNewYear: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMsg(`${data.updated}명 연차 생성/갱신 완료`);
      setMsgType('ok');
      setSelected([]);
      await load();
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : '생성 실패');
      setMsgType('err');
    } finally {
      setGenerating(false);
    }
  };

  if (!user) return null;

  if (!isAdmin) {
    return (
      <div className="p-6 text-center text-slate-400">관리자만 접근 가능합니다.</div>
    );
  }

  const needsUpdateCount = employees.filter(e => e.needsUpdate && !e.error).length;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <Link href="/dashboard/settings" className="flex items-center gap-2 text-slate-400 hover:text-teal-400 text-sm mb-4 w-fit">
        <ArrowLeft className="w-4 h-4" /> 설정으로
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-teal-400 flex items-center gap-2">
            <CalendarPlus className="w-6 h-6" /> 연차 생성
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            입사일·출근(만근) 기준 근로기준법 연차를 자동 계산합니다
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500">기준일</label>
          <input
            type="date"
            value={asOf}
            onChange={e => setAsOf(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200"
          />
          <button
            onClick={load}
            disabled={loading}
            className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-teal-400"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 mb-6 text-sm text-slate-400">
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 text-teal-400 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p><strong className="text-slate-300">1년 미만</strong> — 만근 월 1일씩 부여</p>
            <p><strong className="text-slate-300">1년 만근</strong> — 12일 + 3일 보너스 = 15일</p>
            <p><strong className="text-slate-300">1년 이후</strong> — 15일 기본, 입사 2년차부터 매년 1일 추가 (최대 25일)</p>
            <p className="text-xs text-slate-500 pt-1">
              연차 신청은 HR 캘린더에서 하며, 승인 시 잔여 연차가 자동 차감됩니다.
            </p>
          </div>
        </div>
      </div>

      {needsUpdateCount > 0 && (
        <div className="mb-4 px-4 py-2 bg-amber-900/20 border border-amber-700/40 rounded-lg text-sm text-amber-300">
          {needsUpdateCount}명의 연차가 갱신이 필요합니다
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-6 h-6 text-teal-400 animate-spin" />
        </div>
      ) : (
        <>
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto mb-6">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="bg-slate-800 border-b border-slate-700">
                  <th className="px-3 py-2 text-left">
                    <input
                      type="checkbox"
                      checked={selected.length > 0 && selected.length === employees.filter(e => !e.error).length}
                      onChange={toggleAll}
                    />
                  </th>
                  <th className="px-3 py-2 text-left text-slate-400">사원명</th>
                  <th className="px-3 py-2 text-left text-slate-400">부서</th>
                  <th className="px-3 py-2 text-left text-slate-400">입사일</th>
                  <th className="px-3 py-2 text-right text-slate-400">만근월</th>
                  <th className="px-3 py-2 text-right text-slate-400">현재/계산</th>
                  <th className="px-3 py-2 text-right text-slate-400">사용</th>
                  <th className="px-3 py-2 text-right text-slate-400">잔여</th>
                  <th className="px-3 py-2 text-left text-slate-400">적용규칙</th>
                </tr>
              </thead>
              <tbody>
                {employees.map(emp => {
                  const remain = emp.remainAnnualLeave ?? (emp.totalAnnualLeave - emp.usedAnnualLeave);
                  return (
                    <tr key={emp.empNo} className={`border-b border-slate-800/60 ${emp.needsUpdate ? 'bg-amber-950/10' : ''}`}>
                      <td className="px-3 py-2">
                        {!emp.error && (
                          <input
                            type="checkbox"
                            checked={selected.includes(emp.empNo)}
                            onChange={() => setSelected(prev =>
                              prev.includes(emp.empNo)
                                ? prev.filter(x => x !== emp.empNo)
                                : [...prev, emp.empNo],
                            )}
                          />
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-200 font-medium">{emp.name}</td>
                      <td className="px-3 py-2 text-slate-500">{emp.department || '-'}</td>
                      <td className="px-3 py-2 text-slate-400 tabular-nums">{emp.hireDate || '-'}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-400">
                        {emp.error ? '-' : `${emp.fullMonths}개월`}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {emp.error ? (
                          <span className="text-red-400 text-xs">{emp.error}</span>
                        ) : (
                          <>
                            <span className="text-slate-400">{emp.totalAnnualLeave}</span>
                            <span className="text-slate-600 mx-1">→</span>
                            <span className={emp.needsUpdate ? 'text-amber-400 font-semibold' : 'text-teal-400'}>
                              {emp.calculatedTotal}일
                            </span>
                          </>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-orange-400">{emp.usedAnnualLeave}일</td>
                      <td className={`px-3 py-2 text-right tabular-nums ${leaveRemainClass(remain)}`}>
                        {formatLeaveRemainLabel(remain)}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-500 max-w-[140px] truncate" title={emp.rule}>
                        {emp.rule || '-'}
                      </td>
                    </tr>
                  );
                })}
                {employees.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                      등록된 재직 사원이 없습니다
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => handleGenerate(false)}
              disabled={generating || !selected.length}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white rounded-xl font-medium text-sm"
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {generating ? '생성 중...' : `선택 ${selected.length}명 연차 생성`}
            </button>
            <button
              onClick={() => handleGenerate(true)}
              disabled={generating || employees.length === 0}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-200 rounded-xl font-medium text-sm border border-slate-600"
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarPlus className="w-4 h-4" />}
              전체 사원 일괄 생성
            </button>
          </div>

          {msg && (
            <p className={`text-sm mt-3 ${msgType === 'ok' ? 'text-teal-400' : 'text-red-400'}`}>
              {msg}
            </p>
          )}

          <div className="mt-6 pt-4 border-t border-slate-800">
            <Link
              href="/dashboard/settings/leave-status"
              className="text-sm text-slate-400 hover:text-teal-400"
            >
              → 연차현황 (사용 내역 확인)
            </Link>
            {' · '}
            <Link
              href="/dashboard/hr/calendar?tab=leave"
              className="text-sm text-slate-400 hover:text-teal-400"
            >
              → 연차 신청/승인
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
