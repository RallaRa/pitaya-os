'use client';

import type { ClassifiedError } from './types';
import NetworkErrorFallback from './fallbacks/NetworkErrorFallback';
import AuthErrorFallback from './fallbacks/AuthErrorFallback';
import NotFoundErrorFallback from './fallbacks/NotFoundErrorFallback';
import UnknownErrorFallback from './fallbacks/UnknownErrorFallback';

interface ErrorFallbackProps {
  error: ClassifiedError;
  onRetry?: () => void;
  compact?: boolean;
}

export default function ErrorFallback({ error, onRetry, compact }: ErrorFallbackProps) {
  const props = { message: error.message, onRetry, compact };

  switch (error.type) {
    case 'NetworkError':
      return <NetworkErrorFallback {...props} />;
    case 'AuthError':
      return <AuthErrorFallback {...props} />;
    case 'NotFoundError':
      return <NotFoundErrorFallback {...props} />;
    default:
      return <UnknownErrorFallback {...props} />;
  }
}
