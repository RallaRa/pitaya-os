'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus, Upload, Download, Search, X, ChevronUp, ChevronDown,
  TrendingUp, TrendingDown, Edit2, Trash2, RefreshCw,
  Calculator, History, Building2, FileText, SlidersHorizontal,
  CheckSquare, Square, AlertCircle,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useStore } from '@/context/StoreContext';
import { getAuthHeaders, getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import { overlay } from '@/components/overlay';
import {
  useProducts,
  useUpdateProduct,
  useDeleteProduct,
  useCreateProduct,
} from '@/lib/queries';
import { ITEM_CATEGORIES_WITH_ALL, ALL_ITEM_CATEGORIES } from '@/lib/purchaseCategories';
import {
  LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import * as XLSX from 'xlsx';

/* ── Types ── */
interface Item {
  id: string;
  category: string;
  grade: string;
  targetMargin: number;
  appliedCost: number;
  lossRate: number;
  species: string;
  storage: string;
  cut: string;
  origin: string;
  buyPrice: number;
  sellPrice: number;
  kgTargetPrice: number;
  kgSalePrice: number;
  geunTargetPrice: number;
  geunSalePrice: number;
  supplier?: string;
  lastPurchaseDate?: string;
  lastTrace?: string;
  priceHistory?: { date: string; oldPrice: number; newPrice: number }[];
}

/* ── Constants ── */
const CATEGORIES = ITEM_CATEGORIES_WITH_ALL;
const STORAGES   = ['전체', '냉장', '냉동'];

function calcPrices(buyPrice: number, targetMargin: number, appliedCost: number, lossRate: number) {
  if (!buyPrice) return { kgTargetPrice: 0, kgSalePrice: 0, geunTargetPrice: 0, geunSalePrice: 0 };
  const kgt = Math.round((buyPrice / (1 - targetMargin)) * (1 + lossRate));
  const kgs = Math.round((buyPrice / (1 - appliedCost)) * (1 + lossRate));
  return { kgTargetPrice: kgt, kgSalePrice: kgs, geunTargetPrice: Math.round(kgt * 0.6), geunSalePrice: Math.round(kgs * 0.6) };
}

function pct(v: number) { return `${Math.round(v * 100)}%`; }
function comma(v: number) { return v ? v.toLocaleString() : '-'; }

function marginBg(v: number) {
  if (v >= 0.60) return 'bg-green-900/30 text-green-300';
  if (v >= 0.40) return '';
  if (v >= 0.30) return 'bg-yellow-900/30 text-yellow-300';
  return 'bg-red-900/30 text-red-300';
}

/* ── InlineEditCell ── */
function InlineCell({
  value, type = 'text', onSave, className = '',
}: {
  value: string | number; type?: 'text' | 'number' | 'date'; onSave: (v: string) => void; className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ''));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const commit = () => {
    setEditing(false);
    if (draft !== String(value ?? '')) onSave(draft);
  };

  if (!editing) {
    return (
      <span
        className={`cursor-pointer hover:bg-slate-700/60 rounded px-1 py-0.5 inline-block ${className}`}
        onClick={() => { setDraft(String(value ?? '')); setEditing(true); }}
        title="클릭하여 수정"
      >
        {type === 'number' ? comma(Number(value)) : (value || '-')}
      </span>
    );
  }
  return (
    <input
      ref={inputRef}
      type={type === 'date' ? 'date' : type === 'number' ? 'number' : 'text'}
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
      className="w-full bg-slate-700 border border-teal-500/60 rounded px-1 py-0.5 text-xs text-slate-100 outline-none"
    />
  );
}

/* ── Detail Modal ── */
function ItemModal({
  item, onClose, onSave,
}: {
  item: Item; onClose: () => void; onSave: (id: string, updates: Partial<Item>) => void;
}) {
  const [activeTab, setActiveTab] = useState<'info' | 'calc' | 'history' | 'supplier'>('info');
  const [draft, setDraft] = useState({ ...item });
  const prices = calcPrices(draft.buyPrice, draft.targetMargin, draft.appliedCost, draft.lossRate);

  const set = (k: keyof Item, v: any) => setDraft(p => ({ ...p, [k]: v }));

  const handleSave = () => {
    onSave(item.id, draft);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70" />
      <div
        className="relative bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-800 shrink-0">
          <div className="flex-1">
            <p className="text-slate-200 font-semibold text-sm">{item.cut}</p>
            <p className="text-slate-500 text-xs">{item.category} · {item.grade} · {item.origin}</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white"><X className="w-4 h-4" /></button>
        </div>

        {/* 탭 */}
        <div className="flex gap-1 px-5 pt-3 shrink-0">
          {([['info','기본정보'],['calc','단가계산기'],['history','매입이력'],['supplier','거래처']] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${activeTab === id ? 'bg-teal-600/20 text-teal-300 border border-teal-600/30' : 'text-slate-500 hover:text-slate-300'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* 탭 내용 */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === 'info' && (
            <div className="grid grid-cols-2 gap-3 text-xs">
              {([
                ['구분', 'category'],['등급', 'grade'],['품종', 'species'],['부위', 'cut'],
                ['원산지', 'origin'],['보관방법', 'storage'],
              ] as [string, keyof Item][]).map(([label, key]) => (
                <div key={key} className="bg-slate-800/60 rounded-xl p-3">
                  <p className="text-slate-500 mb-1">{label}</p>
                  <input
                    value={String(draft[key] ?? '')}
                    onChange={e => set(key, e.target.value)}
                    className="w-full bg-transparent text-slate-200 font-medium outline-none border-b border-slate-700 pb-0.5"
                  />
                </div>
              ))}
              <div className="bg-slate-800/60 rounded-xl p-3 col-span-2">
                <p className="text-slate-500 mb-1">거래처</p>
                <input
                  value={String(draft.supplier ?? '')}
                  onChange={e => set('supplier', e.target.value)}
                  className="w-full bg-transparent text-slate-200 outline-none border-b border-slate-700 pb-0.5"
                />
              </div>
              <div className="bg-slate-800/60 rounded-xl p-3 col-span-2">
                <p className="text-slate-500 mb-1">최근이력</p>
                <input
                  value={String(draft.lastTrace ?? '')}
                  onChange={e => set('lastTrace', e.target.value)}
                  className="w-full bg-transparent text-slate-200 outline-none border-b border-slate-700 pb-0.5"
                />
              </div>
            </div>
          )}

          {activeTab === 'calc' && (
            <div className="space-y-4">
              {/* 슬라이더 입력 */}
              {([
                { label: '매입단가 (원/kg)', key: 'buyPrice' as const, min: 0, max: 300000, step: 500, pctMode: false },
                { label: '목표마진율 (%)', key: 'targetMargin' as const, min: 0, max: 0.70, step: 0.01, pctMode: true },
                { label: '적용원가율 (%)', key: 'appliedCost' as const, min: 0, max: 0.70, step: 0.01, pctMode: true },
                { label: '로스율 (%)',     key: 'lossRate' as const,    min: 0, max: 0.50, step: 0.01, pctMode: true },
              ]).map(({ label, key, min, max, step, pctMode }) => (
                <div key={key} className="bg-slate-800/60 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-slate-400 text-xs">{label}</span>
                    <input
                      type="number"
                      value={pctMode ? Math.round(draft[key] * 100) : draft[key]}
                      onChange={e => set(key, pctMode ? Number(e.target.value) / 100 : Number(e.target.value))}
                      className="w-24 text-right bg-slate-700 border border-slate-600 rounded px-2 py-0.5 text-xs text-slate-100 outline-none"
                    />
                  </div>
                  <input
                    type="range" min={pctMode ? min * 100 : min} max={pctMode ? max * 100 : max} step={pctMode ? 1 : step}
                    value={pctMode ? Math.round(draft[key] * 100) : draft[key]}
                    onChange={e => set(key, pctMode ? Number(e.target.value) / 100 : Number(e.target.value))}
                    className="w-full accent-teal-500"
                  />
                </div>
              ))}

              {/* 계산 결과 */}
              <div className="grid grid-cols-2 gap-3">
                {([
                  ['kg 목표단가', prices.kgTargetPrice],
                  ['kg 세일단가', prices.kgSalePrice],
                  ['1근 목표단가', prices.geunTargetPrice],
                  ['1근 세일단가', prices.geunSalePrice],
                ] as [string, number][]).map(([label, val]) => (
                  <div key={label} className="bg-teal-900/20 border border-teal-700/30 rounded-xl p-3 text-center">
                    <p className="text-teal-400/70 text-[10px] mb-1">{label}</p>
                    <p className="text-teal-300 font-bold text-lg">{val.toLocaleString()}원</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div>
              {(!item.priceHistory || item.priceHistory.length === 0) ? (
                <div className="flex flex-col items-center justify-center h-32 text-slate-600 gap-2">
                  <History className="w-8 h-8 opacity-40" />
                  <p className="text-xs">매입 이력이 없습니다</p>
                </div>
              ) : (
                <>
                  <div className="h-40 mb-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={item.priceHistory.map(h => ({ date: h.date.slice(0,10), price: h.newPrice }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }} />
                        <YAxis tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={v => v.toLocaleString()} />
                        <Tooltip
                          contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, fontSize: 11 }}
                          formatter={(v: any) => [`${Number(v).toLocaleString()}원`, '매입단가']}
                        />
                        <Line type="monotone" dataKey="price" stroke="#14b8a6" dot={{ r: 3 }} strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-1.5">
                    {[...item.priceHistory].reverse().map((h, i) => (
                      <div key={i} className="flex items-center gap-3 px-3 py-2 bg-slate-800/60 rounded-xl text-xs">
                        <span className="text-slate-500 shrink-0">{h.date.slice(0,10)}</span>
                        <span className="text-slate-400">{h.oldPrice?.toLocaleString()}원</span>
                        <span className="text-slate-600">→</span>
                        <span className={h.newPrice > (h.oldPrice||0) ? 'text-red-400 font-semibold' : 'text-green-400 font-semibold'}>
                          {h.newPrice?.toLocaleString()}원
                          {h.oldPrice ? ` (${h.newPrice > h.oldPrice ? '+' : ''}${Math.round((h.newPrice / h.oldPrice - 1) * 100)}%)` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === 'supplier' && (
            <div className="flex flex-col items-center justify-center h-32 text-slate-600 gap-2">
              <Building2 className="w-8 h-8 opacity-40" />
              <p className="text-xs">거래처 연동: AI 매입관리에서 자동 반영됩니다</p>
              <p className="text-slate-700 text-[10px]">등록 거래처: {item.supplier || '없음'}</p>
            </div>
          )}
        </div>

        {/* 하단 버튼 */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-800 shrink-0">
          <button onClick={onClose} className="px-4 py-1.5 text-xs text-slate-400 hover:text-white rounded-lg transition-colors">취소</button>
          <button
            onClick={handleSave}
            className="px-4 py-1.5 text-xs bg-teal-600 hover:bg-teal-500 text-white rounded-lg transition-colors font-medium"
          >
            저장
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Add Item Modal ── */
function AddItemModal({ storeId, onClose, onSaved }: { storeId: string; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    category: '한돈', grade: '1', targetMargin: 0.40, appliedCost: 0.35, lossRate: 0.10,
    species: '돼지고기', storage: '냉장', cut: '', origin: '국내산', buyPrice: 0, sellPrice: 0, supplier: '',
  });
  const [saving, setSaving] = useState(false);
  const prices = calcPrices(form.buyPrice, form.targetMargin, form.appliedCost, form.lossRate);
  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    if (!form.cut) return;
    setSaving(true);
    const headers = await getAuthJsonHeaders();
    await fetch('/api/items', { method: 'POST', headers, body: JSON.stringify({ storeId, item: form }) });
    setSaving(false);
    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70" />
      <div className="relative bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800">
          <h3 className="text-slate-200 font-semibold text-sm">품목 추가</h3>
          <button onClick={onClose}><X className="w-4 h-4 text-slate-500" /></button>
        </div>
        <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-3 gap-2">
            {([
              ['구분', 'category', [...ALL_ITEM_CATEGORIES]],
              ['보관', 'storage', ['냉장','냉동']],
              ['원산지', 'origin', ['국내산','미국산','호주산','캐나다산','스페인산','칠레산','수입산']],
            ] as [string, string, string[]][]).map(([label, key, opts]) => (
              <div key={key}>
                <p className="text-slate-500 text-[10px] mb-1">{label}</p>
                <select value={(form as any)[key]} onChange={e => set(key, e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200 outline-none">
                  {opts.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(['등급','품종','부위','거래처'] as const).map(label => {
              const key = label === '등급' ? 'grade' : label === '품종' ? 'species' : label === '부위' ? 'cut' : 'supplier';
              return (
                <div key={key}>
                  <p className="text-slate-500 text-[10px] mb-1">{label}</p>
                  <input value={(form as any)[key] || ''} onChange={e => set(key, e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-teal-500/60" />
                </div>
              );
            })}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {([
              ['매입단가', 'buyPrice', false],
              ['목표마진%', 'targetMargin', true],
              ['적용원가%', 'appliedCost', true],
              ['로스율%',   'lossRate', true],
              ['판매가',    'sellPrice', false],
            ] as [string, string, boolean][]).map(([label, key, isPct]) => (
              <div key={key}>
                <p className="text-slate-500 text-[10px] mb-1">{label}</p>
                <input type="number"
                  value={isPct ? Math.round((form as any)[key] * 100) : (form as any)[key]}
                  onChange={e => set(key, isPct ? Number(e.target.value) / 100 : Number(e.target.value))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-teal-500/60" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 bg-teal-900/20 border border-teal-700/30 rounded-xl p-3">
            {[['kg목표단가', prices.kgTargetPrice],['kg세일단가', prices.kgSalePrice],['1근목표단가', prices.geunTargetPrice],['1근세일단가', prices.geunSalePrice]].map(([l,v]) => (
              <div key={l} className="text-center">
                <p className="text-teal-400/60 text-[9px]">{l}</p>
                <p className="text-teal-300 text-sm font-bold">{Number(v).toLocaleString()}원</p>
              </div>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-800">
          <button onClick={onClose} className="px-4 py-1.5 text-xs text-slate-400 hover:text-white rounded-lg">취소</button>
          <button onClick={handleSave} disabled={saving || !form.cut}
            className="px-4 py-1.5 text-xs bg-teal-600 hover:bg-teal-500 text-white rounded-lg font-medium disabled:opacity-40">
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Bulk Change Modal ── */
function BulkModal({
  selectedIds, items, onClose, onDone,
}: {
  selectedIds: string[]; items: Item[]; onClose: () => void; onDone: () => void;
}) {
  const [mode, setMode] = useState<'margin' | 'price'>('margin');
  const [marginVal, setMarginVal] = useState(40);
  const [priceAdj, setPriceAdj] = useState(0);
  const [adjType, setAdjType] = useState<'pct' | 'flat'>('pct');
  const [saving, setSaving] = useState(false);

  const selected = items.filter(i => selectedIds.includes(i.id));

  const handleApply = async () => {
    setSaving(true);
    const headers = await getAuthJsonHeaders();
    for (const item of selected) {
      let updates: Partial<Item> = {};
      if (mode === 'margin') {
        updates = {
          targetMargin: marginVal / 100,
          appliedCost: item.appliedCost,
          lossRate: item.lossRate,
          buyPrice: item.buyPrice,
        };
      } else {
        const newPrice = adjType === 'pct'
          ? Math.round(item.buyPrice * (1 + priceAdj / 100))
          : item.buyPrice + priceAdj;
        updates = {
          buyPrice: newPrice,
          targetMargin: item.targetMargin,
          appliedCost: item.appliedCost,
          lossRate: item.lossRate,
        };
      }
      await fetch('/api/items', { method: 'PUT', headers, body: JSON.stringify({ id: item.id, updates }) });
    }
    setSaving(false);
    onDone();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70" />
      <div className="relative bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800">
          <h3 className="text-slate-200 font-semibold text-sm">일괄 변경 ({selected.length}개)</h3>
          <button onClick={onClose}><X className="w-4 h-4 text-slate-500" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex gap-2">
            <button onClick={() => setMode('margin')} className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${mode === 'margin' ? 'bg-teal-600/20 text-teal-300 border border-teal-600/30' : 'text-slate-500 bg-slate-800'}`}>목표마진율 변경</button>
            <button onClick={() => setMode('price')} className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${mode === 'price' ? 'bg-teal-600/20 text-teal-300 border border-teal-600/30' : 'text-slate-500 bg-slate-800'}`}>매입단가 조정</button>
          </div>

          {mode === 'margin' && (
            <div>
              <p className="text-slate-400 text-xs mb-2">새 목표마진율: <span className="text-teal-300 font-semibold">{marginVal}%</span></p>
              <input type="range" min={0} max={70} value={marginVal} onChange={e => setMarginVal(Number(e.target.value))} className="w-full accent-teal-500" />
            </div>
          )}
          {mode === 'price' && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <button onClick={() => setAdjType('pct')} className={`flex-1 py-1 rounded-lg text-xs ${adjType === 'pct' ? 'bg-teal-600/20 text-teal-300' : 'text-slate-500 bg-slate-800'}`}>% 변경</button>
                <button onClick={() => setAdjType('flat')} className={`flex-1 py-1 rounded-lg text-xs ${adjType === 'flat' ? 'bg-teal-600/20 text-teal-300' : 'text-slate-500 bg-slate-800'}`}>원 변경</button>
              </div>
              <div className="flex items-center gap-2">
                <input type="number" value={priceAdj} onChange={e => setPriceAdj(Number(e.target.value))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 outline-none" />
                <span className="text-slate-400 text-xs shrink-0">{adjType === 'pct' ? '%' : '원'}</span>
              </div>
              <p className="text-slate-600 text-[10px]">양수: 인상 / 음수: 인하</p>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-800">
          <button onClick={onClose} className="px-4 py-1.5 text-xs text-slate-400 hover:text-white rounded-lg">취소</button>
          <button onClick={handleApply} disabled={saving}
            className="px-4 py-1.5 text-xs bg-orange-600 hover:bg-orange-500 text-white rounded-lg font-medium disabled:opacity-40">
            {saving ? '적용 중...' : '적용'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════ 메인 ══════════════════════════ */
export default function ItemsPage() {
  const { user }         = useAuth();
  const { currentStore } = useStore();
  const storeId = currentStore?.storeId || '';

  const { data: rawItems = [], isLoading: loading, refetch } = useProducts(storeId, undefined, !!storeId);
  const items = rawItems as Item[];
  const updateProduct = useUpdateProduct(storeId);
  const deleteProduct = useDeleteProduct(storeId);
  const createProduct = useCreateProduct(storeId);

  const [activeTab,    setActiveTab]    = useState('전체');
  const [search,       setSearch]       = useState('');
  const [filterStorage,setFilterStorage]= useState('전체');
  const [selectedIds,  setSelectedIds]  = useState<Set<string>>(new Set());
  const [sortKey,      setSortKey]      = useState<keyof Item>('category');
  const [sortAsc,      setSortAsc]      = useState(true);
  const [detailItem,   setDetailItem]   = useState<Item | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBulkModal,setShowBulkModal]= useState(false);
  const [pageView,     setPageView]     = useState<'items' | 'aliases'>('items');
  const [aliases,      setAliases]      = useState<{ id: string; alias: string; normalizedName: string; supplierName?: string }[]>([]);
  const [aliasLoading, setAliasLoading] = useState(false);
  const [newAlias,     setNewAlias]     = useState({ alias: '', normalizedName: '', supplierName: '' });
  const fileRef = useRef<HTMLInputElement>(null);

  const loadAliases = useCallback(async () => {
    if (!storeId) return;
    setAliasLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/purchases/match-items?storeId=${storeId}`, { headers });
      const data = await res.json();
      setAliases(data.aliases || []);
    } finally { setAliasLoading(false); }
  }, [storeId]);

  const saveAlias = async () => {
    if (!newAlias.alias.trim() || !newAlias.normalizedName.trim()) return;
    const headers = await getAuthJsonHeaders();
    await fetch('/api/purchases/match-items', {
      method: 'PUT', headers,
      body: JSON.stringify({ ...newAlias, storeId, confidence: 100 }),
    });
    setNewAlias({ alias: '', normalizedName: '', supplierName: '' });
    loadAliases();
  };

  const deleteAlias = async (id: string) => {
    const headers = await getAuthHeaders();
    await fetch(`/api/purchases/match-items?id=${id}`, { method: 'DELETE', headers });
    loadAliases();
  };

  const load = useCallback(async () => {
    await refetch();
  }, [refetch]);

  useEffect(() => { if (pageView === 'aliases') loadAliases(); }, [pageView, loadAliases]);

  /* 필터링 + 정렬 */
  const filtered = items
    .filter(i => activeTab === '전체' || i.category === activeTab)
    .filter(i => filterStorage === '전체' || i.storage === filterStorage)
    .filter(i => {
      if (!search) return true;
      const q = search.toLowerCase();
      return [i.cut, i.species, i.origin, i.supplier, i.grade].some(v => v?.toLowerCase().includes(q));
    })
    .sort((a, b) => {
      const av = a[sortKey] ?? '';
      const bv = b[sortKey] ?? '';
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortAsc ? cmp : -cmp;
    });

  const toggleSort = (key: keyof Item) => {
    if (sortKey === key) setSortAsc(v => !v);
    else { setSortKey(key); setSortAsc(true); }
  };

  /* 인라인 저장 */
  const saveField = async (id: string, key: keyof Item, val: string) => {
    const item = items.find(i => i.id === id);
    if (!item) return;
    const numKeys: (keyof Item)[] = ['buyPrice','sellPrice','targetMargin','appliedCost','lossRate'];
    const isNum = numKeys.includes(key);
    const pctKeys: (keyof Item)[] = ['targetMargin','appliedCost','lossRate'];
    const isPct = pctKeys.includes(key);
    const parsed = isNum ? (isPct ? Number(val) / 100 : Number(val)) : val;

    const updates = {
      buyPrice:     key === 'buyPrice'     ? parsed as number : item.buyPrice,
      targetMargin: key === 'targetMargin' ? parsed as number : item.targetMargin,
      appliedCost:  key === 'appliedCost'  ? parsed as number : item.appliedCost,
      lossRate:     key === 'lossRate'     ? parsed as number : item.lossRate,
      [key]: parsed,
    };

    await updateProduct.mutateAsync({ id, updates });
  };

  /* 모달 저장 */
  const saveFromModal = async (id: string, updates: Partial<Item>) => {
    const item = items.find(i => i.id === id)!;
    const merged = {
      buyPrice:     updates.buyPrice     ?? item.buyPrice,
      targetMargin: updates.targetMargin ?? item.targetMargin,
      appliedCost:  updates.appliedCost  ?? item.appliedCost,
      lossRate:     updates.lossRate     ?? item.lossRate,
      ...updates,
    };
    await updateProduct.mutateAsync({ id, updates: merged });
  };

  /* 삭제 */
  const deleteItem = async (id: string) => {
    if (!(await overlay.confirm('품목을 삭제하시겠습니까?', { destructive: true }))) return;
    deleteProduct.mutate(id);
  };

  /* 선택 */
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map(i => i.id)));
  };

  /* Excel 내보내기 */
  const exportExcel = () => {
    const rows = filtered.map(i => ({
      구분: i.category, 등급: i.grade,
      '목표마진%': Math.round(i.targetMargin * 100),
      '적용원가%': Math.round(i.appliedCost  * 100),
      '로스율%':   Math.round(i.lossRate     * 100),
      품종: i.species, 보관방법: i.storage, 부위: i.cut, 원산지: i.origin,
      '매입단가(kg)': i.buyPrice, '판매가(kg)': i.sellPrice,
      kg목표단가: i.kgTargetPrice, kg세일단가: i.kgSalePrice,
      '1근세일단가': i.geunSalePrice, '1근목표단가': i.geunTargetPrice,
      거래처: i.supplier || '', 매입일자: i.lastPurchaseDate || '', 최근이력: i.lastTrace || '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '품목관리');
    XLSX.writeFile(wb, `품목관리_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  /* Excel 가져오기 */
  const importExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    const wb  = XLSX.read(buf);
    const ws  = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws) as any[];

    let saved = 0;
    for (const row of rows) {
      const item = {
        category:     row['구분'] || '',
        grade:        row['등급'] || '',
        targetMargin: (row['목표마진%'] || 0) / 100,
        appliedCost:  (row['적용원가%'] || 0) / 100,
        lossRate:     (row['로스율%']   || 0) / 100,
        species:      row['품종'] || '',
        storage:      row['보관방법'] || '냉장',
        cut:          row['부위'] || '',
        origin:       row['원산지'] || '',
        buyPrice:     Number(row['매입단가(kg)']) || 0,
        sellPrice:    Number(row['판매가(kg)'])  || 0,
        supplier:     row['거래처'] || null,
        lastPurchaseDate: row['매입일자'] || null,
        lastTrace:    row['최근이력'] || null,
      };
      if (!item.cut) continue;
      await createProduct.mutateAsync(item);
      saved++;
    }
    overlay.toast(`${saved}개 품목이 저장되었습니다`, { variant: 'success' });
    await refetch();
    if (fileRef.current) fileRef.current.value = '';
  };

  /* SortHeader */
  const SH = ({ label, k }: { label: string; k: keyof Item }) => (
    <th
      onClick={() => toggleSort(k)}
      className="px-2 py-2 text-left text-[10px] text-slate-500 font-medium cursor-pointer hover:text-slate-300 select-none whitespace-nowrap"
    >
      <span className="flex items-center gap-0.5">
        {label}
        {sortKey === k ? (sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : null}
      </span>
    </th>
  );

  /* 탭별 카운트 */
  const countOf = (cat: string) => cat === '전체' ? items.length : items.filter(i => i.category === cat).length;

  return (
    <div className="flex flex-col h-full bg-slate-950">
      {/* 헤더 */}
      <div className="shrink-0 px-3 sm:px-6 py-3 border-b border-slate-800/60">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-slate-400 text-xs font-semibold uppercase tracking-widest flex-1">품목관리</h1>

          <button onClick={() => setPageView('items')} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${pageView === 'items' ? 'bg-teal-600/20 text-teal-300 border border-teal-500/30' : 'text-slate-500'}`}>품목목록</button>
          <button onClick={() => setPageView('aliases')} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${pageView === 'aliases' ? 'bg-teal-600/20 text-teal-300 border border-teal-500/30' : 'text-slate-500'}`}>알리아스</button>

          {pageView === 'items' && selectedIds.size > 0 && (
            <button
              onClick={() => setShowBulkModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-600/20 hover:bg-orange-600/30 border border-orange-500/30 text-orange-300 rounded-lg text-xs"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              일괄변경 ({selectedIds.size})
            </button>
          )}

          {pageView === 'items' && (
          <>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600/20 hover:bg-teal-600/30 border border-teal-500/30 text-teal-300 rounded-lg text-xs"
          >
            <Plus className="w-3.5 h-3.5" /> 품목추가
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg text-xs"
          >
            <Upload className="w-3.5 h-3.5" /> Excel 가져오기
          </button>
          <button
            onClick={exportExcel}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg text-xs"
          >
            <Download className="w-3.5 h-3.5" /> Excel 내보내기
          </button>
          <button
            onClick={load}
            disabled={loading}
            className="p-1.5 text-slate-500 hover:text-teal-400 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          </>
          )}
          {pageView === 'aliases' && (
            <button onClick={loadAliases} className="p-1.5 text-slate-500 hover:text-teal-400"><RefreshCw className={`w-3.5 h-3.5 ${aliasLoading ? 'animate-spin' : ''}`} /></button>
          )}
        </div>
      </div>

      {pageView === 'aliases' ? (
        <div className="flex-1 overflow-auto p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2 bg-slate-900 border border-slate-800 rounded-xl p-4">
            <input value={newAlias.alias} onChange={e => setNewAlias(a => ({ ...a, alias: e.target.value }))} placeholder="OCR/명세서 표기" className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white" />
            <input value={newAlias.normalizedName} onChange={e => setNewAlias(a => ({ ...a, normalizedName: e.target.value }))} placeholder="표준 품목명" className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white" />
            <input value={newAlias.supplierName} onChange={e => setNewAlias(a => ({ ...a, supplierName: e.target.value }))} placeholder="거래처 (선택)" className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white" />
            <button onClick={saveAlias} className="bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-sm font-bold">알리아스 추가</button>
          </div>
          {aliasLoading ? <p className="text-slate-500 text-sm">로딩...</p> : aliases.length === 0 ? <p className="text-slate-500 text-sm">등록된 알리아스가 없습니다.</p> : (
            <div className="space-y-2">
              {aliases.map(a => (
                <div key={a.id} className="flex items-center gap-3 bg-slate-900 border border-slate-800 rounded-lg px-4 py-3">
                  <span className="font-mono text-sm text-white flex-1">{a.alias}</span>
                  <span className="text-teal-400 text-sm">→ {a.normalizedName}</span>
                  {a.supplierName && <span className="text-slate-500 text-xs">{a.supplierName}</span>}
                  <button onClick={() => deleteAlias(a.id)} className="text-slate-500 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
      <>
      {/* 탭 */}
      <div className="shrink-0 flex items-center gap-1 px-3 sm:px-6 pt-3 border-b border-slate-800/40 overflow-x-auto">
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => { setActiveTab(cat); setSelectedIds(new Set()); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg text-xs font-medium transition-colors ${
              activeTab === cat
                ? 'bg-slate-800 text-slate-200 border-t border-x border-slate-700/60'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {cat}
            <span className={`text-[9px] px-1 rounded ${activeTab === cat ? 'bg-teal-600/30 text-teal-300' : 'bg-slate-700 text-slate-500'}`}>
              {countOf(cat)}
            </span>
          </button>
        ))}
      </div>

      {/* 검색 + 필터 */}
      <div className="shrink-0 flex flex-wrap items-center gap-2 px-3 sm:px-6 py-2 border-b border-slate-800/40">
        <div className="relative flex-1 min-w-[140px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="부위 / 품종 / 원산지 / 거래처..."
            className="w-full pl-8 pr-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 placeholder-slate-600 outline-none focus:border-teal-500/60"
          />
          {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2"><X className="w-3 h-3 text-slate-500" /></button>}
        </div>

        <select
          value={filterStorage}
          onChange={e => setFilterStorage(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-300 outline-none"
        >
          {STORAGES.map(s => <option key={s} value={s}>{s === '전체' ? '보관: 전체' : s}</option>)}
        </select>

        <span className="text-slate-600 text-[10px] ml-auto">{filtered.length}개</span>
      </div>

      {/* 테이블 */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <RefreshCw className="w-5 h-5 text-slate-600 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-600 gap-2">
            <AlertCircle className="w-8 h-8 opacity-30" />
            <p className="text-sm">품목이 없습니다</p>
            <p className="text-xs text-slate-700">설정 → 품목 초기 데이터 로드 버튼으로 기본 187개를 불러올 수 있습니다</p>
          </div>
        ) : (
          <div className="min-w-[1100px]">
          <table className="w-full border-collapse" style={{ fontSize: 12 }}>
            <thead className="sticky top-0 z-10 bg-slate-900 border-b border-slate-800">
              <tr>
                <th className="px-2 py-2 w-8">
                  <button onClick={toggleAll} className="text-slate-500 hover:text-teal-400">
                    {selectedIds.size === filtered.length && filtered.length > 0
                      ? <CheckSquare className="w-3.5 h-3.5 text-teal-400" />
                      : <Square className="w-3.5 h-3.5" />
                    }
                  </button>
                </th>
                <SH label="구분"         k="category" />
                <SH label="등급"         k="grade" />
                <SH label="목표마진%"    k="targetMargin" />
                <SH label="적용원가%"    k="appliedCost" />
                <SH label="로스율%"      k="lossRate" />
                <SH label="품종"         k="species" />
                <SH label="보관"         k="storage" />
                <SH label="부위"         k="cut" />
                <SH label="원산지"       k="origin" />
                <SH label="매입단가(kg)" k="buyPrice" />
                <SH label="판매가(kg)"   k="sellPrice" />
                <SH label="kg목표단가"   k="kgTargetPrice" />
                <SH label="kg세일단가"   k="kgSalePrice" />
                <SH label="1근세일단가"  k="geunSalePrice" />
                <SH label="1근목표단가"  k="geunTargetPrice" />
                <SH label="거래처"       k="supplier" />
                <SH label="매입일자"     k="lastPurchaseDate" />
                <SH label="최근이력"     k="lastTrace" />
                <th className="px-2 py-2 text-[10px] text-slate-600 w-16">액션</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item, idx) => {
                const hist = item.priceHistory;
                const prevPrice = hist && hist.length > 0 ? hist[hist.length - 1].oldPrice : null;
                const priceDir = prevPrice
                  ? item.buyPrice > prevPrice ? 'up' : item.buyPrice < prevPrice ? 'down' : 'same'
                  : null;

                return (
                  <tr
                    key={item.id}
                    className={`border-b border-slate-800/40 hover:bg-slate-800/30 ${selectedIds.has(item.id) ? 'bg-teal-900/10' : idx % 2 === 1 ? 'bg-slate-900/30' : ''}`}
                    style={{ height: 36 }}
                  >
                    <td className="px-2">
                      <button onClick={() => toggleSelect(item.id)} className="text-slate-500 hover:text-teal-400">
                        {selectedIds.has(item.id)
                          ? <CheckSquare className="w-3.5 h-3.5 text-teal-400" />
                          : <Square className="w-3.5 h-3.5" />}
                      </button>
                    </td>
                    <td className="px-2 whitespace-nowrap text-slate-300">{item.category}</td>
                    <td className="px-2 whitespace-nowrap text-slate-300">{item.grade}</td>
                    <td className={`px-2 whitespace-nowrap text-right tabular-nums rounded ${marginBg(item.targetMargin)}`}>
                      <InlineCell value={Math.round(item.targetMargin * 100)} type="number" className="w-full" onSave={v => saveField(item.id, 'targetMargin', v)} />
                      %
                    </td>
                    <td className="px-2 whitespace-nowrap text-right tabular-nums text-slate-300">
                      <InlineCell value={Math.round(item.appliedCost * 100)} type="number" onSave={v => saveField(item.id, 'appliedCost', v)} />%
                    </td>
                    <td className="px-2 whitespace-nowrap text-right tabular-nums text-slate-300">
                      <InlineCell value={Math.round(item.lossRate * 100)} type="number" onSave={v => saveField(item.id, 'lossRate', v)} />%
                    </td>
                    <td className="px-2 whitespace-nowrap text-slate-400">{item.species}</td>
                    <td className="px-2 whitespace-nowrap">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${item.storage === '냉장' ? 'bg-blue-900/30 text-blue-400' : 'bg-cyan-900/30 text-cyan-400'}`}>
                        {item.storage}
                      </span>
                    </td>
                    <td
                      className="px-2 whitespace-nowrap text-slate-200 font-medium cursor-pointer hover:text-teal-300"
                      onClick={() => setDetailItem(item)}
                    >
                      {item.cut}
                    </td>
                    <td className="px-2 whitespace-nowrap text-slate-500 text-[11px]">{item.origin}</td>
                    <td className="px-2 whitespace-nowrap text-right tabular-nums">
                      <span className="flex items-center justify-end gap-1">
                        {priceDir === 'up'   && <TrendingUp   className="w-3 h-3 text-red-400   shrink-0" />}
                        {priceDir === 'down' && <TrendingDown className="w-3 h-3 text-green-400 shrink-0" />}
                        <InlineCell value={item.buyPrice} type="number" className="text-slate-200" onSave={v => saveField(item.id, 'buyPrice', v)} />
                      </span>
                    </td>
                    <td className="px-2 whitespace-nowrap text-right tabular-nums text-slate-300">
                      <InlineCell value={item.sellPrice} type="number" onSave={v => saveField(item.id, 'sellPrice', v)} />
                    </td>
                    <td className="px-2 whitespace-nowrap text-right tabular-nums text-slate-400">{comma(item.kgTargetPrice)}</td>
                    <td className="px-2 whitespace-nowrap text-right tabular-nums text-teal-400 font-medium">{comma(item.kgSalePrice)}</td>
                    <td className="px-2 whitespace-nowrap text-right tabular-nums text-teal-300">{comma(item.geunSalePrice)}</td>
                    <td className="px-2 whitespace-nowrap text-right tabular-nums text-slate-400">{comma(item.geunTargetPrice)}</td>
                    <td className="px-2 whitespace-nowrap text-slate-500 text-[11px]">
                      <InlineCell value={item.supplier || ''} onSave={v => saveField(item.id, 'supplier', v)} />
                    </td>
                    <td className="px-2 whitespace-nowrap text-slate-500 text-[11px]">
                      <InlineCell value={item.lastPurchaseDate || ''} type="date" onSave={v => saveField(item.id, 'lastPurchaseDate', v)} />
                    </td>
                    <td className="px-2 whitespace-nowrap text-slate-500 text-[11px] max-w-[120px] truncate">
                      <InlineCell value={item.lastTrace || ''} onSave={v => saveField(item.id, 'lastTrace', v)} />
                    </td>
                    <td className="px-2">
                      <div className="flex items-center gap-1">
                        <button onClick={() => setDetailItem(item)} className="p-1 text-slate-600 hover:text-teal-400 transition-colors">
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button onClick={() => deleteItem(item.id)} className="p-1 text-slate-600 hover:text-red-400 transition-colors">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* 하단 요약 바 */}
      <div className="shrink-0 px-6 py-2 border-t border-slate-800/60 flex items-center gap-4 text-[10px] text-slate-600">
        <span>총 <span className="text-slate-400">{items.length}</span>개</span>
        <span>|</span>
        {CATEGORIES.slice(1).map(cat => (
          <span key={cat}>{cat}: <span className="text-slate-400">{countOf(cat)}</span></span>
        ))}
        <span className="ml-auto flex items-center gap-3">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-green-900/60 inline-block" /> 60%↑</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-yellow-900/60 inline-block" /> 30~40%</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-red-900/60 inline-block" /> 30%↓</span>
        </span>
      </div>

      {/* 숨김 input */}
      <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={importExcel} />

      {/* 모달들 */}
      {detailItem && (
        <ItemModal
          item={detailItem}
          onClose={() => setDetailItem(null)}
          onSave={saveFromModal}
        />
      )}
      {showAddModal && (
        <AddItemModal
          storeId={storeId}
          onClose={() => setShowAddModal(false)}
          onSaved={load}
        />
      )}
      {showBulkModal && (
        <BulkModal
          selectedIds={[...selectedIds]}
          items={items}
          onClose={() => setShowBulkModal(false)}
          onDone={() => { load(); setSelectedIds(new Set()); }}
        />
      )}
      </>
      )}
    </div>
  );
}
