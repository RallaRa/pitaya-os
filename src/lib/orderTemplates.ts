export interface OrderTemplateLine {
  itemName: string;
  qty: number;
  unit: string;
}

export interface OrderTemplateSchedule {
  dow: number;
  hour: number;
}

export interface OrderTemplate {
  id?: string;
  storeId: string;
  name: string;
  supplierId: string;
  supplierName: string;
  lines: OrderTemplateLine[];
  schedule?: OrderTemplateSchedule | null;
  active: boolean;
}
