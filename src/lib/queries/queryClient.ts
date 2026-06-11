import { QueryClient } from '@tanstack/react-query';

export const STALE_TIME = {
  sales: 60_000,
  customers: 5 * 60_000,
  products: 10 * 60_000,
  orders: 5 * 60_000,
  employees: 5 * 60_000,
  coupons: 5 * 60_000,
} as const;

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 3,
        retryDelay: attempt => Math.min(1000 * 2 ** attempt, 10_000),
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
      },
    },
  });
}
