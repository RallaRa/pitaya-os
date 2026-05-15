'use client';

import React, { useState, useRef } from 'react';

// 메시지 타입을 확장하여 이미지 데이터(base64)를 포함할 수 있도록 합니다.
type Message = {
  role: 'user' | 'ai';
  text: string;
  image?: string; 
};

export default function ReportInputPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 이미지 파일이 선택되면 미리보기를 생성합니다.
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // 메시지 전송 핸들러: 텍스트와 이미지를 함께 전송합니다.
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && !imagePreview) || isLoading) return;

    const userMessage: Message = { role: 'user', text: input };
    if (imagePreview) {
      userMessage.image = imagePreview;
    }

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setImagePreview(null);
    setIsLoading(true);

    try {
      const requestBody = {
        ...userMessage,
        persona: 'reporter' // 보고서용 페르소나 지정
      };

      const response = await fetch('/api/ai', {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `API error: ${response.statusText}`);
      }

      const data = await response.json();
      const aiResponse: Message = {
          role: 'ai',
          text: data.text, 
      };

      setMessages((prev) => [...prev, aiResponse]);
    } catch (error) {
        console.error("AI 응답 오류:", error);
        const errorMessage: Message = {
            role: 'ai',
            text: error instanceof Error ? error.message : '죄송합니다. AI 응답을 처리하는 중 오류가 발생했습니다.',
        };
        setMessages((prev) => [...prev, errorMessage]);
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 p-4">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-teal-400">일일 마감보고서 입력</h1>
        <p className="text-slate-400">AI와 대화하며 오늘의 마감 내용을 입력하고 이미지를 캡처/첨부하세요.</p>
      </div>

      {/* 대화 이력 출력 영역 */}
      <div className="flex-1 overflow-y-auto mb-4 space-y-4 pr-2">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`p-4 rounded-xl max-w-[80%] border shadow-sm ${
              msg.role === 'user' 
                ? 'bg-teal-900/50 border-teal-700/50 rounded-br-sm text-teal-50' 
                : 'bg-slate-800 border-slate-700 rounded-bl-sm text-slate-200'
            }`}>
              {/* 메시지에 이미지가 있으면 출력합니다. */}
              {msg.image && <img src={msg.image} alt="첨부 이미지" className="rounded-lg mb-2 max-w-full h-auto" />}
              <p className="whitespace-pre-wrap">{msg.text}</p>
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="flex justify-start">
            <div className="p-4 rounded-xl bg-slate-800 border border-slate-700 rounded-bl-sm text-slate-400 animate-pulse">
              AI가 분석 중...
            </div>
          </div>
        )}
      </div>

      {/* 하단 입력창 */}
      <form onSubmit={handleSendMessage} className="flex flex-col gap-2">
        {/* 이미지 미리보기 영역 */}
        {imagePreview && (
          <div className="p-2 bg-slate-800 rounded-lg relative w-40">
            <img src={imagePreview} alt="미리보기" className="rounded-md" />
            <button
              type="button"
              onClick={() => setImagePreview(null)}
              className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 w-6 h-6 flex items-center justify-center text-xs font-bold"
            >
              X
            </button>
          </div>
        )}
        <div className="flex items-center gap-2">
          {/* 이미지 첨부 버튼 */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-3 rounded-lg font-bold transition-colors"
            aria-label="이미지 첨부"
          >
            📎
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImageChange}
            className="hidden"
            accept="image/*"
          />
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="오늘의 마감 내용을 입력하세요..."
            className="flex-1 bg-slate-900 border border-slate-700 rounded-lg p-3 pl-4 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all text-slate-100 placeholder:text-slate-500 resize-none"
            rows={1}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage(e as any);
              }
            }}
          />
          <button
            type="submit"
            disabled={isLoading}
            className="bg-teal-500 hover:bg-teal-400 text-slate-950 px-6 py-3 rounded-lg font-bold transition-colors disabled:opacity-50"
          >
            전송
          </button>
        </div>
      </form>
    </div>
  );
}
