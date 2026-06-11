'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { SkeletonWidget } from '@/components/suspense';

/** 화면에 가까워질 때만 자식(위젯)을 마운트해 API·번들 부담을 줄입니다. */
export default function LazyWidgetMount({
  children,
  eager = false,
}: {
  children: ReactNode;
  eager?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(eager);

  useEffect(() => {
    if (visible || eager) return;
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '160px 0px' },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [visible, eager]);

  return (
    <div ref={ref} className="h-full min-h-0 flex flex-col">
      {visible ? children : <SkeletonWidget />}
    </div>
  );
}
