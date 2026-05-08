"use client";

import React, { useState } from 'react';

// [History: AI 대화 프론트엔드 상태 관리 및 백엔드 API 연동 UI 구축]
export default function AiChatPage() {
  const [messages, setMessages] = useState<{ role: 'user' | 'ai', text: string }[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input;
    // 사용자 메시지를 즉시 화면에 렌더링
    setMessages((prev) => [...prev, { role: 'user', text: userMessage }]);
    setInput('');
    setIsLoading(true);

    try {
      // 팩트 통제된 백엔드 API 호출 (/api/ai)
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage }),
      });

      if (!response.ok) throw new Error('서버 통신 에러');

      const data = await response.json();
      // AI 응답 화면 렌더링
      setMessages((prev) => [...prev, { role: 'ai', text: data.text }]);
    } catch (error) {
      console.error('API Error:', error);
      setMessages((prev) => [...prev, { role: 'ai', text: '통신 중 오류가 발생했습니다. 다시 시도해 주세요.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 p-4">
      {/* 대화 이력 출력 영역 */}
      <div className="flex-1 overflow-y-auto mb-4 space-y-4 pr-2">
        {messages.length === 0 ? (
          <div className="text-center text-slate-500 mt-20 flex flex-col items-center justify-center">
            <span className="text-4xl mb-4">✨</span>
            <p className="text-lg font-medium text-slate-300">무엇을 도와드릴까요?</p>
            <p className="text-sm mt-2">매출 요약, 재고 조회 등 팩트 기반으로 질문해 보세요.</p>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`p-4 rounded-xl max-w-[80%] border shadow-sm ${
                msg.role === 'user' 
                  ? 'bg-teal-900/50 border-teal-700/50 rounded-br-sm text-teal-50' 
                  : 'bg-slate-800 border-slate-700 rounded-bl-sm text-slate-200'
              }`}>
                {msg.text}
              </div>
            </div>
          ))
        )}
        
        {/* 로딩 인디케이터 */}
        {isLoading && (
          <div className="flex justify-start">
            <div className="p-4 rounded-xl bg-slate-800 border border-slate-700 rounded-bl-sm text-slate-400 animate-pulse">
              데이터 분석 중...
            </div>
          </div>
        )}
      </div>

      {/* 하단 입력창 */}
      <form onSubmit={handleSendMessage} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="명령어를 입력하거나 도움이 필요하면 질문하세요..."
          className="flex-1 bg-slate-900 border border-slate-700 rounded-lg p-3 pl-4 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all text-slate-100 placeholder:text-slate-500"
        />
        <button
          type="submit"
          disabled={isLoading}
          className="bg-teal-500 hover:bg-teal-400 text-slate-950 px-6 py-3 rounded-lg font-bold transition-colors disabled:opacity-50"
        >
          전송
        </button>
      </form>
    </div>
  );
}