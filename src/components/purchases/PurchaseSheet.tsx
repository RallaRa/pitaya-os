'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  ChevronRight, ChevronDown, Plus, Trash2, Save, Loader2, Check,
  ShoppingCart, Image as ImageIcon, Building2,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import PurchaseDocumentViewer from '@/components/purchases/PurchaseDocumentViewer';
import {
  isImageAttachment,
  resolveGroupAttachments,
  type PurchaseAttachment,
} from '@/lib/purchaseAttachments';

import {
  ALL_ITEM_CATEGORIES,
  isMeatCategory,
  PURCHASE_UNITS,
} from '@/lib/purchaseCategories';
import { hasInvoiceTotalMismatch } from '@/lib/purchasePostProcess';
import {
  formatPurchaseQty,
  normalizePurchaseQty,
  parsePurchaseQtyInput,
} from '@/lib/purchaseQtyFormat';
import {
  SupplierCodePicker,
  usePurchaseMasterData,
  type SupplierOption,
} from '@/components/purchases/PurchaseMasterSelect';

const PurchaseItemPriceHistoryPanel = dynamic(
  () => import('@/components/purchases/PurchaseItemPriceHistoryPanel'),
  { ssr: false },
);

export interface PurchaseItem {
  name: string;
  itemCode?: number;
  scaleCodeId?: string;
  category: string;
  qty: number;
  unit: string;
  unitPrice: number;
  supplyAmount: number;
  taxAmount: number;
  traceNo: string;
  origin: string;
  cut: string;
  grade: string;
}

export interface Invoice {
  purchaseDate: string;
  supplierName: string;
  supplierId?: string;
  invoiceNumber: string;
  items: PurchaseItem[];
  supplyAmount: number;
  taxAmount: number;
  totalAmount: number;
  paymentMethod: string;
  memo: string;
  /** AI 분석에 사용된 모델 꼬리표 (비교용) */
  aiTag?: string;
  /** 앙상블 OCR 원본 (수정 학습용) */
  _originalAiResult?: Omit<Invoice, '_originalAiResult' | '_conflicts' | '_totalMismatch' | '_ocrTotalAmount'>;
  _conflicts?: Array<{ field: string; values: Array<{ ai: string; value: unknown }> }>;
  /** OCR이 읽은 합계 (품목합과 다를 때) */
  _ocrTotalAmount?: number;
  _totalMismatch?: boolean;
}

export interface AttachedFile {
  name: string;
  type: 'image' | 'pdf' | 'csv' | 'excel';
  content: string;
  preview?: string;
}

export interface InvoiceGroup {
  id: string;
  invoice: Invoice;
  isSaved: boolean;
  isExpanded: boolean;
  attachedFiles?: AttachedFile[];
  /** @deprecated savedAttachments 사용 */
  savedImageUrls?: string[];
  /** Storage에 보관된 원본 (저장 후 영구 조회) */
  savedAttachments?: PurchaseAttachment[];
  purchaseRecordId?: string;
  originalAiResult?: Invoice['_originalAiResult'];
}

interface Props {
  groups: InvoiceGroup[];
  onGroupsChange: (groups: InvoiceGroup[]) => void;
  onSaveGroup: (groupId: string) => Promise<void>;
  savingGroupIds: Set<string>;
  storeId?: string;
}

type OptionalCol = 'traceNo' | 'origin' | 'cut' | 'grade';

const OPTIONAL_COL_LABELS: Record<OptionalCol, string> = {
  traceNo: '이력번호',
  origin: '원산지',
  cut: '부위',
  grade: '등급',
};

const OPTIONAL_COLS: OptionalCol[] = ['traceNo', 'origin', 'cut', 'grade'];

const PAYMENT_METHODS = ['', '현금', '카드', '외상', '이체'];
const UNITS = PURCHASE_UNITS;

const DEFAULT_ITEM: PurchaseItem = {
  name: '', category: '', qty: 0, unit: 'kg', unitPrice: 0,
  supplyAmount: 0, taxAmount: 0,
  traceNo: '', origin: '', cut: '', grade: '',
};

const fmt = (n: number) => (n || 0).toLocaleString('ko-KR');

