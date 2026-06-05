'use client';

import { useEffect, useRef } from 'react';

export interface SignageContent {
  id?: string;
  type: 'image' | 'video' | 'text' | 'slide';
  title?: string;
  url?: string;
  body?: string;
  footer?: string;
  bgColor?: string;
  textColor?: string;
}

interface Props {
  content: SignageContent;
  preview?: boolean;
}

export default function SignageContentPlayer({ content, preview = false }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (content.type === 'video' && videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
  }, [content]);

  const isImageUrl = (url: string) =>
    !url.trim().startsWith('<') && !url.trim().startsWith('{');

  if ((content.type === 'image' || content.type === 'slide') && content.url && isImageUrl(content.url)) {
    return (
      <div className="w-full h-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={content.url} alt={content.title || ''} className="w-full h-full object-cover" />
      </div>
    );
  }

  if (content.type === 'video' && content.url) {
    return (
      <video
        ref={videoRef}
        src={content.url}
        className="w-full h-full object-cover"
        autoPlay
        muted
        loop={preview}
        playsInline
      />
    );
  }

  if (content.type === 'text' || content.type === 'slide') {
    if (content.url && content.url.trim().startsWith('<')) {
      return (
        <div
          className="w-full h-full overflow-hidden"
          dangerouslySetInnerHTML={{ __html: content.url }}
        />
      );
    }

    let parsed: { title?: string; body?: string; footer?: string } = {};
    if (content.url && !content.url.startsWith('<')) {
      try {
        parsed = JSON.parse(content.url);
      } catch {
        parsed = { body: content.url };
      }
    }

    return (
      <div
        className="w-full h-full flex flex-col items-center justify-center p-8 text-center"
        style={{
          background: content.bgColor || '#1a1a2e',
          color: content.textColor || '#ffffff',
        }}
      >
        <h2 className="text-4xl font-bold mb-4 leading-tight">
          {parsed.title || content.title}
        </h2>
        {(parsed.body || content.body) && (
          <p className="text-2xl opacity-80 leading-relaxed whitespace-pre-wrap">
            {parsed.body || content.body}
          </p>
        )}
        {(parsed.footer || content.footer) && (
          <p className="text-lg opacity-50 mt-6">{parsed.footer || content.footer}</p>
        )}
      </div>
    );
  }

  return (
    <div className="w-full h-full flex items-center justify-center bg-black text-white/50">
      콘텐츠 없음
    </div>
  );
}
