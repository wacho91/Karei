/**
 * Tipos de dominio — espejo de los schemas Pydantic del backend.
 */

export type TableStatus = 'FREE' | 'OCCUPIED' | 'BILLING' | 'RESERVED';
export type OrderStatus =
  | 'DRAFT'
  | 'CONFIRMED'
  | 'IN_KITCHEN'
  | 'READY'
  | 'SERVED'
  | 'PAID'
  | 'CANCELLED';
export type OrderChannel = 'POS' | 'QR' | 'DELIVERY' | 'TAKEOUT';
export type PaymentMethod = 'CASH' | 'CARD' | 'TRANSFER' | 'NEQUI' | 'DAVIPLATA';

export interface Table {
  id: string;
  tenant_id: string;
  branch_id: string;
  code: string;
  name: string;
  capacity: number;
  zone: string | null;
  qr_code: string;
  status: TableStatus;
  is_active: boolean;
  created_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price_cents: number;
  tax_rate: number;
  discount_cents: number;
  total_cents: number;
  status: string;
  modifiers: Array<Record<string, unknown>>;
  notes: string | null;
  kds_station: string | null;
}

export interface Order {
  id: string;
  tenant_id: string;
  branch_id: string;
  session_id: string | null;
  order_number: string;
  channel: OrderChannel;
  status: OrderStatus;
  created_by_id: string;
  customer_name: string | null;
  notes: string | null;
  subtotal_cents: number;
  discount_cents: number;
  tax_cents: number;
  tip_cents: number;
  total_cents: number;
  currency: string;
  created_at: string;
  items: OrderItem[];
}

export interface SalesPoint {
  date: string;
  revenue_cents: number;
  orders: number;
}

export interface CategorySlice {
  name: string;
  value_cents: number;
  color: string;
}

export interface KpiSummary {
  revenue_cents: number;
  orders: number;
  avg_ticket_cents: number;
  food_cost_ratio: number;
  delta_revenue: number;
  delta_orders: number;
}
