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
  AlertTriangle
} from "lucide-react";

// 메시지 타입 정의
interface Message {
  id: number;
  type: "ai" | "user";
  text: string;
  isReport?: boolean;
}

// 보고서 데이터 타입 정의
interface ReportData {
  totalSales: number;
  customerCount: number;
}

export default function ConversationalReportPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      type: "ai",
      text: "안녕하세요 대표님! 일일 마감 보고서를 작성할 준비가 되었습니다. 오늘 포스기에서 다운로드하신 '단품별 상세 매출속보' 엑셀(CSV) 파일을 이곳에 업로드해 주세요."
    }
  ]);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 메시지 변경 시 자동 스크롤
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  // 파일 업로드 핸들러
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setMessages(prev => [
      ...prev,
      { id: Date.now(), type: "user", text: `📎 ${file.name} 업로드 완료` }
    ]);
    
    setIsTyping(true);
    setReportData(null); // 이전 데이터 리셋

    // Papaparse를 이용한 CSV 파싱
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        // --- 데이터 계산 로직 ---
        let totalSales = 0;
        const receiptNos = new Set<string>();

        if (results.data && Array.isArray(results.data)) {
          for (const row of results.data as any[]) {
            // 총매출 계산 (row['합계'] 컬럼 사용)
            const salesValue = parseFloat(String(row['합계']).replace(/,/g, ''));
            if (!isNaN(salesValue)) {
              totalSales += salesValue;
            }

            // 객수 계산 (row['영수증'] 컬럼 사용)
            if (row['영수증']) {
              receiptNos.add(row['영수증']);
            }
          }
        }
        
        const customerCount = receiptNos.size;
        setReportData({ totalSales, customerCount });
        // --- 계산 로직 끝 ---

        // AI 응답 메시지 (성공)
        setTimeout(() => {
          setMessages(prev => [
            ...prev,
            { id: Date.now(), type: "ai", text: "파일을 확인했습니다. 매출 데이터를 분석하고, 당일 날씨 및 정육 업계 이슈를 수집하여 마감 보고서를 생성하고 있습니다..." }
          ]);
          
          setTimeout(() => {
            setIsTyping(false);
            setMessages(prev => [
              ...prev,
              { 
                id: Date.now(), 
                type: "ai", 
                text: "보고서 생성이 완료되었습니다. 아래 내역을 확인해 주세요!",
                isReport: true 
              }
            ]);
          }, 1500);

        }, 1000);
      },
      error: (error: any) => {
        console.error("CSV 파싱 에러:", error);
        setIsTyping(false);
        setMessages(prev => [
          ...prev,
          { 
            id: Date.now(), 
            type: "ai", 
            text: `⚠️ 파일 분석 중 오류가 발생했습니다. CSV 파일 형식이 올바른지 확인해주세요. (에러: ${error.message})`
          }
        ]);
      }
    });
  };

  // AI 생성 보고서 UI
  const GeneratedReport = () => (
    <div className="mt-4 bg-gray-800 border border-gray-700 rounded-xl p-5 shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex justify-between items-center border-b border-gray-700 pb-3 mb-4">
        <h3 className="text-lg font-bold text-white flex items-center">
          <CheckCircle2 className="w-5 h-5 mr-2 text-emerald-400" />
          일일 마감 리포트 ({new Date().toLocaleDateString('ko-KR')})
        </h3>
      </div>

      {/* 계산된 데이터 표시 영역 */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-gray-900 rounded-lg p-4 flex items-center">
          <div className="p-3 bg-emerald-500/20 rounded-full mr-3">
            <DollarSign className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <p className="text-xs text-gray-400">총 일매출</p>
            <p className="text-xl font-bold text-white">
              {reportData ? `${reportData.totalSales.toLocaleString()} 원` : "계산 중..."}
            </p>
          </div>
        </div>
        <div className="bg-gray-900 rounded-lg p-4 flex items-center">
          <div className="p-3 bg-blue-500/20 rounded-full mr-3">
            <Users className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <p className="text-xs text-gray-400">총 객수</p>
            <p className="text-xl font-bold text-white">
              {reportData ? `${reportData.customerCount} 명` : "계산 중..."}
            </p>
          </div>
        </div>
      </div>

      {/* 외부 데이터 표시 영역 (목업) */}
      <div className="space-y-4">
        <div className="bg-gray-900 rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-400 flex items-center mb-2">
            <ThermometerSun className="w-4 h-4 mr-2 text-orange-400" />
            날씨 및 환경
          </h4>
          <p className="text-sm text-gray-200">맑음 (최고 30°C / 최저 20°C)</p>
          <p className="text-xs text-gray-400 mt-1">초여름 날씨로 구이용 고기 수요 증가 포착</p>
        </div>
        <div className="bg-gray-900 rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-400 flex items-center mb-2">
            <Newspaper className="w-4 h-4 mr-2 text-purple-400" />
            금일 정육 주요 동향
          </h4>
          <ul className="text-sm text-gray-200 space-y-1">
            <li>• 한우 안심 가격 상승세 (수입단가 상승 여파)</li>
            <li>• 수입산 돼지고기 유입량 26% 증가 (ASF 영향)</li>
          </ul>
        </div>
      </div>

      <button className="w-full mt-5 bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded-lg text-sm font-medium transition-colors">
        이대로 마감 승인 및 저장
      </button>
    </div>
  );

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] max-w-4xl mx-auto bg-gray-900 rounded-xl overflow-hidden border border-gray-800">
      <div className="bg-gray-800 px-6 py-4 border-b border-gray-700">
        <h1 className="text-xl font-bold text-white">AI 마감 보고서 어시스턴트</h1>
        <p className="text-xs text-gray-400 mt-1">데이터를 업로드하면 AI가 자동으로 보고서를 작성합니다.</p>
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
                <div className={`p-4 rounded-2xl ${
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
                <span className="text-sm text-gray-400">AI가 데이터를 분석 중입니다...</span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="bg-gray-800 p-4 border-t border-gray-700">
        <div className="relative flex items-center">
          <label className="cursor-pointer p-2 text-gray-400 hover:text-emerald-400 transition-colors">
            <Paperclip className="w-6 h-6" />
            <input 
              type="file" 
              accept=".csv, application/vnd.ms-excel, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" 
              className="hidden" 
              onChange={handleFileUpload} 
              disabled={isTyping}
            />
          </label>
          <input
            type="text"
            readOnly
            placeholder="좌측 클립 아이콘을 눌러 매출 엑셀 파일을 업로드하세요."
            className="flex-1 bg-gray-900 border border-gray-700 rounded-full px-5 py-3 text-sm text-gray-200 focus:outline-none cursor-not-allowed"
          />
          <button disabled className="p-2 ml-2 text-gray-600 bg-gray-900 rounded-full">
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}