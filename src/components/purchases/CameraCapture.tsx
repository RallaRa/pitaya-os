'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { Camera, X, Check, RotateCcw, Loader2, AlertCircle } from 'lucide-react';

interface Props {
  onCapture: (file: File) => void;
}

async function compressImageDataUrl(dataUrl: string, maxPx = 1600, quality = 0.88): Promise<string> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      let w = img.width;
      let h = img.height;
      if (w > maxPx || h > maxPx) {
        if (w > h) { h = Math.round(h * maxPx / w); w = maxPx; }
        else { w = Math.round(w * maxPx / h); h = maxPx; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export default function CameraCapture({ onCapture }: Props) {
  const [isOpen, setIsOpen]         = useState(false);
  const [captured, setCaptured]     = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [camError, setCamError]     = useState<string | null>(null);
  const [starting, setStarting]     = useState(false);
  const [compressing, setCompressing] = useState(false);

  const videoRef  = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async (facing: 'environment' | 'user' = facingMode) => {
    setStarting(true);
    setCamError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
    } catch (e: any) {
      if (e.name === 'NotAllowedError') setCamError('카메라 권한이 거부됐습니다. 브라우저 설정에서 허용해주세요.');
      else if (e.name === 'NotFoundError') setCamError('카메라를 찾을 수 없습니다.');
      else setCamError('카메라를 시작할 수 없습니다: ' + (e.message || e.name));
    } finally {
      setStarting(false);
    }
  }, [facingMode]);

  // open → start camera
  useEffect(() => {
    if (isOpen && !captured) {
      startCamera(facingMode);
    }
    return () => {
      if (!isOpen) stopStream();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const open = () => {
    setCaptured(null);
    setCamError(null);
    setIsOpen(true);
  };

  const close = () => {
    stopStream();
    setIsOpen(false);
    setCaptured(null);
    setCamError(null);
  };

  const capture = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width  = video.videoWidth  || 1280;
    canvas.height = video.videoHeight || 720;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    setCaptured(dataUrl);
    stopStream();
  };

  const retake = () => {
    setCaptured(null);
    setCamError(null);
    startCamera(facingMode);
  };

  const confirm = async () => {
    if (!captured || !canvasRef.current) return;
    setCompressing(true);
    try {
      const compressed = await compressImageDataUrl(captured, 1600, 0.88);
      const res = await fetch(compressed);
      const blob = await res.blob();
      const file = new File([blob], `receipt_${Date.now()}.jpg`, { type: 'image/jpeg' });
      onCapture(file);
      close();
    } finally {
      setCompressing(false);
    }
  };

  const toggleCamera = async () => {
    stopStream();
    const next: 'environment' | 'user' = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(next);
    setCaptured(null);
    setCamError(null);
    startCamera(next);
  };

  return (
    <>
      {/* 카메라 버튼 */}
      <button
        onClick={open}
        title="카메라 촬영"
        className="p-2 text-slate-400 hover:text-blue-400 hover:bg-slate-800 rounded-lg transition-colors shrink-0"
      >
        <Camera className="w-4 h-4" />
      </button>

      {/* 전체화면 카메라 모달 */}
      {isOpen && (
        <div className="fixed inset-0 z-[9999] bg-black flex flex-col select-none">
          {/* 상단 헤더 */}
          <div className="flex items-center justify-between px-4 py-3 bg-black/80 shrink-0">
            <span className="text-white text-sm font-medium">거래명세서 촬영</span>
            <div className="flex items-center gap-3">
              {!captured && !camError && (
                <button
                  onClick={toggleCamera}
                  className="text-white/80 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors"
                  title="전/후면 전환"
                >
                  <RotateCcw className="w-5 h-5" />
                </button>
              )}
              <button
                onClick={close}
                className="text-white/80 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* 카메라 뷰 */}
          <div className="flex-1 relative overflow-hidden bg-black">
            {/* 에러 상태 */}
            {camError ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center">
                <AlertCircle className="w-12 h-12 text-red-400" />
                <p className="text-white text-sm">{camError}</p>
                <button
                  onClick={() => { setCamError(null); startCamera(facingMode); }}
                  className="px-5 py-2.5 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-sm font-medium transition-colors"
                >
                  다시 시도
                </button>
              </div>
            ) : starting ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-8 h-8 text-teal-400 animate-spin" />
                <p className="text-slate-400 text-sm">카메라 시작 중...</p>
              </div>
            ) : !captured ? (
              <>
                {/* 라이브 비디오 */}
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                  style={{ transform: facingMode === 'user' ? 'scaleX(-1)' : 'none' }}
                />
                {/* 촬영 가이드 오버레이 */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-[88%] h-[65%] relative">
                    {/* 코너 마커 */}
                    {[
                      'top-0 left-0 border-t-2 border-l-2 rounded-tl-lg',
                      'top-0 right-0 border-t-2 border-r-2 rounded-tr-lg',
                      'bottom-0 left-0 border-b-2 border-l-2 rounded-bl-lg',
                      'bottom-0 right-0 border-b-2 border-r-2 rounded-br-lg',
                    ].map((cls, i) => (
                      <div key={i} className={`absolute w-8 h-8 border-white/70 ${cls}`} />
                    ))}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <p className="text-white/50 text-xs bg-black/30 rounded-lg px-3 py-1.5">
                        거래명세서를 안에 맞춰주세요
                      </p>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              /* 촬영된 이미지 */
              <img
                src={captured}
                alt="촬영된 이미지"
                className="w-full h-full object-contain"
                style={{ transform: facingMode === 'user' ? 'scaleX(-1)' : 'none' }}
              />
            )}

            {/* 숨김 캔버스 */}
            <canvas ref={canvasRef} className="hidden" />
          </div>

          {/* 하단 컨트롤 */}
          <div className="px-6 py-8 bg-black/80 shrink-0 flex items-center justify-center gap-10">
            {!captured && !camError && !starting ? (
              /* 촬영 버튼 */
              <button
                onClick={capture}
                className="w-18 h-18 rounded-full bg-white border-4 border-slate-400 hover:bg-slate-100 active:scale-95 transition-all flex items-center justify-center shadow-xl"
                style={{ width: 72, height: 72 }}
              >
                <Camera className="w-7 h-7 text-slate-800" />
              </button>
            ) : captured ? (
              /* 다시찍기 / 사용하기 */
              <>
                <button
                  onClick={retake}
                  disabled={compressing}
                  className="flex items-center gap-2 px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
                >
                  <RotateCcw className="w-4 h-4" />
                  다시 찍기
                </button>
                <button
                  onClick={confirm}
                  disabled={compressing}
                  className="flex items-center gap-2 px-6 py-3 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {compressing
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> 처리 중...</>
                    : <><Check className="w-4 h-4" /> 사용하기</>
                  }
                </button>
              </>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}
