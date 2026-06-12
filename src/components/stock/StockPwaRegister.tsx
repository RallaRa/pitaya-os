'use client';

import { useEffect } from 'react';

/** 슈퍼유저 주식 PWA — 서비스 워커 등록 (FCM과 scope 공유) */
export default function StockPwaRegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    void navigator.serviceWorker.register('/sw-stock.js', { scope: '/dashboard/superuser/stock' }).catch(() => {});
  }, []);
  return null;
}
