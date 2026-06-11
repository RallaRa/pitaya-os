export { STALE_TIME, makeQueryClient } from './queryClient';
export { queryKeys } from './keys';
export { fetchAuthJson, QueryFetchError } from './fetchJson';
export { useCustomers, useRegisterCustomer } from './useCustomers';
export type { CustomerRow, UseCustomersParams } from './useCustomers';
export { useSalesData } from './useSalesData';
export type { TodaySalesData } from './useSalesData';
export { useProducts } from './useProducts';
export type { ProductItem } from './useProducts';
export { useOrders, useCreateOrderTemplate, useDeleteOrderTemplate } from './useOrders';
export type { OrderTemplate } from './useOrders';
export { useEmployees, useCreateEmployee } from './useEmployees';
export type { EmployeeSummary } from './useEmployees';
export {
  useCoupons,
  useCreateCoupon,
  useToggleCoupon,
  useDeleteCoupon,
} from './useCoupons';
export type { CouponRecord, CreateCouponInput } from './useCoupons';
