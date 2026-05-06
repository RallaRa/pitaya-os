// [History: 2026-05-05 - 제미나이 스타일 대화형 메인 페이지 분리 적용]
import React from 'react';

export default function DashboardPage() {
  return (
    <main className="flex-1 flex flex-col relative bg-slate-950">
      {/* 모바일 전용 헤더 */}
      <header className="md:hidden flex items-center justify-between p-4 border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm z-10">
        <span className="font-bold text-teal-400 text-lg">Pitaya OS</span>
        <button className="text-slate-300 p-2 hover:bg-slate-800 rounded-lg">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
        </button>
      </header>

      {/* 대화 이력 출력 영역 */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8 scroll-smooth">
        {/* 환영 인사 (초기 빈 화면 상태) */}
        <div className="flex flex-col items-center justify-center mt-12 md:mt-20 space-y-4 animate-fade-in-up">
          <div className="w-16 h-16 bg-teal-900/30 border border-teal-500/30 rounded-2xl flex items-center justify-center mb-2 shadow-lg shadow-teal-900/20">
            <span className="text-3xl">✨</span>
          </div>
          <h1 className="text-2xl md:text-4xl font-bold text-slate-100 tracking-tight">무엇을 도와드릴까요?</h1>
          <p className="text-slate-400 text-sm md:text-base text-center max-w-md">
            매출 요약, 재고 조회, 팀원 호출 등 자연어로 업무를 지시해 보세요.
          </p>
        </div>

        {/* 샘플 AI 응답 메시지 (UI 확인용) */}
        <div className="flex gap-4 max-w-4xl mx-auto w-full mt-12 opacity-80">
           <div className="w-8 h-8 rounded-full bg-teal-900 border border-teal-500 flex items-center justify-center shrink-0 shadow-sm">
             ✨
           </div>
           <div className="bg-slate-900 p-4 md:p-5 rounded-2xl rounded-tl-sm border border-slate-800 text-slate-300 text-sm md:text-base leading-relaxed shadow-sm">
             안녕하세요, 최고 관리자님. 현재 시스템 내 모든 연결이 정상입니다.<br/>
             좌측 하단의 대시보드를 통해 리소스 사용량을 실시간으로 체크하실 수 있습니다.
           </div>
        </div>
      </div>

      {/* 3. 하단 입력창 (Input Area) */}
      <div className="p-4 md:p-6 bg-gradient-to-t from-slate-950 via-slate-950 to-transparent">
        <div className="max-w-4xl mx-auto relative group">
          <input 
            type="text" 
            placeholder="명령어를 입력하거나 도움이 필요하면 질문하세요..." 
            className="w-full bg-slate-900 border border-slate-700 rounded-2xl py-4 pl-5 pr-14 text-slate-100 text-sm md:text-base focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all shadow-lg placeholder:text-slate-500"
          />
          <button className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 bg-teal-500 hover:bg-teal-400 text-slate-950 rounded-xl transition-transform transform hover:scale-105 active:scale-95 shadow-md">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19V5m0 0l-7 7m7-7l7 7"></path></svg>
          </button>
        </div>
        <p className="text-center text-xs text-slate-500 mt-3 hidden md:block">
          AI가 생성한 데이터는 부정확할 수 있습니다. 민감한 작업 전에는 반드시 교차 검증을 수행하십시오.
        </p>
      </div>
    </main>
  );
}