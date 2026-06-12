'use client';

import { useEffect, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';

const VAPID = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

export default function StockFcmRegister() {
  const [status, setStatus] = useState<'idle' | 'pending' | 'ok' | 'denied' | 'unsupported'>('idle');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('Notification' in window) || !VAPID) {
      setStatus('unsupported');
      return;
    }
    if (Notification.permission === 'granted') setStatus('ok');
    else if (Notification.permission === 'denied') setStatus('denied');
  }, []);

  const register = async () => {
    if (!VAPID) return;
    setStatus('pending');
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setStatus('denied');
        return;
      }

      const { getMessaging, getToken, isSupported } = await import('firebase/messaging');
      const { app } = await import('@/lib/firebase/firebase');
      const supported = await isSupported();
      if (!supported) {
        setStatus('unsupported');
        return;
      }

      const reg = await navigator.serviceWorker.register('/sw-stock.js', { scope: '/dashboard/superuser/stock' });
      const messaging = getMessaging(app);
      const token = await getToken(messaging, { vapidKey: VAPID, serviceWorkerRegistration: reg });
      if (!token) {
        setStatus('denied');
        return;
      }

      const headers = await getAuthJsonHeaders();
      await fetch('/api/stock/fcm', {
        method: 'POST',
        headers,
        body: JSON.stringify({ token }),
      });
      setStatus('ok');
    } catch {
      setStatus('denied');
    }
  };

  if (status === 'unsupported') return null;

  return (
    <button
      type="button"
      onClick={() => void register()}
      disabled={status === 'pending' || status === 'ok'}
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] border border-slate-700 text-slate-400 hover:text-slate-200"
      title="매매 알림 푸시"
    >
      {status === 'ok' ? <Bell className="w-3 h-3 text-teal-400" /> : <BellOff className="w-3 h-3" />}
      {status === 'ok' ? '알림 ON' : status === 'pending' ? '등록 중…' : '알림 켜기'}
    </button>
  );
}
