/** POS·AI 품목명 fuzzy 매칭 */

export function normalizeItemName(name: string): string {
  return (name || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function itemNamesMatch(a: string, b: string): boolean {
  const na = normalizeItemName(a);
  const nb = normalizeItemName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length >= 4 && nb.length >= 4 && (na.includes(nb) || nb.includes(na))) return true;
  return false;
}

export function findItemInList<T extends { name?: string; item?: string }>(
  name: string,
  list: T[],
): T | undefined {
  return list.find(x => itemNamesMatch(name, String(x.name || x.item || '')));
}
