'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Phone, PhoneMissed, X } from 'lucide-react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { useAuth } from '@/context/AuthContext';

interface PhoneToast {
  id: string;
  title: string;
  message: string;
  link: string;
  missed: boolean;
}

const TOAST_MS = 12000;

function playRingTone() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.value = 0.08;
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
    setTimeout(() => {
      const o2 = ctx.createOscillator();
      const g2 = ctx.createGain();
      o2.connect(g2);
      g2.connect(ctx.destination);
      o2.frequency.value = 660;
      g2.gain.value = 0.08;
      o2.start();
      o2.stop(ctx.currentTime + 0.15);
    }, 180);
  } catch {
    /* ignore */
  }
}

function showBrowserNotification(title: string, body: string) {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body, tag: 'pitaya-phone-call', requireInteraction: true });
  } catch {
    /* ignore */
  }
}

export default function PhoneCallToast() {
  const { user } = useAuth();
  const router = useRouter();
  const [toast, setToast] = useState<PhoneToast | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bootstrapped = useRef(false);
  const seenIds = useRef(new Set<string>());

  const dismiss = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setToast(null);
  }, []);

  const show = useCallback((item: PhoneToast) => {
    setToast(item);
    playRingTone();
    showBrowserNotification(item.title, item.message);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  useEffect(() => {
    if (!user?.uid) return;
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;

    const q = query(
      collection(db, 'notifications'),
      where('targetUid', '==', user.uid),
    );

    const unsub = onSnapshot(q, snapshot => {
      if (!bootstrapped.current) {
        bootstrapped.current = true;
        snapshot.docs.forEach(d => seenIds.current.add(d.id));
        return;
      }

      for (const change of snapshot.docChanges()) {
        if (change.type !== 'added') continue;
        const id = change.doc.id;
        if (seenIds.current.has(id)) continue;
        seenIds.current.add(id);

        const data = change.doc.data();
        if (data.type !== 'phone_call') continue;

        const title = String(data.title || '전화 수신');
        const message = String(data.message || '');
        const missed = title.includes('부재중');

        show({
          id,
          title,
          message,
          link: String(data.link || '/dashboard/customers'),
          missed,
        });
      }
    });

    return () => {
      unsub();
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [user?.uid, show]);

  if (!toast) return null;

  return (
    <div
      className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] w-[min(92vw,24rem)] animate-in fade-in slide-in-from-top-2 duration-300"
      role="alert"
    >
      <button
        type="button"
        onClick={() => {
          dismiss();
          router.push(toast.link);
        }}
        className={`w-full text-left rounded-2xl border shadow-2xl px-4 py-3.5 flex items-start gap-3 transition-transform active:scale-[0.98] ${
          toast.missed
            ? 'bg-amber-950/95 border-amber-600/60 text-amber-50'
            : 'bg-teal-950/95 border-teal-500/60 text-teal-50'
        }`}
      >
        <span className={`shrink-0 mt-0.5 p-2 rounded-xl ${toast.missed ? 'bg-amber-600/30' : 'bg-teal-600/30'}`}>
          {toast.missed ? <PhoneMissed className="w-5 h-5" /> : <Phone className="w-5 h-5 animate-pulse" />}
        </span>
        <span className="flex-1 min-w-0">
          <p className="text-sm font-bold">{toast.title}</p>
          <p className="text-xs mt-0.5 opacity-90 leading-snug">{toast.message}</p>
          <p className="text-[10px] mt-1.5 opacity-60">탭하면 고객 화면으로 이동</p>
        </span>
        <span
          role="button"
          tabIndex={0}
          onClick={e => { e.stopPropagation(); dismiss(); }}
          onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); dismiss(); } }}
          className="shrink-0 p-1 rounded-lg opacity-60 hover:opacity-100"
          aria-label="닫기"
        >
          <X className="w-4 h-4" />
        </span>
      </button>
    </div>
  );
}
