'use client';

import Link from 'next/link';
import HrSystemShell from '@/components/hr-system/HrSystemShell';
import { HR_SYSTEM_MENU_SECTIONS } from '@/lib/hr-system/menuStructure';
import { Users, Clock, Calculator, FileSpreadsheet, Wallet } from 'lucide-react';

const SECTION_ICONS: Record<string, typeof Users> = {
  personnel: Users,
  attendance: Clock,
  payrollMaster: Wallet,
  payrollCalc: Calculator,
  payrollReport: FileSpreadsheet,
};

export default function HrSystemHomePage() {
  return (
    <HrSystemShell title="인사/급여관리" description="영림원 SystemEver WP 인사·근태·급여관리와 동일한 메뉴 구조">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {HR_SYSTEM_MENU_SECTIONS.map(section => {
          const Icon = SECTION_ICONS[section.id] || Users;
          return (
            <div
              key={section.id}
              className="rounded-xl border border-slate-800 bg-slate-900/50 overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2">
                <Icon className="w-4 h-4 text-cyan-400" />
                <h2 className="text-sm font-semibold text-slate-100">{section.label}</h2>
              </div>
              <ul className="p-2 space-y-0.5">
                {section.items.map(item => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="block px-3 py-2 rounded-lg text-xs text-slate-300 hover:bg-slate-800/80 hover:text-cyan-200 transition-colors"
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

      <div className="mt-6 p-4 rounded-xl border border-cyan-500/20 bg-cyan-950/20 text-xs text-cyan-200/90">
        <p className="font-semibold mb-1">Pitaya 인사/급여 모듈</p>
        <p className="text-cyan-200/70 leading-relaxed">
          사원정보(hr_employees)를 기준으로 인사현황·근태집계·급여계산·명세서·4대보험까지
          영림원 ERP와 동일한 메뉴 순서로 구성되어 있습니다. 권한 그룹에서 세부 메뉴별 접근을 설정할 수 있습니다.
        </p>
      </div>
    </HrSystemShell>
  );
}
