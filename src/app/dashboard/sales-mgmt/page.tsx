'use client';

import Link from 'next/link';
import SalesShell from '@/components/sales/SalesShell';
import { SALES_MENU_SECTIONS } from '@/lib/sales/menuStructure';
import {
  BarChart2, Keyboard, LineChart, Users, Megaphone, Scale,
} from 'lucide-react';

const SECTION_ICONS: Record<string, typeof BarChart2> = {
  report: BarChart2,
  manual: Keyboard,
  analysis: LineChart,
  customer: Users,
  promotion: Megaphone,
  scale: Scale,
};

export default function SalesMgmtHomePage() {
  return (
    <SalesShell title="영업관리" description="매출 마감·고객·판촉·사이니지까지">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {SALES_MENU_SECTIONS.map(section => {
          const Icon = SECTION_ICONS[section.id] || BarChart2;
          return (
            <div
              key={section.id}
              className="rounded-xl border border-slate-800 bg-slate-900/50 overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2">
                <Icon className="w-4 h-4 text-indigo-400" />
                <h2 className="text-sm font-semibold text-slate-100">{section.label}</h2>
              </div>
              <ul className="p-2 space-y-0.5">
                {section.items.map(item => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="block px-3 py-2 rounded-lg text-xs text-slate-300 hover:bg-slate-800/80 hover:text-indigo-200 transition-colors"
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

      <div className="mt-6 p-4 rounded-xl border border-indigo-500/20 bg-indigo-950/20 text-xs text-indigo-200/90">
        <p className="font-semibold mb-1">영업관리 흐름</p>
        <p className="text-indigo-200/70 leading-relaxed">
          일마감·달력매출로 실적을 확인하고, 예측·고객 여정으로 운영을 개선하세요.
          사이니지 AI 쇼는 매장 TV에 인기·Pick 품목을 4시간마다 로테이션합니다.
        </p>
      </div>
    </SalesShell>
  );
}
