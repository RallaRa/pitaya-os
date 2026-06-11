'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import SignageContentPlayer from '@/components/signage/SignageContentPlayer';
import { topicLabel, type SignageSlidePlan } from '@/lib/signage/signageShowPlanner';

interface Props {
  slides: SignageSlidePlan[];
  playing?: boolean;
  onPlayingChange?: (playing: boolean) => void;
}

export default function SignageShowPreview({ slides, playing = false, onPlayingChange }: Props) {
  const [index, setIndex] = useState(0);
  const [autoPlay, setAutoPlay] = useState(playing);

  useEffect(() => {
    setAutoPlay(playing);
  }, [playing]);

  useEffect(() => {
    setIndex(0);
  }, [slides]);

  const current = slides[index];
  const totalDuration = useMemo(
    () => slides.reduce((sum, s) => sum + s.duration, 0),
    [slides],
  );

  useEffect(() => {
    if (!autoPlay || !current || slides.length === 0) return;
    const timer = setTimeout(() => {
      setIndex(i => (i + 1) % slides.length);
    }, current.duration * 1000);
    return () => clearTimeout(timer);
  }, [autoPlay, current, index, slides.length]);

  if (!slides.length) {
    return (
      <div className="aspect-video rounded-2xl border border-dashed border-gray-700 bg-gray-900 flex items-center justify-center text-gray-500 text-sm">
        슬라이드가 없습니다. 대화로 쇼를 생성해 보세요.
      </div>
    );
  }

  const playerContent = {
    type: 'text' as const,
    title: current.title,
    url: JSON.stringify({ title: current.title, body: current.body, footer: current.footer || '' }),
    bgColor: current.bgColor,
    textColor: current.textColor,
  };

  return (
    <div className="space-y-3">
      <div className="relative aspect-video rounded-2xl overflow-hidden border border-gray-700 bg-black shadow-xl">
        <SignageContentPlayer content={playerContent} preview />
        <div className="absolute top-3 left-3 flex items-center gap-2">
          <span className="text-[10px] px-2 py-1 rounded-full bg-black/60 text-gray-200">
            {index + 1} / {slides.length}
          </span>
          <span className="text-[10px] px-2 py-1 rounded-full bg-blue-600/80 text-white">
            {topicLabel(current.topic)}
          </span>
          <span className="text-[10px] px-2 py-1 rounded-full bg-black/60 text-gray-300">
            {current.duration}초
          </span>
        </div>
        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setIndex(i => (i - 1 + slides.length) % slides.length)}
            className="p-2 rounded-lg bg-black/50 text-white hover:bg-black/70 touch-target"
            aria-label="이전"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            onClick={() => {
              const next = !autoPlay;
              setAutoPlay(next);
              onPlayingChange?.(next);
            }}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium flex items-center gap-1.5 touch-target"
          >
            {autoPlay ? <Pause size={14} /> : <Play size={14} />}
            {autoPlay ? '일시정지' : '재생'}
          </button>
          <button
            type="button"
            onClick={() => setIndex(i => (i + 1) % slides.length)}
            className="p-2 rounded-lg bg-black/50 text-white hover:bg-black/70 touch-target"
            aria-label="다음"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-gray-400 px-1">
        <span>총 {totalDuration}초 · {slides.length}장</span>
        <span>{autoPlay ? 'TV 재생 시뮬레이션' : '수동 탐색'}</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {slides.map((slide, i) => (
          <button
            key={slide.id}
            type="button"
            onClick={() => { setIndex(i); setAutoPlay(false); onPlayingChange?.(false); }}
            className={`rounded-xl p-2 text-left border transition-colors ${
              i === index
                ? 'border-blue-500 bg-blue-900/30'
                : 'border-gray-800 bg-gray-900 hover:border-gray-600'
            }`}
          >
            <div
              className="aspect-video rounded-lg mb-1.5 flex items-center justify-center p-1 text-[9px] font-bold leading-tight text-center"
              style={{ background: slide.bgColor, color: slide.textColor }}
            >
              {slide.title.slice(0, 12)}
            </div>
            <p className="text-[10px] text-gray-300 truncate">{slide.title}</p>
            <p className="text-[9px] text-gray-500">{slide.duration}초</p>
          </button>
        ))}
      </div>
    </div>
  );
}
