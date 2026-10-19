// Toda la comunicación con el backend POS.
// Las rutas se prueban en orden y la ganadora queda en caché para no repetir 404.
import * as apiModule from '../api';
import axiosLib from 'axios';
import type { Mesa, Cuenta, LineaComanda } from './tipos';

const api: any =
  (apiModule as any).default ??
  (apiModule as any).api ??
  (apiModule as any).axios ??
  axiosLib.create({ baseURL: '/api/v1' });

// ─── Utilidades ───
export function extraerLista(x: any): any[] {
  if (Array.isArray(x)) return x;
  const d = x?.data ?? x;
  if (Array.isArray(d)) return d;
  if (Array.isArray(d?.data)) return d.data;
  for (const k of ['items', 'mesas', 'tables', 'results', 'orders', 'recipes', 'productos']) {
    if (Array.isArray(d?.[k])) return d[k];
  }
  return [];
}

function campo(obj: any, ...claves: string[]): any {
  for (const c of claves) {
    const v = obj?.[c];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

export function textoError(e: any): string {
  const d = e?.response?.data;
  const detalle = typeof d === 'string' ? d : d?.detail ?? d?.message ?? '';
  return String(detalle || e?.message || 'sin respuesta del servidor').slice(0, 160);
}

// ─── Cachés de rutas ganadoras ───
let rutaRecetas: string | null = null;
let plantillaCuenta: string | null = null;
let plantillaCrear: string | null = null;

// ─── Mesas ───
export async function traerMesas(): Promise<Mesa[]> {
  const rutas = ['/pos/tables', '/tables'];
  for (const ruta of rutas) {
    try {
      const r = await api.get(ruta);
      const lista = extraerLista(r?.data ?? r);
      if (lista.length) {
        return lista
          .filter((m: any) => m && typeof m === 'object')
          .map((m: any) => ({ ...m, id: Number(campo(m, 'id', 'table_id', 'mesa_id') ?? 0) }))
          .filter((m: any) => Number.isFinite(m.id) && m.id > 0);
      }
    } catch { /* siguiente ruta */ }
  }
  return [];
}

export async function crearMesa(datos: { nombre: string; zona: string; capacidad: number }): Promise<void> {
  const n = datos.nombre;
  const cap = datos.capacidad;
  const cuerpo = {
    name: n, nombre: n, number: n, numero: n,
    zone: datos.zona, zona: datos.zona,
    capacity: cap, capacidad: cap, seats: cap, pax: cap,
    status: 'libre',
  };
  await api.post('/pos/tables', cuerpo);
}

export async function crearMesasDemo(): Promise<void> {
  const demo = [
    ...['M1', 'M2', 'M3', 'M4', 'M5', 'M6'].map(nombre => ({ nombre, zona: 'Salón', capacidad: 4 })),
    ...['T1', 'T2', 'T3', 'T4'].map(nombre => ({ nombre, zona: 'Terraza', capacidad: 8 })),
  ];
  for (const m of demo) {
    try { await crearMesa(m); } catch { /* ya existe, seguimos */ }
  }
}

export async function eliminarMesa(mesaId: number): Promise<void> {
  try { await api.delete(`/pos/tables/${mesaId}`); return; } catch { /* siguiente */ }
  try { await api.post(`/pos/tables/${mesaId}/delete`, {}); return; } catch { /* siguiente */ }
  throw new Error('El backend no aceptó eliminar la mesa.');
}

// ─── Recetas (menú rápido) ───
export async function traerRecetas(): Promise<any[]> {
  const rutas = rutaRecetas
    ? [rutaRecetas]
    : ['/pos/recipes', '/recipes', '/pos/menu', '/menu', '/pos/products', '/products'];
  for (const ruta of rutas) {
    try {
      const r = await api.get(ruta);
      const lista = extraerLista(r?.data ?? r);
      if (lista.length) { rutaRecetas = ruta; return lista; }
    } catch { /* siguiente ruta */ }
  }
  return [];
}

// ─── Cuenta abierta de una mesa ───
const PLANTILLAS_CUENTA = [
  '/pos/tables/{id}/account',
  '/pos/tables/{id}/order',
  '/pos/tables/{id}/current-order',
  '/pos/orders?table_id={id}',
  '/pos/current-order?table_id={id}',
  '/order?table_id={id}',
];

export async function traerCuenta(mesaId: number): Promise<Cuenta | null> {
  const plantillas = plantillaCuenta
    ? [plantillaCuenta, ...PLANTILLAS_CUENTA]
    : PLANTILLAS_CUENTA;

  for (const plantilla of plantillas) {
    try {
      const r = await api.get(plantilla.replace('{id}', String(mesaId)));
      const d: any = r?.data ?? r;
      let orden = d?.order ?? d?.data?.order ?? d;
      if (Array.isArray(orden)) orden = orden[0];
      if (!orden || typeof orden !== 'object') continue;

      const items = extraerLista(orden.items ?? orden.order_items ?? orden.lines ?? orden.detail ?? []);
      const orderId = Number(campo(orden, 'id', 'order_id', 'orderId') ?? 0);
      if (!orderId && items.length === 0) continue;

      plantillaCuenta = plantilla;
      return {
        orderId: orderId || null,
        items,
        estado: String(campo(orden, 'status', 'estado') ?? ''),
        total: Number(campo(orden, 'total', 'total_amount', 'amount') ?? 0),
      };
    } catch { /* 404 → siguiente plantilla */ }
  }
  return null;
}

// ─── Enviar comanda a cocina ───
export interface ResultadoEnvio {
  ok: boolean;
  orderId: number | null;
  detalle?: string[];
}

const INTENTOS_CREAR: { ruta: string; cuerpo: (mesaId: number, items: LineaComanda[]) => any }[] = [
  { ruta: '/pos/orders', cuerpo: (m, items) => ({ table_id: m, items }) },
  { ruta: '/pos/orders', cuerpo: (m, items) => ({ table_id: m, mesa_id: m, items }) },
  { ruta: '/pos/tables/{id}/orders', cuerpo: (_m, items) => ({ items }) },
  { ruta: '/pos/tables/{id}/order', cuerpo: (_m, items) => ({ items }) },
  { ruta: '/pos/tables/{id}/account', cuerpo: (_m, items) => ({ items }) },
];

export async function enviarComanda(
  mesaId: number,
  items: LineaComanda[],
  orderIdAbierta?: number | null,
): Promise<ResultadoEnvio> {
  // Caso 1: la mesa ya tiene cuenta abierta → agregamos los ítems nuevos
  if (orderIdAbierta) {
    const fallos: string[] = [];
    for (const ruta of [`/pos/orders/${orderIdAbierta}/items`, `/pos/orders/${orderIdAbierta}/add-items`]) {
      try {
        await api.post(ruta, { items });
        return { ok: true, orderId: orderIdAbierta };
      } catch (e) {
        fallos.push(`POST ${ruta} → ${textoError(e)}`);
      }
    }
    return { ok: false, detalle: fallos };
  }

  // Caso 2: mesa sin cuenta → creamos la orden con los ítems
  const fallos: string[] = [];
  const intentos = plantillaCrear
    ? [
        ...INTENTOS_CREAR.filter(i => i.ruta === plantillaCrear),
        ...INTENTOS_CREAR.filter(i => i.ruta !== plantillaCrear),
      ]
    : INTENTOS_CREAR;

  for (const intento of intentos) {
    const url = intento.ruta.replace('{id}', String(mesaId));
    try {
      const r = await api.post(url, intento.cuerpo(mesaId, items));
      const d: any = r?.data ?? r;
      const nuevoId = Number(
        campo(d, 'id', 'order_id') ??
        campo(d?.order ?? {}, 'id', 'order_id') ??
        campo(d?.data ?? {}, 'id', 'order_id') ??
        0,
      );
      plantillaCrear = intento.ruta;
      return { ok: true, orderId: nuevoId > 0 ? nuevoId : null };
    } catch (e) {
      fallos.push(`POST ${url} → ${textoError(e)}`);
    }
  }
  return { ok: false, detalle: fallos };
}

// ─── Sumar / reducir ítems de la cuenta abierta ───
export async function sumarItemCuenta(orderId: number, item: any): Promise<void> {
  const recipeId = Number(
    campo(item, 'recipe_id', 'recipeId') ?? campo(item?.recipe ?? {}, 'id') ?? 0,
  );
  if (!recipeId) throw new Error('Este ítem no tiene receta asociada. Agrégalo desde el menú rápido.');
  await api.post(`/pos/orders/${orderId}/items`, {
    items: [{ recipe_id: recipeId, quantity: 1, notes: item?.notes ?? null }],
  });
}

export async function restarItemCuenta(orderId: number, item: any): Promise<void> {
  const itemId = Number(campo(item, 'id', 'item_id', 'order_item_id') ?? 0);
  const cantidad = Number(campo(item, 'quantity', 'cantidad', 'qty') ?? 1);

  if (itemId) {
    try { await api.delete(`/pos/orders/${orderId}/items/${itemId}`); return; } catch { /* siguiente */ }
    try {
      await api.patch(`/pos/orders/${orderId}/items/${itemId}`, { quantity: Math.max(0, cantidad - 1) });
      return;
    } catch { /* siguiente */ }
  }
  throw new Error('El backend no aceptó reducir este ítem (DELETE y PATCH fallaron).');
}

// ─── Cobro ───
export async function cobrarCuenta(orderId: number, propinaPct: number, metodo: string): Promise<void> {
  const cuerpo = {
    tip_percent: propinaPct, tip: propinaPct, propina: propinaPct,
    payment_method: metodo, method: metodo, metodo_pago: metodo,
  };
  const rutas = [`/pos/orders/${orderId}/checkout`, `/pos/orders/${orderId}/close`, `/pos/orders/${orderId}/pay`];
  for (const ruta of rutas) {
    try { await api.post(ruta, cuerpo); return; } catch { /* siguiente */ }
  }
  throw new Error('Ninguna ruta de cobro respondió (checkout / close / pay).');
}

// ─── Diagnóstico de rutas (el botón «Diagnóstico») ───
export async function diagnosticoPos(mesaId?: number | null): Promise<string[]> {
  const lineas: string[] = [];
  const probar = async (metodo: 'get' | 'post', url: string, cuerpo?: any): Promise<string> => {
    try {
      await (metodo === 'get' ? api.get(url) : api.post(url, cuerpo));
      return '200 OK';
    } catch (e: any) {
      return `${e?.response?.status ?? 'sin respuesta'} · ${textoError(e)}`;
    }
  };

  lineas.push(`GET /pos/tables → ${await probar('get', '/pos/tables')}`);
  lineas.push(`GET /recipes → ${await probar('get', '/recipes')}`);
  lineas.push(`GET /pos/recipes → ${await probar('get', '/pos/recipes')}`);
  lineas.push(`GET /kitchen → ${await probar('get', '/kitchen')}`);
  lineas.push(`GET /pos/kitchen → ${await probar('get', '/pos/kitchen')}`);
  lineas.push(`GET /pos/orders → ${await probar('get', '/pos/orders')}`);

  const mesas = await traerMesas();
  lineas.push(`Mesas cargadas: ${mesas.length}`);
  if (mesas[0]) lineas.push(`Primera mesa (cruda): ${JSON.stringify(mesas[0]).slice(0, 220)}`);

  if (mesaId) {
    lineas.push(`GET /pos/tables/${mesaId}/account → ${await probar('get', `/pos/tables/${mesaId}/account`)}`);
    lineas.push(`GET /pos/orders?table_id=${mesaId} → ${await probar('get', `/pos/orders?table_id=${mesaId}`)}`);
  }
  // Prueba segura de creación: usa una mesa inexistente, así no crea nada.
  lineas.push(`POST /pos/orders (mesa falsa) → ${await probar('post', '/pos/orders', { table_id: 99999999, items: [] })}`);
  return lineas;
}