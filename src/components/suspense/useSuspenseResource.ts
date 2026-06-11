'use client';

import { useRef, useSyncExternalStore } from 'react';
import {
  getSuspenseResourceVersion,
  invalidateSuspenseResource,
  readSuspenseResource,
  subscribeSuspenseResource,
} from './suspenseResource';

export function useSuspenseResource<T>(key: string, fetcher: () => Promise<T>): T {
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const version = useSyncExternalStore(
    cb => subscribeSuspenseResource(key, cb),
    () => getSuspenseResourceVersion(key),
    () => 0,
  );

  return readSuspenseResource(key, () => fetcherRef.current());
}

export function useSuspenseInvalidate(key: string) {
  return () => invalidateSuspenseResource(key);
}
