'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Plus, ChevronDown, Loader2, X } from 'lucide-react';
import { getAuthHeaders, getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import { ALL_ITEM_CATEGORIES } from '@/lib/purchaseCategories';

export interface ScaleCodeOption {
  id: string;
  code: number;
  scaleCode3?: string;
  posBarCode?: string;
  name: string;
  category?: string;
}

export interface SupplierOption {
  id: string;
  supplierName: string;
  businessNumber?: string;
  category?: string;
  phone?: string;
  active?: boolean;
}

function supplierLabel(s: SupplierOption) {
  const code = s.businessNumber?.trim() || s.id.slice(-6).toUpperCase();
  return `${code} · ${s.supplierName}`;
}

function itemLabel(c: ScaleCodeOption) {
  const sc = c.scaleCode3 || String(c.code).padStart(3, '0');
  const pos = c.posBarCode ? ` [${c.posBarCode}]` : '';
  return `${sc} · ${c.name}${pos}`;
}

export function usePurchaseMasterData(storeId: string) {
  const [scaleCodes, setScaleCodes] = useState<ScaleCodeOption[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!storeId) {
      setScaleCodes([]);
      setSuppliers([]);
      return;
    }
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const [codesRes, supRes] = await Promise.all([
        fetch(`/api/scale/codes?storeId=${encodeURIComponent(storeId)}`, { headers }),
        fetch(`/api/suppliers?storeId=${encodeURIComponent(storeId)}`, { headers }),
      ]);
      const codesData = await codesRes.json();
      const supData = await supRes.json();
      setScaleCodes(
        (codesData.items || [])
          .map((c: ScaleCodeOption) => ({
            id: c.id,
            code: Number(c.code),
            name: String(c.name || ''),
            category: c.category,
          }))
          .filter((c: ScaleCodeOption) => c.code && c.name)
          .sort((a: ScaleCodeOption, b: ScaleCodeOption) => a.code - b.code),
      );
      setSuppliers(
        (supData.suppliers || [])
          .filter((s: SupplierOption) => s.active !== false)
          .sort((a: SupplierOption, b: SupplierOption) =>
            a.supplierName.localeCompare(b.supplierName, 'ko'),
          ),
      );
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { reload(); }, [reload]);

  return { scaleCodes, suppliers, loading, reload };
}

function mapScaleCategory(cat?: string): string {
  if (!cat) return '';
  if (cat === '한우' || cat === '한돈' || cat === '수입육') return cat;
  if (cat === '기타') return '계육및기타';
  return cat;
}

/* ── 품목코드 선택 ── */
export function ItemCodePicker({
  storeId,
  itemCode,
  itemName,
  onSelect,
  scaleCodes,
  onReload,
  disabled,
}: {
  storeId: string;
  itemCode?: number;
  itemName?: string;
  onSelect: (opt: ScaleCodeOption | null) => void;
  scaleCodes: ScaleCodeOption[];
  onReload: () => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [showNew, setShowNew] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const selected = scaleCodes.find(c => c.code === itemCode);
  const display = selected ? itemLabel(selected) : (itemName || '');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return scaleCodes.slice(0, 80);
    return scaleCodes
      .filter(c =>
        String(c.code).includes(q)
        || (c.scaleCode3 || '').includes(q)
        || (c.posBarCode || '').includes(q)
        || c.name.toLowerCase().includes(q),
      )
      .slice(0, 80);
  }, [scaleCodes, search]);

  return (
    <div ref={wrapRef} className="relative min-w-0">
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen(v => !v)}
          className="flex-1 min-w-0 flex items-center gap-1 bg-transparent px-1 py-0.5 text-left text-[10px] text-slate-200 hover:bg-slate-800 rounded truncate disabled:opacity-40"
          title={display || '품목코드 선택'}
        >
          <span className="truncate flex-1">{display || '품목코드 선택'}</span>
          <ChevronDown className="w-3 h-3 shrink-0 text-slate-500" />
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setShowNew(true)}
          className="shrink-0 text-[9px] text-teal-400 hover:text-teal-300 px-1 py-0.5 rounded border border-teal-800/50 hover:bg-teal-950/40 whitespace-nowrap"
          title="품목코드 신규등록"
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>

      {open && (
        <div className="absolute z-30 left-0 top-full mt-0.5 w-56 max-h-48 bg-slate-900 border border-slate-700 rounded-lg shadow-xl overflow-hidden">
          <input
            autoFocus
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="코드·품명 검색"
            className="w-full bg-slate-800 border-b border-slate-700 px-2 py-1.5 text-[10px] text-slate-200 outline-none"
          />
          <ul className="overflow-y-auto max-h-36">
            {filtered.length === 0 ? (
              <li className="px-2 py-2 text-[10px] text-slate-500">검색 결과 없음</li>
            ) : (
              filtered.map(c => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={`w-full text-left px-2 py-1.5 text-[10px] hover:bg-slate-800 ${
                      c.code === itemCode ? 'bg-teal-900/30 text-teal-200' : 'text-slate-300'
                    }`}
                    onClick={() => {
                      onSelect(c);
                      setOpen(false);
                      setSearch('');
                    }}
                  >
                    {itemLabel(c)}
                  </button>
                </li>
              ))
            )}
          </ul>
          <button
            type="button"
            onClick={() => { setOpen(false); setShowNew(true); }}
            className="w-full border-t border-slate-700 px-2 py-1.5 text-[10px] text-teal-400 hover:bg-slate-800 text-left"
          >
            + 품목코드 신규등록
          </button>
        </div>
      )}

      {showNew && (
        <NewScaleCodeModal
          storeId={storeId}
          initialName={itemName || search}
          onClose={() => setShowNew(false)}
          onCreated={async (created) => {
            await onReload();
            onSelect(created);
            setShowNew(false);
          }}
        />
      )}
    </div>
  );
}

