'use client';

import { useState, useEffect } from 'react';

/** 대시보드 page.tsx 모바일 분기와 동일 (max-width 767px) */
function readMobileMq() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(max-width: 767px)').matches;
}

export function useIsMobileView() {
  const [mobile, setMobile] = useState(readMobileMq);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  return mobile;
}
