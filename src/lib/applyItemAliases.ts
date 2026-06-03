import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { inferUnitFromItem, postProcessInvoice } from '@/lib/purchasePostProcess';

export interface AliasEntry {
  alias: string;
  normalizedName: string;
  itemId?: string | null;
  supplierId?: string | null;
  supplierName?: string;
}

export interface AliasApplyResult {
  invoices: Record<string, unknown>[];
  applied: Array<{ from: string; to: string; supplierName?: string }>;
}

export async function loadStoreAliases(storeId: string): Promise<AliasEntry[]> {
  if (!storeId) return [];
  const snap = await adminDb.collection('item_aliases')
    .where('storeId', '==', storeId)
    .limit(500)
    .get();
  return snap.docs.map(d => d.data() as AliasEntry);
}

function supplierMatches(entry: AliasEntry, supplierName?: string): boolean {
  if (!entry.supplierName || !supplierName) return true;
  return entry.supplierName === supplierName;
}

export function findAliasMatch(
  name: string,
  aliases: AliasEntry[],
  supplierName?: string,
): AliasEntry | null {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const exact = aliases.find(a => a.alias === trimmed && supplierMatches(a, supplierName));
  if (exact) return exact;

  return aliases.find(a => {
    if (!supplierMatches(a, supplierName)) return false;
    return trimmed.includes(a.alias) || a.alias.includes(trimmed);
  }) || null;
}

export function applyAliasesToInvoices(
  invoices: Record<string, unknown>[],
  aliases: AliasEntry[],
): AliasApplyResult {
  if (!aliases.length) return { invoices, applied: [] };

  const applied: AliasApplyResult['applied'] = [];
  const mapped = invoices.map(inv => {
    const supplierName = String(inv.supplierName || '').trim();
    const items = Array.isArray(inv.items) ? inv.items : [];
    const nextItems = items.map((raw: Record<string, unknown>) => {
      const name = String(raw.name || '').trim();
      const match = findAliasMatch(name, aliases, supplierName);
      let item = raw;
      if (match && match.normalizedName !== name) {
        applied.push({ from: name, to: match.normalizedName, supplierName });
        item = { ...raw, name: match.normalizedName, _aliasApplied: name };
      }
      const normalizedName = String(item.name || '').trim();
      const category = String(item.category || '');
      const unit = String(item.unit || '').trim() || inferUnitFromItem(normalizedName, category);
      return { ...item, unit };
    });
    return postProcessInvoice({ ...inv, items: nextItems });
  });

  return { invoices: mapped, applied };
}

export async function learnAliasesFromCorrection(
  storeId: string,
  supplierName: string,
  originalResult: Record<string, unknown>,
  correctedResult: Record<string, unknown>,
): Promise<number> {
  const origItems = Array.isArray(originalResult.items) ? originalResult.items : [];
  const corrItems = Array.isArray(correctedResult.items) ? correctedResult.items : [];
  const count = Math.min(origItems.length, corrItems.length);
  let saved = 0;

  for (let i = 0; i < count; i++) {
    const from = String((origItems[i] as { name?: string })?.name || '').trim();
    const to = String((corrItems[i] as { name?: string })?.name || '').trim();
    if (!from || !to || from === to) continue;

    const key = `${storeId}_${from}`;
    await adminDb.collection('item_aliases').doc(key).set({
      alias: from,
      normalizedName: to,
      storeId,
      supplierName: supplierName || '',
      confidence: 100,
      source: 'ocr_correction',
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    saved++;
  }

  return saved;
}
