'use client';

import React, { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { db } from '@/lib/firebase/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { Bot, User, Loader2, DollarSign, Users, Hash, Save, CheckCircle2 } from "lucide-react";
import { useAuth } from '@/context/AuthContext';
import { useStore } from '@/context/StoreContext';

const WEATHER_ICONS: Record<string, string> = {
  '맑음': '☀️', '구름': '⛅', '안개': '🌫️', '비': '🌧️', '눈': '❄️', '소나기': '🌦️', '뇌우': '⛈️'
};

function getWeatherConditionClient(code: number): string {
  if (code === 0) return '맑음';
  if (code <= 3) return '구름';
  if (code <= 48) return '안개';
  if (code <= 67) return '비';
  if (code <= 77) return '눈';
  if (code <= 82) return '소나기';
  return '뇌우';
}

// --- 타입 정의 영역 ---
type Message = {
  id: number;
  role: 'user' | 'ai';
  text: string;
  image?: string;
  attachedFileName?: string;
  attachedFileUrl?: string;
};

interface ExtractedData {
  totalSales: number;
  customerCount: number;
  receiptNumber: string;
  serialNumber?: string;
  reportDate?: string;
  issues?: { title: string; url?: string; source?: string }[];
  promotions?: string[];
  returnAmount?: number;
  discountAmount?: number;
  netSales?: number;
  items?: any[];
}

type AttachedFileType = 'image' | 'excel';

// --- 메인 컴포넌트 ---
export default function ReportInputPage() {
  const { user } = useAuth();
  const { currentStore } = useStore();
  const [messages, setMessages] = useState<Message[]>([
    { id: 1, role: 'ai', text: "안녕하세요 대표님! 마감 내용을 입력하시거나, 분석할 매출 데이터(엑셀) 및 거래명세서(사진)를 업로드해주세요." }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // 파일 및 데이터 상태
  const [imagePreview, setImagePreview] = useState<string | null>(null); 
  const [attachedFileContent, setAttachedFileContent] = useState<string | null>(null); 
  const [attachedFileName, setAttachedFileName] = useState<string | null>(null);
  const [attachedFileType, setAttachedFileType] = useState<AttachedFileType | null>(null);
  const [attachedFileUrl, setAttachedFileUrl] = useState<string | null>(null); 
  
  // [핵심] 투트랙으로 분리된 정형 데이터를 담을 State
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [awaitingDateConfirm, setAwaitingDateConfirm] = useState(false);
  const [pendingData, setPendingData] = useState<any>(null);
  const [promotions, setPromotions] = useState<string[]>([]);
  const [promotionInput, setPromotionInput] = useState('');
  const [weatherPreview, setWeatherPreview] = useState<{ condition: string; tempMax: number; tempMin: number } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 자동 스크롤
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading, extractedData]);

  // 날씨 프리뷰: extractedData의 reportDate가 생기면 Open-Meteo에서 날씨 조회
  useEffect(() => {
    const dateStr = extractedData?.reportDate;
    if (!dateStr) { setWeatherPreview(null); return; }
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=37.5665&longitude=126.9780&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=Asia%2FSeoul&start_date=${dateStr}&end_date=${dateStr}`)
      .then(r => r.json())
      .then(data => {
        const code = data.daily?.weathercode?.[0];
        if (code === undefined) return;
        setWeatherPreview({
          condition: getWeatherConditionClient(code),
          tempMax: Math.round(data.daily?.temperature_2m_max?.[0] ?? 0),
          tempMin: Math.round(data.daily?.temperature_2m_min?.[0] ?? 0),
        });
      })
      .catch(() => {});
  }, [extractedData?.reportDate]);

  // 첨부 파일 초기화
  const cancelAttachment = () => {
    setImagePreview(null);
    setAttachedFileName(null);
    setAttachedFileType(null);
    setAttachedFileContent(null);
    if (attachedFileUrl) URL.revokeObjectURL(attachedFileUrl);
    setAttachedFileUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // 클립보드 이미지 붙여넣기 감지 핸들러
  // 클립보드 이미지 및 엑셀 셀 붙여넣기 감지 핸들러 (강화판)
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const clipboardData = e.clipboardData;
    if (!clipboardData) return;

    let imageFile: File | null = null;

    // 1. files 배열 우선 탐색 (엑셀 표 복사 시 이미지는 보통 files 배열에 깊숙이 숨겨져 들어옴)
    if (clipboardData.files && clipboardData.files.length > 0) {
      for (let i = 0; i < clipboardData.files.length; i++) {
        if (clipboardData.files[i].type.startsWith('image/')) {
          imageFile = clipboardData.files[i];
          break;
        }
      }
    }

    // 2. files에 없다면 items 배열에서 탐색 (일반 화면 캡처 이미지 등)
    if (!imageFile && clipboardData.items) {
      for (let i = 0; i < clipboardData.items.length; i++) {
        if (clipboardData.items[i].type.startsWith('image/')) {
          const file = clipboardData.items[i].getAsFile();
          if (file) {
            imageFile = file;
            break;
          }
        }
      }
    }

    // 3. 엑셀 이미지나 캡처 이미지를 찾아냈다면, 텍스트 입력을 강제 차단하고 이미지 첨부로 낚아챔
    if (imageFile) {
      e.preventDefault(); // 중요: 엑셀 텍스트가 입력창에 지저분하게 찍히는 것을 원천 차단

      const MAX_SIZE = 10 * 1024 * 1024;
      if (imageFile.size > MAX_SIZE) {
        alert('10MB 이하의 이미지만 붙여넣을 수 있습니다.');
        return;
      }

      cancelAttachment(); // 기존 첨부 초기화 및 메모리 해제

      const fileUrl = URL.createObjectURL(imageFile);
      setAttachedFileUrl(fileUrl);
      setAttachedFileName(`excel_paste_${Date.now()}.png`);
      setAttachedFileType('image');

      const compressImage = (dataUrl: string): Promise<string> => {
        return new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const ratio = Math.min(1, 2560 / img.width);
            canvas.width = img.width * ratio;
            canvas.height = img.height * ratio;
            canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/jpeg', 0.95));
          };
          img.src = dataUrl;
        });
      };

      const reader = new FileReader();
      reader.onloadend = async () => {
        const compressed = await compressImage(reader.result as string);
        setAttachedFileContent(compressed);
        setImagePreview(compressed);
      };
      reader.readAsDataURL(imageFile);
    }
  };

  // --- [강력한 데이터 추출] 엑셀 바이너리를 환각 없이 CSV 텍스트로 파싱 ---
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    cancelAttachment();

    const fileName = file.name.toLowerCase();
    const fileUrl = URL.createObjectURL(file);
    setAttachedFileUrl(fileUrl);
    setAttachedFileName(file.name);

    const reader = new FileReader();
    
    if (file.type.startsWith('image/')) {
      setAttachedFileType('image');
      reader.onloadend = () => {
        const base64 = reader.result as string;
        setImagePreview(base64); 
        setAttachedFileContent(base64); 
      };
      reader.readAsDataURL(file);

    } else if (fileName.endsWith('.csv')) {
      setAttachedFileType('excel');
      reader.onloadend = () => {
        setAttachedFileContent(reader.result as string);
      };
      reader.readAsText(file, 'UTF-8');

    } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      setAttachedFileType('excel');
      reader.onloadend = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const csvText = XLSX.utils.sheet_to_csv(workbook.Sheets[firstSheetName]);
          setAttachedFileContent(csvText); // AI에게 먹일 진짜 숫자 데이터 강제 주입
        } catch (error) {
          console.error("Excel 파싱 에러:", error);
          alert("엑셀 파일 데이터를 읽는 데 실패했습니다.");
        }
      };
      reader.readAsArrayBuffer(file); 
    } else {
      alert("지원하지 않는 파일 형식입니다.");
      cancelAttachment();
    }
  };

  // --- [투트랙 API 통신] 메시지 전송 및 응답 분리 ---
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && !attachedFileContent) || isLoading) return;

    let finalText = input.trim();
    if (!finalText && attachedFileName) {
      if (attachedFileType === 'image') {
        finalText = `[시스템] 첨부된 '${attachedFileName}' 거래명세서 이미지를 분석해주세요.`;
      } else if (attachedFileType === 'excel') {
        finalText = `[시스템] 첨부된 '${attachedFileName}' 매출 데이터를 분석하여 마감 보고서를 작성해주세요.`;
      }
    }

    const userMessageForUI: Message = { 
      id: Date.now(),
      role: 'user', 
      text: finalText,
      attachedFileName: attachedFileName || undefined,
      attachedFileUrl: attachedFileUrl || undefined,
      image: imagePreview || undefined // 문법 오류 완벽 수정
    };

    setMessages((prev) => [...prev, userMessageForUI]);
    setExtractedData(null);
    setWeatherPreview(null);

    const requestBody = {
      text: finalText,
      fileContent: attachedFileContent,
      fileName: attachedFileName,
      fileType: attachedFileType,
      promotions: promotions,
    };
    
    setInput('');
    setIsLoading(true);
    cancelAttachment();

    try {
      const response = await fetch('/api/sales_ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `API 오류`);
      }

      const data = await response.json();
      
      // 1. 대화 렌더링
      setMessages((prev) => [...prev, {
          id: Date.now() + 1,
          role: 'ai',
          text: data.text || "분석이 완료되었습니다.",
      }]);

      // 2. 정형 데이터가 있으면 UI 패널 오픈
      if (data.parsedData) {
        const replyText = data.text || '';
        const hasDateQuestion =
          replyText.includes('맞습니까') ||
          replyText.includes('맞나요');

        if (hasDateQuestion) {
          setAwaitingDateConfirm(true);
          setPendingData(data.parsedData);
        } else {
          setExtractedData(data.parsedData);
        }
      }

    } catch (error: any) {
        setMessages((prev) => [...prev, {
            id: Date.now() + 1,
            role: 'ai',
            text: error.message || '오류가 발생했습니다.',
        }]);
    } finally {
        setIsLoading(false);
    }
  };

  // --- [DB 연동] 추출된 데이터를 Firestore에 저장 ---
  /*const handleSaveToDB = async () => {
    if (!extractedData) return;
    setIsSaving(true);
    try {
      await addDoc(collection(db, "daily_reports"), {
        ...extractedData,
        reportDate: new Date().toISOString(),
        createdAt: serverTimestamp() 
      });
      setMessages(prev => [...prev, { 
        id: Date.now(), 
        role: "ai", 
        text: "✅ 성공적으로 DB에 저장했습니다. '전체 보고서 조회' 메뉴에서 확인하실 수 있습니다." 
      }]);
      setExtractedData(null); // 저장 완료 후 패널 닫기
    } catch (error: any) {
      console.error("DB 저장 오류: ", error);
      setMessages(prev => [...prev, { id: Date.now(), role: "ai", text: `❌ DB 저장 실패: ${error.message}` }]);
    } finally {
      setIsSaving(false);
    }
  };*/
  // --- [수정] 직접 DB 저장을 빼고, 백엔드 서버에 대행 요청을 날리는 구조로 교체 ---
  /* const handleSaveToDB = async () => {
    if (!extractedData) return;
    setIsSaving(true);
    try {
      const response = await fetch('/api/sales_ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save',
          extractedData: extractedData
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '서버 저장 실패');
      }

      setMessages(prev => [...prev, { 
        id: Date.now(), 
        role: "ai", 
        text: "✅ 성공적으로 DB에 저장했습니다. '전체 보고서 조회' 메뉴에서 확인하실 수 있습니다." 
      }]);
      setExtractedData(null); // 저장 완료 후 패널 닫기
    } catch (error: any) {
      console.error("DB 저장 오류: ", error);
      setMessages(prev => [...prev, { id: Date.now(), role: "ai", text: `❌ DB 저장 실패: ${error.message}` }]);
    } finally {
      setIsSaving(false);
    }
  };*/

// --- [백엔드 대행 요청 + HTML 파싱 에러 방어벽 추가] ---
const handleSaveToDB = async () => {
  if (!extractedData) return;
  setIsSaving(true);
  try {
    const response = await fetch('/api/sales_ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'save',
        extractedData: extractedData,
        uid: user?.uid || '',
        storeId: currentStore?.storeId || '',
      })
    });

    // [핵심] JSON 파싱 전 텍스트로 먼저 받아서 HTML 에러 붕괴 방어
    const responseText = await response.text();
    
    if (!response.ok) {
      let errorMessage = `서버 통신 실패 (상태: ${response.status})`;
      try {
        // JSON 형태의 에러 메시지라면 정상 파싱
        const errorData = JSON.parse(responseText);
        errorMessage = errorData.error || errorMessage;
      } catch (e) {
        // HTML 덩어리(500 에러 페이지)가 날아오면 뻗지 않고 에러 처리
        console.error("서버 에러 HTML 원문:", responseText);
        errorMessage = "데이터베이스 연결 또는 서버 내부 에러가 발생했습니다. (터미널 확인)";
      }
      throw new Error(errorMessage);
    }

    // 정상 응답일 때만 JSON 변환
    const data = JSON.parse(responseText);

    setMessages(prev => [...prev, { 
      id: Date.now(), 
      role: "ai", 
      text: "✅ 성공적으로 DB에 저장했습니다. '전체 보고서 조회' 메뉴에서 확인하실 수 있습니다." 
    }]);
    setExtractedData(null); 
  } catch (error: any) {
    console.error("DB 저장 오류: ", error);
    setMessages(prev => [...prev, { id: Date.now(), role: "ai", text: `❌ DB 저장 실패: ${error.message}` }]);
  } finally {
    setIsSaving(false);
  }
};

  const DateConfirmButtons = () => {
    if (!awaitingDateConfirm || !pendingData) return null;

    const handleConfirm = () => {
      setMessages(prev => [...prev, {
        id: Date.now(),
        role: 'ai',
        text: '반영하겠습니다.',
      }]);
      setExtractedData(pendingData);
      setAwaitingDateConfirm(false);
      setPendingData(null);
    };

    const handleDeny = () => {
      const today = new Date().toISOString().split('T')[0];
      setMessages(prev => [...prev, {
        id: Date.now(),
        role: 'ai',
        text: '오늘 날짜의 데이터를 반영해주세요.',
      }]);
      setExtractedData({
        ...pendingData,
        reportDate: today
      });
      setAwaitingDateConfirm(false);
      setPendingData(null);
    };

    return (
      <div className="flex gap-3 my-2 ml-14">
        <button
          onClick={handleConfirm}
          className="bg-teal-600 hover:bg-teal-500 text-white px-6 py-2.5 rounded-xl font-bold transition-colors shadow-md"
        >
          ✅ 네
        </button>
        <button
          onClick={handleDeny}
          className="bg-slate-700 hover:bg-slate-600 text-white px-6 py-2.5 rounded-xl font-bold transition-colors shadow-md"
        >
          ❌ 아니오
        </button>
      </div>
    );
  };

  // --- 정형 데이터 시각화 패널 컴포넌트 ---
  const ExtractedDataDisplay = () => {
    if (!extractedData) return null;
    return (
      <div className="bg-slate-800 border border-teal-500/50 rounded-xl p-5 shadow-lg my-4 max-w-[85%]">
        <h3 className="text-lg font-bold text-teal-400 flex items-center mb-4">
          <CheckCircle2 className="w-5 h-5 mr-2" />
          AI 마감 데이터 추출 완료 (DB 저장 대기중)
        </h3>

        {/* 기준일 */}
        {extractedData.reportDate && (
          <div className="mb-4 bg-slate-900/60 rounded-lg p-3 border border-slate-700 flex items-center gap-2">
            <span className="text-lg">📅</span>
            <div>
              <p className="text-slate-400 text-xs">기준일</p>
              <p className="text-white font-bold">
                {new Date(extractedData.reportDate + 'T00:00:00').toLocaleDateString('ko-KR', {
                  year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'
                })}
              </p>
            </div>
          </div>
        )}

        {/* 날씨 */}
        {weatherPreview && (
          <div className="mb-4 bg-slate-900/60 rounded-lg p-3 border border-slate-700 flex items-center gap-3">
            <span className="text-2xl">{WEATHER_ICONS[weatherPreview.condition] || '🌡️'}</span>
            <div>
              <p className="text-slate-400 text-xs">날씨</p>
              <p className="text-white font-medium">
                {weatherPreview.condition}
                <span className="text-slate-400 text-sm ml-2">{weatherPreview.tempMin}°~{weatherPreview.tempMax}°</span>
              </p>
            </div>
          </div>
        )}

        {/* 매출 요약 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div className="bg-slate-900 rounded-lg p-3 border border-slate-700">
            <p className="text-slate-400 flex items-center text-sm mb-1"><DollarSign className="w-4 h-4 mr-1"/>총매출</p>
            <p className="text-white font-bold text-lg">{Number(extractedData.totalSales || 0).toLocaleString()} 원</p>
          </div>
          <div className="bg-slate-900 rounded-lg p-3 border border-slate-700">
            <p className="text-slate-400 flex items-center text-sm mb-1"><Users className="w-4 h-4 mr-1"/>총 객수</p>
            <p className="text-white font-bold text-lg">{extractedData.customerCount || 0} 명</p>
          </div>
          <div className="bg-slate-900 rounded-lg p-3 border border-slate-700">
            <p className="text-slate-400 flex items-center text-sm mb-1"><Hash className="w-4 h-4 mr-1"/>이력번호</p>
            <p className="text-white font-mono text-lg truncate" title={extractedData.receiptNumber}>{extractedData.receiptNumber || 'N/A'}</p>
          </div>
        </div>

        {/* 이슈 */}
        {extractedData.issues && extractedData.issues.length > 0 && (
          <div className="mb-4">
            <p className="text-slate-400 text-xs mb-2">🔔 오늘의 이슈</p>
            <div className="space-y-2">
              {extractedData.issues.map((issue, i) => (
                <div key={i} className="bg-slate-900/60 border border-yellow-500/20 rounded-lg p-2.5 flex items-start gap-2">
                  <span className="text-yellow-400 flex-shrink-0">📰</span>
                  <div>
                    {issue.url ? (
                      <a href={issue.url} target="_blank" rel="noopener noreferrer"
                        className="text-yellow-300 text-sm hover:underline">{issue.title}</a>
                    ) : (
                      <p className="text-yellow-300 text-sm">{issue.title}</p>
                    )}
                    {issue.source && <p className="text-slate-500 text-xs">{issue.source}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 프로모션 */}
        {extractedData.promotions && extractedData.promotions.length > 0 && (
          <div className="mb-4">
            <p className="text-slate-400 text-xs mb-2">🎯 프로모션</p>
            <div className="flex flex-wrap gap-2">
              {extractedData.promotions.map((p, i) => (
                <span key={i} className="bg-emerald-900/30 border border-emerald-500/30 text-emerald-300 text-xs px-2.5 py-1 rounded-full">
                  {p}
                </span>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={handleSaveToDB}
          disabled={isSaving}
          className="w-full bg-teal-600 hover:bg-teal-500 text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center transition-colors disabled:bg-slate-600"
        >
          {isSaving ? <Loader2 className="w-5 h-5 animate-spin mr-2"/> : <Save className="w-5 h-5 mr-2"/>}
          {isSaving ? '안전하게 DB에 기록 중...' : '이 내용으로 마감 장부(DB)에 확정 저장하기'}
        </button>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-[calc(100vh-2rem)] bg-slate-950 text-slate-100 p-4">
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold text-teal-400">일일 마감보고서 입력</h1>
        <p className="text-slate-400 text-sm">AI 비서와 대화하며 마감을 진행하고 장부에 기록하세요.</p>
      </div>

      {/* 대화 이력 영역 */}
      <div className="flex-1 overflow-y-auto mb-4 space-y-6 pr-2">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`flex max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
              <div className={`flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center ${
                msg.role === 'user' ? 'bg-blue-600 ml-3' : 'bg-teal-600 mr-3'
              }`}>
                {msg.role === 'user' ? <User className="w-6 h-6 text-white" /> : <Bot className="w-6 h-6 text-white" />}
              </div>
              
              <div className={`p-4 rounded-2xl shadow-sm border ${
                msg.role === 'user' 
                  ? 'bg-blue-600 text-white border-blue-500 rounded-tr-none' 
                  : 'bg-slate-800 text-slate-200 border-slate-700 rounded-tl-none'
              }`}>
                {msg.image && <img src={msg.image} alt="첨부" className="rounded-lg mb-3 max-w-full h-auto" />} 
                <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                
                {/* 다운로드 가능한 엑셀 파일명 UI */}
                {msg.attachedFileName && msg.attachedFileUrl ? (
                  <a href={msg.attachedFileUrl} download={msg.attachedFileName} className="flex items-center gap-2 mt-3 p-2 bg-slate-900 border border-slate-600 rounded-lg text-sm text-teal-300 w-fit hover:bg-slate-700 transition-colors cursor-pointer">
                    <span>📎</span><span className="font-medium underline underline-offset-2">{msg.attachedFileName}</span>
                  </a>
                ) : msg.attachedFileName ? (
                  <div className="flex items-center gap-2 mt-3 p-2 bg-slate-900 border border-slate-600 rounded-lg text-sm text-slate-300 w-fit">
                    <span>📎</span><span className="font-medium">{msg.attachedFileName}</span>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ))}
        
        {/* 분석 중 로딩 UI */}
        {isLoading && (
          <div className="flex justify-start">
            <div className="flex flex-row">
              <div className="flex-shrink-0 h-10 w-10 rounded-full bg-teal-600 mr-3 flex items-center justify-center">
                <Bot className="w-6 h-6 text-white" />
              </div>
              <div className="bg-slate-800 border border-slate-700 p-4 rounded-2xl rounded-tl-none flex items-center space-x-3">
                <Loader2 className="w-5 h-5 text-teal-400 animate-spin" />
                <span className="text-slate-300">AI가 데이터를 심층 분석 중입니다...</span>
              </div>
            </div>
          </div>
        )}

        {/* 추출 데이터 UI */}
        <DateConfirmButtons />
        <ExtractedDataDisplay />
        <div ref={messagesEndRef} />
      </div>

      {/* 하단 입력 폼 */}
      <form onSubmit={handleSendMessage} className="flex flex-col gap-2 relative">
        {/* 첨부파일 미리보기 영역 */}
        {attachedFileType && (
          <div className="absolute -top-14 left-0 p-2 bg-slate-800 rounded-lg border border-slate-600 shadow-xl flex items-center gap-3">
            {attachedFileType === 'image' && imagePreview ? (
              <img src={imagePreview} alt="미리보기" className="rounded-md h-10 w-auto object-cover" />
            ) : (
              <div className="text-teal-400 text-sm font-medium px-2">📊 {attachedFileName}</div>
            )}
            <button type="button" onClick={cancelAttachment} className="bg-red-500 hover:bg-red-600 text-white rounded-full p-1 w-6 h-6 flex items-center justify-center text-xs font-bold transition-colors">X</button>
          </div>
        )}

        {/* 프로모션/이벤트 태그 입력 */}
        <div className="mb-2">
          {promotions.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-1.5 px-1">
              {promotions.map((p, i) => (
                <span key={i} className="flex items-center gap-1 bg-emerald-900/30 border border-emerald-500/40 text-emerald-300 text-xs px-2.5 py-1 rounded-full">
                  🎯 {p}
                  <button type="button" onClick={() => setPromotions(prev => prev.filter((_, idx) => idx !== i))}
                    className="text-emerald-400 hover:text-white ml-0.5 font-bold">×</button>
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              value={promotionInput}
              onChange={e => setPromotionInput(e.target.value)}
              onKeyDown={e => {
                if ((e.key === 'Enter' || e.key === ',') && promotionInput.trim()) {
                  e.preventDefault();
                  setPromotions(prev => [...prev, promotionInput.trim()]);
                  setPromotionInput('');
                }
              }}
              placeholder="프로모션/이벤트 입력 후 Enter (예: 한우 특가)"
              className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-100 text-sm placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 transition-colors"
            />
            <button
              type="button"
              onClick={() => {
                if (promotionInput.trim()) {
                  setPromotions(prev => [...prev, promotionInput.trim()]);
                  setPromotionInput('');
                }
              }}
              className="bg-emerald-800/50 hover:bg-emerald-700/60 text-emerald-300 px-3 py-2 rounded-xl text-sm font-medium transition-colors border border-emerald-600/30 whitespace-nowrap"
            >
              추가
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-3.5 rounded-xl font-bold transition-colors shadow-sm border border-slate-700"
            title="엑셀/CSV 또는 이미지 파일 첨부"
          >
            📎
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
            accept="image/*, .csv, .xlsx, .xls, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
          />
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPaste={handlePaste}
            placeholder="마감 내용을 입력하거나 파일을 첨부하세요... (Enter로 전송)"
            className="flex-1 bg-slate-900 border border-slate-700 rounded-xl p-3.5 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all text-slate-100 placeholder:text-slate-500 resize-none shadow-inner"
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
            disabled={isLoading || (!input.trim() && !attachedFileContent)}
            className="bg-teal-500 hover:bg-teal-400 text-slate-950 px-6 py-3.5 rounded-xl font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
          >
            전송
          </button>
        </div>
      </form>
    </div>
  );
}