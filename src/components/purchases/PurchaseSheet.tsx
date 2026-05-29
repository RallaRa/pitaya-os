'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  ChevronRight, ChevronDown, Plus, Trash2, Save, Loader2, Check,
  ShoppingCart,
} from 'lucide-react';

export interface PurchaseItem {
  name: string;
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
  invoiceNumber: string;
  items: PurchaseItem[];
  supplyAmount: number;
  taxAmount: number;
  totalAmount: number;
  paymentMethod: string;
  memo: string;
}

export interface InvoiceGroup {
  id: string;
  invoice: Invoice;
  isSaved: boolean;
  isExpanded: boolean;
}

interface Props {
  groups: InvoiceGroup[];
  onGroupsChange: (groups: InvoiceGroup[]) => void;
  onSaveGroup: (groupId: string) => Promise<void>;
  savingGroupIds: Set<string>;
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
const UNITS = ['kg', 'g', '개', '박스', '묶음', '마리', '팩'];

const DEFAULT_ITEM: PurchaseItem = {
  name: '', qty: 0, unit: 'kg', unitPrice: 0,
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

export default function PurchaseSheet({
  groups, onGroupsChange, onSaveGroup, savingGroupIds,
}: Props) {
  const [visibleCols, setVisibleCols] = useState<Set<OptionalCol>>(new Set());

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

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-3">
        <ShoppingCart className="w-10 h-10 opacity-20" />
        <p className="text-sm">우측 AI 채팅에서 파일을 업로드하면 여기에 자동으로 표시됩니다.</p>
        <p className="text-xs text-slate-600">이미지 드래그 앤 드랍, 클립보드 붙여넣기 모두 지원합니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 선택 컬럼 토글 */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] text-slate-500">선택 컬럼:</span>
        {OPTIONAL_COLS.map(col => {
          const active = visibleCols.has(col) || hasData[col];
          return (
            <button
              key={col}
              onClick={() => toggleCol(col)}
              className={`flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-full border transition-colors ${
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
            <div className={`flex items-center gap-2 px-3 py-2 ${group.isSaved ? 'bg-teal-900/15' : 'bg-slate-800/60'}`}>
              <button
                onClick={() => toggleExpand(group.id)}
                className="text-slate-400 hover:text-white transition-colors shrink-0"
              >
                {group.isExpanded
                  ? <ChevronDown className="w-4 h-4" />
                  : <ChevronRight className="w-4 h-4" />}
              </button>

              <input
                value={inv.purchaseDate}
                onChange={e => updateHeader(group.id, 'purchaseDate', e.target.value)}
                type="date"
                className="bg-transparent text-xs text-slate-400 focus:outline-none focus:bg-slate-800 rounded px-1 w-32 shrink-0"
              />

              <input
                value={inv.supplierName}
                onChange={e => updateHeader(group.id, 'supplierName', e.target.value)}
                placeholder="공급업체명"
                className="bg-transparent text-sm text-white font-semibold focus:outline-none focus:bg-slate-800 rounded px-1 flex-1 min-w-0 placeholder:text-slate-600"
              />

              <input
                value={inv.invoiceNumber}
                onChange={e => updateHeader(group.id, 'invoiceNumber', e.target.value)}
                placeholder="전표번호"
                className="bg-transparent text-xs text-slate-500 focus:outline-none focus:bg-slate-800 rounded px-1 w-28 shrink-0 hidden sm:block placeholder:text-slate-700"
              />

              <select
                value={inv.paymentMethod}
                onChange={e => updateHeader(group.id, 'paymentMethod', e.target.value)}
                className="bg-slate-800 border border-slate-600/60 text-xs text-slate-300 rounded px-1.5 py-0.5 focus:outline-none shrink-0"
              >
                {PAYMENT_METHODS.map(m => (
                  <option key={m} value={m}>{m || '결제방법'}</option>
                ))}
              </select>

              <span className="text-sm text-teal-400 font-bold whitespace-nowrap shrink-0 hidden lg:block tabular-nums">
                {fmt(inv.totalAmount)}원
              </span>

              {group.isSaved ? (
                <span className="flex items-center gap-1 text-[10px] text-teal-400 shrink-0">
                  <Check className="w-3 h-3" /> 저장됨
                </span>
              ) : (
                <button
                  onClick={() => onSaveGroup(group.id)}
                  disabled={isSaving}
                  className="flex items-center gap-1 text-[10px] bg-teal-700 hover:bg-teal-600 disabled:bg-slate-700 text-white px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  {isSaving
                    ? <Loader2 className="w-3 h-3 animate-spin" />
                    : <Save className="w-3 h-3" />}
                  저장
                </button>
              )}

              <button
                onClick={() => removeGroup(group.id)}
                className="text-slate-700 hover:text-red-400 transition-colors p-0.5 shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* 시트 테이블 */}
            {group.isExpanded && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-700/60 bg-slate-800/30">
                      <th className="text-left text-slate-500 px-3 py-2 font-medium w-7">#</th>
                      <th className="text-left text-slate-400 px-2 py-2 font-medium min-w-[120px]">품명</th>
                      <th className="text-right text-slate-400 px-2 py-2 font-medium w-20">수량</th>
                      <th className="text-left text-slate-400 px-2 py-2 font-medium w-16">단위</th>
                      <th className="text-right text-slate-400 px-2 py-2 font-medium w-28">단가</th>
                      <th className="text-right text-slate-400 px-2 py-2 font-medium w-28">공급가액</th>
                      <th className="text-right text-slate-400 px-2 py-2 font-medium w-22">세액</th>
                      {shownCols.includes('traceNo') && (
                        <th className="text-left text-slate-400 px-2 py-2 font-medium w-32">이력번호</th>
                      )}
                      {shownCols.includes('origin') && (
                        <th className="text-left text-slate-400 px-2 py-2 font-medium w-20">원산지</th>
                      )}
                      {shownCols.includes('cut') && (
                        <th className="text-left text-slate-400 px-2 py-2 font-medium w-20">부위</th>
                      )}
                      {shownCols.includes('grade') && (
                        <th className="text-left text-slate-400 px-2 py-2 font-medium w-16">등급</th>
                      )}
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {inv.items.map((item, idx) => (
                      <tr
                        key={idx}
                        className="border-b border-slate-800/50 hover:bg-slate-800/20 group"
                      >
                        <td className="px-3 py-1 text-slate-600 tabular-nums">{idx + 1}</td>

                        {/* 품명 */}
                        <td className="px-1 py-0.5">
                          <input
                            value={item.name}
                            onChange={e => updateItem(group.id, idx, 'name', e.target.value)}
                            className="w-full bg-transparent px-2 py-1 text-slate-200 focus:outline-none focus:bg-slate-800 rounded"
                          />
                        </td>

                        {/* 수량 */}
                        <td className="px-1 py-0.5">
                          <input
                            value={item.qty || ''}
                            type="number"
                            min={0}
                            step="0.01"
                            onChange={e => updateItem(group.id, idx, 'qty', parseFloat(e.target.value) || 0)}
                            className="w-full bg-transparent px-2 py-1 text-right text-slate-200 focus:outline-none focus:bg-slate-800 rounded tabular-nums"
                          />
                        </td>

                        {/* 단위 */}
                        <td className="px-1 py-0.5">
                          <select
                            value={item.unit}
                            onChange={e => updateItem(group.id, idx, 'unit', e.target.value)}
                            className="w-full bg-transparent px-1 py-1 text-slate-300 focus:outline-none focus:bg-slate-800 rounded appearance-none cursor-pointer"
                          >
                            {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                            {!UNITS.includes(item.unit) && item.unit && (
                              <option value={item.unit}>{item.unit}</option>
                            )}
                          </select>
                        </td>

                        {/* 단가 */}
                        <td className="px-1 py-0.5">
                          <input
                            value={item.unitPrice || ''}
                            type="number"
                            min={0}
                            onChange={e => updateItem(group.id, idx, 'unitPrice', parseInt(e.target.value) || 0)}
                            className="w-full bg-transparent px-2 py-1 text-right text-slate-200 focus:outline-none focus:bg-slate-800 rounded tabular-nums"
                          />
                        </td>

                        {/* 공급가액 (직접 편집 가능) */}
                        <td className="px-1 py-0.5">
                          <input
                            value={item.supplyAmount || ''}
                            type="number"
                            min={0}
                            onChange={e => updateItem(group.id, idx, 'supplyAmount', parseInt(e.target.value) || 0)}
                            className="w-full bg-transparent px-2 py-1 text-right text-slate-300 focus:outline-none focus:bg-slate-800 rounded tabular-nums"
                          />
                        </td>

                        {/* 세액 */}
                        <td className="px-1 py-0.5">
                          <input
                            value={item.taxAmount || ''}
                            type="number"
                            min={0}
                            onChange={e => updateItem(group.id, idx, 'taxAmount', parseInt(e.target.value) || 0)}
                            className="w-full bg-transparent px-2 py-1 text-right text-slate-400 focus:outline-none focus:bg-slate-800 rounded tabular-nums"
                          />
                        </td>

                        {shownCols.includes('traceNo') && (
                          <td className="px-1 py-0.5">
                            <input
                              value={item.traceNo}
                              onChange={e => updateItem(group.id, idx, 'traceNo', e.target.value)}
                              className="w-full bg-transparent px-2 py-1 text-slate-400 focus:outline-none focus:bg-slate-800 rounded font-mono text-[10px]"
                            />
                          </td>
                        )}

                        {shownCols.includes('origin') && (
                          <td className="px-1 py-0.5">
                            <input
                              value={item.origin}
                              onChange={e => updateItem(group.id, idx, 'origin', e.target.value)}
                              className="w-full bg-transparent px-2 py-1 text-slate-300 focus:outline-none focus:bg-slate-800 rounded"
                            />
                          </td>
                        )}

                        {shownCols.includes('cut') && (
                          <td className="px-1 py-0.5">
                            <input
                              value={item.cut}
                              onChange={e => updateItem(group.id, idx, 'cut', e.target.value)}
                              className="w-full bg-transparent px-2 py-1 text-slate-300 focus:outline-none focus:bg-slate-800 rounded"
                            />
                          </td>
                        )}

                        {shownCols.includes('grade') && (
                          <td className="px-1 py-0.5">
                            <input
                              value={item.grade}
                              onChange={e => updateItem(group.id, idx, 'grade', e.target.value)}
                              className="w-full bg-transparent px-2 py-1 text-slate-300 focus:outline-none focus:bg-slate-800 rounded"
                            />
                          </td>
                        )}

                        <td className="px-2 py-1">
                          <button
                            onClick={() => removeItem(group.id, idx)}
                            className="text-slate-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>

                  {/* 합계 */}
                  <tfoot>
                    <tr className="border-t border-slate-700/60 bg-slate-800/20">
                      <td colSpan={5} className="px-3 py-1.5 text-right text-slate-500 text-[11px]">소계</td>
                      <td className="px-2 py-1.5 text-right text-slate-200 font-semibold tabular-nums">
                        {fmt(inv.supplyAmount)}
                      </td>
                      <td className="px-2 py-1.5 text-right text-slate-400 tabular-nums">
                        {fmt(inv.taxAmount)}
                      </td>
                      {shownCols.map(c => <td key={c} />)}
                      <td />
                    </tr>
                    <tr className="bg-slate-800/10">
                      <td colSpan={5} className="px-3 py-2 text-right text-teal-400 text-[11px] font-medium">합계금액</td>
                      <td colSpan={2} className="px-2 py-2 text-right text-teal-400 font-bold text-sm tabular-nums">
                        {fmt(inv.totalAmount)}원
                      </td>
                      {shownCols.map(c => <td key={c} />)}
                      <td />
                    </tr>
                  </tfoot>
                </table>

                {/* 품목 추가 + 메모 */}
                <div className="flex items-center gap-4 px-3 py-2 border-t border-slate-800/40">
                  <button
                    onClick={() => addItem(group.id)}
                    className="flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-teal-400 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    품목 추가
                  </button>
                  <input
                    value={inv.memo}
                    onChange={e => updateHeader(group.id, 'memo', e.target.value)}
                    placeholder="메모 (특이사항)"
                    className="flex-1 bg-transparent text-[11px] text-slate-500 placeholder:text-slate-700 focus:outline-none py-0.5"
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
