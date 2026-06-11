'use client';

import { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import HrSystemShell from '@/components/hr-system/HrSystemShell';
import { useStore } from '@/context/StoreContext';
import { getAuthHeaders } from '@/lib/getAuthHeaders';

interface Appointment {
  id: string;
  empNo: string;
  empName: string;
  type: string;
  typeLabel?: string;
  effectiveDate: string;
  fromDepartment?: string;
  toDepartment?: string;
  fromPosition?: string;
  toPosition?: string;
  memo?: string;
}

interface Employee {
  empNo: string;
  name: string;
  department: string;
  position: string;
}

const TYPE_OPTIONS = [
  { value: 'hire', label: '입사' },
  { value: 'promotion', label: '승진' },
  { value: 'transfer', label: '전보' },
  { value: 'position', label: '직책변경' },
  { value: 'resign', label: '퇴사' },
];

export default function AppointmentsPage() {
  const { currentStore } = useStore();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    empNo: '',
    type: 'position',
    effectiveDate: new Date().toISOString().slice(0, 10),
    toDepartment: '',
    toPosition: '',
    memo: '',
    applyToEmployee: true,
  });

  const load = async () => {
    if (!currentStore?.storeId) return;
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const [apRes, empRes] = await Promise.all([
        fetch(`/api/hr-system/appointments?storeId=${encodeURIComponent(currentStore.storeId)}`, { headers }),
        fetch(`/api/hr/employees?storeId=${encodeURIComponent(currentStore.storeId)}`, { headers }),
      ]);
      const apData = await apRes.json();
      const empData = await empRes.json();
      setAppointments(apData.appointments || []);
      setEmployees(empData.employees || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStore?.storeId]);

  const selectedEmp = employees.find(e => e.empNo === form.empNo);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentStore?.storeId || !form.empNo) return;
    setSaving(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/hr-system/appointments', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId: currentStore.storeId,
          ...form,
          empName: selectedEmp?.name,
          fromDepartment: selectedEmp?.department,
          fromPosition: selectedEmp?.position,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '등록 실패');
      }
      setForm(f => ({ ...f, memo: '', toDepartment: '', toPosition: '' }));
      await load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '오류');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!currentStore?.storeId || !confirm('발령 기록을 삭제할까요?')) return;
    const headers = await getAuthHeaders();
    await fetch(
      `/api/hr-system/appointments?storeId=${encodeURIComponent(currentStore.storeId)}&id=${encodeURIComponent(id)}`,
      { method: 'DELETE', headers },
    );
    await load();
  };

  return (
    <HrSystemShell>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <form onSubmit={handleSubmit} className="xl:col-span-1 rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-3">
          <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            <Plus className="w-4 h-4 text-cyan-400" /> 발령 등록
          </h2>
          <label className="block text-xs text-slate-400">
            사원
            <select
              required
              value={form.empNo}
              onChange={e => setForm(f => ({ ...f, empNo: e.target.value }))}
              className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white"
            >
              <option value="">선택</option>
              {employees.map(emp => (
                <option key={emp.empNo} value={emp.empNo}>{emp.name} ({emp.empNo})</option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-slate-400">
            발령구분
            <select
              value={form.type}
              onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
              className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white"
            >
              {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label className="block text-xs text-slate-400">
            시행일
            <input
              type="date"
              required
              value={form.effectiveDate}
              onChange={e => setForm(f => ({ ...f, effectiveDate: e.target.value }))}
              className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="block text-xs text-slate-400">
            변경 부서
            <input
              value={form.toDepartment}
              onChange={e => setForm(f => ({ ...f, toDepartment: e.target.value }))}
              placeholder={selectedEmp?.department || ''}
              className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="block text-xs text-slate-400">
            변경 직급/직책
            <input
              value={form.toPosition}
              onChange={e => setForm(f => ({ ...f, toPosition: e.target.value }))}
              placeholder={selectedEmp?.position || ''}
              className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="block text-xs text-slate-400">
            비고
            <input
              value={form.memo}
              onChange={e => setForm(f => ({ ...f, memo: e.target.value }))}
              className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={form.applyToEmployee}
              onChange={e => setForm(f => ({ ...f, applyToEmployee: e.target.checked }))}
            />
            인사카드에 즉시 반영
          </label>
          <button
            type="submit"
            disabled={saving}
            className="w-full py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium disabled:opacity-50"
          >
            {saving ? '저장 중…' : '발령 등록'}
          </button>
        </form>

        <div className="xl:col-span-2">
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-cyan-400" /></div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full text-xs">
                <thead className="bg-slate-900/80 text-slate-400">
                  <tr>
                    <th className="px-3 py-2 text-left">시행일</th>
                    <th className="px-3 py-2 text-left">구분</th>
                    <th className="px-3 py-2 text-left">성명</th>
                    <th className="px-3 py-2 text-left">변경내용</th>
                    <th className="px-3 py-2 text-left">비고</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {appointments.map(a => (
                    <tr key={a.id} className="border-t border-slate-800/80">
                      <td className="px-3 py-2 text-slate-300">{a.effectiveDate}</td>
                      <td className="px-3 py-2">{a.typeLabel || a.type}</td>
                      <td className="px-3 py-2 text-white">{a.empName}</td>
                      <td className="px-3 py-2 text-slate-400">
                        {a.fromDepartment !== a.toDepartment && a.toDepartment && `${a.fromDepartment || '-'} → ${a.toDepartment}`}
                        {a.fromPosition !== a.toPosition && a.toPosition && ` / ${a.fromPosition || '-'} → ${a.toPosition}`}
                      </td>
                      <td className="px-3 py-2 text-slate-500">{a.memo || '-'}</td>
                      <td className="px-3 py-2">
                        <button type="button" onClick={() => handleDelete(a.id)} className="text-red-400 hover:text-red-300">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </HrSystemShell>
  );
}
