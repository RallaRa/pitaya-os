'use client';

import { createContext, useContext, useState, useCallback } from 'react';

interface DashboardChromeContextValue {
  hideChrome: boolean;
  setHideChrome: (v: boolean) => void;
  toggleDashboardFullscreen: () => void;
}

const DashboardChromeContext = createContext<DashboardChromeContextValue | null>(null);

export function DashboardChromeProvider({ children }: { children: React.ReactNode }) {
  const [hideChrome, setHideChrome] = useState(false);

  const toggleDashboardFullscreen = useCallback(() => {
    setHideChrome(prev => {
      const next = !prev;
      if (next) {
        document.documentElement.requestFullscreen?.().catch(() => {});
      } else if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {});
      }
      return next;
    });
  }, []);

  return (
    <DashboardChromeContext.Provider value={{ hideChrome, setHideChrome, toggleDashboardFullscreen }}>
      {children}
    </DashboardChromeContext.Provider>
  );
}

export function useDashboardChrome() {
  return useContext(DashboardChromeContext);
}
