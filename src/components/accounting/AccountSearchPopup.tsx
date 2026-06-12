'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { AccountingAccount } from '@/lib/accounting/types';

interface Props {
  open: boolean;
  accounts: AccountingAccount[];
  onSelect: (account: AccountingAccount) => void;
  onClose: () => void;
}

export default function AccountSearchPopup({ open, accounts, onSelect, onClose }: Props) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return accounts.slice(0, 50);
    return accounts.filter(a =>
      String(a.code).includes(q)
      || a.name.toLowerCase().includes(q),
    ).slice(0, 50);
  }, [accounts, query]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] px-4 bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-slate-900 border border-slate-600 rounded-lg shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 py-2 bg-slate-800 border-b border-slate-700">
          <Search className="w-4 h-4 text-teal-400 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="계정코드·계정명 검색 (영림원 F2)"
            className="flex-1 bg-transparent text-sm text-white focus:outline-none placeholder:text-slate-500"
            onKeyDown={e => {
              if (e.key === 'Enter' && filtered[0]) {
                onSelect(filtered[0]);
                onClose();
              }
            }}
          />
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
        <ul className="max-h-64 overflow-y-auto text-xs">
          {filtered.length === 0 ? (
            <li className="px-3 py-4 text-slate-500 text-center">검색 결과 없음</li>
          ) : filtered.map(acc => (
            <li key={acc.id || acc.code}>
              <button
                type="button"
                className="w-full text-left px-3 py-2 hover:bg-teal-950/50 flex gap-3 border-b border-slate-800/80"
                onClick={() => { onSelect(acc); onClose(); }}
              >
                <span className="font-mono text-teal-300 w-16 shrink-0">{acc.code}</span>
                <span className="text-slate-200 truncate">{acc.name}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="px-3 py-1.5 text-[9px] text-slate-500 bg-slate-950 border-t border-slate-800">
          Enter 선택 · Esc 닫기
        </p>
      </div>
    </div>
  );
}
