export { STALE_TIME, makeQueryClient } from './queryClient';
export { queryKeys } from './keys';
export { fetchAuthJson, QueryFetchError } from './fetchJson';
export { useCustomers, useRegisterCustomer, fetchCustomersList, buildCustomersSearchParams } from './useCustomers';
export type { CustomerListParams, CustomersListResult } from './useCustomers';
export { useSalesData } from './useSalesData';
export type { TodaySalesPayload } from './useSalesData';
export { useProducts, useUpdateProduct, useDeleteProduct, useCreateProduct } from './useProducts';
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
