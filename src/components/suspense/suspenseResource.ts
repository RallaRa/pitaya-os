type ResourceStatus = 'pending' | 'success' | 'error';

export interface ResourceEntry<T> {
  status: ResourceStatus;
  promise?: Promise<void>;
  data?: T;
  error?: Error;
}

const cache = new Map<string, ResourceEntry<unknown>>();
const versions = new Map<string, number>();
const listeners = new Map<string, Set<() => void>>();

function getVersion(key: string): number {
  return versions.get(key) ?? 0;
}

function bumpVersion(key: string) {
  versions.set(key, getVersion(key) + 1);
  listeners.get(key)?.forEach(fn => fn());
}

export function subscribeSuspenseResource(key: string, cb: () => void): () => void {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key)!.add(cb);
  return () => {
    listeners.get(key)?.delete(cb);
  };
}

export function getSuspenseResourceVersion(key: string): number {
  return getVersion(key);
}

export function invalidateSuspenseResource(key: string) {
  cache.delete(key);
  bumpVersion(key);
}

export function readSuspenseResource<T>(key: string, fetcher: () => Promise<T>): T {
  let entry = cache.get(key) as ResourceEntry<T> | undefined;

  if (!entry) {
    entry = { status: 'pending' };
    cache.set(key, entry);
    entry.promise = fetcher()
      .then(data => {
        entry!.status = 'success';
        entry!.data = data;
      })
      .catch(err => {
        entry!.status = 'error';
        entry!.error = err instanceof Error ? err : new Error(String(err));
      })
      .finally(() => {
        bumpVersion(key);
      });
  }

  if (entry.status === 'pending') throw entry.promise;
  if (entry.status === 'error') throw entry.error;
  return entry.data as T;
}

export function preloadSuspenseResource<T>(key: string, fetcher: () => Promise<T>) {
  readSuspenseResource(key, fetcher);
}
