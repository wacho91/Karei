// Comunicación con el backend POS. Las rutas se descubren solas (lib/openapi.ts).
import * as apiModule from './api';
import axiosLib from 'axios';
import { cargarEspec, buscarRuta, armar, esquemaDeCuerpo, escaparRegex } from './openapi';
import { alertaError } from './alertas';
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
  for (const k of ['items', 'mesas', 'tables', 'results', 'orders', 'recipes', 'productos', 'rows', 'list']) {
    if (Array.isArray(d?.[k])) return d[k];
  }
  return [];
}

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

/** Errores SIEMPRE legibles (adiós [object Object]). */
export function textoError(e: any): string {
  const d = e?.response?.data;
  let detalle: any = typeof d === 'string' ? d : d?.detail ?? d?.message ?? d;
  if (detalle && typeof detalle === 'object') detalle = JSON.stringify(detalle);
  return String(detalle || e?.message || 'sin respuesta del servidor').slice(0, 300);
}

// ─── Construcción de bodies según lo que el backend pide de verdad ───
const EQUIVALENCIAS: Record<string, string[]> = {
  name: ['nombre'], nombre: ['nombre'], number: ['numero', 'nombre'], numero: ['numero', 'nombre'],
  nro: ['numero', 'nombre'], zone: ['zona'], zona: ['zona'],
  capacity: ['capacidad'], capacidad: ['capacidad'], seats: ['capacidad'], pax: ['capacidad'], sillas: ['capacidad'],
  status: ['estado'], estado: ['estado'],
  table_id: ['mesaId'], mesa_id: ['mesaId'],
  recipe_id: ['recipeId'], receta_id: ['recipeId'],
  quantity: ['cantidad'], cantidad: ['cantidad'], qty: ['cantidad'],
  notes: ['notes'], nota: ['notes'], notas: ['notes'],
};

function cuerpoDesdeEsquema(esquema: any, datos: any): any {
  if (!esquema?.properties) return { ...datos };
  const cuerpo: any = {};
  for (const [nombre, p] of Object.entries<any>(esquema.properties)) {
    const fuente = (EQUIVALENCIAS[nombre] ?? []).find(k => datos?.[k] !== undefined);
    if (fuente !== undefined) {
      let valor = datos[fuente];
      if ((p?.type === 'integer' || p?.type === 'number') && typeof valor === 'string') {
        valor = Number(String(valor).replace(/\D/g, '') || 0);
      }
      if (p?.type === 'string' && typeof valor !== 'string') valor = String(valor);
      cuerpo[nombre] = valor;
    } else if ((esquema.required ?? []).includes(nombre)) {
      cuerpo[nombre] = p?.type === 'integer' || p?.type === 'number' ? 0 : p?.type === 'boolean' ? false : '';
    }
  }
  for (const k of ['status', 'estado']) if (cuerpo[k] === '') cuerpo[k] = 'libre';
  return cuerpo;
}

async function cuerpoDeItems(propItems: any, items: LineaComanda[]): Promise<any[]> {
  const e = await cargarEspec();
  const ref = propItems?.items?.$ref;
  const props = ref ? e.esquemas[ref.split('/').pop()]?.properties : null;
  if (!props) return items.map(i => ({ recipe_id: i.recipe_id, quantity: i.quantity, notes: i.notes ?? null }));
  const elegir = (claves: string[]) => claves.find(c => props[c]);
  const cReceta = elegir(['recipe_id', 'receta_id', 'recipeId', 'recipe']);
  const cCant = elegir(['quantity', 'cantidad', 'qty']);
  const cNotas = elegir(['notes', 'nota', 'notas', 'note']);
  return items.map(i => ({
    ...(cReceta ? { [cReceta]: i.recipe_id } : {}),
    ...(cCant ? { [cCant]: i.quantity } : {}),
    ...(cNotas ? { [cNotas]: i.notes ?? null } : {}),
  }));
}

// ─── Mesas ───
export async function traerMesas(): Promise<Mesa[]> {
  const especifica = await buscarRuta('GET', /\/(tables|mesas)\/?$/);
  const rutas = [...new Set([especifica ?? '/pos/tables', '/pos/tables', '/tables'])];
  for (const ruta of rutas) {
    try {
      const r = await api.get(ruta);
      const bruta = r?.data ?? r;
      let lista = extraerLista(bruta);
      if (!lista.length) lista = primerArray(bruta);
      if (lista.length) {
        return lista
          .filter((m: any) => m && typeof m === 'object')
          .map((m: any) => ({ ...m, id: campo(m, 'id', 'table_id', 'mesa_id', 'id_mesa') }));
      }
    } catch { /* siguiente ruta */ }
  }
  return [];
}

