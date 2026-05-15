'use client';

import React, { useState, useRef, useEffect } from 'react';

type Persona = 'assistant' | 'analyst';

export default function AiChatPage() {
  const [messages, setMessages] = useState<{ role: 'user' | 'ai', text: string }[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [persona, setPersona] = useState<Persona>('assistant');

  // [추가] 오토 스크롤을 위한 참조 훅
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // [추가] 메시지 배열이나 로딩 상태가 변할 때마다 맨 아래로 자동 스크롤
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  /*const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault(); 

    if (!input.trim()) return;

    const currentMessage = input;
    setMessages((prev) => [...prev, { role: 'user', text: currentMessage }]);
    setInput('');
    setIsLoading(true); 

    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: currentMessage, persona }),
      });

      const data = await res.json();

      if (!res.ok) {
        const errorMessage = data.error || '알 수 없는 서버 오류가 발생했습니다.';
        setMessages((prev) => [...prev, { role: 'ai', text: `[통신 오류] ${errorMessage}` }]);
        return;
      }

      setMessages((prev) => [...prev, { role: 'ai', text: data.text }]);
    } catch (error: any) {
      console.error('Fetch Error:', error);
      setMessages((prev) => [...prev, { role: 'ai', text: `[네트워크 오류] 통신에 실패했습니다.` }]);
    } finally {
      setIsLoading(false); 
    }
  };*/

  // [수정된 안전한 통신 로직] - 기존 handleSendMessage 함수를 통째로 덮어쓰세요
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault(); 

    if (!input.trim()) return;

    const currentMessage = input;
    setMessages((prev) => [...prev, { role: 'user', text: currentMessage }]);
    setInput('');
    setIsLoading(true); 

    try {
      // ⚠️ 주의: 백엔드 폴더가 api/ai 라면 '/api/ai'로, api/chat 이라면 '/api/chat'으로 맞춰야 합니다.
      const res = await fetch('/api/ai', {
      //const res = await fetch('/api/chat', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: currentMessage, persona }),
      });

      // 1. JSON이 아닐 경우를 대비해 일단 날것의 텍스트로 받습니다.
      const rawText = await res.text(); 
      
      let data;
      try {
        // 2. 받은 텍스트를 JSON으로 변환 시도합니다.
        data = JSON.parse(rawText); 
      } catch (parseError) {
        // 3. HTML(<!DOCTYPE...)이 날아와도 앱이 죽지 않고 원인을 화면에 출력합니다.
        console.error("서버 원본 응답:", rawText);
        setMessages((prev) => [...prev, { 
          role: 'ai', 
          text: `[경로 오류] 백엔드 주소가 엇갈렸습니다. (현재 찌른 주소: /api/chat)\n좌측 파일 트리에서 백엔드 폴더명이 'ai'인지 'chat'인지 확인해주세요.` 
        }]);
        return;
      }

      if (!res.ok) {
        const errorMessage = data.error || '알 수 없는 서버 오류가 발생했습니다.';
        setMessages((prev) => [...prev, { role: 'ai', text: `[통신 오류] ${errorMessage}` }]);
        return;
      }

      setMessages((prev) => [...prev, { role: 'ai', text: data.text }]);
    } catch (error: any) {
      console.error('Fetch Error:', error);
      setMessages((prev) => [...prev, { role: 'ai', text: `[네트워크 오류] 통신에 실패했습니다.` }]);
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
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-slate-950 text-slate-100 p-4">
      {/* 페르소나 선택 UI */}
      <div className="flex justify-center mb-4 shrink-0">
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
              <div className={`p-4 rounded-xl max-w-[80%] border shadow-sm break-words whitespace-pre-wrap ${
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
        {/* [추가] 오토 스크롤이 도달할 타겟 지점 */}
        <div ref={messagesEndRef} />
      </div>

      {/* 하단 입력창 */}
      <form onSubmit={handleSendMessage} className="flex gap-2 shrink-0">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="명령어를 입력하거나 도움이 필요하면 질문하세요..."
          className="flex-1 bg-slate-900 border border-slate-700 rounded-lg p-3 pl-4 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all text-slate-100 placeholder:text-slate-500"
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()} // [수정] 로딩중이거나 빈칸이면 강제 비활성화
          className="bg-teal-500 hover:bg-teal-400 text-slate-950 px-6 py-3 rounded-lg font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          전송
        </button>
      </form>
    </div>
  );
}