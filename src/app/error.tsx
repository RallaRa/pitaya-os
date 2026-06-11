'use client';

import { useEffect } from 'react';
import { classifyError } from '@/components/error-boundary/classifyError';
import { logErrorToFirestore } from '@/components/error-boundary/logError';
import ErrorFallback from '@/components/error-boundary/ErrorFallback';
import { useAuth } from '@/context/AuthContext';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { user } = useAuth();
  const classified = classifyError(error);

  useEffect(() => {
    console.error(error);
    void logErrorToFirestore({
      type: classified.type,
      message: classified.message,
      stack: error.stack,
      page: typeof window !== 'undefined' ? window.location.pathname : '',
      userId: user?.uid ?? null,
    });
  }, [error, classified.type, classified.message, user?.uid]);

  return (
    <div className="min-h-app bg-slate-950 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-xl">
        <ErrorFallback error={classified} onRetry={reset} />
      </div>
    </div>
  );
}
