'use client';

import { useCallback, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Plus, Trash2, Search } from 'lucide-react';
import type { AccountingAccount, VoucherLine } from '@/lib/accounting/types';
import AccountSearchPopup from '@/components/accounting/AccountSearchPopup';

export interface PartnerOption {
  id: string;
  supplierName: string;
}

export interface CodeNameOption {
  code: string;
  name: string;
}

type EditableCol =
  | 'accountCode'
  | 'debit'
  | 'credit'
  | 'memo'
  | 'partnerCode'
  | 'partnerName'
  | 'deptCode'
  | 'projectCode';

const EDITABLE_COLS: EditableCol[] = [
  'accountCode',
  'debit',
  'credit',
  'memo',
  'partnerCode',
  'partnerName',
  'deptCode',
  'projectCode',
];

const COL_LABELS: Record<EditableCol | 'accountName', string> = {
  accountCode: '계정코드',
  accountName: '계정명',
  debit: '차변금액',
  credit: '대변금액',
  memo: '적요',
  partnerCode: '거래처코드',
  partnerName: '거래처명',
  deptCode: '부서코드',
  projectCode: '프로젝트코드',
};

const MIN_SHEET_ROWS = 12;

function emptyLine(lineNo: number): VoucherLine {
  return {
    lineNo,
    accountCode: '',
    accountName: '',
    partnerCode: '',
    partnerName: '',
    deptCode: '',
    projectCode: '',
    debit: 0,
    credit: 0,
    memo: '',
  };
}

function fmtAmount(n: number): string {
  return (n || 0).toLocaleString('ko-KR');
}

function parseAmount(raw: string): number {
  const n = Number(String(raw).replace(/,/g, '').trim());
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
}

interface Props {
  lines: VoucherLine[];
  accounts: AccountingAccount[];
  partners?: PartnerOption[];
  depts?: CodeNameOption[];
  projects?: CodeNameOption[];
  readOnly?: boolean;
  onChange: (lines: VoucherLine[]) => void;
  totals: { debit: number; credit: number; balanced: boolean };
}

