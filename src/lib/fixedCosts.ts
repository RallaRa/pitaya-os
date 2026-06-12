export interface FixedCosts {
  rent: number;
  labor: number;
  admin: number;
  other: number;
}

export const DEFAULT_FIXED_COSTS: FixedCosts = {
  rent: 2_750_000,
  labor: 3_100_000,
  admin: 1_000_000,
  other: 2_000_000,
};

export function sumFixedCosts(costs: FixedCosts): number {
  return costs.rent + costs.labor + costs.admin + costs.other;
}

export function parseFixedCosts(raw: unknown): FixedCosts {
  const r = (raw || {}) as Partial<FixedCosts>;
  return {
    rent: Number(r.rent ?? DEFAULT_FIXED_COSTS.rent) || 0,
    labor: Number(r.labor ?? DEFAULT_FIXED_COSTS.labor) || 0,
    admin: Number(r.admin ?? DEFAULT_FIXED_COSTS.admin) || 0,
    other: Number(r.other ?? DEFAULT_FIXED_COSTS.other) || 0,
  };
}
