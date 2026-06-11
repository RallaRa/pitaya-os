'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Save, Trash2 } from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import AccountingShell from '@/components/accounting/AccountingShell';

type Tab = 'partner' | 'dept' | 'project';

interface MgmtItem {
  id: string;
  type: string;
  code: string;
  name: string;
  memo?: string;
}

interface Supplier {
  id: string;
  supplierName: string;
}

export default function ManagementItemsPanel() {
  const { currentStore } = useStore();
  const storeId = currentStore?.storeId || '';
  const [tab, setTab] = useState<Tab>('partner');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [items, setItems] = useState<MgmtItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [memo, setMemo] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    try {
      const headers = await getAuthJsonHeaders();
      if (tab === 'partner') {
        const res = await fetch(`/api/suppliers?storeId=${encodeURIComponent(storeId)}`, { headers });
        const data = await res.json();
        setSuppliers(data.suppliers || []);
      } else {
        const res = await fetch(`/api/accounting/management-items?storeId=${encodeURIComponent(storeId)}&type=${tab}`, { headers });
        const data = await res.json();
        setItems(data.items || []);
      }
    } finally {
      setLoading(false);
    }
  }, [storeId, tab]);

  useEffect(() => { load(); }, [load]);

  const saveItem = async () => {
    if (!storeId || tab === 'partner' || !code || !name || saving) return;
    setSaving(true);
    setMsg('');
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/accounting/management-items', {
        method: 'POST',
        headers,
        body: JSON.stringify({ storeId, type: tab, code, name, memo }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '저장 실패');
      setCode('');
      setName('');
      setMemo('');
      setMsg('저장되었습니다.');
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  const removeItem = async (id: string) => {
    if (!storeId) return;
    const headers = await getAuthJsonHeaders();
    await fetch(`/api/accounting/management-items?storeId=${encodeURIComponent(storeId)}&id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers,
    });
    await load();
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'partner', label: '거래처' },
    { id: 'dept', label: '부서' },
    { id: 'project', label: '프로젝트' },
  ];

  return (
    <AccountingShell
      actions={tab !== 'partner' ? (
        <button type="button" disabled={saving || !code || !name} onClick={saveItem} className="text-xs px-2.5 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-600 text-white inline-flex items-center gap-1 disabled:opacity-40">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          저장
        </button>
      ) : undefined}
    >
      <div className="flex gap-1 mb-4 p-1 bg-slate-900 border border-slate-800 rounded-xl w-fit">
        {tabs.map(t => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)} className={`px-4 py-2 text-xs font-medium rounded-lg ${tab === t.id ? 'bg-teal-700 text-white' : 'text-slate-400 hover:bg-slate-800'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab !== 'partner' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4 p-4 bg-slate-900 border border-slate-800 rounded-xl">
          <label className="text-[10px] text-slate-500">
            코드
            <input value={code} onChange={e => setCode(e.target.value)} className="block mt-1 w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-white" />
          </label>
          <label className="text-[10px] text-slate-500">
            명칭
            <input value={name} onChange={e => setName(e.target.value)} className="block mt-1 w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-white" />
          </label>
          <label className="text-[10px] text-slate-500">
            메모
            <input value={memo} onChange={e => setMemo(e.target.value)} className="block mt-1 w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-white" />
          </label>
        </div>
      )}

      {msg && <p className="text-xs text-teal-300 mb-3">{msg}</p>}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-teal-400" /></div>
      ) : tab === 'partner' ? (
        <>
          <p className="text-xs text-slate-500 mb-3">거래처는 매입·공급 모듈에서 등록됩니다.</p>
          <div className="border border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-slate-800/80 text-slate-400">
                <tr><th className="text-left px-3 py-2">거래처명</th></tr>
              </thead>
              <tbody>
                {suppliers.map(s => (
                  <tr key={s.id} className="border-t border-slate-800/80">
                    <td className="px-3 py-2 text-slate-200">{s.supplierName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-slate-800/80 text-slate-400">
              <tr>
                <th className="text-left px-3 py-2">코드</th>
                <th className="text-left px-3 py-2">명칭</th>
                <th className="text-left px-3 py-2">메모</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} className="border-t border-slate-800/80">
                  <td className="px-3 py-2 font-mono text-slate-300">{item.code}</td>
                  <td className="px-3 py-2 text-slate-200">{item.name}</td>
                  <td className="px-3 py-2 text-slate-400">{item.memo || '—'}</td>
                  <td className="px-2 py-2">
                    <button type="button" onClick={() => removeItem(item.id)} className="text-slate-500 hover:text-red-400">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AccountingShell>
  );
}
