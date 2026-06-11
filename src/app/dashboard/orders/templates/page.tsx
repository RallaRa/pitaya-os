'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useStore } from '@/context/StoreContext';
import { getAuthHeaders, getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import { Loader2, Play, Plus, Trash2 } from 'lucide-react';

interface Template {
  id: string;
  name: string;
  supplierName: string;
  lines: { itemName: string; qty: number; unit: string }[];
  active: boolean;
}

export default function OrderTemplatesPage() {
  const { currentStore } = useStore();
  const storeId = currentStore?.storeId || '';
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [itemName, setItemName] = useState('');
  const [qty, setQty] = useState('1');

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/order-templates?storeId=${encodeURIComponent(storeId)}`, { headers });
    const data = await res.json();
    setTemplates(data.templates || []);
    setLoading(false);
  }, [storeId]);

  useEffect(() => { load(); }, [load]);

  const createTemplate = async () => {
    if (!name.trim()) return;
    const headers = await getAuthJsonHeaders();
    await fetch('/api/order-templates', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        storeId,
        name: name.trim(),
        supplierName: supplierName.trim(),
        supplierId: '',
        lines: itemName.trim() ? [{ itemName: itemName.trim(), qty: Number(qty) || 1, unit: 'kg' }] : [],
      }),
    });
    setName(''); setSupplierName(''); setItemName('');
    await load();
  };

  const execute = async (id: string) => {
    const headers = await getAuthJsonHeaders();
    await fetch('/api/order-templates/execute', {
      method: 'POST',
      headers,
      body: JSON.stringify({ templateId: id, storeId }),
    });
    alert('발주 요청이 메신저로 전송되었습니다.');
  };

  const remove = async (id: string) => {
    if (!confirm('삭제할까요?')) return;
    const headers = await getAuthHeaders();
    await fetch(
      `/api/order-templates?id=${encodeURIComponent(id)}&storeId=${encodeURIComponent(storeId)}`,
      { method: 'DELETE', headers },
    );
    await load();
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-bold text-teal-400 mb-1">발주 템플릿</h1>
      <p className="text-slate-500 text-sm mb-6">원클릭 발주 → 메신저 승인</p>

      <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 mb-6 space-y-2">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="템플릿 이름" className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white" />
        <input value={supplierName} onChange={e => setSupplierName(e.target.value)} placeholder="거래처" className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white" />
        <div className="flex gap-2">
          <input value={itemName} onChange={e => setItemName(e.target.value)} placeholder="품목" className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white" />
          <input value={qty} onChange={e => setQty(e.target.value)} placeholder="수량" className="w-20 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white" />
        </div>
        <button onClick={createTemplate} className="flex items-center gap-1 px-4 py-2 bg-teal-600 text-white text-sm rounded-lg">
          <Plus className="w-4 h-4" /> 저장
        </button>
      </div>

      {loading ? (
        <Loader2 className="w-6 h-6 animate-spin text-teal-400" />
      ) : templates.length === 0 ? (
        <p className="text-slate-600 text-sm">템플릿이 없습니다.</p>
      ) : (
        <ul className="space-y-2">
          {templates.map(t => (
            <li key={t.id} className="flex items-center gap-3 bg-slate-900 border border-slate-700 rounded-xl p-4">
              <div className="flex-1 min-w-0">
                <p className="text-white font-medium text-sm">{t.name}</p>
                <p className="text-slate-500 text-xs">{t.supplierName || '거래처 미지정'} · {t.lines?.length || 0}품목</p>
              </div>
              <button onClick={() => execute(t.id)} className="p-2 text-teal-400 hover:bg-teal-900/30 rounded-lg" title="실행"><Play className="w-4 h-4" /></button>
              <button onClick={() => remove(t.id)} className="p-2 text-red-400 hover:bg-red-900/30 rounded-lg"><Trash2 className="w-4 h-4" /></button>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-6 text-slate-600 text-xs">
        <Link href="/dashboard/suppliers" className="text-teal-500 hover:underline">거래처 관리</Link>에서 발주일정을 설정할 수 있습니다.
      </p>
    </div>
  );
}
