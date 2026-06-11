'use client';

import { useEffect } from 'react';
import { classifyError } from '@/components/error-boundary/classifyError';
import ErrorFallback from '@/components/error-boundary/ErrorFallback';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const classified = classifyError(error);

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="ko">
      <body className="bg-slate-950 text-slate-100">
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-xl">
            <ErrorFallback error={classified} onRetry={reset} />
          </div>
        </div>
      </body>
    </html>
  );
}
