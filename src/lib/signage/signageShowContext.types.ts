export interface ItemVelocity {
  name: string;
  qty30d: number;
  amount30d: number;
}

export interface SignageRotationPlan {
  slotLabel: string;
  featuredHot: ItemVelocity | null;
  featuredSlow: ItemVelocity | null;
  alternateHot: ItemVelocity | null;
  alternateSlow: ItemVelocity | null;
}

export interface SignageInternalPlanning {
  planningNotes: string[];
}

export interface SignageShowContext {
  storeName: string;
  today: string;
  weather: string;
  hotItems: ItemVelocity[];
  slowItems: ItemVelocity[];
  rotation: SignageRotationPlan;
  activeCoupons: string[];
  customerEvents: string[];
  internal: SignageInternalPlanning;
}
