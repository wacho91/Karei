/** Tipos compartidos del módulo de inventario/recetas. */

export type Ingrediente = {
  id: string;
  name: string;
  purchase_unit: string;
  purchase_price: number;
  content_qty: number;
  usage_unit: string;
  cost_per_unit: number;
  stock: number;
  min_stock: number;
};

export type IngredienteInput = {
  name: string;
  purchase_unit: string;
  purchase_price: number;
  content_qty: number;
  usage_unit: string;
  stock: number;
  min_stock: number;
};

export type CompraInput = {
  quantity: number;
  purchase_price: number | null;
};

export type Receta = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  is_active: boolean;
  items: { id: string; ingredient_id: string; quantity: number }[];
  cost: number;
  margin: number;
};

export type RecetaInput = {
  name: string;
  description: string | null;
  price: number;
  items: { ingredient_id: string; quantity: number }[];
};