export async function crearMesa(datos: { nombre: string; zona: string; capacidad: number; numero?: number }): Promise<void> {
  const ruta = (await buscarRuta('POST', /\/(tables|mesas)\/?$/)) ?? '/pos/tables';
  const esquema = await esquemaDeCuerpo('post', new RegExp(escaparRegex(ruta) + '/?$'));
  await api.post(ruta, cuerpoDesdeEsquema(esquema, datos));
}

export async function crearMesasDemo(): Promise<void> {
  const demo = [
    ...[1, 2, 3, 4, 5, 6].map(n => ({ nombre: `M${n}`, numero: n, zona: 'Salón', capacidad: 4 })),
    ...[1, 2, 3, 4].map(n => ({ nombre: `T${n}`, numero: 20 + n, zona: 'Terraza', capacidad: 8 })),
  ];
  let creadas = 0;
  let primerError = '';
  for (const m of demo) {
    try { await crearMesa(m); creadas++; }
    catch (e) { if (!primerError) primerError = textoError(e); }
  }
  if (creadas === 0) {
    alertaError('No se pudo crear ninguna mesa', primerError || 'El backend rechazó la creación.');
    throw new Error(primerError || 'creación rechazada');
  }
}

export async function eliminarMesa(mesaId: number): Promise<void> {
  const plantilla = await buscarRuta('DELETE', /(table|mesa)/);
  if (plantilla) {
    try { await api.delete(armar(plantilla, mesaId)); return; } catch { /* siguiente */ }
  }
  try { await api.delete(`/pos/tables/${mesaId}`); return; } catch { /* siguiente */ }
  try { await api.post(`/pos/tables/${mesaId}/delete`, {}); return; } catch { /* siguiente */ }
  throw new Error('El backend no aceptó eliminar la mesa.');
}

// ─── Recetas (menú rápido) ───
export async function traerRecetas(): Promise<any[]> {
  const especificas = [
    await buscarRuta('GET', /\/(recipes|recetas)\/?$/),
    await buscarRuta('GET', /\/(products|productos|dishes|platillos)\/?$/),
    await buscarRuta('GET', /\/(menu|menus)\/?$/),
  ].filter(Boolean) as string[];
  const rutas = [...new Set([...especificas, '/pos/recipes', '/recipes', '/pos/products', '/products', '/recetas'])];
  for (const ruta of rutas) {
    try {
      const r = await api.get(ruta);
      const bruta = r?.data ?? r;
      let lista = extraerLista(bruta);
      if (!lista.length) lista = primerArray(bruta);
      if (lista.length) return lista;
    } catch { /* siguiente ruta */ }
  }
  return [];
}

// ─── Cuenta abierta de una mesa ───
const PLANTILLAS_CUENTA = [
  '/pos/tables/{id}/account', '/pos/tables/{id}/orders', '/pos/tables/{id}/order',
  '/pos/orders?table_id={id}', '/pos/current-order?table_id={id}',
];

async function rutasCuenta(): Promise<string[]> {
  const e = await cargarEspec();
  if (!e.cargada) return PLANTILLAS_CUENTA;
  const halladas: string[] = [];
  for (const r of e.rutas) {
    if (r.metodo !== 'GET' || !r.ruta.includes('{')) continue;
    const t = r.ruta.toLowerCase();
    if ((t.includes('table') || t.includes('mesa')) && /(account|order|comanda|pedido|cuenta)/.test(t)) {
      halladas.push(r.ruta);
    }
  }
  for (const r of e.rutas) {
    if (r.metodo !== 'GET' || r.ruta.includes('{')) continue;
    const t = r.ruta.toLowerCase();
    if (/(order|pedido|comanda)/.test(t) && !/(kitchen|cocina)/.test(t)) {
      halladas.push(`${r.ruta}?table_id={id}`);
    }
  }
  return halladas.length ? [...new Set(halladas)] : PLANTILLAS_CUENTA;
}