function resolveSupplierForInvoice(
  invoice: Invoice,
  suppliers: SupplierOption[],
): SupplierOption | undefined {
  if (invoice.supplierId) {
    return suppliers.find(s => s.id === invoice.supplierId);
  }
  const name = invoice.supplierName?.trim();
  if (!name) return undefined;
  const exact = suppliers.find(s => s.supplierName.trim() === name);
  if (exact) return exact;
  return suppliers.find(s =>
    s.supplierName.includes(name) || name.includes(s.supplierName),
  );
}

function SupplierInfoSection({
  groupId,
  invoice,
  storeId,
  suppliers,
  onReload,
  onUpdateHeader,
  onUpdateSupplier,
}: {
  groupId: string;
  invoice: Invoice;
  storeId: string;
  suppliers: SupplierOption[];
  onReload: () => void;
  onUpdateHeader: (groupId: string, field: keyof Invoice, value: string) => void;
  onUpdateSupplier: (groupId: string, supplier: SupplierOption | null) => void;
}) {
  const matched = resolveSupplierForInvoice(invoice, suppliers);
  const displayName = matched?.supplierName || invoice.supplierName?.trim() || '';

  const infoRows: { label: string; value?: string }[] = [
    { label: '업체명', value: displayName || undefined },
    { label: '사업자번호', value: matched?.businessNumber?.trim() || undefined },
    { label: '분류', value: matched?.category?.trim() || undefined },
    { label: '연락처', value: matched?.phone?.trim() || undefined },
    { label: '매입일', value: invoice.purchaseDate || undefined },
    { label: '결제', value: invoice.paymentMethod || undefined },
    { label: '전표번호', value: invoice.invoiceNumber?.trim() || undefined },
  ].filter(r => r.value);

  return (
    <div className="border-b border-slate-800/80 bg-slate-950/40 px-3 py-2.5">
      <div className="flex items-center gap-1.5 mb-2">
        <Building2 className="w-3.5 h-3.5 text-teal-400 shrink-0" />
        <span className="text-[10px] font-semibold text-teal-300">공급자 정보</span>
        {!matched && displayName && (
          <span className="text-[9px] text-amber-400/90">마스터 미등록 — 아래에서 거래처 선택</span>
        )}
      </div>

      {storeId ? (
        <div className="mb-2">
          <SupplierCodePicker
            storeId={storeId}
            supplierId={invoice.supplierId || matched?.id}
            supplierName={invoice.supplierName}
            suppliers={suppliers}
            onReload={onReload}
            onSelect={s => onUpdateSupplier(groupId, s)}
          />
        </div>
      ) : (
        <input
          value={invoice.supplierName}
          onChange={e => onUpdateHeader(groupId, 'supplierName', e.target.value)}
          placeholder="공급업체명"
          className="w-full mb-2 bg-slate-800/60 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-teal-600 placeholder:text-slate-600"
        />
      )}

      {infoRows.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-1.5 text-[10px]">
          {infoRows.map(row => (
            <div key={row.label} className="min-w-0">
              <span className="text-slate-500">{row.label}: </span>
              {row.label === '전표번호' ? (
                <input
                  value={invoice.invoiceNumber}
                  onChange={e => onUpdateHeader(groupId, 'invoiceNumber', e.target.value)}
                  placeholder="전표번호"
                  className="inline-block w-[calc(100%-3.5rem)] max-w-[8rem] bg-transparent text-slate-200 focus:outline-none focus:bg-slate-800 rounded px-0.5 placeholder:text-slate-700"
                />
              ) : (
                <span className="text-slate-200 break-words">{row.value}</span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[10px] text-slate-500">거래처를 선택하거나 AI 분석 결과의 업체명을 확인해 주세요.</p>
      )}
    </div>
  );
}

function PurchaseQtyInput({
  qty,
  unit,
  onChange,
}: {
  qty: number;
  unit: string;
  onChange: (qty: number) => void;
}) {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState('');

  useEffect(() => {
    if (!focused) setText(formatPurchaseQty(qty, unit));
  }, [qty, unit, focused]);

  return (
    <input
      value={focused ? text : formatPurchaseQty(qty, unit)}
      inputMode="decimal"
      onFocus={() => {
        setFocused(true);
        setText(qty ? String(qty) : '');
      }}
      onChange={e => {
        setText(e.target.value);
        onChange(parsePurchaseQtyInput(e.target.value, unit));
      }}
      onBlur={() => {
        const normalized = normalizePurchaseQty(parsePurchaseQtyInput(text, unit), unit);
        onChange(normalized);
        setFocused(false);
        setText(formatPurchaseQty(normalized, unit));
      }}
      className="w-full bg-transparent px-1 py-0.5 text-right text-[10px] text-slate-200 focus:outline-none focus:bg-slate-800 rounded tabular-nums"
    />
  );
}

function recalcTotals(invoice: Invoice): Invoice {
  const supply = invoice.items.reduce((s, i) => s + (i.supplyAmount || 0), 0);
  const tax = invoice.items.reduce((s, i) => s + (i.taxAmount || 0), 0);
  return { ...invoice, supplyAmount: supply, taxAmount: tax, totalAmount: supply + tax };
}

function applyItemChange(
  item: PurchaseItem,
  field: keyof PurchaseItem,
  value: string | number,
): PurchaseItem {
  const updated = { ...item, [field]: value };
  if (field === 'unit') {
    updated.qty = normalizePurchaseQty(updated.qty, String(value));
  }
  if (field === 'qty' || field === 'unitPrice') {
    updated.supplyAmount = Math.round(updated.qty * updated.unitPrice);
    updated.taxAmount = Math.round(updated.supplyAmount * 0.1);
  } else if (field === 'supplyAmount') {
    updated.taxAmount = Math.round(Number(value) * 0.1);
  }
  return updated;
}

export default function PurchaseSheet({
  groups, onGroupsChange, onSaveGroup, savingGroupIds, storeId = '',
}: Props) {
  const [visibleCols, setVisibleCols] = useState<Set<OptionalCol>>(new Set());
  const [viewer, setViewer] = useState<{ groupId: string; index: number } | null>(null);
  const [historyTarget, setHistoryTarget] = useState<{
    groupId: string;
    itemIdx: number;
    itemName: string;
    itemUnit: string;
    purchaseDate: string;
  } | null>(null);
  const [historyCollapsed, setHistoryCollapsed] = useState(false);
  const { suppliers, reload: reloadMaster } = usePurchaseMasterData(storeId);

  const hasData = useMemo<Record<OptionalCol, boolean>>(() => {
    const r: Record<OptionalCol, boolean> = { traceNo: false, origin: false, cut: false, grade: false };
    for (const g of groups) {
      for (const item of g.invoice.items) {
        if (item.traceNo) r.traceNo = true;
        if (item.origin) r.origin = true;
        if (item.cut) r.cut = true;
        if (item.grade) r.grade = true;
      }
    }
    return r;
  }, [groups]);

  const shownCols = useMemo<OptionalCol[]>(() =>
    OPTIONAL_COLS.filter(col => visibleCols.has(col) || hasData[col]),
    [visibleCols, hasData],
  );

  const toggleCol = (col: OptionalCol) => {
    setVisibleCols(prev => {
      const next = new Set(prev);
      if (next.has(col)) next.delete(col); else next.add(col);
      return next;
    });
  };

  const updateGroup = useCallback((groupId: string, updater: (g: InvoiceGroup) => InvoiceGroup) => {
    onGroupsChange(groups.map(g => g.id === groupId ? updater(g) : g));
  }, [groups, onGroupsChange]);

  const toggleExpand = (groupId: string) => {
    updateGroup(groupId, g => ({ ...g, isExpanded: !g.isExpanded }));
  };

  const removeGroup = (groupId: string) => {
    onGroupsChange(groups.filter(g => g.id !== groupId));
  };

  const updateHeader = (groupId: string, field: keyof Invoice, value: string) => {
    updateGroup(groupId, g => ({
      ...g, invoice: recalcTotals({ ...g.invoice, [field]: value }),
    }));
  };

  const updateSupplier = (groupId: string, supplier: SupplierOption | null) => {
    updateGroup(groupId, g => ({
      ...g,
      invoice: recalcTotals({
        ...g.invoice,
        supplierId: supplier?.id || '',
        supplierName: supplier?.supplierName || '',
      }),
    }));
  };

  const updateItem = (groupId: string, idx: number, field: keyof PurchaseItem, value: string | number) => {
    updateGroup(groupId, g => {
      const items = g.invoice.items.map((item, i) =>
        i === idx ? applyItemChange(item, field, value) : item
      );
      return { ...g, invoice: recalcTotals({ ...g.invoice, items }) };
    });
  };

  const addItem = (groupId: string) => {
    updateGroup(groupId, g => ({
      ...g, invoice: { ...g.invoice, items: [...g.invoice.items, { ...DEFAULT_ITEM }] },
    }));
  };

  const removeItem = (groupId: string, idx: number) => {
    updateGroup(groupId, g => {
      const items = g.invoice.items.filter((_, i) => i !== idx);
      return { ...g, invoice: recalcTotals({ ...g.invoice, items }) };
    });
  };

  const viewerGroup = viewer ? groups.find(g => g.id === viewer.groupId) : null;
  const viewerAttachments = viewerGroup ? resolveGroupAttachments(viewerGroup) : [];

  const handleItemDoubleClick = (groupId: string, itemIdx: number, item: PurchaseItem, purchaseDate: string) => {
    if (!item.name.trim() || !storeId) return;
    setHistoryTarget({
      groupId,
      itemIdx,
      itemName: item.name.trim(),
      itemUnit: item.unit || 'kg',
      purchaseDate,
    });
    setHistoryCollapsed(false);
  };

  const applyHistoryPrice = useCallback((groupId: string, itemIdx: number, unitPrice: number) => {
    updateGroup(groupId, g => {
      const items = [...g.invoice.items];
      const item = items[itemIdx];
      if (!item) return g;
      items[itemIdx] = applyItemChange(item, 'unitPrice', unitPrice);
      return { ...g, invoice: recalcTotals({ ...g.invoice, items }) };
    });
  }, [updateGroup]);

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-3">
        <ShoppingCart className="w-10 h-10 opacity-20" />
        <p className="text-[11px]">우측 AI 채팅에서 파일을 업로드하면 여기에 자동으로 표시됩니다.</p>
        <p className="text-[10px] text-slate-600">드래그 · Ctrl+V 붙여넣기 지원</p>
      </div>
    );
  }

  return (
    <div className="flex gap-0 min-w-0">
    <div className="flex-1 min-w-0 space-y-3">
      {viewer && viewerAttachments.length > 0 && (
        <PurchaseDocumentViewer
          attachments={viewerAttachments}
          initialIndex={viewer.index}
          onClose={() => setViewer(null)}
        />
      )}

      {/* 선택 컬럼 토글 */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] text-slate-500">선택 컬럼:</span>
        {OPTIONAL_COLS.map(col => {
          const active = visibleCols.has(col) || hasData[col];
          return (
            <button
              key={col}
              onClick={() => toggleCol(col)}
              className={`flex items-center gap-0.5 text-[9px] px-2 py-0.5 rounded-full border transition-colors ${
                active
                  ? 'bg-teal-900/40 border-teal-600/60 text-teal-300'
                  : 'bg-slate-800 border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-400'
              }`}
            >
              {OPTIONAL_COL_LABELS[col]}
              {hasData[col] && (
                <span className="w-1.5 h-1.5 bg-teal-400 rounded-full" />
              )}
            </button>
          );
        })}
      </div>

      {/* 인보이스 그룹 목록 */}
      {groups.map(group => {
        const inv = group.invoice;
        const isSaving = savingGroupIds.has(group.id);

        return (
          <div
            key={group.id}
            className={`bg-slate-900 border rounded-xl overflow-hidden transition-colors ${
              group.isSaved ? 'border-teal-700/50' : 'border-slate-700'
            }`}
          >
            {/* 그룹 헤더 */}
            <div className={`flex items-center gap-1 px-2 py-1.5 flex-wrap ${group.isSaved ? 'bg-teal-900/15' : 'bg-slate-800/60'}`}>
              <button
                onClick={() => toggleExpand(group.id)}
                className="text-slate-400 hover:text-white transition-colors shrink-0"
              >
                {group.isExpanded
                  ? <ChevronDown className="w-3.5 h-3.5" />
                  : <ChevronRight className="w-3.5 h-3.5" />}
              </button>

              <input
                value={inv.purchaseDate}
                onChange={e => updateHeader(group.id, 'purchaseDate', e.target.value)}
                type="date"
                className="bg-transparent text-[10px] text-slate-400 focus:outline-none focus:bg-slate-800 rounded px-0.5 w-[7.5rem] shrink-0"
              />

              {storeId ? (
                <SupplierCodePicker
                  storeId={storeId}
                  supplierId={inv.supplierId}
                  supplierName={inv.supplierName}
                  suppliers={suppliers}
                  onReload={reloadMaster}
                  onSelect={s => updateSupplier(group.id, s)}
                  compact
                />
              ) : (
                <input
                  value={inv.supplierName}
                  onChange={e => updateHeader(group.id, 'supplierName', e.target.value)}
                  placeholder="공급업체명"
                  className="bg-transparent text-[11px] text-white font-semibold focus:outline-none focus:bg-slate-800 rounded px-0.5 flex-1 min-w-[5rem] placeholder:text-slate-600"
                />
              )}

              {inv.aiTag && (
                <span
                  className="shrink-0 text-[9px] px-1.5 py-0.5 rounded-full bg-slate-700/80 text-slate-300 border border-slate-600 max-w-[5rem] truncate"
                  title="이 명세를 분석한 AI"
                >
                  {inv.aiTag}
                </span>
              )}

              {inv._conflicts && inv._conflicts.length > 0 && (
                <span
                  className="shrink-0 text-[9px] px-1.5 py-0.5 rounded-full bg-amber-900/40 text-amber-400 border border-amber-500/30"
                  title={inv._conflicts.map(c => `${c.field}: ${c.values.map(v => `${v.ai}=${v.value}`).join(' / ')}`).join('\n')}
                >
                  AI 불일치 {inv._conflicts.length}
                </span>
              )}

              {hasInvoiceTotalMismatch(inv) && (
                <span
                  className="shrink-0 text-[9px] px-1.5 py-0.5 rounded-full bg-orange-900/40 text-orange-300 border border-orange-500/30"
                  title={
                    inv._ocrTotalAmount
                      ? `문서 합계 ${fmt(inv._ocrTotalAmount)}원 ≠ 품목합 ${fmt(inv.totalAmount)}원 — 품목 기준으로 보정됨`
                      : '품목 합계와 표시 합계가 다릅니다'
                  }
                >
                  합계 확인
                </span>
              )}

              <input
                value={inv.invoiceNumber}
                onChange={e => updateHeader(group.id, 'invoiceNumber', e.target.value)}
                placeholder="전표번호"
                className="bg-transparent text-[10px] text-slate-500 focus:outline-none focus:bg-slate-800 rounded px-0.5 w-20 shrink-0 hidden sm:block placeholder:text-slate-700"
              />

              <select
                value={inv.paymentMethod}
                onChange={e => updateHeader(group.id, 'paymentMethod', e.target.value)}
                className="bg-slate-800 border border-slate-600/60 text-[10px] text-slate-300 rounded px-1 py-0.5 focus:outline-none shrink-0"
              >
                {PAYMENT_METHODS.map(m => (
                  <option key={m} value={m}>{m || '결제방법'}</option>
                ))}
              </select>

              <span className="text-[11px] text-teal-400 font-bold whitespace-nowrap shrink-0 hidden lg:block tabular-nums">
                {fmt(inv.totalAmount)}원
              </span>

              {(() => {
                const docs = resolveGroupAttachments(group);
                if (docs.length === 0) return null;
                const first = docs[0];
                const thumb = first && isImageAttachment(first) ? first.url : null;
                return (
                  <button
                    type="button"
                    onClick={() => setViewer({ groupId: group.id, index: 0 })}
                    className={`flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded transition-colors shrink-0 ${
                      group.isSaved
                        ? 'text-teal-400 hover:text-teal-300 bg-teal-900/30 hover:bg-teal-900/50'
                        : 'text-slate-400 hover:text-teal-300 bg-slate-700/60 hover:bg-slate-700'
                    }`}
                    title={group.isSaved ? '저장된 원본 문서 보기' : '원본 문서 보기'}
                  >
                    {thumb ? (
                      <img src={thumb} alt="" className="w-4 h-4 object-cover rounded" />
                    ) : (
                      <ImageIcon className="w-3 h-3" />
                    )}
                    <span>원본{docs.length > 1 ? ` ${docs.length}` : ''}</span>
                  </button>
                );
              })()}

              {group.isSaved ? (
                <span className="flex items-center gap-0.5 text-[9px] text-teal-400 shrink-0">
                  <Check className="w-2.5 h-2.5" /> 저장
                </span>
              ) : (
                <button
                  onClick={() => onSaveGroup(group.id)}
                  disabled={isSaving}
                  className="flex items-center gap-0.5 text-[9px] bg-teal-700 hover:bg-teal-600 disabled:bg-slate-700 text-white px-2 py-0.5 rounded transition-colors whitespace-nowrap shrink-0"
                >
                  {isSaving
                    ? <Loader2 className="w-2.5 h-2.5 animate-spin" />
                    : <Save className="w-2.5 h-2.5" />}
                  저장
                </button>
              )}

              <button
                onClick={() => removeGroup(group.id)}
                className="text-slate-700 hover:text-red-400 transition-colors p-0.5 shrink-0"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>

            {/* 공급자 정보 + 품목 입력 */}
            {group.isExpanded && (
              <>
              <SupplierInfoSection
                groupId={group.id}
                invoice={inv}
                storeId={storeId}
                suppliers={suppliers}
                onReload={reloadMaster}
                onUpdateHeader={updateHeader}
                onUpdateSupplier={updateSupplier}
              />
              <div className="overflow-x-auto">
                <table className="w-full text-[10px] border-collapse table-fixed min-w-[640px]">
                  <thead>
                    <tr className="border-b border-slate-700/60 bg-slate-800/30">
                      <th className="text-left text-slate-500 px-1.5 py-1 font-medium w-6">#</th>
                      <th className="text-left text-slate-400 px-1 py-1 font-medium w-16">구분</th>
                      <th className="text-left text-slate-400 px-1 py-1 font-medium w-[22%]">품명</th>
                      <th className="text-right text-slate-400 px-1 py-1 font-medium w-12">거래량</th>
                      <th className="text-left text-slate-400 px-1 py-1 font-medium w-10">단위</th>
                      <th className="text-right text-slate-400 px-1 py-1 font-medium w-16">단가</th>
                      <th className="text-right text-slate-400 px-1 py-1 font-medium w-16">공급가</th>
                      <th className="text-right text-slate-400 px-1 py-1 font-medium w-14">세액</th>
                      {shownCols.includes('traceNo') && (
                        <th className="text-left text-slate-400 px-1 py-1 font-medium w-24">이력번호</th>
                      )}
                      {shownCols.includes('origin') && (
                        <th className="text-left text-slate-400 px-1 py-1 font-medium w-14">원산지</th>
                      )}
                      {shownCols.includes('cut') && (
                        <th className="text-left text-slate-400 px-1 py-1 font-medium w-14">부위</th>
                      )}
                      {shownCols.includes('grade') && (
                        <th className="text-left text-slate-400 px-1 py-1 font-medium w-10">등급</th>
                      )}
                      <th className="w-6" />
                    </tr>
                  </thead>
                  <tbody>
                    {inv.items.map((item, idx) => (
                      <tr
                        key={idx}
                        onDoubleClick={() => handleItemDoubleClick(group.id, idx, item, inv.purchaseDate)}
                        className={`border-b border-slate-800/50 hover:bg-slate-800/20 group cursor-default ${
                          historyTarget?.groupId === group.id && historyTarget?.itemIdx === idx
                            ? 'bg-teal-900/20 ring-1 ring-inset ring-teal-700/40'
                            : ''
                        }`}
                        title={item.name.trim() ? '더블클릭: 단가 히스토리' : undefined}
                      >
                        <td className="px-1.5 py-0.5 text-slate-600 tabular-nums">{idx + 1}</td>

                        {/* 구분 */}
                        <td className="px-0.5 py-0">
                          <select
                            value={item.category}
                            onChange={e => updateItem(group.id, idx, 'category', e.target.value)}
                            className={`w-full bg-transparent px-0.5 py-0.5 text-[9px] focus:outline-none focus:bg-slate-800 rounded appearance-none cursor-pointer ${
                              isMeatCategory(item.category) ? 'text-slate-300' : 'text-amber-300/90'
                            }`}
                          >
                            <option value="">구분</option>
                            {ALL_ITEM_CATEGORIES.map(c => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                            {item.category && !ALL_ITEM_CATEGORIES.includes(item.category as typeof ALL_ITEM_CATEGORIES[number]) && (
                              <option value={item.category}>{item.category}</option>
                            )}
                          </select>
                        </td>

                        {/* 품명 */}
                        <td className="px-0.5 py-0">
                          <input
                            value={item.name}
                            onChange={e => updateItem(group.id, idx, 'name', e.target.value)}
                            className="w-full bg-transparent px-1 py-0.5 text-[10px] text-slate-200 focus:outline-none focus:bg-slate-800 rounded truncate"
                            placeholder="품명"
                          />
                        </td>

                        {/* 거래량 */}
                        <td className="px-0.5 py-0">
                          <PurchaseQtyInput
                            qty={item.qty}
                            unit={item.unit}
                            onChange={v => updateItem(group.id, idx, 'qty', v)}
                          />
                        </td>

                        {/* 단위 */}
                        <td className="px-0.5 py-0">
                          <select
                            value={item.unit}
                            onChange={e => updateItem(group.id, idx, 'unit', e.target.value)}
                            className="w-full bg-transparent px-0.5 py-0.5 text-[10px] text-slate-300 focus:outline-none focus:bg-slate-800 rounded appearance-none cursor-pointer"
                          >
                            {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                            {!UNITS.includes(item.unit) && item.unit && (
                              <option value={item.unit}>{item.unit}</option>
                            )}
                          </select>
                        </td>

                        {/* 단가 */}
                        <td className="px-0.5 py-0">
                          <input
                            value={item.unitPrice || ''}
                            type="number"
                            min={0}
                            onChange={e => updateItem(group.id, idx, 'unitPrice', parseInt(e.target.value) || 0)}
                            className="w-full bg-transparent px-1 py-0.5 text-right text-[10px] text-slate-200 focus:outline-none focus:bg-slate-800 rounded tabular-nums"
                          />
                        </td>

                        {/* 공급가액 */}
                        <td className="px-0.5 py-0">
                          <input
                            value={item.supplyAmount || ''}
                            type="number"
                            min={0}
                            onChange={e => updateItem(group.id, idx, 'supplyAmount', parseInt(e.target.value) || 0)}
                            className="w-full bg-transparent px-1 py-0.5 text-right text-[10px] text-slate-300 focus:outline-none focus:bg-slate-800 rounded tabular-nums"
                          />
                        </td>

                        {/* 세액 */}
                        <td className="px-0.5 py-0">
                          <input
                            value={item.taxAmount || ''}
                            type="number"
                            min={0}
                            onChange={e => updateItem(group.id, idx, 'taxAmount', parseInt(e.target.value) || 0)}
                            className="w-full bg-transparent px-1 py-0.5 text-right text-[10px] text-slate-400 focus:outline-none focus:bg-slate-800 rounded tabular-nums"
                          />
                        </td>

                        {shownCols.includes('traceNo') && (
                          <td className="px-0.5 py-0">
                            <input
                              value={item.traceNo}
                              onChange={e => updateItem(group.id, idx, 'traceNo', e.target.value)}
                              disabled={!isMeatCategory(item.category)}
                              className="w-full bg-transparent px-1 py-0.5 text-slate-400 focus:outline-none focus:bg-slate-800 rounded font-mono text-[9px] disabled:opacity-30"
                            />
                          </td>
                        )}

                        {shownCols.includes('origin') && (
                          <td className="px-0.5 py-0">
                            <input
                              value={item.origin}
                              onChange={e => updateItem(group.id, idx, 'origin', e.target.value)}
                              disabled={!isMeatCategory(item.category)}
                              className="w-full bg-transparent px-1 py-0.5 text-[10px] text-slate-300 focus:outline-none focus:bg-slate-800 rounded disabled:opacity-30"
                            />
                          </td>
                        )}

                        {shownCols.includes('cut') && (
                          <td className="px-0.5 py-0">
                            <input
                              value={item.cut}
                              onChange={e => updateItem(group.id, idx, 'cut', e.target.value)}
                              disabled={!isMeatCategory(item.category)}
                              className="w-full bg-transparent px-1 py-0.5 text-[10px] text-slate-300 focus:outline-none focus:bg-slate-800 rounded disabled:opacity-30"
                            />
                          </td>
                        )}

                        {shownCols.includes('grade') && (
                          <td className="px-0.5 py-0">
                            <input
                              value={item.grade}
                              onChange={e => updateItem(group.id, idx, 'grade', e.target.value)}
                              disabled={!isMeatCategory(item.category)}
                              className="w-full bg-transparent px-1 py-0.5 text-[10px] text-slate-300 focus:outline-none focus:bg-slate-800 rounded disabled:opacity-30"
                            />
                          </td>
                        )}

                        <td className="px-1 py-0.5">
                          <button
                            onClick={() => removeItem(group.id, idx)}
                            className="text-slate-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>

                  {/* 합계 */}
                  <tfoot>
                    <tr className="border-t border-slate-700/60 bg-slate-800/20">
                      <td colSpan={6} className="px-1.5 py-1 text-right text-slate-500 text-[9px]">소계</td>
                      <td className="px-1 py-1 text-right text-slate-200 font-semibold tabular-nums text-[10px]">
                        {fmt(inv.supplyAmount)}
                      </td>
                      <td className="px-1 py-1 text-right text-slate-400 tabular-nums text-[10px]">
                        {fmt(inv.taxAmount)}
                      </td>
                      {shownCols.map(c => <td key={c} />)}
                      <td />
                    </tr>
                    <tr className="bg-slate-800/10">
                      <td colSpan={6} className="px-1.5 py-1 text-right text-teal-400 text-[9px] font-medium">합계</td>
                      <td colSpan={2} className="px-1 py-1 text-right text-teal-400 font-bold text-[11px] tabular-nums">
                        {fmt(inv.totalAmount)}원
                      </td>
                      {shownCols.map(c => <td key={c} />)}
                      <td />
                    </tr>
                  </tfoot>
                </table>

                {/* 품목 추가 + 메모 */}
                <div className="flex items-center gap-2 px-2 py-1.5 border-t border-slate-800/40">
                  <button
                    onClick={() => addItem(group.id)}
                    className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-teal-400 transition-colors shrink-0"
                  >
                    <Plus className="w-3 h-3" />
                    품목 추가
                  </button>
                  <input
                    value={inv.memo}
                    onChange={e => updateHeader(group.id, 'memo', e.target.value)}
                    placeholder="메모"
                    className="flex-1 bg-transparent text-[10px] text-slate-500 placeholder:text-slate-700 focus:outline-none py-0.5 min-w-0"
                  />
                </div>
              </div>
              </>
            )}
          </div>
        );
      })}
    </div>

    {historyTarget && storeId && (
      <PurchaseItemPriceHistoryPanel
        storeId={storeId}
        itemName={historyTarget.itemName}
        itemUnit={historyTarget.itemUnit}
        referenceDate={historyTarget.purchaseDate}
        collapsed={historyCollapsed}
        onToggleCollapse={() => setHistoryCollapsed(v => !v)}
        onClose={() => setHistoryTarget(null)}
        onSelectPrice={(price) => applyHistoryPrice(historyTarget.groupId, historyTarget.itemIdx, price)}
      />
    )}
    </div>
  );
}
