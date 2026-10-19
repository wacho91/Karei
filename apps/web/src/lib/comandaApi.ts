// comandaApi.ts v3 — pedidos y líneas: primero rutas reales (mapa), luego candidatas
import { api } from './http';
import { cargarMapaRutas, buscarRuta, conParams, hayMapa } from './rutas';

function campo(o: any, ...ks: string[]) {
  for (const k of ks) { const v = o?.[k]; if (v != null && v !== '') return v; }
  return undefined;
}

function idDe(x: any): any {
  const nodos = [x, x?.data, x?.order, x?.pedido, x?.data?.order];
  for (const n of nodos) {
    const v = campo(n, 'orderId', 'order_id', 'id', 'id_orden', 'pedido_id', 'uuid');
    if (v !== undefined) return v;
  }
  return undefined;
}

function cuerposItem(l: any): any[] {
  const rid = campo(l, 'recipeId', 'recipe_id', 'receta_id', 'id') ?? 0;
  const cant = Number(campo(l, 'cantidad', 'quantity', 'qty') ?? 1) || 1;
  const notas = campo(l, 'notes', 'nota', 'notas') ?? '';
  const nombre = campo(l, 'nombre', 'name') ?? '';
  return [{ recipe_id: rid, quantity: cant, notes: notas, name: nombre },
          { receta_id: rid, cantidad: cant, notas, nombre }];
}

// Crea el pedido de una mesa (primero ruta descubierta, luego las conocidas)
export async function crearPedido(mesaId: any): Promise<any> {
  await cargarMapaRutas();
  const patron = buscarRuta('post', [/order/], 1);
  const intentos: Array<[string, any]> = [];
  if (patron) {
    const conMesa = patron.includes('{');
    intentos.push([conMesa ? conParams(patron, [mesaId]) : patron, conMesa ? {} : { table_id: mesaId }]);
  }
  intentos.push([`/pos/tables/${mesaId}/orders`, {}], [`/pos/tables/${mesaId}/order`, {}],
    ['/pos/orders', { table_id: mesaId }], ['/pos/orders', { mesa_id: mesaId }]);
  const vistas = new Set<string>();
  let ultimo: any = null;
  for (const [url, cuerpo] of intentos) {
    const k = url + '|' + JSON.stringify(cuerpo);
    if (vistas.has(k)) continue;
    vistas.add(k);
    try {
      const d = (await api.post(url, cuerpo))?.data;
      return (d && typeof d === 'object' && Object.keys(d).length) ? d : true;
    } catch (e: any) {
      ultimo = e;
      if (e?.response?.status !== 404 && e?.response?.status !== 422) throw e;
    }
  }
  throw new Error(`No se pudo crear el pedido (${ultimo?.response?.status ?? 'sin respuesta'})`);
}

// Empuja las líneas: 422 avanza al cuerpo ES, otros errores cortan el intento
async function empujar(url: string, items: any[]): Promise<void> {
  for (const it of items) {
    let hecho = false, ultimo: any = null;
    for (const cuerpo of cuerposItem(it)) {
      try { await api.post(url, cuerpo); hecho = true; break; }
      catch (e: any) { ultimo = e; if (e?.response?.status !== 422) throw e; }
    }
    if (!hecho) throw ultimo ?? new Error('Ítem rechazado por el backend');
  }
}

// Agrega líneas a un pedido existente (mesaId es opcional, para rutas de 2 params)
export async function agregar(orderId: any, items: any[], mesaId?: any): Promise<any> {
  if (!orderId) throw new Error('El pedido no tiene id en el backend');
  await cargarMapaRutas();
  const intentos: string[] = [];
  const patron = buscarRuta('post', [/order.*(item|line|add)/, /(item|line).*order/], 1);
  if (patron) intentos.push(conParams(patron, [orderId]));
  if (mesaId) {
    const p2 = buscarRuta('post', [/order.*(item|line|add)/, /(item|line).*order/], 2);
    if (p2 && p2 !== patron) intentos.push(conParams(p2, [mesaId, orderId]));
  }
  intentos.push(`/pos/orders/${orderId}/items`, `/pos/orders/${orderId}/add-items`,
    `/pos/orders/${orderId}/lines`, `/orders/${orderId}/items`);
  let ultimo: any = null;
  for (const url of [...new Set(intentos)]) {
    try { await empujar(url, items); return true; }
    catch (e: any) { ultimo = e; if (e?.response?.status !== 404) throw e; }
  }
  throw ultimo ?? new Error('No hay ruta para agregar ítems');
}

// Envía el borrador a cocina (crea el pedido si aún no existe)
export async function enviarComanda(mesaId: any, orderId: any, items: any[]): Promise<any> {
  if (orderId) return agregar(orderId, items, mesaId);
  const id = idDe(await crearPedido(mesaId));
  if (!id) throw new Error('El backend no devolvió el id del pedido');
  return agregar(id, items, mesaId);
}

// +1 a una línea de cuenta
export async function sumarItemCuenta(orderId: any, linea: any, mesaId?: any): Promise<any> {
  try { return await agregar(orderId, [{ ...linea, cantidad: 1 }], mesaId); }
  catch (e: any) {
    const nf = e?.response?.status === 404 || /not found/i.test(String(e?.message));
    if (!nf) throw e;
    const conRuta = hayMapa() && !!buscarRuta('post', [/order.*(item|line|add)/], 1);
    throw new Error(conRuta
      ? 'El pedido ya no existe en el backend. Refresca (F5) y vuelve a abrir la mesa.'
      : 'El backend no tiene ruta para agregar ítems al pedido.');
  }
}

// −1 a una línea: primero DELETE, si no funciona PATCH con cantidad 0
export async function restarItemCuenta(orderId: any, linea: any, mesaId?: any): Promise<any> {
  const iid = campo(linea, 'id', 'itemId', 'item_id', 'line_id') ?? '';
  await cargarMapaRutas();
  const urls: string[] = [];
  const p1 = buscarRuta('delete', [/order.*(item|line)/, /(item|line).*order/], 1);
  if (p1) urls.push(conParams(p1, [orderId]));
  if (mesaId) {
    const p2 = buscarRuta('delete', [/order.*(item|line)/, /(item|line).*order/], 2);
    if (p2 && p2 !== p1) urls.push(conParams(p2, [mesaId, orderId]));
  }
  if (iid) urls.push(`/pos/orders/${orderId}/items/${iid}`, `/orders/${orderId}/items/${iid}`);
  for (const url of [...new Set(urls)]) {
    try { await api.delete(url); return true; } catch { /* probamos PATCH */ }
    try { await api.patch(url, { quantity: 0, cantidad: 0 }); return true; } catch { /* siguiente */ }
  }
  throw new Error('No se pudo restar el ítem en el backend');
}