'use client';

import { useEffect, useRef } from 'react';
import { Terminal, Trash2 } from 'lucide-react';
import type { TerminalLine } from './types';

export default function TerminalPanel({
  lines,
  onClear,
  activeTab,
  onTabChange,
}: {
  lines: TerminalLine[];
  onClear: () => void;
  activeTab: 'terminal' | 'output';
  onTabChange: (tab: 'terminal' | 'output') => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines.length]);

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e] border-t border-[#3c3c3c]">
      <div className="flex items-center justify-between px-2 h-9 bg-[#252526] border-b border-[#3c3c3c] shrink-0">
        <div className="flex items-center gap-1">
          {(['terminal', 'output'] as const).map(tab => (
            <button
              key={tab}
              type="button"
              onClick={() => onTabChange(tab)}
              className={`px-3 py-1 text-[11px] uppercase tracking-wide ${
                activeTab === tab
                  ? 'text-white border-b border-[#007acc]'
                  : 'text-[#858585] hover:text-[#cccccc]'
              }`}
            >
              {tab === 'terminal' ? 'Terminal' : 'Output'}
            </button>
          ))}
        </div>
        <button type="button" onClick={onClear} className="p-1 text-[#858585] hover:text-white" title="Clear">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto font-mono text-[12px] p-2 leading-relaxed">
        {lines.length === 0 ? (
          <div className="flex items-center gap-2 text-[#858585]">
            <Terminal className="w-4 h-4" />
            <span>에이전트 터미널 출력이 여기에 표시됩니다</span>
          </div>
        ) : (
          lines.map(line => (
            <div
              key={line.id}
              className={
                line.kind === 'cmd' ? 'text-[#4ec9b0]' :
                line.kind === 'err' ? 'text-[#f48771]' :
                line.kind === 'info' ? 'text-[#569cd6]' :
                'text-[#cccccc]'
              }
            >
              {line.kind === 'cmd' && <span className="text-[#858585]">$ </span>}
              {line.text}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
