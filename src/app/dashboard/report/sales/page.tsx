'use client';

import React from 'react';

export default function SalesReportPage() {
  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 p-4 md:p-6">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-teal-400">일일 판매내역 분석</h1>
        <p className="text-slate-400">일일 판매내역 파일을 업로드하여 AI 분석 및 리포트를 생성합니다.</p>
      </div>

      <div className="flex-1 flex items-center justify-center bg-slate-900 border-2 border-dashed border-slate-700 rounded-2xl">
        <div className="text-center">
          <p className="text-slate-500">판매내역 분석 기능이 여기에 구현될 예정입니다.</p>
          <p className="text-sm text-slate-600">파일 업로드 UI가 추가됩니다.</p>
        </div>
      </div>
    </div>
  );
}
