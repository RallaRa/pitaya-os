'use client';

import { computeLeaveRemain, formatLeaveRemainLabel, leaveRemainClass } from '@/lib/hr/leaveRemainDisplay';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, CalendarDays } from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { useAuth } from '@/context/AuthContext';
import { isSuperuserEmail } from '@/lib/auth/permissions';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';

interface Employee {
  empNo: string;
  name: string;
  department?: string;
  totalAnnualLeave?: number;
  usedAnnualLeave?: number;
  remainAnnualLeave?: number;
  linkedUid?: string;
  linkedEmail?: string;
}

export default function LeaveStatusPage() {
  const { currentStore } = useStore();
  const { user } = useAuth();
  const storeId = currentStore?.storeId || '';
  const isSuper = isSuperuserEmail(user?.email);
  const isAdmin = isSuper || ['master', 'admin', 'owner'].includes(currentStore?.role || '');

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [leaveForm, setLeaveForm] = useState({
    leaveType: 'annual',
    startDate: '',
    endDate: '',
    reason: '연차 일괄 부여',
  });
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch(`/api/hr/employees?storeId=${storeId}`, { headers });
      const data = await res.json();
      setEmployees(data.employees || []);
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { load(); }, [load]);

  const toggleAll = () => {
    if (selected.length === employees.length) setSelected([]);
    else setSelected(employees.map(e => e.empNo));
  };

  const handleBulk = async () => {
    if (!selected.length || !leaveForm.startDate || !leaveForm.endDate) {
      setMsg('사원과 날짜를 선택해주세요');
      return;
    }
    setSubmitting(true);
    setMsg('');
    try {
      const targets = employees.filter(e => selected.includes(e.empNo));
      const records = targets.map(emp => ({
        type: 'leave' as const,
        userId: emp.linkedUid || emp.empNo,
        userName: emp.name,
        userEmail: emp.linkedEmail || '',
        storeId,
        leaveType: leaveForm.leaveType,
        startDate: leaveForm.startDate,
        endDate: leaveForm.endDate,
        reason: leaveForm.reason,
      }));
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/hr/bulk-register', {
        method: 'POST',
        headers,
        body: JSON.stringify({ records }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMsg(`${data.created}건 연차 일괄 등록 완료`);
      setSelected([]);
    } catch (e: any) {
      setMsg(e.message || '등록 실패');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="p-6 text-center text-slate-400">관리자만 접근 가능합니다.</div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <Link href="/dashboard/settings" className="flex items-center gap-2 text-slate-400 hover:text-teal-400 text-sm mb-4 w-fit">
        <ArrowLeft className="w-4 h-4" /> 설정으로
      </Link>

      <h1 className="text-2xl font-bold text-teal-400 flex items-center gap-2 mb-2">
        <CalendarDays className="w-6 h-6" /> 연차현황
      </h1>
      <Link href="/dashboard/settings/annual-leave" className="text-sm text-slate-400 hover:text-teal-400 mb-6 inline-block">
        → 연차 생성/갱신
      </Link>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 text-teal-400 animate-spin" /></div>
      ) : (
        <>
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden mb-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-800 border-b border-slate-700">
                  <th className="px-4 py-2 text-left text-slate-400">사원명</th>
                  <th className="px-4 py-2 text-left text-slate-400">부서</th>
                  <th className="px-4 py-2 text-right text-slate-400">총연차</th>
                  <th className="px-4 py-2 text-right text-slate-400">사용</th>
                  <th className="px-4 py-2 text-right text-slate-400">잔여</th>
                  <th className="px-4 py-2 text-slate-400">진행률</th>
                </tr>
              </thead>
              <tbody>
                {employees.map(emp => {
                  const total = emp.totalAnnualLeave ?? 0;
                  const used = emp.usedAnnualLeave ?? 0;
                  const remain = emp.remainAnnualLeave ?? computeLeaveRemain(total, used);
                  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
                  return (
                    <tr key={emp.empNo} className="border-b border-slate-800/60">
                      <td className="px-4 py-2 text-slate-200">{emp.name}</td>
                      <td className="px-4 py-2 text-slate-500">{emp.department || '-'}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{total}일</td>
                      <td className="px-4 py-2 text-right tabular-nums text-orange-400">{used}일</td>
                      <td className={`px-4 py-2 text-right tabular-nums ${leaveRemainClass(remain)}`}>
                        {formatLeaveRemainLabel(remain)}
                      </td>
                      <td className="px-4 py-2">
                        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${remain < 0 ? 'bg-red-500' : 'bg-teal-500'}`} style={{ width: `${pct}%` }} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {isSuper && (
            <div className="bg-slate-900 border border-purple-800/40 rounded-xl p-5">
              <h3 className="font-semibold text-purple-300 mb-3 flex items-center gap-2">
                📅 연차 일괄 등록
                <span className="text-xs bg-purple-900/50 text-purple-300 px-2 py-0.5 rounded-full">슈퍼유저</span>
              </h3>

              <div className="flex justify-between items-center mb-2">
                <span className="text-sm text-slate-400">대상 사원</span>
                <button onClick={toggleAll} className="text-xs text-blue-400 hover:underline">
                  {selected.length === employees.length ? '전체 해제' : '전체 선택'}
                </button>
              </div>
              <div className="border border-slate-700 rounded-lg max-h-40 overflow-y-auto mb-4">
                {employees.map(emp => (
                  <label key={emp.empNo} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-800/50 cursor-pointer border-b border-slate-800/40 last:border-0">
                    <input
                      type="checkbox"
                      checked={selected.includes(emp.empNo)}
                      onChange={() => setSelected(prev =>
                        prev.includes(emp.empNo) ? prev.filter(x => x !== emp.empNo) : [...prev, emp.empNo],
                      )}
                    />
                    <span className="text-sm text-slate-200">{emp.name}</span>
                    <span className="text-xs text-slate-500 ml-auto">
                      잔여 {formatLeaveRemainLabel(emp.remainAnnualLeave ?? computeLeaveRemain(emp.totalAnnualLeave ?? 0, emp.usedAnnualLeave ?? 0))}
                    </span>
                  </label>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="text-xs text-slate-500">유형</label>
                  <select
                    value={leaveForm.leaveType}
                    onChange={e => setLeaveForm(p => ({ ...p, leaveType: e.target.value }))}
                    className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200"
                  >
                    <option value="annual">연차</option>
                    <option value="half_am">반차(오전)</option>
                    <option value="half_pm">반차(오후)</option>
                    <option value="unpaid">무급휴가</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500">시작일</label>
                  <input type="date" value={leaveForm.startDate}
                    onChange={e => setLeaveForm(p => ({ ...p, startDate: e.target.value }))}
                    className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
                </div>
                <div>
                  <label className="text-xs text-slate-500">종료일</label>
                  <input type="date" value={leaveForm.endDate}
                    onChange={e => setLeaveForm(p => ({ ...p, endDate: e.target.value }))}
                    className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
                </div>
              </div>

              <button
                onClick={handleBulk}
                disabled={submitting || !selected.length}
                className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-lg font-medium text-sm"
              >
                {submitting ? '등록 중...' : `${selected.length}명 연차 일괄 등록`}
              </button>
              {msg && <p className="text-sm text-teal-400 mt-2">{msg}</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
