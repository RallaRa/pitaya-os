export { STALE_TIME } from './queryClient';

export const queryKeys = {
  customers: (storeId: string, params?: Record<string, string | number | boolean | undefined>) =>
    ['customers', storeId, params ?? {}] as const,
  sales: (storeId: string, date?: string) => ['sales', storeId, date ?? 'today'] as const,
  products: (storeId: string, category?: string) => ['products', storeId, category ?? 'all'] as const,
  orders: (storeId: string) => ['orders', storeId] as const,
  employees: (storeId: string) => ['employees', storeId] as const,
  coupons: (storeId: string) => ['coupons', storeId] as const,
  dashboard: {
    salesCompare: (storeId: string) => ['dashboard', 'sales-compare', storeId] as const,
    customerVisit: (storeId: string) => ['dashboard', 'customer-visit', storeId] as const,
    yesterday: (storeId: string) => ['dashboard', 'yesterday', storeId] as const,
    weekly: (storeId: string) => ['dashboard', 'weekly', storeId] as const,
    costRatio: (storeId: string) => ['dashboard', 'cost-ratio', storeId] as const,
    weather: (storeId: string) => ['dashboard', 'weather', storeId] as const,
    news: () => ['dashboard', 'news'] as const,
    aiInsight: (storeId: string) => ['dashboard', 'ai-insight', storeId] as const,
    totalPartner: (storeId: string) => ['dashboard', 'total-partner', storeId] as const,
    salesPrediction: (storeId: string) => ['dashboard', 'sales-prediction', storeId] as const,
    salesHeatmap: (storeId: string, range: string) => ['dashboard', 'sales-heatmap', storeId, range] as const,
    dowProfitability: (storeId: string, period: string) => ['dashboard', 'dow-profitability', storeId, period] as const,
    churnRisk: (storeId: string, limit: number) => ['dashboard', 'churn-risk', storeId, limit] as const,
    timeSlotAov: (storeId: string, date: string) => ['dashboard', 'time-slot-aov', storeId, date] as const,
    salesCategories: (storeId: string, date: string) => ['dashboard', 'sales-categories', storeId, date] as const,
    orderDeliveryGap: (storeId: string) => ['dashboard', 'order-delivery-gap', storeId] as const,
    marginRanking: (storeId: string) => ['dashboard', 'margin-ranking', storeId] as const,
    repurchaseDue: (storeId: string) => ['dashboard', 'repurchase-due', storeId] as const,
    performanceContext: (storeId: string) => ['dashboard', 'performance-context', storeId] as const,
  },
};
