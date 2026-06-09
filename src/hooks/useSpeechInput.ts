'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: { [index: number]: { [index: number]: { transcript?: string } } } }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  const w = window as Window & {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function useSpeechInput(options?: {
  lang?: string;
  continuous?: boolean;
  onFinalTranscript?: (text: string) => void;
  onError?: (message: string) => void;
}) {
  const lang = options?.lang ?? 'ko-KR';
  const continuous = options?.continuous ?? false;
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const onFinalRef = useRef(options?.onFinalTranscript);
  const onErrorRef = useRef(options?.onError);

  useEffect(() => { onFinalRef.current = options?.onFinalTranscript; }, [options?.onFinalTranscript]);
  useEffect(() => { onErrorRef.current = options?.onError; }, [options?.onError]);

  useEffect(() => {
    setSupported(!!getSpeechRecognitionCtor());
    return () => {
      recRef.current?.abort();
      recRef.current = null;
    };
  }, []);

  const stop = useCallback(() => {
    recRef.current?.stop();
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      onErrorRef.current?.('이 브라우저는 음성 입력을 지원하지 않습니다.');
      return;
    }

    recRef.current?.abort();
    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = continuous;
    rec.interimResults = false;

    rec.onresult = (event: { results: ArrayLike<{ 0?: { transcript?: string } }> }) => {
      const idx = event.results.length - 1;
      const text = event.results[idx]?.[0]?.transcript?.trim();
      if (text) onFinalRef.current?.(text);
    };

    rec.onerror = (event) => {
      if (event.error !== 'aborted' && event.error !== 'no-speech') {
        onErrorRef.current?.(`음성 인식 오류: ${event.error}`);
      }
      setListening(false);
    };

    rec.onend = () => setListening(false);

    recRef.current = rec;
    setListening(true);
    rec.start();
  }, [continuous, lang]);

  const toggle = useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  return { listening, supported, start, stop, toggle };
}
