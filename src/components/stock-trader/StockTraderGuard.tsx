'use client';

import { useEffect, useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { isSuperuserEmail } from '@/lib/auth/permissions';
import { STOCK_AUTH_COOKIE, STOCK_SESSION_IDLE_MS, STOCK_SUPERUSER_EMAIL } from '@/lib/stock/constants';

const SESSION_KEY = 'pitaya_stock_session_id';

function setAuthCookie(token: string) {
  document.cookie = `${STOCK_AUTH_COOKIE}=${encodeURIComponent(token)}; path=/; max-age=3600; SameSite=Strict; Secure=${location.protocol === 'https:'}`;
}

export default function StockTraderGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [ready, setReady] = useState(false);

  const allowed =
    !!user?.email &&
    isSuperuserEmail(user.email) &&
    user.email.toLowerCase() === STOCK_SUPERUSER_EMAIL &&
    user.emailVerified;

  const resetIdle = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      document.cookie = `${STOCK_AUTH_COOKIE}=; path=/; max-age=0`;
      localStorage.removeItem(SESSION_KEY);
      router.replace('/login?reason=stock_idle');
    }, STOCK_SESSION_IDLE_MS);
  }, [router]);

  useEffect(() => {
    if (loading) return;
    if (!allowed) {
      router.replace('/dashboard');
      return;
    }

    void (async () => {
      const token = await user!.getIdToken(true);
      setAuthCookie(token);
      resetIdle();

      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      };
      const existingSession = localStorage.getItem(SESSION_KEY);
      if (existingSession) headers['x-stock-session'] = existingSession;

      const res = await fetch('/api/stock/auth/verify', {
        method: 'POST',
        headers,
        body: JSON.stringify({ path: window.location.pathname }),
      });

      if (!res.ok) {
        router.replace('/dashboard');
        return;
      }

      const data = await res.json();
      if (data.sessionId) localStorage.setItem(SESSION_KEY, data.sessionId);
      setReady(true);
    })();

    const events = ['mousemove', 'keydown', 'click', 'scroll'] as const;
    events.forEach(ev => window.addEventListener(ev, resetIdle));
    return () => {
      events.forEach(ev => window.removeEventListener(ev, resetIdle));
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [loading, allowed, user, router, resetIdle]);

  if (loading || !allowed || !ready) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}
