'use client';

import Link from 'next/link';
import AccountingShell from '@/components/accounting/AccountingShell';
import { ACCOUNTING_MENU_SECTIONS } from '@/lib/accounting/menuStructure';
import {
  BookOpen, FileText, Landmark, PieChart, Wallet, Link2,
} from 'lucide-react';

const SECTION_ICONS: Record<string, typeof BookOpen> = {
  basic: BookOpen,
  voucher: FileText,
  ledger: Landmark,
  closing: PieChart,
  fund: Wallet,
  integration: Link2,
};

export default function AccountingHomePage() {
  return (
    <AccountingShell title="회계관리" description="영림원 SystemEver WP 회계관리와 동일한 메뉴 구조">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {ACCOUNTING_MENU_SECTIONS.map(section => {
          const Icon = SECTION_ICONS[section.id] || BookOpen;
          return (
            <div
              key={section.id}
              className="rounded-xl border border-slate-800 bg-slate-900/50 overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2">
                <Icon className="w-4 h-4 text-teal-400" />
                <h2 className="text-sm font-semibold text-slate-100">{section.label}</h2>
              </div>
              <ul className="p-2 space-y-0.5">
                {section.items.map(item => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="block px-3 py-2 rounded-lg text-xs text-slate-300 hover:bg-slate-800/80 hover:text-teal-200 transition-colors"
                    >
                      <span className="font-medium">{item.label}</span>
                      {item.description && (
                        <span className="block text-[10px] text-slate-500 mt-0.5">{item.description}</span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <div className="mt-6 p-4 rounded-xl border border-amber-500/20 bg-amber-950/20 text-xs text-amber-200/90">
        <p className="font-semibold mb-1">Pitaya 회계 모듈</p>
        <p className="text-amber-200/70 leading-relaxed">
          기본정보 → 전표 → 장부 → 결산 → 자금 순서로 영림원 ERP와 동일하게 구성되어 있습니다.
          매입·POS 데이터는 연동 {'>'} 자동전표에서 회계전표로 반영할 수 있습니다.
        </p>
      </div>
    </AccountingShell>
  );
}
