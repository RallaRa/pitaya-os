'use client';

export interface AiMetaDisplay {
  provider?: string;
  model?: string;
  label?: string;
  tag?: string;
  exclusions?: string[];
}

export function AiUsedBadge({ ai, className = '' }: { ai?: AiMetaDisplay | null; className?: string }) {
  if (!ai?.tag && !ai?.label && !ai?.provider) return null;

  return (
    <div className={`text-[10px] text-slate-500 ${className}`}>
      <span className="text-slate-400">
        🤖 분석 AI: {ai.tag || ai.label || ai.provider}
      </span>
      {ai.exclusions && ai.exclusions.length > 0 && (
        <details className="mt-1">
          <summary className="cursor-pointer text-slate-600 hover:text-slate-400">
            제외된 AI {ai.exclusions.length}개
          </summary>
          <ul className="mt-1 space-y-0.5 pl-2">
            {ai.exclusions.map((line, i) => (
              <li key={i} className="text-red-400/75 leading-snug">{line}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
