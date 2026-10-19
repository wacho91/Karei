// Toda la comunicación con el backend POS.
// Las rutas se prueban en orden y la ganadora queda en caché.
import * as apiModule from './api';
import axiosLib from 'axios';
import type { Mesa, Cuenta, LineaComanda } from './tipos';

const api: any =
  (apiModule as any).default ??
  (apiModule as any).api ??
  (apiModule as any).axios ??
  axiosLib.create({ baseURL: '/api/v1' });

// ─── Utilidades de extracción ───
export function extraerLista(x: any): any[] {
  if (Array.isArray(x)) return x;
  const d = x?.data ?? x;
  if (Array.isArray(d)) return d;
  if (Array.isArray(d?.data)) return d.data;
  for (const k of ['items', 'mesas', 'tables', 'results', 'orders', 'recipes', 'productos', 'rows', 'list']) {
    if (Array.isArray(d?.[k])) return d[k];
  }
  return [];
}

/** Busca el primer array de objetos en la respuesta, a cualquier profundidad razonable. */
function primerArray(x: any, profundidad = 4): any[] {
  if (Array.isArray(x)) return x.filter(e => e && typeof e === 'object');
  if (!x || typeof x !== 'object' || profundidad === 0) return [];
  for (const v of Object.values(x)) {
    const r = primerArray(v, profundidad - 1);
    if (r.length) return r;
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
  return String(detalle || e?.message || 'sin respuesta del servidor').slice(0, 200);
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
      const bruta = r?.data ?? r;
      let lista = extraerLista(bruta);
      if (!lista.length) lista = primerArray(bruta); // por si la respuesta tiene una forma rara
      if (lista.length) {
        return lista
          .filter((m: any) => m && typeof m === 'object')
          .map((m: any) => ({ ...m, id: campo(m, 'id', 'table_id', 'mesa_id', 'id_mesa') }));
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
    : ['/pos/recipes', '/recipes', '/pos/products', '/products', '/recetas', '/pos/recetas', '/pos/menu', '/menu', '/pos/dishes', '/dishes'];
  for (const ruta of rutas) {
    try {
      const r = await api.get(ruta);
      const bruta = r?.data ?? r;
      let lista = extraerLista(bruta);
      if (!lista.length) lista = primerArray(bruta);
      if (lista.length) { rutaRecetas = ruta; return lista; }
    } catch { /* siguiente ruta */ }
  }
  return [];
}

// ─── Cuenta abierta de una mesa ───
const PLANTILLAS_CUENTA = [
  '/pos/tables/{id}/account',
  '/pos/tables/{id}/orders',
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

      const brutoItems = orden.items ?? orden.order_items ?? orden.lines ?? orden.detail ?? null;
      let items = extraerLista(brutoItems);
      if (!items.length) items = primerArray(brutoItems);

      const orderId = campo(orden, 'id', 'order_id', 'orderId');
      if (!orderId && items.length === 0) continue;

      plantillaCuenta = plantilla;
      return {
        orderId: orderId ? Number(orderId) : null,
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

const alIngles = (items: LineaComanda[]) => items;
const alEspanol = (items: LineaComanda[]) =>
  items.map(i => ({ receta_id: i.recipe_id, cantidad: i.quantity, notas: i.notes ?? null }));

const INTENTOS_CREAR: { ruta: string; cuerpo: (mesaId: number, items: LineaComanda[]) => any }[] = [
  { ruta: '/pos/tables/{id}/account', cuerpo: (_m, items) => ({ items: alIngles(items) }) },
  { ruta: '/pos/tables/{id}/account', cuerpo: (_m, items) => ({ items: alEspanol(items) }) },
  { ruta: '/pos/tables/{id}/orders', cuerpo: (_m, items) => ({ items: alIngles(items) }) },
  { ruta: '/pos/tables/{id}/orders', cuerpo: (_m, items) => ({ items: alEspanol(items) }) },
  { ruta: '/pos/tables/{id}/items',  cuerpo: (_m, items) => ({ items: alIngles(items) }) },
  { ruta: '/pos/tables/{id}/items',  cuerpo: (_m, items) => ({ items: alEspanol(items) }) },
  { ruta: '/pos/tables/{id}/order',  cuerpo: (_m, items) => ({ items: alIngles(items) }) },
  { ruta: '/pos/orders', cuerpo: (m, items) => ({ table_id: m, items: alIngles(items) }) },
  { ruta: '/pos/orders', cuerpo: (m, items) => ({ mesa_id: m, items: alIngles(items) }) },
  { ruta: '/pos/orders/create', cuerpo: (m, items) => ({ table_id: m, items: alIngles(items) }) },
];

export async function enviarComanda(
  mesaId: number,
  items: LineaComanda[],
  orderIdAbierta?: number | null,
): Promise<ResultadoEnvio> {
  // Caso 1: la mesa ya tiene cuenta abierta → agregamos los ítems nuevos
  if (orderIdAbierta) {
    const fallos: string[] = [];
    const intentosAgregar = [
      { ruta: `/pos/orders/${orderIdAbierta}/items`, cuerpo: { items: alIngles(items) } },
      { ruta: `/pos/orders/${orderIdAbierta}/items`, cuerpo: { items: alEspanol(items) } },
      { ruta: `/pos/tables/${mesaId}/items`, cuerpo: { items: alIngles(items) } },
      { ruta: `/pos/orders/${orderIdAbierta}/add-items`, cuerpo: { items: alIngles(items) } },
    ];
    for (const intento of intentosAgregar) {
      try {
        await api.post(intento.ruta, intento.cuerpo);
        return { ok: true, orderId: orderIdAbierta };
      } catch (e) {
        fallos.push(`POST ${intento.ruta} → ${textoError(e)}`);
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
    campo(item, 'recipe_id', 'recipeId', 'receta_id') ?? campo(item?.recipe ?? {}, 'id') ?? 0,
  );
  if (!recipeId) throw new Error('Este ítem no tiene receta asociada. Agrégalo desde el menú rápido.');
  const intentos = [
    { recipe_id: recipeId, quantity: 1, notes: item?.notes ?? null },
    { receta_id: recipeId, cantidad: 1, notas: item?.notes ?? null },
  ];
  let ultimo = '';
  for (const cuerpo of intentos) {
    try {
      await api.post(`/pos/orders/${orderId}/items`, { items: [cuerpo] });
      return;
    } catch (e) {
      ultimo = textoError(e);
    }
  }
  throw new Error(ultimo || 'El backend rechazó sumar el ítem.');
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

// ─── Diagnóstico v2: respuestas crudas + pruebas con mesa falsa ───
async function sondearHooks(): Promise<string> {
  const candidatos = ['../hooks/usePos', '../hooks/usePosHooks', '../hooks/pos', '../hooks/usePos.ts', '../hooks/usePos.tsx', '../hooks/usePos.jsx'];
  for (const ruta of candidatos) {
    try {
      const mod: any = await import(/* @vite-ignore */ ruta);
      const nombres = Object.keys(mod).filter(k => typeof mod[k] === 'function');
      if (nombres.length) return `${ruta} → exporta: ${nombres.join(', ')}`;
    } catch { /* siguiente candidato */ }
  }
  return 'no encontré archivo de hooks (no pasa nada, usamos rutas directas)';
}

export async function diagnosticoPos(_mesaId?: number | null): Promise<string[]> {
  const lineas: string[] = [];
  const FALSA = 99999999; // mesa que no existe: sirve para probar rutas SIN crear nada

  const probar = async (metodo: 'get' | 'post', url: string, cuerpo?: any): Promise<string> => {
    try {
      await (metodo === 'get' ? api.get(url) : api.post(url, cuerpo));
      return '200 OK';
    } catch (e: any) {
      return `${e?.response?.status ?? 'sin respuesta'} · ${textoError(e)}`;
    }
  };

  // 1) Mesas: respuesta CRUDA (revela la forma exacta y los nombres de campo)
  try {
    const r = await api.get('/pos/tables');
    const bruto = r?.data ?? r;
    const texto = typeof bruto === 'string' ? bruto : JSON.stringify(bruto);
    lineas.push(`[MESAS] GET /pos/tables → 200 · cruda: ${texto.slice(0, 360)}`);
  } catch (e: any) {
    lineas.push(`[MESAS] GET /pos/tables → ${textoError(e)}`);
  }
  const mesas = await traerMesas();
  lineas.push(`[MESAS] extraídas por mi código: ${mesas.length}`);
  if (mesas[0]) lineas.push(`[MESAS] primera con id: ${JSON.stringify(mesas[0]).slice(0, 220)}`);

  // 2) Dónde se crea una orden (mesa falsa → no se crea nada; si NO dice "404 Not Found", la ruta existe)
  lineas.push(`[CREAR] POST /pos/tables/${FALSA}/account → ${await probar('post', `/pos/tables/${FALSA}/account`, { items: [] })}`);
  lineas.push(`[CREAR] POST /pos/tables/${FALSA}/orders → ${await probar('post', `/pos/tables/${FALSA}/orders`, { items: [] })}`);
  lineas.push(`[CREAR] POST /pos/tables/${FALSA}/order → ${await probar('post', `/pos/tables/${FALSA}/order`, { items: [] })}`);
  lineas.push(`[CREAR] POST /pos/tables/${FALSA}/items → ${await probar('post', `/pos/tables/${FALSA}/items`, { items: [] })}`);
  lineas.push(`[CREAR] POST /pos/orders → ${await probar('post', '/pos/orders', { table_id: FALSA, items: [] })}`);

  // 3) Cómo se lee la cuenta y cómo se agregan ítems
  lineas.push(`[CUENTA] GET /pos/tables/${FALSA}/account → ${await probar('get', `/pos/tables/${FALSA}/account`)}`);
  lineas.push(`[CUENTA] GET /pos/orders?table_id=${FALSA} → ${await probar('get', `/pos/orders?table_id=${FALSA}`)}`);
  lineas.push(`[CUENTA] POST /pos/orders/${FALSA}/items → ${await probar('post', `/pos/orders/${FALSA}/items`, { items: [] })}`);

  // 4) Cocina y menú
  lineas.push(`[COCINA] GET /pos/kitchen/orders → ${await probar('get', '/pos/kitchen/orders')}`);
  lineas.push(`[COCINA] GET /kitchen/orders → ${await probar('get', '/kitchen/orders')}`);
  lineas.push(`[COCINA] GET /pos/cocina → ${await probar('get', '/pos/cocina')}`);
  lineas.push(`[MENU] GET /pos/products → ${await probar('get', '/pos/products')}`);
  lineas.push(`[MENU] GET /products → ${await probar('get', '/products')}`);
  lineas.push(`[MENU] GET /recetas → ${await probar('get', '/recetas')}`);

  // 5) Hooks del frontend (si existen, sé qué funciones exporta tu usePos)
  lineas.push(`[HOOKS] ${await sondearHooks()}`);
  return lineas;
}