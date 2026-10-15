/** Tipos del POS — espejo exacto de lo que devuelve el backend. */

export type MesaStatus = 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'CLEANING' | 'OUT_OF_SERVICE';

export type Mesa = {
  id: string;
  code: string;
  name: string;
  capacity: number;
  zone: string | null;
  status: MesaStatus;
  session_id: string | null;
  order_id: string | null;
  order_number: string | null;
  open_total: number;
  items_count: number;
};

export type MesaInput = {
  code: string;
  name: string;
  capacity: number;
  zone: string | null;
};

export type PedidoItem = {
  id: string;
  recipe_id: string;
  recipe_name: string;
  quantity: number;
  unit_price: number;
  notes: string | null;
};

export type Pedido = {
  id: string;
  order_number: string;
  status: string; // CONFIRMED -> SENT_TO_KITCHEN -> ... -> PAID
  table_id: string;
  session_id: string | null;
  subtotal: number;
  tip: number;
  total: number;
  items: PedidoItem[];
};

export type RecetaMenu = {
  id: string;
  name: string;
  price: number;
  is_active: boolean;
  cost: number;
  margin: number;
};

export type CheckoutResultado = {
  order_number: string;
  subtotal: number;
  tip: number;
  total: number;
  method: string;
};