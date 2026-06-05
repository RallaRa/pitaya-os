'use client';

import { breakdownPosBarCode } from '@/lib/posBarCode';

/** POS 6/7자리 구조 — 저울코드 등록·중복 확인용 */
export default function PosBarCodeBreakdownView({
  barCode,
  compact = false,
}: {
  barCode?: string | null;
  compact?: boolean;
}) {
  const b = barCode ? breakdownPosBarCode(barCode) : null;
  if (!b) return null;

  if (compact) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1 text-[10px] font-mono">
        <span className="text-slate-500" title="앞3자리 계열">{b.prefix3}</span>
        <span className="text-slate-600">|</span>
        <span className="text-teal-400/90" title="뒤3자리 저울">{b.scaleCode3}</span>
        <span className="text-amber-300/80" title="3번째 자리(계열구분)">·{b.seriesDigitLabel}</span>
      </span>
    );
  }

  return (
    <div className="rounded-lg border border-slate-700/60 bg-slate-900/50 px-2.5 py-2 text-[10px] space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-slate-500">POS 6자리</span>
        <span className="font-mono font-bold text-slate-200 tracking-wider">
          <span className="text-blue-300">{b.prefix3}</span>
          <span className="text-slate-600 mx-0.5">+</span>
          <span className="text-teal-300">{b.scaleCode3}</span>
        </span>
        <span className="text-slate-500">({b.prefixLabel})</span>
      </div>

      <div className="font-mono text-slate-400 leading-relaxed">
        <div>
          자리 1~6:{' '}
          {b.pos6.split('').map((ch, i) => (
            <span
              key={i}
              className={
                i === 2
                  ? 'text-amber-300 font-bold underline decoration-amber-500/50'
                  : i < 3
                    ? 'text-blue-300/90'
                    : 'text-teal-300/90'
              }
              title={i === 2 ? '3번째=계열구분(1한돈·3한우)' : i < 3 ? '앞3 계열' : '뒤3 저울'}
            >
              {ch}
              {i < 5 ? ' ' : ''}
            </span>
          ))}
        </div>
        <div className="text-slate-500 mt-0.5">
          7자리(앞0): <span className="text-slate-400">{b.padded7.split('').join(' ')}</span>
          {' · '}
          <span className="text-amber-300">4번째={b.digit4InPadded7}({b.seriesDigitLabel})</span>
          {' · '}
          <span className="text-teal-300/80">7번째={b.digit7InPadded7}(저울 끝자리)</span>
        </div>
      </div>

      {b.hasExtraDigits && (
        <p className="text-amber-200/70">원본 {b.raw.length}자리 — 표시는 마지막 6자리 기준</p>
      )}
    </div>
  );
}
