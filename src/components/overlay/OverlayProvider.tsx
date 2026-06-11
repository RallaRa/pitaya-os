'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { OverlayItem, ToastItem } from './types';
import { registerOverlayController } from './overlayStore';
import OverlayContainer from './OverlayContainer';

const EXIT_MS = 200;
const DEFAULT_TOAST_MS = 3200;

export default function OverlayProvider({ children }: { children: React.ReactNode }) {
  const [stack, setStack] = useState<OverlayItem[]>([]);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const removeOverlay = useCallback((id: string) => {
    setStack(prev => {
      const item = prev.find(o => o.id === id);
      if (item && (item.kind === 'confirm' || item.kind === 'alert')) {
        /* resolve는 closeOverlay에서 처리 */
      }
      return prev.filter(o => o.id !== id);
    });
  }, []);

  const closeOverlay = useCallback((id: string) => {
    setStack(prev => {
      const target = prev.find(o => o.id === id);
      if (!target || target.exiting) return prev;
      return prev.map(o => (o.id === id ? { ...o, exiting: true } : o));
    });

    const existing = timersRef.current.get(id);
    if (existing) clearTimeout(existing);

    timersRef.current.set(
      id,
      setTimeout(() => {
        timersRef.current.delete(id);
        setStack(prev => {
          const item = prev.find(o => o.id === id);
          if (item?.kind === 'confirm') item.resolve(false);
          if (item?.kind === 'alert') item.resolve();
          return prev.filter(o => o.id !== id);
        });
      }, EXIT_MS),
    );
  }, []);

  const closeTop = useCallback(() => {
    setStack(prev => {
      const top = prev[prev.length - 1];
      if (top) closeOverlay(top.id);
      return prev;
    });
  }, [closeOverlay]);

  const push = useCallback((item: OverlayItem) => {
    setStack(prev => [...prev, item]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const closeToast = useCallback((id: string) => {
    setToasts(prev => prev.map(t => (t.id === id ? { ...t, exiting: true } : t)));
    const existing = timersRef.current.get(`toast-${id}`);
    if (existing) clearTimeout(existing);
    timersRef.current.set(
      `toast-${id}`,
      setTimeout(() => {
        timersRef.current.delete(`toast-${id}`);
        removeToast(id);
      }, EXIT_MS),
    );
  }, [removeToast]);

  const pushToast = useCallback((item: ToastItem) => {
    setToasts(prev => [...prev.slice(-4), item]);
    const existing = timersRef.current.get(`toast-${item.id}`);
    if (existing) clearTimeout(existing);
    timersRef.current.set(
      `toast-${item.id}`,
      setTimeout(() => closeToast(item.id), item.duration ?? DEFAULT_TOAST_MS),
    );
  }, [closeToast]);

  useEffect(() => {
    registerOverlayController({ push, pushToast, close: closeOverlay, closeTop });

    return () => {
      registerOverlayController(null);
      timersRef.current.forEach(t => clearTimeout(t));
      timersRef.current.clear();
    };
  }, [push, pushToast, closeOverlay, closeTop]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setStack(prev => {
        const top = prev[prev.length - 1];
        if (!top || top.exiting) return prev;
        if (top.kind === 'modal' || top.kind === 'bottomSheet') {
          if (top.closeOnEsc) closeOverlay(top.id);
        } else if (top.kind === 'confirm' || top.kind === 'alert') {
          closeOverlay(top.id);
        }
        return prev;
      });
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeOverlay]);

  const resolveConfirm = useCallback((id: string, value: boolean) => {
    setStack(prev => {
      const item = prev.find(o => o.id === id);
      if (item?.kind === 'confirm') item.resolve(value);
      return prev.map(o => (o.id === id ? { ...o, exiting: true } : o));
    });
    timersRef.current.set(
      id,
      setTimeout(() => removeOverlay(id), EXIT_MS),
    );
  }, [removeOverlay]);

  const resolveAlert = useCallback((id: string) => {
    setStack(prev => {
      const item = prev.find(o => o.id === id);
      if (item?.kind === 'alert') item.resolve();
      return prev.map(o => (o.id === id ? { ...o, exiting: true } : o));
    });
    timersRef.current.set(
      id,
      setTimeout(() => removeOverlay(id), EXIT_MS),
    );
  }, [removeOverlay]);

  return (
    <>
      {children}
      <OverlayContainer
        stack={stack}
        toasts={toasts}
        onClose={closeOverlay}
        onConfirm={resolveConfirm}
        onAlert={resolveAlert}
        onDismissToast={closeToast}
      />
    </>
  );
}
