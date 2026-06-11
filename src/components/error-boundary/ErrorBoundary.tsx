'use client';

import React, { Component, type ReactNode } from 'react';
import { classifyError } from './classifyError';
import { logErrorToFirestore } from './logError';
import ErrorFallback from './ErrorFallback';
import type { ClassifiedError } from './types';

interface ErrorBoundaryProps {
  children: ReactNode;
  userId?: string | null;
  page?: string;
  compact?: boolean;
  fallback?: (error: ClassifiedError, retry: () => void) => ReactNode;
  onError?: (error: ClassifiedError) => void;
}

interface ErrorBoundaryState {
  error: ClassifiedError | null;
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(err: Error): ErrorBoundaryState {
    return { error: classifyError(err) };
  }

  componentDidCatch(err: Error) {
    const classified = classifyError(err);
    this.props.onError?.(classified);

    void logErrorToFirestore({
      type: classified.type,
      message: classified.message,
      stack: err.stack,
      page: this.props.page ?? (typeof window !== 'undefined' ? window.location.pathname : ''),
      userId: this.props.userId ?? null,
    });
  }

  handleRetry = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) {
      return this.props.fallback(error, this.handleRetry);
    }

    return (
      <ErrorFallback error={error} onRetry={this.handleRetry} compact={this.props.compact} />
    );
  }
}
