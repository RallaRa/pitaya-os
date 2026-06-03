'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  ChevronRight, ChevronDown, Plus, Trash2, Save, Loader2, Check,
  ShoppingCart, Image as ImageIcon, X, ChevronLeft, ChevronRight as ChevronRightIcon,
  FileText, FileSpreadsheet,
} from 'lucide-react';

import {
  ALL_ITEM_CATEGORIES,
  isMeatCategory,
  PURCHASE_UNITS,
} from '@/lib/purchaseCategories';
import { hasInvoiceTotalMismatch } from '@/lib/purchasePostProcess';
import {
  ItemCodePicker,
  SupplierCodePicker,
  usePurchaseMasterData,
  mapScaleCategory,
  type ScaleCodeOption,
  type SupplierOption,
} from '@/components/purchases/PurchaseMasterSelect';

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
  savedImageUrls?: string[];
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
  if (field === 'qty' || field === 'unitPrice') {
    updated.supplyAmount = Math.round(updated.qty * updated.unitPrice);
    updated.taxAmount = Math.round(updated.supplyAmount * 0.1);
  } else if (field === 'supplyAmount') {
    updated.taxAmount = Math.round(Number(value) * 0.1);
  }
  return updated;
}

// ── 이미지 뷰어 모달 ──
function ImageViewerModal({
  files,
  savedUrls,
  initialIndex,
  onClose,
}: {
  files: AttachedFile[];
  savedUrls?: string[];
  initialIndex: number;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(initialIndex);

  // 표시할 소스 목록: 저장된 URL 우선, 없으면 로컬 content
  const sources: { src: string; name: string; type: string }[] = files.map((f, i) => ({
    src: savedUrls?.[i] || f.preview || f.content,
    name: f.name,
    type: f.type,
  }));
  const total = sources.length;
  const cur = sources[idx];

  const prev = () => setIdx(i => (i - 1 + total) % total);
  const next = () => setIdx(i => (i + 1) % total);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-center"
      onClick={onClose}
    >
      <div
        className="relative bg-slate-900 rounded-2xl overflow-hidden max-w-4xl w-full mx-4 max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-700 shrink-0">
          <ImageIcon className="w-4 h-4 text-teal-400" />
          <span className="text-sm text-slate-200 flex-1 truncate">{cur?.name}</span>
          <span className="text-xs text-slate-500">{idx + 1} / {total}</span>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 이미지 영역 */}
        <div className="flex-1 overflow-auto flex items-center justify-center bg-slate-950 min-h-[300px] relative">
          {cur?.type === 'image' ? (
            <img
              src={cur.src}
              alt={cur.name}
              className="max-w-full max-h-[70vh] object-contain"
            />
          ) : cur?.type === 'pdf' ? (
            <div className="flex flex-col items-center gap-3 text-slate-400">
              <FileText className="w-16 h-16 text-red-400" />
              <p className="text-sm">{cur.name}</p>
              <a
                href={cur.src}
                target="_blank"
                rel="noopener noreferrer"
                className="text-teal-400 hover:text-teal-300 text-xs underline"
              >
                새 탭에서 열기
              </a>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 text-slate-400">
              <FileSpreadsheet className="w-16 h-16 text-green-400" />
              <p className="text-sm">{cur.name}</p>
            </div>
          )}

          {/* 이전/다음 버튼 */}
          {total > 1 && (
            <>
              <button
                onClick={prev}
                className="absolute left-2 top-1/2 -translate-y-1/2 bg-slate-800/80 hover:bg-slate-700 text-white rounded-full p-2 transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={next}
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-slate-800/80 hover:bg-slate-700 text-white rounded-full p-2 transition-colors"
              >
                <ChevronRightIcon className="w-5 h-5" />
              </button>
            </>
          )}
        </div>

        {/* 썸네일 스트립 (여러 장일 때) */}
        {total > 1 && (
          <div className="flex gap-2 px-4 py-2 border-t border-slate-700 overflow-x-auto shrink-0">
            {sources.map((s, i) => (
              <button
                key={i}
                onClick={() => setIdx(i)}
                className={`shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 transition-colors ${
                  i === idx ? 'border-teal-400' : 'border-slate-700 hover:border-slate-500'
                }`}
              >
                {s.type === 'image' ? (
                  <img src={s.src} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-slate-800 flex items-center justify-center">
                    {s.type === 'pdf'
                      ? <FileText className="w-6 h-6 text-red-400" />
                      : <FileSpreadsheet className="w-6 h-6 text-green-400" />}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function PurchaseSheet({
  groups, onGroupsChange, onSaveGroup, savingGroupIds, storeId = '',
}: Props) {
  const [visibleCols, setVisibleCols] = useState<Set<OptionalCol>>(new Set());
  const [viewer, setViewer] = useState<{ groupId: string; index: number } | null>(null);
  const { scaleCodes, suppliers, reload: reloadMaster } = usePurchaseMasterData(storeId);

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

  const selectItemCode = (groupId: string, idx: number, opt: ScaleCodeOption | null) => {
    updateGroup(groupId, g => {
      const items = g.invoice.items.map((item, i) => {
        if (i !== idx) return item;
        if (!opt) {
          return { ...item, itemCode: undefined, scaleCodeId: undefined };
        }
        const cat = mapScaleCategory(opt.category) || item.category;
        return applyItemChange(
          {
            ...item,
            itemCode: opt.code,
            scaleCodeId: opt.id,
            name: opt.name,
            category: ALL_ITEM_CATEGORIES.includes(cat as typeof ALL_ITEM_CATEGORIES[number])
              ? cat
              : item.category,
          },
          'name',
          opt.name,
        );
      });
      return { ...g, invoice: recalcTotals({ ...g.invoice, items }) };
    });
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
    <div className="space-y-3">
      {/* 이미지 뷰어 모달 */}
      {viewer && viewerGroup && viewerGroup.attachedFiles && viewerGroup.attachedFiles.length > 0 && (
        <ImageViewerModal
          files={viewerGroup.attachedFiles}
          savedUrls={viewerGroup.savedImageUrls}
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

              {/* 원본 이미지 버튼 */}
              {group.attachedFiles && group.attachedFiles.length > 0 && (
                <button
                  onClick={() => setViewer({ groupId: group.id, index: 0 })}
                  className="flex items-center gap-0.5 text-[9px] text-slate-400 hover:text-teal-300 bg-slate-700/60 hover:bg-slate-700 px-1.5 py-0.5 rounded transition-colors shrink-0"
                  title="원본 문서 보기"
                >
                  {group.attachedFiles[0].type === 'image' && group.attachedFiles[0].preview ? (
                    <img
                      src={group.attachedFiles[0].preview}
                      alt=""
                      className="w-4 h-4 object-cover rounded"
                    />
                  ) : (
                    <ImageIcon className="w-3 h-3" />
                  )}
                  <span>원본{group.attachedFiles.length > 1 ? ` ${group.attachedFiles.length}` : ''}</span>
                </button>
              )}

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

            {/* 시트 테이블 */}
            {group.isExpanded && (
              <div className="overflow-x-auto">
                <table className="w-full text-[10px] border-collapse table-fixed min-w-[640px]">
                  <thead>
                    <tr className="border-b border-slate-700/60 bg-slate-800/30">
                      <th className="text-left text-slate-500 px-1.5 py-1 font-medium w-6">#</th>
                      <th className="text-left text-slate-400 px-1 py-1 font-medium w-16">구분</th>
                      <th className="text-left text-slate-400 px-1 py-1 font-medium w-[22%]">품목코드·품명</th>
                      <th className="text-right text-slate-400 px-1 py-1 font-medium w-12">수량</th>
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
                        className="border-b border-slate-800/50 hover:bg-slate-800/20 group"
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

                        {/* 품목코드·품명 */}
                        <td className="px-0.5 py-0">
                          {storeId ? (
                            <ItemCodePicker
                              storeId={storeId}
                              itemCode={item.itemCode}
                              itemName={item.name}
                              scaleCodes={scaleCodes}
                              onReload={reloadMaster}
                              onSelect={opt => selectItemCode(group.id, idx, opt)}
                            />
                          ) : (
                            <input
                              value={item.name}
                              onChange={e => updateItem(group.id, idx, 'name', e.target.value)}
                              className="w-full bg-transparent px-1 py-0.5 text-[10px] text-slate-200 focus:outline-none focus:bg-slate-800 rounded truncate"
                            />
                          )}
                        </td>

                        {/* 수량 */}
                        <td className="px-0.5 py-0">
                          <input
                            value={item.qty || ''}
                            type="number"
                            min={0}
                            step="0.01"
                            onChange={e => updateItem(group.id, idx, 'qty', parseFloat(e.target.value) || 0)}
                            className="w-full bg-transparent px-1 py-0.5 text-right text-[10px] text-slate-200 focus:outline-none focus:bg-slate-800 rounded tabular-nums"
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
            )}
          </div>
        );
      })}
    </div>
  );
}
