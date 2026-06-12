'use client';

import Link from 'next/link';
import PurchaseShell from '@/components/purchase/PurchaseShell';
import { PURCHASE_MENU_SECTIONS } from '@/lib/purchase/menuStructure';
import { ShoppingCart, TrendingUp, Shield, Database, FileText } from 'lucide-react';

const SECTION_ICONS: Record<string, typeof ShoppingCart> = {
  input: FileText,
  analysis: TrendingUp,
  compliance: Shield,
  master: Database,
};

export default function PurchaseMgmtHomePage() {
  return (
    <PurchaseShell title="구매관리" description="매입 등록부터 단가 분석·법정 기록까지">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {PURCHASE_MENU_SECTIONS.map(section => {
          const Icon = SECTION_ICONS[section.id] || ShoppingCart;
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

      <div className="mt-6 p-4 rounded-xl border border-teal-500/20 bg-teal-950/20 text-xs text-teal-200/90">
        <p className="font-semibold mb-1">구매관리 흐름</p>
        <p className="text-teal-200/70 leading-relaxed">
          매입 등록 → 원장·거래처별 조회 → 단가 분석 → 법정 거래내역서 순으로 업무를 진행하세요.
          품목·거래처 마스터는 회계 연동 전표의 기준 데이터가 됩니다.
        </p>
      </div>
    </PurchaseShell>
  );
}
