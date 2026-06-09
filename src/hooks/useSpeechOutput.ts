'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export function useSpeechOutput(options?: { lang?: string }) {
  const lang = options?.lang ?? 'ko-KR';
  const [enabled, setEnabled] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [supported, setSupported] = useState(false);
  const onEndRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    setSupported(typeof window !== 'undefined' && 'speechSynthesis' in window);
    return () => {
      window.speechSynthesis?.cancel();
    };
  }, []);

  const stop = useCallback(() => {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }, []);

  const speak = useCallback((text: string, onEnd?: () => void) => {
    if (!enabled || !supported || !text.trim()) {
      onEnd?.();
      return;
    }

    window.speechSynthesis.cancel();
    onEndRef.current = onEnd ?? null;

    const utter = new SpeechSynthesisUtterance(text.replace(/\*\*/g, '').slice(0, 4000));
    utter.lang = lang;
    utter.rate = 1;
    utter.onend = () => {
      setSpeaking(false);
      onEndRef.current?.();
      onEndRef.current = null;
    };
    utter.onerror = () => {
      setSpeaking(false);
      onEndRef.current?.();
      onEndRef.current = null;
    };

    setSpeaking(true);
    window.speechSynthesis.speak(utter);
  }, [enabled, lang, supported]);

  return { enabled, setEnabled, speaking, supported, speak, stop };
}
