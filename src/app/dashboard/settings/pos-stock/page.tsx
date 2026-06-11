'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { useAuth } from '@/context/AuthContext';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import { isSuperuserEmail } from '@/lib/auth/permissions';

interface Row {
  itemName: string;
  openingQty: number;
  alertBelowQty: number;
  unit: string;
}

export default function PosStockThresholdsPage() {
  const { currentStore } = useStore();
  const { user } = useAuth();
  const storeId = currentStore?.storeId || '';
  const canManage = isSuperuserEmail(user?.email)
    || ['owner', 'admin', 'master', 'superuser'].includes(currentStore?.role || '');

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!storeId) { setLoading(false); return; }
    getAuthJsonHeaders()
      .then(h => fetch(`/api/store/pos-stock-thresholds?storeId=${encodeURIComponent(storeId)}`, { headers: h }))
      .then(r => r.json())
      .then(d => { if (d.thresholds) setRows(d.thresholds); })
      .catch(() => setError('불러오기 실패'))
      .finally(() => setLoading(false));
  }, [storeId]);

  const save = async () => {
    if (!storeId || !canManage) return;
    setSaving(true);
    setError('');
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/store/pos-stock-thresholds', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ storeId, thresholds: rows }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '저장 실패');
      if (data.thresholds) setRows(data.thresholds);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  if (!storeId) return <div className="p-6 text-slate-400 text-sm">매장을 선택해주세요.</div>;
  if (!canManage) return <div className="p-6 text-center text-slate-400">master/admin 이상만 변경 가능합니다.</div>;

  return (
    <div className="max-w-3xl mx-auto p-6">
      <Link href="/dashboard/settings" className="flex items-center gap-2 text-slate-400 hover:text-teal-400 text-sm mb-6 w-fit">
        <ArrowLeft className="w-4 h-4" /> 설정으로 돌아가기
      </Link>
      <h1 className="text-lg font-bold text-teal-400 mb-2">POS 재고 경고 임계값</h1>
      <p className="text-slate-500 text-sm mb-4">POS 재고 미연동 — 오늘 판매량 기준 추정 재고(시작량−판매)가 임계값 이하일 때 알림</p>
      {error && <div className="mb-4 p-3 bg-red-900/30 border border-red-500/30 rounded-xl text-red-400 text-sm">{error}</div>}
      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 py-12 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> 불러오는 중...</div>
      ) : (
        <div className="space-y-3">
          {rows.map((row, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2 items-center p-3 rounded-xl border border-slate-800 bg-slate-900/60">
              <input className="col-span-4 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-sm" placeholder="품목명" value={row.itemName} onChange={e => setRows(prev => prev.map((r, i) => i === idx ? { ...r, itemName: e.target.value } : r))} />
              <input type="number" className="col-span-2 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-sm" placeholder="시작량" value={row.openingQty} onChange={e => setRows(prev => prev.map((r, i) => i === idx ? { ...r, openingQty: Number(e.target.value) } : r))} />
              <input type="number" className="col-span-2 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-sm" placeholder="경고≤" value={row.alertBelowQty} onChange={e => setRows(prev => prev.map((r, i) => i === idx ? { ...r, alertBelowQty: Number(e.target.value) } : r))} />
              <input className="col-span-2 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-sm" placeholder="단위" value={row.unit} onChange={e => setRows(prev => prev.map((r, i) => i === idx ? { ...r, unit: e.target.value } : r))} />
              <button type="button" className="col-span-2 text-red-400 text-sm flex items-center gap-1 justify-end" onClick={() => setRows(prev => prev.filter((_, i) => i !== idx))}><Trash2 className="w-4 h-4" /> 삭제</button>
            </div>
          ))}
          <button type="button" className="flex items-center gap-2 text-teal-400 text-sm" onClick={() => setRows(prev => [...prev, { itemName: '', openingQty: 20, alertBelowQty: 2, unit: 'kg' }])}>
            <Plus className="w-4 h-4" /> 품목 추가
          </button>
          <button type="button" onClick={save} disabled={saving} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-500/20 text-teal-400 border border-teal-500/40">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} 저장
          </button>
        </div>
      )}
    </div>
  );
}
