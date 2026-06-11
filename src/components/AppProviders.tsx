'use client';

import OverlayProvider from '@/components/overlay/OverlayProvider';

export default function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <OverlayProvider>
      {children}
    </OverlayProvider>
  );
}