export async function traerCuenta(mesaId: number): Promise<Cuenta | null> {
  for (const plantilla of await rutasCuenta()) {
    try {
      const r = await api.get(armar(plantilla, mesaId));
      const d: any = r?.data ?? r;
      let orden = d?.order ?? d?.data?.order ?? d;
      if (Array.isArray(orden)) orden = orden[0];
      if (!orden || typeof orden !== 'object') continue;

      const bruto = orden.items ?? orden.order_items ?? orden.lines ?? orden.detail ?? null;
      let items = extraerLista(bruto);
      if (!items.length) items = primerArray(bruto);

      const orderId = campo(orden, 'id', 'order_id', 'orderId');
      if (!orderId && items.length === 0) continue;

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

async function rutaAgregarItems(): Promise<string | null> {
  const e = await cargarEspec();
  if (!e.cargada) return null;
  const ok = e.rutas.filter(r =>
    r.metodo === 'POST' && r.ruta.includes('{') &&
    /item|linea|detalle/i.test(r.ruta) &&
    /(order|pedido|comanda|table|mesa|cuenta|account)/i.test(r.ruta),
  );
  return ok[0]?.ruta ?? null;
}

async function rutaCrear(): Promise<string | null> {
  const e = await cargarEspec();
  if (!e.cargada) return null;
  const puntaje = (ruta: string): number => {
    const t = ruta.toLowerCase();
    let p = 0;
    if (/(table|mesa)/.test(t) && /(account|order|comanda|pedido|cuenta)/.test(t)) p += 6;
    if (/(order|pedido|comanda)/.test(t)) p += 4;
    if (t.includes('{')) p += 2;
    if (/(kitchen|cocina|recipe|receta|product|menu|platillo|user|auth|login|token)/.test(t)) p -= 15;
    if (/(checkout|close|pay|cobro|pago|factur|advance|status)/.test(t)) p -= 15;
    if (/\/(tables|mesas)\/?$/.test(t)) p -= 8;
    return p;
  };
  const mejores = e.rutas
    .filter(r => r.metodo === 'POST')
    .map(r => ({ ruta: r.ruta, p: puntaje(r.ruta) }))
    .filter(r => r.p > 0)
    .sort((a, b) => b.p - a.p);

  for (const c of mejores) {
    const esq = await esquemaDeCuerpo('post', new RegExp('^' + escaparRegex(c.ruta) + '/?$'));
    const props = esq?.properties ? Object.keys(esq.properties) : [];
    if (!props.length || props.some(k => /item|table|mesa/i.test(k))) return c.ruta;
  }
  return mejores[0]?.ruta ?? null;
}

export async function enviarComanda(
  mesaId: number,
  items: LineaComanda[],
  orderIdAbierta?: number | null,
): Promise<ResultadoEnvio> {
  const fallos: string[] = [];
  const enIngles = items.map(x => ({ recipe_id: x.recipe_id, quantity: x.quantity, notes: x.notes ?? null }));
  const enEspanol = items.map(x => ({ receta_id: x.recipe_id, cantidad: x.quantity, notas: x.notes ?? null }));

  // Caso 1: cuenta abierta → agregamos los ítems nuevos
  if (orderIdAbierta) {
    const plantilla = await rutaAgregarItems();
    const urls = new Set<string>([
      ...(plantilla ? [armar(plantilla, orderIdAbierta), armar(plantilla, mesaId)] : []),
      `/pos/orders/${orderIdAbierta}/items`,
      `/pos/tables/${mesaId}/items`,
    ]);
    for (const url of urls) {
      for (const cuerpo of [{ items: enIngles }, { items: enEspanol }]) {
        try {
          await api.post(url, cuerpo);
          return { ok: true, orderId: orderIdAbierta };
        } catch (e) {
          fallos.push(`POST ${url} → ${textoError(e)}`);
        }
      }
    }
    return { ok: false, detalle: fallos };
  }

  // Caso 2: mesa sin cuenta → creamos la orden
  const ruta = await rutaCrear();
  const intentosClasicos: Array<[string, any]> = [
    [`/pos/tables/${mesaId}/account`, { items: enIngles }],
    [`/pos/tables/${mesaId}/orders`, { items: enIngles }],
    ['/pos/orders', { table_id: mesaId, items: enIngles }],
    ['/pos/orders', { mesa_id: mesaId, items: enEspanol }],
  ];
  if (!ruta) {
    for (const [url, cuerpo] of intentosClasicos) {
      try {
        const r = await api.post(url, cuerpo);
        const d: any = r?.data ?? r;
        const nuevoId = Number(campo(d, 'id', 'order_id') ?? campo(d?.order ?? {}, 'id') ?? 0);
        return { ok: true, orderId: nuevoId > 0 ? nuevoId : null };
      } catch (e) {
        fallos.push(`POST ${url} → ${textoError(e)}`);
      }
    }
    return { ok: false, detalle: fallos };
  }

  const rutaFinal = ruta.includes('{') ? armar(ruta, mesaId) : ruta;
  const esquema = await esquemaDeCuerpo('post', new RegExp('^' + escaparRegex(ruta) + '/?$'));
  let cuerpo: any = cuerpoDesdeEsquema(esquema, { mesaId });
  if (esquema?.properties?.items) {
    cuerpo.items = await cuerpoDeItems(esquema.properties.items, items);
  } else if (!esquema?.properties) {
    cuerpo.items = enIngles;
  }
  try {
    const r = await api.post(rutaFinal, cuerpo);
    const d: any = r?.data ?? r;
    const nuevoId = Number(
      campo(d, 'id', 'order_id', 'orderId') ??
      campo(d?.order ?? {}, 'id', 'order_id') ??
      campo(d?.data ?? {}, 'id', 'order_id') ?? 0,
    );
    if (nuevoId > 0 && cuerpo.items === undefined) {
      const plantilla = await rutaAgregarItems();
      if (plantilla) {
        try { await api.post(armar(plantilla, nuevoId), { items: enIngles }); } catch { /* lo intentó */ }
      }
    }
    return { ok: true, orderId: nuevoId > 0 ? nuevoId : null };
  } catch (e) {
    fallos.push(`POST ${rutaFinal} → ${textoError(e)}`);
    for (const [url, alt] of intentosClasicos) {
      try {
        const r = await api.post(url, alt);
        const d: any = r?.data ?? r;
        const nuevoId = Number(campo(d, 'id', 'order_id') ?? campo(d?.order ?? {}, 'id') ?? 0);
        return { ok: true, orderId: nuevoId > 0 ? nuevoId : null };
      } catch (e2) {
        fallos.push(`POST ${url} → ${textoError(e2)}`);
      }
    }
    return { ok: false, detalle: fallos };
  }
}

// ─── Sumar / reducir ítems de la cuenta abierta ───
export async function sumarItemCuenta(orderId: number, item: any): Promise<void> {
  const recipeId = Number(campo(item, 'recipe_id', 'receta_id', 'recipeId') ?? campo(item?.recipe ?? {}, 'id') ?? 0);
  if (!recipeId) throw new Error('Este ítem no tiene receta asociada. Agrégalo desde el menú rápido.');
  const variantes = [
    { items: [{ recipe_id: recipeId, quantity: 1, notes: item?.notes ?? null }] },
    { items: [{ receta_id: recipeId, cantidad: 1, notas: item?.notes ?? null }] },
  ];
  const plantilla = await rutaAgregarItems();
  const rutas = [...new Set([...(plantilla ? [armar(plantilla, orderId)] : []), `/pos/orders/${orderId}/items`])];
  let ultimo = '';
  for (const ruta of rutas) {
    for (const cuerpo of variantes) {
      try { await api.post(ruta, cuerpo); return; }
      catch (e) { ultimo = `${ruta} → ${textoError(e)}`; }
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
  const cuerpo: any = {
    tip_percent: propinaPct, tip: propinaPct, propina: propinaPct,
    payment_method: metodo, method: metodo, metodo_pago: metodo,
  };
  const plantilla = await buscarRuta('POST', /(checkout|close|pay|cobro|pago|factur)/);
  const plantillas = [...new Set([
    ...(plantilla ? [plantilla] : []),
    `/pos/orders/${orderId}/checkout`, `/pos/orders/${orderId}/close`, `/pos/orders/${orderId}/pay`,
  ])];
  let ultimo = '';
  for (const p of plantillas) {
    const ruta = p.includes('{') ? armar(p, orderId) : p;
    try { await api.post(ruta, cuerpo); return; }
    catch (e) { ultimo = `${ruta} → ${textoError(e)}`; }
  }
  throw new Error(ultimo || 'Ninguna ruta de cobro respondió.');
}

// ─── Diagnóstico: muestra las rutas REALES del backend ───
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
  try {
    const r = await api.get('/pos/tables');
    const bruto = r?.data ?? r;
    const texto = typeof bruto === 'string' ? bruto : JSON.stringify(bruto);
    lineas.push(`[MESAS] GET /pos/tables → 200 · cruda: ${texto.slice(0, 300)}`);
  } catch (e: any) {
    lineas.push(`[MESAS] GET /pos/tables → ${textoError(e)}`);
  }
  lineas.push(`[MESAS] extraídas por mi código: ${(await traerMesas()).length}`);
  lineas.push('');
  lineas.push('── RUTAS REALES DEL BACKEND (openapi.json) ──');
  lineas.push(...(await resumenEspec()));
  lineas.push('');
  lineas.push(`[HOOKS] ${await sondearHooks()}`);
  return lineas;
}