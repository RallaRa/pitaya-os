// [History: 2026-05-05 - 대시보드 2단 레이아웃 분리 적용]
import React from 'react';
import Sidebar from '@/components/Sidebar';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      <Sidebar />
      {children}
    </div>
  );
}
