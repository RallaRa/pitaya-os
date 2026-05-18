"use client";

import { useState, useRef, useEffect } from "react";
import Papa from "papaparse";
import { 
  Bot, 
  User, 
  Paperclip, 
  Send, 
  Loader2,
  DollarSign,
  Users,
  ThermometerSun,
  Newspaper,
  CheckCircle2,
  AlertTriangle,
  Sparkles
} from "lucide-react";

// --- 타입 정의 영역 --- //

interface Message {
  id: number;
  type: "ai" | "user";
  text: string;
  isReport?: boolean;
}

interface CsvReportData {
  totalSales: number;
  customerCount: number;
}

interface AiReportData {
  weather: {
    condition: string;
    tempHigh: number;
    tempLow: number;
    note: string;
  };
  news: string[];
  insights: string;
}

// --- 메인 컴포넌트 --- //

export default function SalesAiReportPage() {
  const [messages, setMessages] = useState<Message[]>([
    { id: 1, type: "ai", text: "안녕하세요 대표님! AI 마감 보고서를 준비했습니다. 오늘 포스기에서 다운로드하신 '단품별 상세 매출속보' CSV 파일을 업로드해주세요." }
  ]);
  const [csvReportData, setCsvReportData] = useState<CsvReportData | null>(null);
  const [aiReportData, setAiReportData] = useState<AiReportData | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  // --- 파일 업로드 및 API 호출 핸들러 --- //

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setMessages(prev => [...prev, { id: Date.now(), type: "user", text: `📎 ${file.name} 업로드 완료` }]);
    setIsTyping(true);
    setCsvReportData(null);
    setAiReportData(null);

    // 1. Papaparse로 CSV 파싱
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        // CSV 데이터 계산
        let totalSales = 0;
        const receiptNos = new Set<string>();
        
        if (results.data && Array.isArray(results.data)) {
          for (const row of results.data as any[]) {
            const salesValue = parseFloat(String(row['합계']).replace(/,/g, ''));
            if (!isNaN(salesValue)) totalSales += salesValue;
            if (row['영수증']) receiptNos.add(row['영수증']);
          }
        }
        const customerCount = receiptNos.size;
        setCsvReportData({ totalSales, customerCount });

        setMessages(prev => [...prev, { id: Date.now(), type: "ai", text: "파일 분석 완료! AI에게 데이터를 넘겨 경영 분석을 요청하고 있습니다..." }]);

        // 2. 백엔드 API 호출
        try {
          const response = await fetch("/api/sales_ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
              totalSales,
              customerCount,
              date: new Date().toLocaleDateString('ko-KR')
            }),
          });

          if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
          
          const result = await response.json();

          if(result.success) {
            setAiReportData(result.data);
            setIsTyping(false);
            setMessages(prev => [...prev, { id: Date.now(), type: "ai", text: "AI 마감 보고서 생성이 완료되었습니다.", isReport: true }]);
          } else {
            throw new Error(result.message || "알 수 없는 API 오류");
          }

        } catch (error: any) {
          console.error("API 호출 에러:", error);
          setIsTyping(false);
          setMessages(prev => [...prev, { id: Date.now(), type: "ai", text: `⚠️ 보고서 생성에 실패했습니다: ${error.message}` }]);
        }
      },
      error: (error: any) => {
        console.error("CSV 파싱 에러:", error);
        setIsTyping(false);
        setMessages(prev => [...prev, { id: Date.now(), type: "ai", text: `⚠️ 파일 분석 중 오류가 발생했습니다: ${error.message}` }]);
      }
    });
  };

  // --- AI 생성 보고서 UI 컴포넌트 --- //

  const GeneratedReport = () => (
    <div className="mt-4 bg-gray-800 border border-gray-700 rounded-xl p-5 shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex justify-between items-center border-b border-gray-700 pb-3 mb-4">
        <h3 className="text-lg font-bold text-white flex items-center">
          <CheckCircle2 className="w-5 h-5 mr-2 text-emerald-400" />
          AI 일일 마감 리포트 ({new Date().toLocaleDateString('ko-KR')})
        </h3>
      </div>

      {/* CSV 기반 데이터 */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-gray-900 rounded-lg p-4 flex items-center">
          <div className="p-3 bg-emerald-500/20 rounded-full mr-3"><DollarSign className="w-6 h-6 text-emerald-400" /></div>
          <div>
            <p className="text-xs text-gray-400">총 일매출</p>
            <p className="text-xl font-bold text-white">
              {csvReportData ? `${csvReportData.totalSales.toLocaleString()} 원` : "-"}
            </p>
          </div>
        </div>
        <div className="bg-gray-900 rounded-lg p-4 flex items-center">
          <div className="p-3 bg-blue-500/20 rounded-full mr-3"><Users className="w-6 h-6 text-blue-400" /></div>
          <div>
            <p className="text-xs text-gray-400">총 객수</p>
            <p className="text-xl font-bold text-white">
              {csvReportData ? `${csvReportData.customerCount} 명` : "-"}
            </p>
          </div>
        </div>
      </div>

      {/* AI 기반 데이터 */}
      {aiReportData ? (
        <div className="space-y-4 mb-6">
          <div className="bg-gray-900 rounded-lg p-4">
            <h4 className="text-sm font-medium text-gray-400 flex items-center mb-2"><ThermometerSun className="w-4 h-4 mr-2 text-orange-400" />오늘의 날씨</h4>
            <p className="text-sm text-gray-200">{aiReportData.weather.condition} (최고 {aiReportData.weather.tempHigh}°C / 최저 {aiReportData.weather.tempLow}°C)</p>
            <p className="text-xs text-gray-400 mt-1">{aiReportData.weather.note}</p>
          </div>
          <div className="bg-gray-900 rounded-lg p-4">
            <h4 className="text-sm font-medium text-gray-400 flex items-center mb-2"><Newspaper className="w-4 h-4 mr-2 text-purple-400" />주요 업계 동향</h4>
            <ul className="text-sm text-gray-200 space-y-1">
              {aiReportData.news.map((item, index) => <li key={index}>• {item}</li>)}
            </ul>
          </div>
          <div className="bg-gradient-to-br from-emerald-900/70 to-gray-900 rounded-lg p-4 border border-emerald-800">
            <h4 className="text-sm font-bold text-emerald-400 flex items-center mb-2"><Sparkles className="w-4 h-4 mr-2" />AI 경영 인사이트</h4>
            <p className="text-sm text-gray-100 font-medium whitespace-pre-wrap">{aiReportData.insights}</p>
          </div>
        </div>
      ) : <p className="text-center text-gray-400 text-sm py-4">AI 리포트 데이터를 불러오는 중...</p>}

      <button className="w-full mt-2 bg-emerald-600 hover:bg-emerald-500 text-white py-2.5 rounded-lg text-sm font-medium transition-colors">
        마감 승인 및 저장
      </button>
    </div>
  );

  // --- 메인 렌더링 --- //

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] max-w-4xl mx-auto bg-gray-900 rounded-xl overflow-hidden border border-gray-800 shadow-2xl">
      <div className="bg-gray-800 px-6 py-4 border-b border-gray-700">
        <h1 className="text-xl font-bold text-white">AI 마감 보고서 어시스턴트</h1>
        <p className="text-xs text-gray-400 mt-1">매출 데이터를 업로드하면 AI가 자동으로 시장 상황까지 분석하여 보고서를 작성합니다.</p>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-gray-900/50">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`flex max-w-[80%] ${msg.type === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
              <div className={`flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center ${
                msg.type === 'user' ? 'bg-blue-600 ml-3' : 'bg-emerald-600 mr-3'
              }`}>
                {msg.type === 'user' ? <User className="w-5 h-5 text-white" /> : <Bot className="w-5 h-5 text-white" />}
              </div>
              <div className="flex flex-col">
                <div className={`p-4 rounded-2xl shadow-md ${
                  msg.type === 'user' 
                    ? 'bg-blue-600 text-white rounded-tr-none' 
                    : 'bg-gray-800 text-gray-100 border border-gray-700 rounded-tl-none'
                }`}>
                  <p className="text-sm leading-relaxed">{msg.text}</p>
                </div>
                {msg.isReport && <GeneratedReport />}
              </div>
            </div>
          </div>
        ))}
        
        {isTyping && (
          <div className="flex justify-start">
            <div className="flex flex-row">
              <div className="flex-shrink-0 h-10 w-10 rounded-full bg-emerald-600 mr-3 flex items-center justify-center">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div className="bg-gray-800 border border-gray-700 p-4 rounded-2xl rounded-tl-none flex items-center space-x-2">
                <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />
                <span className="text-sm text-gray-400">AI가 보고서를 생성 중입니다...</span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="bg-gray-800 p-4 border-t border-gray-700">
        <div className="relative flex items-center">
          <label className={`cursor-pointer p-2 rounded-full transition-colors ${isTyping ? 'text-gray-600' : 'text-gray-400 hover:text-emerald-400'}`}>
            <Paperclip className="w-6 h-6" />
            <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} disabled={isTyping} />
          </label>
          <input
            type="text"
            readOnly
            placeholder={isTyping ? "AI가 분석 중입니다..." : "클립 아이콘을 눌러 매출 CSV 파일을 업로드하세요."}
            className="flex-1 bg-gray-900 border border-gray-700 rounded-full px-5 py-3 text-sm text-gray-300 focus:outline-none cursor-not-allowed"
          />
          <button disabled className="p-2 ml-2 text-gray-600 bg-gray-900 rounded-full">
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}