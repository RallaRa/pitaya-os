'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Sidebar() {
  const pathname = usePathname();

  const menuItems = [
    { href: '/dashboard/ai', icon: '✨', label: 'AI 대화모드' },
    { href: '/dashboard/report/input', icon: '✍️', label: 'AI 일마감보고 작성' },
    { href: '/dashboard/report/sales', icon: '📈', label: '일일 판매내역 분석' },
    { href: '/dashboard/report/hygiene', icon: '🧼', label: '위생 점검일지' },
    { href: '/dashboard/report/view', icon: '📊', label: '전체 보고서 조회' },
  ];

  return (
    <aside className="hidden md:flex w-72 flex-col bg-slate-900 border-r border-slate-800">
      <div className="p-5 flex-1 overflow-y-auto">
        <h2 className="text-2xl font-bold text-teal-400 mb-8 tracking-tight">Pitaya OS</h2>
        <nav className="space-y-2">
          {menuItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`block w-full flex items-center gap-3 text-left px-4 py-3 rounded-xl transition-colors ${pathname.startsWith(item.href)
                  ? 'bg-slate-800 text-teal-300 font-medium'
                  : 'text-slate-300 hover:bg-slate-800/50'
                }`}>
              <span className="text-lg">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
      </div>

      {/* 하단: 리소스 대시보드 */}
      <div className="p-5 border-t border-slate-800 bg-slate-900/50">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
          시스템 리소스 현황
        </h3>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-slate-400">Gemini 토큰 (일간)</span>
              <span className="text-teal-400 font-medium">45%</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-1.5">
              <div className="bg-teal-500 h-1.5 rounded-full" style={{ width: '45%' }}></div>
            </div>
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-slate-400">GCP 트래픽 제한</span>
              <span className="text-yellow-400 font-medium">82%</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-1.5">
              <div className="bg-yellow-500 h-1.5 rounded-full" style={{ width: '82%' }}></div>
            </div>
          </div>
           <div>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-slate-400">드라이브 스토리지</span>
              <span className="text-teal-400 font-medium">12%</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-1.5">
              <div className="bg-teal-500 h-1.5 rounded-full" style={{ width: '12%' }}></div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