function NewScaleCodeModal({
  storeId,
  initialName,
  onClose,
  onCreated,
}: {
  storeId: string;
  initialName?: string;
  onClose: () => void;
  onCreated: (item: ScaleCodeOption) => void;
}) {
  const [code, setCode] = useState('');
  const [name, setName] = useState(initialName || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    const codeNum = Number(code);
    if (!codeNum || !name.trim()) {
      setError('코드(숫자)와 품명을 입력해 주세요');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/scale/codes', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          storeId,
          items: [{ code: codeNum, name: name.trim() }],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '등록 실패');
      onCreated({
        id: data.ids?.[0] || `new_${codeNum}`,
        code: codeNum,
        name: name.trim(),
        category: mapScaleCategory(
          /한우/.test(name) ? '한우' : /한돈/.test(name) ? '한돈' : '기타',
        ),
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '등록 실패');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70" />
      <div
        className="relative bg-slate-900 border border-slate-700 rounded-xl w-full max-w-sm shadow-2xl p-4 space-y-3"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">품목코드 신규등록</h3>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div>
          <label className="text-[10px] text-slate-500">품목코드</label>
          <input
            type="number"
            value={code}
            onChange={e => setCode(e.target.value)}
            placeholder="예: 352"
            className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-teal-500/50"
          />
        </div>
        <div>
          <label className="text-[10px] text-slate-500">품명</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="예: 한돈대패목살"
            className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-teal-500/50"
          />
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="w-full py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          등록 후 선택
        </button>
      </div>
    </div>
  );
}

/* ── 거래처코드 선택 ── */
export function SupplierCodePicker({
  storeId,
  supplierId,
  supplierName,
  onSelect,
  suppliers,
  onReload,
  disabled,
  compact,
}: {
  storeId: string;
  supplierId?: string;
  supplierName?: string;
  onSelect: (opt: SupplierOption | null) => void;
  suppliers: SupplierOption[];
  onReload: () => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [showNew, setShowNew] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const selected = suppliers.find(s => s.id === supplierId);
  const display = selected
    ? supplierLabel(selected)
    : (supplierName ? supplierName : '');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return suppliers.slice(0, 60);
    return suppliers
      .filter(s =>
        s.supplierName.toLowerCase().includes(q) ||
        (s.businessNumber || '').includes(q) ||
        s.id.toLowerCase().includes(q),
      )
      .slice(0, 60);
  }, [suppliers, search]);

  return (
    <div ref={wrapRef} className={`relative min-w-0 ${compact ? 'flex-1' : 'w-full'}`}>
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen(v => !v)}
          className={`flex-1 min-w-0 flex items-center gap-1 bg-transparent px-0.5 py-0.5 text-left hover:bg-slate-800 rounded truncate disabled:opacity-40 ${
            compact ? 'text-[11px] text-white font-semibold' : 'text-sm text-white'
          }`}
          title={display || '거래처 선택'}
        >
          <span className="truncate flex-1">{display || '거래처코드 선택'}</span>
          <ChevronDown className="w-3 h-3 shrink-0 text-slate-500" />
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setShowNew(true)}
          className="shrink-0 text-[9px] text-teal-400 hover:text-teal-300 px-1 py-0.5 rounded border border-teal-800/50 hover:bg-teal-950/40"
          title="거래처 신규등록"
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>

      {open && (
        <div className="absolute z-30 left-0 top-full mt-0.5 w-64 max-h-52 bg-slate-900 border border-slate-700 rounded-lg shadow-xl overflow-hidden">
          <input
            autoFocus
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="코드·거래처명 검색"
            className="w-full bg-slate-800 border-b border-slate-700 px-2 py-1.5 text-[10px] text-slate-200 outline-none"
          />
          <ul className="overflow-y-auto max-h-40">
            {filtered.length === 0 ? (
              <li className="px-2 py-2 text-[10px] text-slate-500">검색 결과 없음</li>
            ) : (
              filtered.map(s => (
                <li key={s.id}>
                  <button
                    type="button"
                    className={`w-full text-left px-2 py-1.5 text-[10px] hover:bg-slate-800 ${
                      s.id === supplierId ? 'bg-teal-900/30 text-teal-200' : 'text-slate-300'
                    }`}
                    onClick={() => {
                      onSelect(s);
                      setOpen(false);
                      setSearch('');
                    }}
                  >
                    {supplierLabel(s)}
                  </button>
                </li>
              ))
            )}
          </ul>
          <button
            type="button"
            onClick={() => { setOpen(false); setShowNew(true); }}
            className="w-full border-t border-slate-700 px-2 py-1.5 text-[10px] text-teal-400 hover:bg-slate-800 text-left"
          >
            + 거래처 신규등록
          </button>
        </div>
      )}

      {showNew && (
        <NewSupplierModal
          storeId={storeId}
          initialName={supplierName || search}
          onClose={() => setShowNew(false)}
          onCreated={async (created) => {
            await onReload();
            onSelect(created);
            setShowNew(false);
          }}
        />
      )}
    </div>
  );
}

