import { adminDb } from '@/lib/firebase/admin';

export const DEFAULT_WIDGET_PERMISSIONS = {
  news:               { master: true, admin: true,  user: true,  staff: false },
  weather:            { master: true, admin: true,  user: true,  staff: true  },
  weekly_analysis:    { master: true, admin: true,  user: false, staff: false },
  yesterday_analysis: { master: true, admin: true,  user: true,  staff: false },
  quick_menu:         { master: true, admin: true,  user: true,  staff: true  },
  ai_insight:         { master: true, admin: true,  user: true,  staff: false },
  total_partner:      { master: true, admin: true,  user: true,  staff: false },
  sales_prediction:   { master: true, admin: true,  user: true,  staff: false },
  today_sales:        { master: true, admin: true,  user: true,  staff: true  },
  sales_compare:      { master: true, admin: true,  user: true,  staff: false },
  customer_visit:     { master: true, admin: true,  user: true,  staff: false },
  churn_risk:         { master: true, admin: true,  user: true,  staff: false },
  sales_heatmap:      { master: true, admin: true,  user: true,  staff: false },
  dow_profitability:  { master: true, admin: true,  user: true,  staff: false },
  cost_ratio:         { master: true, admin: true,  user: true,  staff: false },
  margin_ranking:     { master: true, admin: true,  user: true,  staff: false },
  sales_category:     { master: true, admin: true,  user: true,  staff: true  },
  time_slot_aov:      { master: true, admin: true,  user: true,  staff: true  },
};

export async function getDashboardWidgetPermissions(storeId: string) {
  try {
    const doc = await adminDb.collection('dashboard_widget_permissions').doc(storeId).get();
    const widgets = doc.exists
      ? { ...DEFAULT_WIDGET_PERMISSIONS, ...doc.data()?.widgets }
      : DEFAULT_WIDGET_PERMISSIONS;
    return { widgets };
  } catch {
    return { widgets: DEFAULT_WIDGET_PERMISSIONS };
  }
}
