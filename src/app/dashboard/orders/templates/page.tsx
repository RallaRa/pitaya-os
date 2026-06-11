'use client';

import Link from 'next/link';
import { useStore } from '@/context/StoreContext';
import { overlay } from '@/components/overlay';
import { OrderRegistrationFunnel } from '@/components/funnel';
import { useOrders, useCreateOrderTemplate, useDeleteOrderTemplate } from '@/lib/queries';
import { Loader2, Play, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

export default function OrderTemplatesPage() {
  const { currentStore } = useStore();
  const storeId = currentStore?.storeId || '';
  const [name, setName] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [itemName, setItemName] = useState('');
  const [qty, setQty] = useState('1');

  const { data: templates = [], isLoading: loading } = useOrders(storeId, !!storeId);
  const createTemplate = useCreateOrderTemplate(storeId);
  const deleteTemplate = useDeleteOrderTemplate(storeId);

  const createTemplateHandler = async () => {
    if (!name.trim()) return;
    await createTemplate.mutateAsync({
      name: name.trim(),
      supplierName: supplierName.trim(),
      lines: itemName.trim() ? [{ itemName: itemName.trim(), qty: Number(qty) || 1, unit: 'kg' }] : [],
    });
    setName('');
    setSupplierName('');
    setItemName('');
  };

  const openOrderFunnel = (t: (typeof templates)[number]) => {
    overlay.open(
      <OrderRegistrationFunnel
        storeId={storeId}
        templateId={t.id}
        templateName={t.name}
        lines={t.lines || []}
        onClose={() => overlay.close()}
        onDone={() => overlay.toast('발주 요청이 전송되었습니다', { variant: 'success' })}
      />,
      { className: 'max-w-lg w-full', closeOnBackdrop: false },
    );
  };

  const remove = async (id: string) => {
    if (!(await overlay.confirm('삭제할까요?'))) return;
    deleteTemplate.mutate(id);
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
        <button
          onClick={() => void createTemplateHandler()}
          disabled={createTemplate.isPending}
          className="flex items-center gap-1 px-4 py-2 bg-teal-600 text-white text-sm rounded-lg disabled:opacity-50"
        >
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
              <button onClick={() => openOrderFunnel(t)} className="p-2 text-teal-400 hover:bg-teal-900/30 rounded-lg" title="발주"><Play className="w-4 h-4" /></button>
              <button onClick={() => void remove(t.id)} className="p-2 text-red-400 hover:bg-red-900/30 rounded-lg"><Trash2 className="w-4 h-4" /></button>
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
