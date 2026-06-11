'use client';

import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import ErrorBoundary from './ErrorBoundary';

export default function GlobalErrorBoundary({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();

  return (
    <ErrorBoundary userId={user?.uid ?? null} page={pathname}>
      {children}
    </ErrorBoundary>
  );
}
