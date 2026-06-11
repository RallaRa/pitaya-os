export function monthStartYMD() {
  const d = new Date(Date.now() + 9 * 3600_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

export function todayYMD() {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
}

export function currentYear() {
  return new Date(Date.now() + 9 * 3600_000).getUTCFullYear();
}

export function currentPeriod() {
  const d = new Date(Date.now() + 9 * 3600_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
