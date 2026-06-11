'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export type FunnelDirection = 'forward' | 'back' | 'none';

export interface FunnelStep<TContext> {
  id: string;
  title: string;
  validate?: (context: TContext) => string | null;
}

export interface UseFunnelOptions<TContext> {
  steps: FunnelStep<TContext>[];
  initialContext: TContext;
  queryKey?: string;
  /** false면 URL ?step= 동기화 없이 내부 state만 사용 (overlay 등) */
  syncToUrl?: boolean;
  onComplete?: (context: TContext) => void | Promise<void>;
}

export interface UseFunnelReturn<TContext> {
  step: number;
  stepIndex: number;
  totalSteps: number;
  currentStep: FunnelStep<TContext>;
  context: TContext;
  setContext: React.Dispatch<React.SetStateAction<TContext>>;
  patchContext: (patch: Partial<TContext>) => void;
  direction: FunnelDirection;
  isFirst: boolean;
  isLast: boolean;
  isComplete: boolean;
  error: string | null;
  setError: (msg: string | null) => void;
  next: () => boolean;
  prev: () => void;
  goTo: (step: number) => void;
  complete: () => Promise<boolean>;
  reset: () => void;
}

function clampStep(step: number, total: number) {
  return Math.min(Math.max(step, 1), total);
}

export function useFunnel<TContext>({
  steps,
  initialContext,
  queryKey = 'step',
  syncToUrl = true,
  onComplete,
}: UseFunnelOptions<TContext>): UseFunnelReturn<TContext> {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const totalSteps = steps.length;

  const [context, setContext] = useState<TContext>(initialContext);
  const [localStep, setLocalStep] = useState(1);
  const [direction, setDirection] = useState<FunnelDirection>('none');
  const [error, setError] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const completingRef = useRef(false);

  const stepFromUrl = useMemo(() => {
    if (!syncToUrl) return localStep;
    const raw = searchParams.get(queryKey);
    const parsed = raw ? Number.parseInt(raw, 10) : 1;
    return clampStep(Number.isFinite(parsed) ? parsed : 1, totalSteps);
  }, [localStep, searchParams, queryKey, syncToUrl, totalSteps]);

  const stepIndex = stepFromUrl - 1;
  const currentStep = steps[stepIndex] ?? steps[0];

  const syncUrl = useCallback((nextStep: number, mode: 'push' | 'replace' = 'replace') => {
    const clamped = clampStep(nextStep, totalSteps);
    if (!syncToUrl) {
      setLocalStep(clamped);
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set(queryKey, String(clamped));
    const qs = params.toString();
    const href = qs ? `${pathname}?${qs}` : pathname;
    if (mode === 'push') router.push(href, { scroll: false });
    else router.replace(href, { scroll: false });
  }, [pathname, queryKey, router, searchParams, syncToUrl, totalSteps]);

  const patchContext = useCallback((patch: Partial<TContext>) => {
    setContext(prev => ({ ...prev, ...patch }));
  }, []);

  const validateCurrent = useCallback(() => {
    if (!currentStep?.validate) return true;
    const message = currentStep.validate(context);
    if (message) {
      setError(message);
      return false;
    }
    setError(null);
    return true;
  }, [context, currentStep]);

  const goTo = useCallback((target: number) => {
    const next = clampStep(target, totalSteps);
    setDirection(next > stepFromUrl ? 'forward' : next < stepFromUrl ? 'back' : 'none');
    syncUrl(next);
  }, [stepFromUrl, syncUrl, totalSteps]);

  const next = useCallback(() => {
    if (!validateCurrent()) return false;
    if (stepFromUrl >= totalSteps) return false;
    setDirection('forward');
    syncUrl(stepFromUrl + 1, 'push');
    return true;
  }, [stepFromUrl, syncUrl, totalSteps, validateCurrent]);

  const prev = useCallback(() => {
    if (stepFromUrl <= 1) return;
    setError(null);
    setDirection('back');
    syncUrl(stepFromUrl - 1, 'push');
  }, [stepFromUrl, syncUrl]);

  const complete = useCallback(async () => {
    if (completingRef.current) return false;
    if (!validateCurrent()) return false;
    completingRef.current = true;
    try {
      await onComplete?.(context);
      setIsComplete(true);
      setError(null);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : '처리 중 오류가 발생했습니다');
      return false;
    } finally {
      completingRef.current = false;
    }
  }, [context, onComplete, validateCurrent]);

  const reset = useCallback(() => {
    setContext(initialContext);
    setError(null);
    setIsComplete(false);
    setDirection('none');
    syncUrl(1);
  }, [initialContext, syncUrl]);

  useEffect(() => {
    if (syncToUrl && (stepFromUrl < 1 || stepFromUrl > totalSteps)) {
      syncUrl(1);
    }
  }, [stepFromUrl, syncToUrl, syncUrl, totalSteps]);

  return {
    step: stepFromUrl,
    stepIndex,
    totalSteps,
    currentStep,
    context,
    setContext,
    patchContext,
    direction,
    isFirst: stepFromUrl <= 1,
    isLast: stepFromUrl >= totalSteps,
    isComplete,
    error,
    setError,
    next,
    prev,
    goTo,
    complete,
    reset,
  };
}