function NewSupplierModal({
  storeId,
  initialName,
  onClose,
  onCreated,
}: {
  storeId: string;
  initialName?: string;
  onClose: () => void;
  onCreated: (s: SupplierOption) => void;
}) {
  const [form, setForm] = useState({
    supplierName: initialName || '',
    businessNumber: '',
    category: '소고기',
    phone: '',
    contactPerson: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!form.supplierName.trim()) {
      setError('거래처명을 입력해 주세요');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/suppliers', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          storeId,
          supplier: {
            ...form,
            supplierName: form.supplierName.trim(),
            orderDays: [],
            deliveryDays: [],
            leadTime: 1,
            paymentTerms: '익월 말일',
            memo: '',
            active: true,
            tags: [],
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '등록 실패');
      onCreated({
        id: data.id,
        supplierName: form.supplierName.trim(),
        businessNumber: form.businessNumber.trim(),
        category: form.category,
        phone: form.phone,
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '등록 실패');
    } finally {
      setSaving(false);
    }
  };

  const SUP_CATS = ['소고기', '돼지고기', '닭고기', '수산물', '채소/과일', '공산품', '기타'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70" />
      <div
        className="relative bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md shadow-2xl p-4 space-y-3 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">거래처 신규등록</h3>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2">
            <label className="text-[10px] text-slate-500">거래처명 *</label>
            <input
              value={form.supplierName}
              onChange={e => setForm(f => ({ ...f, supplierName: e.target.value }))}
              className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none"
            />
          </div>
          <div>
            <label className="text-[10px] text-slate-500">사업자번호(코드)</label>
            <input
              value={form.businessNumber}
              onChange={e => setForm(f => ({ ...f, businessNumber: e.target.value }))}
              placeholder="000-00-00000"
              className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none"
            />
          </div>
          <div>
            <label className="text-[10px] text-slate-500">분류</label>
            <select
              value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none"
            >
              {SUP_CATS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-slate-500">담당자</label>
            <input
              value={form.contactPerson}
              onChange={e => setForm(f => ({ ...f, contactPerson: e.target.value }))}
              className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none"
            />
          </div>
          <div>
            <label className="text-[10px] text-slate-500">전화번호</label>
            <input
              value={form.phone}
              onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none"
            />
          </div>
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="w-full py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          등록 후 선택
        </button>
      </div>
    </div>
  );
}

export { mapScaleCategory, supplierLabel, itemLabel };
