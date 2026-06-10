import { adminDb } from '@/lib/firebase/admin';
import {
  applySuppliersToInvoices,
  resolveInvoiceSupplier,
  type InvoiceSupplierInput,
  type SupplierMasterEntry,
} from '@/lib/purchaseSupplierResolve';

export async function loadStoreSuppliers(storeId: string): Promise<SupplierMasterEntry[]> {
  if (!storeId) return [];
  const snap = await adminDb.collection('suppliers').doc(storeId).collection('list')
    .orderBy('supplierName')
    .get();
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<SupplierMasterEntry, 'id'>) }));
}

export { applySuppliersToInvoices, resolveInvoiceSupplier, type InvoiceSupplierInput, type SupplierMasterEntry };