export default function VoucherLineSheet({
  lines,
  accounts,
  partners = [],
  depts = [],
  projects = [],
  readOnly = false,
  onChange,
  totals,
}: Props) {
  const cellRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const [activeCell, setActiveCell] = useState<{ row: number; col: EditableCol } | null>(null);
  const [accountSearchOpen, setAccountSearchOpen] = useState(false);
  const [accountSearchRow, setAccountSearchRow] = useState(0);

  const accountByCode = useMemo(() => {
    const map = new Map<string, AccountingAccount>();
    for (const a of accounts) map.set(String(a.code), a);
    return map;
  }, [accounts]);

  /** 영림원처럼 빈 행을 아래에 패딩 */
  const displayLines = useMemo(() => {
    const padded = [...lines];
    while (padded.length < MIN_SHEET_ROWS) {
      padded.push(emptyLine(padded.length + 1));
    }
    return padded;
  }, [lines]);

  const setCellRef = useCallback((row: number, col: EditableCol, el: HTMLInputElement | null) => {
    const key = `${row}-${col}`;
    if (el) cellRefs.current.set(key, el);
    else cellRefs.current.delete(key);
  }, []);

  const focusCell = useCallback((row: number, col: EditableCol) => {
    cellRefs.current.get(`${row}-${col}`)?.focus();
    setActiveCell({ row, col });
  }, []);

  const updateLine = useCallback((index: number, patch: Partial<VoucherLine>) => {
    if (index >= lines.length) {
      const extra: VoucherLine[] = [];
      while (extra.length + lines.length <= index) {
        extra.push(emptyLine(lines.length + extra.length + 1));
      }
      const merged = [...lines, ...extra];
      onChange(merged.map((line, i) => {
        if (i !== index) return { ...line, lineNo: i + 1 };
        const next = { ...line, ...patch, lineNo: i + 1 };
        if (patch.accountCode !== undefined) {
          const acc = accountByCode.get(String(patch.accountCode).trim());
          next.accountName = acc?.name || '';
        }
        return next;
      }));
      return;
    }
    onChange(lines.map((line, i) => {
      if (i !== index) return { ...line, lineNo: i + 1 };
      const next = { ...line, ...patch, lineNo: i + 1 };
      if (patch.accountCode !== undefined) {
        const acc = accountByCode.get(String(patch.accountCode).trim());
        next.accountName = acc?.name || '';
      }
      return next;
    }));
  }, [lines, onChange, accountByCode]);

  const resolvePartner = useCallback((code: string, name: string) => {
    const c = code.trim();
    const n = name.trim();
    if (c) {
      const byId = partners.find(p => p.id === c || p.id.startsWith(c));
      if (byId) return { partnerCode: byId.id.slice(0, 8), partnerName: byId.supplierName };
    }
    if (n) {
      const byName = partners.find(p => p.supplierName.includes(n) || n.includes(p.supplierName));
      if (byName) return { partnerCode: byName.id.slice(0, 8), partnerName: byName.supplierName };
    }
    return { partnerCode: c, partnerName: n };
  }, [partners]);

  const addLine = useCallback(() => {
    onChange([...lines, emptyLine(lines.length + 1)]);
  }, [lines, onChange]);

  const insertLineAfter = useCallback((index: number) => {
    const next = [...lines];
    next.splice(index + 1, 0, emptyLine(index + 2));
    onChange(next.map((l, i) => ({ ...l, lineNo: i + 1 })));
    setTimeout(() => focusCell(Math.min(index + 1, next.length), 'accountCode'), 0);
  }, [lines, onChange, focusCell]);

  const removeLine = useCallback((index: number) => {
    if (lines.length <= 2 || index >= lines.length) return;
    onChange(lines.filter((_, i) => i !== index).map((l, i) => ({ ...l, lineNo: i + 1 })));
  }, [lines, onChange]);

  const openAccountSearch = useCallback((row: number) => {
    setAccountSearchRow(row);
    setAccountSearchOpen(true);
  }, []);

  const moveFocus = useCallback((row: number, col: EditableCol, direction: 'next' | 'prev' | 'down' | 'up') => {
    const colIdx = EDITABLE_COLS.indexOf(col);
    const lastDataRow = Math.max(lines.length - 1, 0);
    if (direction === 'next') {
      if (colIdx < EDITABLE_COLS.length - 1) focusCell(row, EDITABLE_COLS[colIdx + 1]);
      else if (row < displayLines.length - 1) focusCell(row + 1, EDITABLE_COLS[0]);
      else {
        addLine();
        setTimeout(() => focusCell(lines.length, EDITABLE_COLS[0]), 0);
      }
    } else if (direction === 'prev') {
      if (colIdx > 0) focusCell(row, EDITABLE_COLS[colIdx - 1]);
      else if (row > 0) focusCell(row - 1, EDITABLE_COLS[EDITABLE_COLS.length - 1]);
    } else if (direction === 'down') {
      if (row < displayLines.length - 1) focusCell(row + 1, col);
      else {
        addLine();
        setTimeout(() => focusCell(lines.length, col), 0);
      }
    } else if (direction === 'up' && row > 0) {
      focusCell(row - 1, col);
    }
    void lastDataRow;
  }, [lines.length, displayLines.length, focusCell, addLine]);

  const onCellKeyDown = (e: KeyboardEvent<HTMLInputElement>, row: number, col: EditableCol) => {
    if (e.key === 'F2' && col === 'accountCode') {
      e.preventDefault();
      openAccountSearch(row);
      return;
    }
    if (e.key === 'Insert' && e.ctrlKey) {
      e.preventDefault();
      if (row < lines.length) insertLineAfter(row);
      else addLine();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      moveFocus(row, col, 'down');
    } else if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      moveFocus(row, col, 'next');
    } else if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault();
      moveFocus(row, col, 'prev');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveFocus(row, col, 'down');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveFocus(row, col, 'up');
    }
  };

  const inputCls =
    'w-full h-full min-h-[24px] bg-white/[0.03] px-1.5 py-0.5 text-[11px] focus:outline-none focus:bg-[#1a3a52] focus:ring-1 focus:ring-inset focus:ring-sky-500/70 disabled:opacity-60';

  const isDataRow = (idx: number) => idx < lines.length;

  return (
    <>
      <div className="border border-slate-500/60 rounded overflow-hidden bg-[#0c1219] shadow-inner">
        {/* 영림원형 툴바 */}
        <div className="flex items-center justify-between px-2 py-1 bg-[#1e3a5f] border-b border-slate-600 text-white">
          <p className="text-[10px] font-semibold tracking-wide">분개明細 입력</p>
          <div className="flex items-center gap-3 text-[9px] text-sky-100/80">
            <span>F2 계정검색</span>
            <span>Tab/Enter 셀 이동</span>
            <span>Ctrl+Insert 행삽입</span>
          </div>
        </div>

        <div className="overflow-x-auto max-h-[min(520px,60vh)] overflow-y-auto">
          <table className="w-full text-[11px] border-collapse table-fixed min-w-[1120px]">
            <thead className="sticky top-0 z-10">
              <tr className="bg-[#2a4a6b] text-sky-50 border-b border-slate-500">
                <th className="w-9 px-1 py-1.5 text-center font-semibold border-r border-slate-500/50">순번</th>
                <th className="w-[76px] px-1 py-1.5 text-left font-semibold border-r border-slate-500/50">{COL_LABELS.accountCode}</th>
                <th className="w-[128px] px-1 py-1.5 text-left font-semibold border-r border-slate-500/50">{COL_LABELS.accountName}</th>
                <th className="w-[92px] px-1 py-1.5 text-right font-semibold border-r border-slate-500/50 bg-[#3d2a1a]/40">{COL_LABELS.debit}</th>
                <th className="w-[92px] px-1 py-1.5 text-right font-semibold border-r border-slate-500/50 bg-[#1a2a3d]/50">{COL_LABELS.credit}</th>
                <th className="w-[148px] px-1 py-1.5 text-left font-semibold border-r border-slate-500/50">{COL_LABELS.memo}</th>
                <th className="w-[76px] px-1 py-1.5 text-left font-semibold border-r border-slate-500/50">{COL_LABELS.partnerCode}</th>
                <th className="w-[108px] px-1 py-1.5 text-left font-semibold border-r border-slate-500/50">{COL_LABELS.partnerName}</th>
                <th className="w-[68px] px-1 py-1.5 text-left font-semibold border-r border-slate-500/50">{COL_LABELS.deptCode}</th>
                <th className="w-[68px] px-1 py-1.5 text-left font-semibold border-r border-slate-500/50">{COL_LABELS.projectCode}</th>
                {!readOnly && <th className="w-8" />}
              </tr>
            </thead>
            <tbody>
              {displayLines.map((line, idx) => {
                const isActiveRow = activeCell?.row === idx;
                const isEmptyPad = !isDataRow(idx);
                return (
                  <tr
                    key={idx}
                    className={`border-b border-slate-700/40 ${
                      isActiveRow ? 'bg-sky-950/30' : isEmptyPad ? 'bg-slate-950/30' : 'hover:bg-slate-900/50'
                    }`}
                  >
                    <td className="text-center text-slate-500 tabular-nums border-r border-slate-700/50 bg-slate-900/60 text-[10px]">
                      {idx + 1}
                    </td>

                    <td className="border-r border-slate-700/50 p-0 relative">
                      {!readOnly && (
                        <button
                          type="button"
                          tabIndex={-1}
                          onClick={() => openAccountSearch(idx)}
                          className="absolute right-0 top-0 bottom-0 px-0.5 text-slate-500 hover:text-sky-400 z-[1]"
                          title="F2 계정검색"
                        >
                          <Search className="w-3 h-3" />
                        </button>
                      )}
                      <input
                        ref={el => setCellRef(idx, 'accountCode', el)}
                        list="voucher-account-codes"
                        value={line.accountCode}
                        disabled={readOnly}
                        onFocus={() => setActiveCell({ row: idx, col: 'accountCode' })}
                        onChange={e => updateLine(idx, { accountCode: e.target.value })}
                        onBlur={e => {
                          const code = e.target.value.trim();
                          if (!code) return;
                          const acc = accountByCode.get(code);
                          if (acc) updateLine(idx, { accountCode: code, accountName: acc.name });
                        }}
                        onKeyDown={e => onCellKeyDown(e, idx, 'accountCode')}
                        className={`${inputCls} font-mono text-sky-200 pr-5`}
                      />
                    </td>

                    <td className="border-r border-slate-700/50 px-1.5 py-0.5 text-slate-300 truncate bg-slate-900/25 text-[10px]" title={line.accountName}>
                      {line.accountName || ''}
                    </td>

                    <td className="border-r border-slate-700/50 p-0 bg-amber-950/10">
                      <input
                        ref={el => setCellRef(idx, 'debit', el)}
                        value={line.debit ? fmtAmount(line.debit) : ''}
                        disabled={readOnly}
                        inputMode="numeric"
                        onFocus={() => setActiveCell({ row: idx, col: 'debit' })}
                        onChange={e => updateLine(idx, { debit: parseAmount(e.target.value), credit: 0 })}
                        onKeyDown={e => onCellKeyDown(e, idx, 'debit')}
                        className={`${inputCls} text-right tabular-nums text-amber-100`}
                      />
                    </td>

                    <td className="border-r border-slate-700/50 p-0 bg-sky-950/15">
                      <input
                        ref={el => setCellRef(idx, 'credit', el)}
                        value={line.credit ? fmtAmount(line.credit) : ''}
                        disabled={readOnly}
                        inputMode="numeric"
                        onFocus={() => setActiveCell({ row: idx, col: 'credit' })}
                        onChange={e => updateLine(idx, { credit: parseAmount(e.target.value), debit: 0 })}
                        onKeyDown={e => onCellKeyDown(e, idx, 'credit')}
                        className={`${inputCls} text-right tabular-nums text-sky-100`}
                      />
                    </td>

                    <td className="border-r border-slate-700/50 p-0">
                      <input
                        ref={el => setCellRef(idx, 'memo', el)}
                        value={line.memo || ''}
                        disabled={readOnly}
                        onFocus={() => setActiveCell({ row: idx, col: 'memo' })}
                        onChange={e => updateLine(idx, { memo: e.target.value })}
                        onKeyDown={e => onCellKeyDown(e, idx, 'memo')}
                        className={`${inputCls} text-slate-200`}
                      />
                    </td>

                    <td className="border-r border-slate-700/50 p-0">
                      <input
                        ref={el => setCellRef(idx, 'partnerCode', el)}
                        list="voucher-partner-codes"
                        value={line.partnerCode || ''}
                        disabled={readOnly}
                        onFocus={() => setActiveCell({ row: idx, col: 'partnerCode' })}
                        onChange={e => updateLine(idx, { partnerCode: e.target.value })}
                        onBlur={e => {
                          const resolved = resolvePartner(e.target.value, line.partnerName || '');
                          updateLine(idx, resolved);
                        }}
                        onKeyDown={e => onCellKeyDown(e, idx, 'partnerCode')}
                        className={`${inputCls} font-mono text-slate-300`}
                      />
                    </td>

                    <td className="border-r border-slate-700/50 p-0">
                      <input
                        ref={el => setCellRef(idx, 'partnerName', el)}
                        list="voucher-partner-names"
                        value={line.partnerName || ''}
                        disabled={readOnly}
                        onFocus={() => setActiveCell({ row: idx, col: 'partnerName' })}
                        onChange={e => updateLine(idx, { partnerName: e.target.value })}
                        onBlur={e => {
                          const resolved = resolvePartner(line.partnerCode || '', e.target.value);
                          updateLine(idx, resolved);
                        }}
                        onKeyDown={e => onCellKeyDown(e, idx, 'partnerName')}
                        className={`${inputCls} text-slate-200`}
                      />
                    </td>

                    <td className="border-r border-slate-700/50 p-0">
                      <input
                        ref={el => setCellRef(idx, 'deptCode', el)}
                        list="voucher-dept-codes"
                        value={line.deptCode || ''}
                        disabled={readOnly}
                        onFocus={() => setActiveCell({ row: idx, col: 'deptCode' })}
                        onChange={e => updateLine(idx, { deptCode: e.target.value })}
                        onKeyDown={e => onCellKeyDown(e, idx, 'deptCode')}
                        className={`${inputCls} font-mono text-slate-400`}
                      />
                    </td>

                    <td className="border-r border-slate-700/50 p-0">
                      <input
                        ref={el => setCellRef(idx, 'projectCode', el)}
                        list="voucher-project-codes"
                        value={line.projectCode || ''}
                        disabled={readOnly}
                        onFocus={() => setActiveCell({ row: idx, col: 'projectCode' })}
                        onChange={e => updateLine(idx, { projectCode: e.target.value })}
                        onKeyDown={e => onCellKeyDown(e, idx, 'projectCode')}
                        className={`${inputCls} font-mono text-slate-400`}
                      />
                    </td>

                    {!readOnly && (
                      <td className="p-0 text-center">
                        {isDataRow(idx) && (
                          <button
                            type="button"
                            onClick={() => removeLine(idx)}
                            disabled={lines.length <= 2}
                            className="p-1 text-slate-600 hover:text-red-400 disabled:opacity-30"
                            title="행 삭제"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="sticky bottom-0">
              <tr className="bg-[#1e3a5f] border-t-2 border-sky-600/50 font-semibold text-sky-50">
                <td colSpan={3} className="px-2 py-2 text-right border-r border-slate-500/50">
                  합계
                </td>
                <td className="px-1.5 py-2 text-right tabular-nums text-amber-200 border-r border-slate-500/50">
                  {fmtAmount(totals.debit)}
                </td>
                <td className="px-1.5 py-2 text-right tabular-nums text-sky-200 border-r border-slate-500/50">
                  {fmtAmount(totals.credit)}
                </td>
                <td
                  colSpan={readOnly ? 5 : 6}
                  className={`px-2 py-2 text-xs ${totals.balanced ? 'text-emerald-300' : 'text-red-300'}`}
                >
                  {totals.balanced ? '차·대변 일치' : `차액 ${fmtAmount(Math.abs(totals.debit - totals.credit))}`}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {!readOnly && (
          <div className="flex items-center gap-2 px-2 py-1.5 border-t border-slate-600 bg-slate-900/80">
            <button
              type="button"
              onClick={addLine}
              className="text-[10px] px-2 py-1 rounded border border-slate-500 text-slate-200 hover:bg-slate-800 inline-flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> 행 추가
            </button>
            {activeCell && activeCell.row < lines.length && (
              <button
                type="button"
                onClick={() => insertLineAfter(activeCell.row)}
                className="text-[10px] px-2 py-1 rounded border border-slate-600 text-slate-400 hover:bg-slate-800"
              >
                아래 행 삽입
              </button>
            )}
            <span className="text-[9px] text-slate-500 ml-auto">
              입력 {lines.length}행 · 표시 {displayLines.length}행
            </span>
          </div>
        )}
      </div>

      <AccountSearchPopup
        open={accountSearchOpen}
        accounts={accounts}
        onSelect={acc => updateLine(accountSearchRow, { accountCode: acc.code, accountName: acc.name })}
        onClose={() => setAccountSearchOpen(false)}
      />

      <datalist id="voucher-account-codes">
        {accounts.map(a => (
          <option key={a.id || a.code} value={a.code}>{a.name}</option>
        ))}
      </datalist>
      <datalist id="voucher-partner-codes">
        {partners.map(p => (
          <option key={p.id} value={p.id.slice(0, 8)}>{p.supplierName}</option>
        ))}
      </datalist>
      <datalist id="voucher-partner-names">
        {partners.map(p => (
          <option key={p.id} value={p.supplierName} />
        ))}
      </datalist>
      <datalist id="voucher-dept-codes">
        {depts.map(d => (
          <option key={d.code} value={d.code}>{d.name}</option>
        ))}
      </datalist>
      <datalist id="voucher-project-codes">
        {projects.map(p => (
          <option key={p.code} value={p.code}>{p.name}</option>
        ))}
      </datalist>
    </>
  );
}
