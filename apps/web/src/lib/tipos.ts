// Kārei · tipos y helpers defensivos del POS

export interface Mesa {
  id: number;
  nombre: string;
  zona: string;
  capacidad: number;
  estado: string;
  [k: string]: any;
}

export interface LineaCuenta {
  id: number;
  recipeId: number;
  nombre: string;
  precio: number;
  cantidad: number;
  notes: string;
  [k: string]: any;
}

export interface Cuenta {
  orderId: number | null;
  mesaId: number;
  items: LineaCuenta[];
  estado: string;
  total: number;
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
  nombre: string;
  precio: number;
  [k: string]: any;
}

type Obj = Record<string, any>;

/** Lee la primera clave que exista y no esté vacía. */
export const campo = (o: Obj | null | undefined, ...claves: string[]): any => {
  if (!o || typeof o !== 'object') return undefined;
  for (const c of claves) {
    const v = o[c];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
};

/** Number tolerante: si no es finito devuelve `def`. */
export const num = (v: any, def = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};

export const nombreMesa = (m: Obj): string =>
  String(campo(m, 'nombre', 'name', 'code', 'codigo') ?? 'Mesa');

export const zonaMesa = (m: Obj): string =>
  String(campo(m, 'zona', 'zone', 'area', 'sector') ?? 'Salón');

export const capacidadMesa = (m: Obj): number =>
  num(campo(m, 'capacidad', 'capacity', 'sillas', 'seats'), 4);

export const estadoMesa = (m: Obj): string =>
  String(campo(m, 'estado', 'status', 'state', 'mesa_status') ?? 'libre').toLowerCase();

export const precioItem = (i: Obj): number =>
  num(campo(i, 'precio', 'price', 'unit_price', 'precio_unitario', 'amount'));

export const cantidadItem = (i: Obj): number =>
  num(campo(i, 'cantidad', 'quantity', 'qty', 'cant'), 1);

export const fmt = (n: number): string => '$' + Math.round(n).toLocaleString('es-CO');