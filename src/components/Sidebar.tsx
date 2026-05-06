// [History: 2026-05-05 - 대시보드 사이드바 컴포넌트 모듈화]
import React from 'react';

export default function Sidebar() {
  return (
    <aside className="hidden md:flex w-72 flex-col bg-slate-900 border-r border-slate-800">
      {/* 상단: 메뉴 목록 */}
      <div className="p-5 flex-1 overflow-y-auto">
        <h2 className="text-2xl font-bold text-teal-400 mb-8 tracking-tight">Pitaya OS</h2>
        <nav className="space-y-2">
          <button className="w-full flex items-center gap-3 text-left px-4 py-3 bg-slate-800 rounded-xl border border-slate-700 text-teal-300 font-medium transition-colors shadow-sm">
            <span className="text-lg">✨</span> AI 대화모드
          </button>
          <button className="w-full flex items-center gap-3 text-left px-4 py-3 hover:bg-slate-800/50 rounded-xl transition-colors text-slate-300">
            <span className="text-lg">💬</span> 직원 내부 메신저
          </button>
          <button className="w-full flex items-center gap-3 text-left px-4 py-3 hover:bg-slate-800/50 rounded-xl transition-colors text-slate-300">
            <span className="text-lg">⚙️</span> 개인화 영역 <span className="text-xs bg-slate-700 px-2 py-0.5 rounded text-slate-400 ml-auto">슈퍼유저</span>
          </button>
        </nav>
      </div>

      {/* 하단: 리소스 대시보드 (토큰, 트래픽, 용량) */}
      <div className="p-5 border-t border-slate-800 bg-slate-900/50">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
          📊 시스템 리소스 현황
        </h3>
        <div className="space-y-4">
          {/* Gemini API 토큰 */}
          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-slate-400">Gemini 토큰 (일간)</span>
              <span className="text-teal-400 font-medium">45%</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-1.5">
              <div className="bg-teal-500 h-1.5 rounded-full shadow-[0_0_8px_rgba(20,184,166,0.5)]" style={{ width: '45%' }}></div>
            </div>
          </div>
          {/* GCP 트래픽 */}
          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-slate-400">GCP 트래픽 제한</span>
              <span className="text-yellow-400 font-medium">82%</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-1.5">
              <div className="bg-yellow-500 h-1.5 rounded-full shadow-[0_0_8px_rgba(234,179,8,0.5)]" style={{ width: '82%' }}></div>
            </div>
          </div>
          {/* 구글 드라이브 용량 */}
          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-slate-400">드라이브 스토리지</span>
              <span className="text-teal-400 font-medium">12%</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-1.5">
              <div className="bg-teal-500 h-1.5 rounded-full shadow-[0_0_8px_rgba(20,184,166,0.5)]" style={{ width: '12%' }}></div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}