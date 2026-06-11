'use client';

import type { AutoVoucherAmountKey, AutoVoucherPattern } from '@/lib/accounting/autoVoucherPattern';
import { AMOUNT_KEY_LABELS } from '@/lib/accounting/autoVoucherPattern';
import { previewAutoPatternSummary } from '@/lib/accounting/autoVoucherPattern';

interface Props {
  title: string;
  pattern: AutoVoucherPattern;
  amountKeys: AutoVoucherAmountKey[];
  savePattern: boolean;
  onPatternChange: (pattern: AutoVoucherPattern) => void;
  onSavePatternChange: (v: boolean) => void;
}

export default function VoucherPatternEditor({
  title,
  pattern,
  amountKeys,
  savePattern,
  onPatternChange,
  onSavePatternChange,
}: Props) {
  const updateLine = (index: number, patch: Partial<AutoVoucherPattern['lines'][number]>) => {
    onPatternChange({
      ...pattern,
      lines: pattern.lines.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    });
  };

  return (
    <div className="mb-4 p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-slate-200">{title}</p>
          <p className="text-[10px] text-slate-500 mt-0.5">{previewAutoPatternSummary(pattern)}</p>
        </div>
        <label className="flex items-center gap-1.5 text-[10px] text-slate-400">
          <input
            type="checkbox"
            checked={pattern.splitVat}
            onChange={e => onPatternChange({ ...pattern, splitVat: e.target.checked })}
            className="rounded border-slate-600"
          />
          부가세 분리
        </label>
      </div>

      <div className="grid gap-2">
        {pattern.lines.map((line, idx) => (
          <div key={idx} className="grid grid-cols-12 gap-2 items-center text-xs">
            <span className={`col-span-1 font-semibold ${line.side === 'debit' ? 'text-blue-400' : 'text-amber-400'}`}>
              {line.side === 'debit' ? '차' : '대'}
            </span>
            <input
              value={line.accountCode}
              onChange={e => updateLine(idx, { accountCode: e.target.value })}
              placeholder="코드"
              className="col-span-2 px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-white"
            />
            <input
              value={line.accountName}
              onChange={e => updateLine(idx, { accountName: e.target.value })}
              placeholder="계정명"
              className="col-span-3 px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-white"
            />
            <select
              value={line.amountKey}
              onChange={e => updateLine(idx, { amountKey: e.target.value as AutoVoucherAmountKey })}
              className="col-span-3 px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-white"
            >
              {amountKeys.map(key => (
                <option key={key} value={key}>{AMOUNT_KEY_LABELS[key]}</option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <label className="flex items-center gap-1.5 text-[10px] text-slate-500">
        <input
          type="checkbox"
          checked={savePattern}
          onChange={e => onSavePatternChange(e.target.checked)}
          className="rounded border-slate-600"
        />
        이 패턴을 회계환경설정에 저장
      </label>
    </div>
  );
}
