'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Phone, PhoneMissed, X, ClipboardList } from 'lucide-react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { useAuth } from '@/context/AuthContext';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';

interface LiveToast {
  id: string;
  type: 'phone_call' | 'pos_member_comment';
  title: string;
  message: string;
  link: string;
  missed: boolean;
}

const TOAST_MS = 12000;
const LIVE_TYPES = new Set(['phone_call', 'pos_member_comment']);

function playRingTone(kind: LiveToast['type']) {
  try {
    const ctx = new AudioContext();
    const playTone = (freq: number, delay = 0) => {
      setTimeout(() => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        gain.gain.value = kind === 'phone_call' ? 0.08 : 0.05;
        osc.start();
        osc.stop(ctx.currentTime + 0.12);
      }, delay);
    };
    if (kind === 'phone_call') {
      playTone(880);
      playTone(660, 180);
    } else {
      playTone(520);
    }
  } catch {
    /* ignore */
  }
}

function showBrowserNotification(title: string, body: string, tag: string) {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body, tag, requireInteraction: true });
  } catch {
    /* ignore */
  }
}

async function markNotificationRead(id: string) {
  try {
    const headers = await getAuthJsonHeaders();
    await fetch('/api/notifications', {
      method: 'PUT',
      headers,
      body: JSON.stringify({ id }),
    });
  } catch {
    /* ignore */
  }
}

export default function PhoneCallToast() {
  const { user } = useAuth();
  const router = useRouter();
  const [toast, setToast] = useState<LiveToast | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bootstrapped = useRef(false);
  const seenIds = useRef(new Set<string>());

  const dismiss = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setToast(null);
  }, []);

  const show = useCallback((item: LiveToast) => {
    setToast(item);
    playRingTone(item.type);
    showBrowserNotification(
      item.title,
      item.message,
      item.type === 'phone_call' ? 'pitaya-phone-call' : 'pitaya-pos-member',
    );
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
        const type = String(data.type || '');
        if (!LIVE_TYPES.has(type)) continue;

        const title = String(data.title || (type === 'phone_call' ? '전화 수신' : '결제 회원'));
        const message = String(data.message || '');
        const missed = type === 'phone_call' && title.includes('부재중');
        const defaultLink = type === 'pos_member_comment'
          ? '/dashboard/customers'
          : '/dashboard/customers';

        show({
          id,
          type: type as LiveToast['type'],
          title,
          message,
          link: String(data.link || defaultLink),
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

  const isPhone = toast.type === 'phone_call';
  const isMember = toast.type === 'pos_member_comment';

  return (
    <div
      className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] w-[min(92vw,24rem)] animate-in fade-in slide-in-from-top-2 duration-300"
      role="alert"
    >
      <button
        type="button"
        onClick={() => {
          dismiss();
          void markNotificationRead(toast.id);
          router.push(toast.link);
        }}
        className={`w-full text-left rounded-2xl border shadow-2xl px-4 py-3.5 flex items-start gap-3 transition-transform active:scale-[0.98] ${
          isPhone && toast.missed
            ? 'bg-amber-950/95 border-amber-600/60 text-amber-50'
            : isPhone
              ? 'bg-teal-950/95 border-teal-500/60 text-teal-50'
              : 'bg-indigo-950/95 border-indigo-500/60 text-indigo-50'
        }`}
      >
        <span className={`shrink-0 mt-0.5 p-2 rounded-xl ${
          isPhone && toast.missed
            ? 'bg-amber-600/30'
            : isPhone
              ? 'bg-teal-600/30'
              : 'bg-indigo-600/30'
        }`}>
          {isPhone
            ? (toast.missed ? <PhoneMissed className="w-5 h-5" /> : <Phone className="w-5 h-5 animate-pulse" />)
            : <ClipboardList className="w-5 h-5" />}
        </span>
        <span className="flex-1 min-w-0">
          <p className="text-sm font-bold">{toast.title}</p>
          <p className="text-xs mt-0.5 opacity-90 leading-snug whitespace-pre-line">{toast.message}</p>
          <p className="text-[10px] mt-1.5 opacity-60">
            {isMember ? '탭하면 회원·요청 이력으로 이동 (결제 화면 입력)' : '탭하면 고객 화면으로 이동'}
          </p>
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
