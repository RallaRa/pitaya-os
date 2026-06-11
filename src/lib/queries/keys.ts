export { STALE_TIME } from './queryClient';

export const queryKeys = {
  customers: (storeId: string, params?: Record<string, string | number | boolean | undefined>) =>
    ['customers', storeId, params ?? {}] as const,
  sales: (storeId: string, date?: string) => ['sales', storeId, date ?? 'today'] as const,
  products: (storeId: string, category?: string) => ['products', storeId, category ?? 'all'] as const,
  orders: (storeId: string) => ['orders', storeId] as const,
  employees: (storeId: string) => ['employees', storeId] as const,
  coupons: (storeId: string) => ['coupons', storeId] as const,
};
