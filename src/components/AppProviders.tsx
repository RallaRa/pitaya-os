'use client';

import { useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import OverlayProvider from '@/components/overlay/OverlayProvider';
import { makeQueryClient } from '@/lib/queries/queryClient';

export default function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(makeQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <OverlayProvider>
        {children}
      </OverlayProvider>
    </QueryClientProvider>
  );
}
