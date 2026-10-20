// src/lib/cuentaApi.ts — v2 (E-12)
// CLAVE: GET /pos/tables/{id}/order (SINGULAR) va de primera — el 405 de la
// consola probó que ese camino existe (405 = ruta viva con otro método).
// Regla nueva: 404/405/409/422 AVANZAN a la siguiente candidata; red/500 cortan.
import { api } from './http';
import { buscarRuta, conParams, cargarMapaRutas } from './rutas';

let rutaGanadora: string | null = null;

const GETS = (id: string): string[] => [
  `/pos/tables/${id}/order`,            // SINGULAR — la 405-probada
  `/pos/tables/${id}/orders`,
  `/pos/tables/${id}/current-order`,
  `/pos/orders?table_id=${id}`,
  `/pos/current-order?table_id=${id}`,
  `/pos/tables/${id}/account`,
];
const AVANZAR = [400, 404, 405, 409, 422];

// Convierte la respuesta en una cuenta usable; rechaza objetos MESA.
function normalizar(data: any, mesaId: string): any {
  if (!data || typeof data !== 'object') return null;
  let o: any = Array.isArray(data) ? data[0] : data;
  if (o?.order && typeof o.order === 'object' && !Array.isArray(o.order)) o = o.order;
  if (Array.isArray(o)) o = o[0] ?? null;
  if (!o || typeof o !== 'object') return null;
  if (o.capacity != null || o.capacidad != null || o.zone != null || o.zona != null) return null;
  const tid = o.table_id ?? o.mesa_id ?? o.tableId;
  if (tid !== undefined && tid !== null && String(tid) !== mesaId) return null;
  const items = o.items ?? o.lineas ?? o.lines;
  if (Array.isArray(items)) return { ...o, items };
  if (tid != null || o.opened_at || o.created_at || o.abierta != null) return { ...o, items: [] };
  return null;
}

async function probar(url: string, mesaId: string): Promise<any> {
  const r = await api.get(url);
  const cta = normalizar(r?.data, mesaId);
  if (cta) rutaGanadora = url;
  return cta;
}

export async function traerCuenta(mesaId: any): Promise<any> {
  const id = String(mesaId ?? '');
  if (!id) return null;
  await cargarMapaRutas();

  if (rutaGanadora) {
    try { return await probar(rutaGanadora, id); } catch (e: any) {
      if (!AVANZAR.includes(Number(e?.response?.status))) rutaGanadora = null;
    }
  }
  for (const url of GETS(id)) {
    try {
      const cta = await probar(url, id);
      if (cta) return cta;
      return null; // 200 sin cuenta = verdad definitiva (la mesa no tiene pedido)
    } catch (e: any) {
      if (!AVANZAR.includes(Number(e?.response?.status))) return null;
    }
  }
  const pat = buscarRuta('get', [/order/, /cuenta/, /account/], 1);
  if (pat) {
    try { return await probar(conParams(pat, [id]), id); } catch { /* fin */ }
  }
  return null;
}

// Compatibilidad con imports viejos
export const PLANTILLAS = (id: any) => GETS(String(id ?? ''));
export function idDe(data: any): string {
  let o: any = data;
  if (o?.order && typeof o.order === 'object') o = o.order;
  const id = o?.id ?? o?.order_id ?? o?.orderId;
  return id == null ? '' : String(id);
}
export function olvidarRutaCuenta() { rutaGanadora = null; }