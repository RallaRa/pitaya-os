'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import HrSystemShell from '@/components/hr-system/HrSystemShell';
import { useStore } from '@/context/StoreContext';
import { getAuthHeaders } from '@/lib/getAuthHeaders';

function fmtRecord(obj: Record<string, number>) {
  return Object.entries(obj).sort((a, b) => b[1] - a[1]);
}

export default function PersonnelStatusPage() {
  const { currentStore } = useStore();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<{
    total: number;
    active: number;
    resigned: number;
    byStatus: Record<string, number>;
    byDepartment: Record<string, number>;
    byPosition: Record<string, number>;
  } | null>(null);
  const [recentHires, setRecentHires] = useState<{ empNo: string; name: string; hireDate: string; department: string }[]>([]);
  const [recentResigns, setRecentResigns] = useState<{ empNo: string; name: string; resignDate: string; department: string }[]>([]);

  useEffect(() => {
    if (!currentStore?.storeId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(
          `/api/hr-system/personnel/status?storeId=${encodeURIComponent(currentStore.storeId)}`,
          { headers },
        );
        const data = await res.json();
        if (!cancelled) {
          setSummary(data.summary);
          setRecentHires(data.recentHires || []);
          setRecentResigns(data.recentResigns || []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [currentStore?.storeId]);

  return (
    <HrSystemShell>
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-cyan-400" /></div>
      ) : summary && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="전체" value={`${summary.total}명`} />
            <StatCard label="재직" value={`${summary.active}명`} accent />
            <StatCard label="퇴직" value={`${summary.resigned}명`} />
            <StatCard label="부서 수" value={`${Object.keys(summary.byDepartment).length}개`} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <BreakdownCard title="부서별" items={fmtRecord(summary.byDepartment)} />
            <BreakdownCard title="직급별" items={fmtRecord(summary.byPosition)} />
            <BreakdownCard title="상태별" items={fmtRecord(summary.byStatus)} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <RecentList title="최근 입사 (3개월)" rows={recentHires.map(r => `${r.hireDate} · ${r.name} (${r.department})`)} />
            <RecentList title="최근 퇴사 (3개월)" rows={recentResigns.map(r => `${r.resignDate} · ${r.name} (${r.department})`)} />
          </div>
        </div>
      )}
    </HrSystemShell>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
      <p className="text-[10px] text-slate-500">{label}</p>
      <p className={`text-lg font-bold ${accent ? 'text-cyan-300' : 'text-white'}`}>{value}</p>
    </div>
  );
}

function BreakdownCard({ title, items }: { title: string; items: [string, number][] }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <h3 className="text-sm font-semibold text-slate-100 mb-3">{title}</h3>
      <ul className="space-y-1.5 text-xs">
        {items.map(([k, v]) => (
          <li key={k} className="flex justify-between text-slate-400">
            <span>{k || '미지정'}</span>
            <span className="text-slate-200">{v}명</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RecentList({ title, rows }: { title: string; rows: string[] }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <h3 className="text-sm font-semibold text-slate-100 mb-3">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-xs text-slate-500">내역 없음</p>
      ) : (
        <ul className="space-y-1 text-xs text-slate-400">
          {rows.map((r, i) => <li key={i}>{r}</li>)}
        </ul>
      )}
    </div>
  );
}
