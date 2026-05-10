"use client";

import React, { useState } from 'react';

// [History: AI 대화 프론트엔드 상태 관리 및 백엔드 API 연동 UI 구축]
// [Update: AI 페르소나 변경 및 API 연동 기능 추가]
// [Update: API 에러 핸들링 로직 개선]
type Persona = 'assistant' | 'analyst';

export default function AiChatPage() {
  const [messages, setMessages] = useState<{ role: 'user' | 'ai', text: string }[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [persona, setPersona] = useState<Persona>('assistant');

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input;
    setMessages((prev) => [...prev, { role: 'user', text: userMessage }]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage, persona: persona }),
      });

      const data = await response.json();

      if (!response.ok) {
        // 서버에서 전달된 구체적인 에러 메시지를 사용
        const errorMessage = data.error || '알 수 없는 서버 오류가 발생했습니다.';
        throw new Error(errorMessage);
      }

      setMessages((prev) => [...prev, { role: 'ai', text: data.text }]);
    } catch (error) {
      console.error('API Error:', error);
      // 에러 객체에 담긴 메시지를 화면에 표시
      const displayError = error instanceof Error ? error.message : '통신 중 오류가 발생했습니다. 다시 시도해 주세요.';
      setMessages((prev) => [...prev, { role: 'ai', text: `오류: ${displayError}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  const personaDetails = {
    assistant: {
      title: '무엇을 도와드릴까요?',
      description: '개발 관련 질문이나 코드 생성을 요청해 보세요.',
      loadingText: '코드 생성 중...',
    },
    analyst: {
      title: '데이터 분석 모드',
      description: '매출 요약, 재고 조회 등 팩트 기반으로 질문해 보세요.',
      loadingText: '데이터 분석 중...',
    },
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 p-4">
      {/* 페르소나 선택 UI */}
      <div className="flex justify-center mb-4">
        <div className="p-1 bg-slate-800 rounded-lg flex gap-1 border border-slate-700">
          <button
            onClick={() => setPersona('assistant')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              persona === 'assistant' ? 'bg-teal-500 text-slate-950 shadow-sm' : 'text-slate-300 hover:bg-slate-700/50'
            }`}
          >
            🧑‍💻 개발 어시스턴트
          </button>
          <button
            onClick={() => setPersona('analyst')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              persona === 'analyst' ? 'bg-teal-500 text-slate-950 shadow-sm' : 'text-slate-300 hover:bg-slate-700/50'
            }`}
          >
            📈 데이터 분석가
          </button>
        </div>
      </div>

      {/* 대화 이력 출력 영역 */}
      <div className="flex-1 overflow-y-auto mb-4 space-y-4 pr-2">
        {messages.length === 0 ? (
          <div className="text-center text-slate-500 mt-20 flex flex-col items-center justify-center">
            <span className="text-4xl mb-4">✨</span>
            <p className="text-lg font-medium text-slate-300">{personaDetails[persona].title}</p>
            <p className="text-sm mt-2">{personaDetails[persona].description}</p>
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
        
        {isLoading && (
          <div className="flex justify-start">
            <div className="p-4 rounded-xl bg-slate-800 border border-slate-700 rounded-bl-sm text-slate-400 animate-pulse">
              {personaDetails[persona].loadingText}
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
