'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import HrSystemShell from '@/components/hr-system/HrSystemShell';
import { useStore } from '@/context/StoreContext';
import { getAuthHeaders } from '@/lib/getAuthHeaders';

export default function HireResignPage() {
  const { currentStore } = useStore();
  const [loading, setLoading] = useState(true);
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
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ListCard title="최근 입사 (3개월)" rows={recentHires.map(r => `${r.hireDate} · ${r.name} (${r.department})`)} />
          <ListCard title="최근 퇴사 (3개월)" rows={recentResigns.map(r => `${r.resignDate} · ${r.name} (${r.department})`)} />
        </div>
      )}
    </HrSystemShell>
  );
}

function ListCard({ title, rows }: { title: string; rows: string[] }) {
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
