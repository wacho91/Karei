// Tipos y helpers compartidos del módulo de mesas

export interface Mesa {
  id: number;
  name?: string;
  number?: string | number;
  zone?: string;
  capacity?: number;
  status?: string;
  [clave: string]: any;
}

export interface Cuenta {
  orderId: number | null;
  items: any[];
  estado: string;
  total: number;
}

export interface LineaComanda {
  recipe_id: number;
  quantity: number;
  notes?: string | null;
}

export interface LineaBorrador {
  clave: string;
  recipe_id: number;
  nombre: string;
  precio: number;
  cantidad: number;
  notes: string;
}

export interface Receta {
  id: number;
  name?: string;
  price?: number;
  [clave: string]: any;
}

// ─── Helpers de mesa ───
export const nombreMesa = (m: Mesa) =>
  String(m?.name ?? m?.nombre ?? m?.number ?? m?.numero ?? `Mesa ${m?.id ?? ''}`);

export const zonaMesa = (m: Mesa) =>
  String(m?.zone ?? m?.zona ?? 'Sin zona');

export const capacidadMesa = (m: Mesa) =>
  Number(m?.capacity ?? m?.capacidad ?? m?.seats ?? m?.pax ?? 4);

export const mesaOcupada = (m: Mesa) => {
  const e = String(m?.status ?? m?.estado ?? '').toLowerCase();
  return e.includes('ocup') || e.includes('bus') || e.includes('open') || e.includes('activ');
};

// ─── Dinero e ítems ───
export const fmt = (n: number) => `$${Number(n || 0).toLocaleString('es-CO')}`;

export const precioItem = (it: any) =>
  Number(it?.price ?? it?.precio ?? it?.unit_price ?? 0);

export const cantidadItem = (it: any) =>
  Number(it?.quantity ?? it?.cantidad ?? it?.qty ?? 1);