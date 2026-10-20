// src/lib/comandaApi.ts — v4 (E-12)
// FIX RAÍZ del 405: antes un 405 CORTABA el bucle y la ruta real de creación
// (POST /pos/orders) jamás se probaba. Ahora 405/404/409/422 AVANZAN.
// Además: busca orden abierta (GET /pos/tables/{id}/order), soporta creación
// mesa-céntrica (/tables/{id}/items) y si todo falla el error muestra las
// rutas POST/GET REALES del openapi para capturarlas.
import { api } from './http';
import { buscarRuta, conParams, cargarMapaRutas, rutasDe, hayMapa, origenMapa } from './rutas';
import { traerCuenta } from './cuentaApi';

const AVANZAR = [400, 404, 405, 409, 422];
const fallidos = new Set<string>();
const clave = (u: string, b: any) => 'post ' + u + ' ' + JSON.stringify(b ?? {});

const idDe = (d: any): string => {
  let o: any = d;
  if (o?.order && typeof o.order === 'object') o = o.order;
  const id = o?.id ?? o?.order_id ?? o?.orderId ?? o?.uuid;
  return id == null ? '' : String(id);
};

const cuerpos = (it: any) => {
  const rid = it?.recipe_id ?? it?.receta_id ?? it?.recipe?.id ?? it?.receta?.id ?? it?.id;
  const q = Number(it?.quantity ?? it?.cantidad ?? it?.qty ?? 1) || 1;
  const n = it?.notes ?? it?.notas ?? '';
  const nom = it?.name ?? it?.nombre ?? it?.recipe?.name ?? it?.recipe_name ?? '';
  return [{ recipe_id: rid, quantity: q, notes: n, name: nom }, { receta_id: rid, cantidad: q, notas: n, nombre: nom }];
};

export async function crearPedido(mesaId: any, primerItem?: any): Promise<{ orderId: string; consumidos: number } | null> {
  const id = String(mesaId ?? '');
  if (!id) return null;
  await cargarMapaRutas();
  const L: Array<[string, any]> = [];
  const p0 = buscarRuta('post', [/order/, /comanda/], 0);
  if (p0) L.push([p0, { table_id: id }], [p0, { mesa_id: id }]);
  const p1 = buscarRuta('post', [/tables.*\/(order|orders|items)$/], 1);
  if (p1) {
    const u = conParams(p1, [id]);
    if (primerItem) for (const b of cuerpos(primerItem)) L.push([u, b]);
    L.push([u, {}]);
  }
  L.push(['/pos/orders', { table_id: id }], ['/pos/orders', { mesa_id: id }], ['/pos/tables/' + id + '/orders', {}]);
  if (primerItem) for (const b of cuerpos(primerItem)) L.push(['/pos/tables/' + id + '/items', b]);

  for (const [patron, body] of L) {
    const url = conParams(patron, [id]);
    const k = clave(url, body);
    if (fallidos.has(k)) continue;
    try {
      const r = await api.post(url, body);
      return { orderId: idDe(r?.data), consumidos: /items$/.test(url) && primerItem ? 1 : 0 };
    } catch (e: any) {
      fallidos.add(k);
      if (!AVANZAR.includes(Number(e?.response?.status))) throw e;
    }
  }
  return null;
}

export async function agregar(orderId: string, items: any[], mesaId?: any): Promise<boolean> {
  await cargarMapaRutas();
  const oid = String(orderId ?? '');
  const mId = mesaId != null && mesaId !== '' ? String(mesaId) : '';
  if (!oid && !mId) return false;
  const urls: string[] = [];
  if (oid) urls.push('/pos/orders/' + oid + '/items');
  const pA = buscarRuta('post', [/order.*item/, /item.*order/], 1);
  if (pA && oid) urls.push(conParams(pA, [oid]));
  const p2 = buscarRuta('post', [/tables.*item/], 2);
  if (p2 && oid && mId) urls.push(conParams(p2, [mId, oid]));
  if (mId) urls.push('/pos/tables/' + mId + '/items');

  const hechos = new Set<any>();
  for (const url of urls) {
    for (const it of items) {
      if (hechos.has(it)) continue;
      let logrado = false, fatal = false;
      for (const b of cuerpos(it)) {
        const k = clave(url, b);
        if (fallidos.has(k)) continue;
        try { await api.post(url, b); logrado = true; break; }
        catch (e: any) {
          fallidos.add(k);
          if (!AVANZAR.includes(Number(e?.response?.status))) { fatal = true; break; }
        }
      }
      if (logrado) hechos.add(it);
      if (fatal) return false;
    }
  }
  return items.length > 0 && items.every((it) => hechos.has(it));
}

export async function enviarComanda(mesaId: any, orderId: any, items: any[]) {
  const id = String(mesaId ?? '');
  const lista = (items ?? []).filter(Boolean);
  if (!id || lista.length === 0) return;
  let oid = String(orderId ?? '');
  if (!oid) {
    try {
      const cta = await traerCuenta(id);
      oid = String(cta?.order?.id ?? cta?.orderId ?? cta?.order_id ?? cta?.id ?? '');
    } catch { /* sin cuenta previa */ }
  }
  if (oid && (await agregar(oid, lista, id))) return;
  const creado = await crearPedido(id, lista[0]).catch(() => null);
  if (creado?.orderId) {
    const resto = lista.slice(creado.consumidos);
    if (resto.length === 0 || (await agregar(creado.orderId, resto, id))) return;
  }
  throw new Error(detalleFallo());
}

function detalleFallo(): string {
  const filtrar = (rs: string[]) => rs.filter((x) => /pos|order|item|table|comanda/i.test(x)).slice(0, 8).join('   ');
  let extra = '';
  try {
    const post = rutasDe('post'), get = rutasDe('get');
    console.error('[Karei] Rutas REALES del backend →', { post, get });
    extra = hayMapa()
      ? ` | POST reales: ${filtrar(post) || '(sin coincidencias)'} | GET reales: ${filtrar(get) || '(sin coincidencias)'} | mapa: ${origenMapa()}`
      : ' | (no pude leer el openapi.json del backend)';
  } catch { /* nada */ }
  return 'No pude crear/enviar el pedido. ' + extra;
}

export async function sumarItemCuenta(orderId: any, linea: any, mesaId?: any): Promise<boolean> {
  return agregar(String(orderId ?? ''), [linea], mesaId);
}

export async function restarItemCuenta(orderId: any, linea: any, mesaId?: any): Promise<boolean> {
  const oid = String(orderId ?? '');
  const mId = mesaId != null && mesaId !== '' ? String(mesaId) : '';
  const lid = linea?.id ?? linea?.item_id ?? linea?.line_id;
  const urls: string[] = [];
  if (lid != null && oid) urls.push('/pos/orders/' + oid + '/items/' + lid);
  if (lid != null && mId) urls.push('/pos/tables/' + mId + '/items/' + lid);
  for (const u of urls) {
    try { await api.delete(u); return true; } catch (e: any) {
      if (!AVANZAR.includes(Number(e?.response?.status))) break;
    }
  }
  for (const b of [{ quantity: 0 }, { cantidad: 0 }]) {
    for (const u of urls) {
      try { await api.patch(u, b); return true; } catch (e: any) {
        if (!AVANZAR.includes(Number(e?.response?.status))) return false;
      }
    }
  }
  return false;
}