// Kārei · enviar comanda y modificar ítems de la cuenta
import { api, textoError } from './http';
import type { LineaBorrador } from './tipos';

const alIngles = (l: LineaBorrador) => ({ recipe_id: l.recipe_id, quantity: l.cantidad, notes: l.notes });
const alEspanol = (l: LineaBorrador) => ({ receta_id: l.recipe_id, cantidad: l.cantidad, notas: l.notes });

const crearPedido = async (mesaId: number, items: LineaBorrador[]): Promise<number | null> => {
  const rutas: Array<[string, any]> = [
    [`/pos/tables/${mesaId}/orders`, {}],
    [`/pos/tables/${mesaId}/order`, {}],
    [`/pos/tables/${mesaId}/items`, {}],
    ['/pos/orders', { table_id: mesaId }],
    ['/pos/orders', { mesa_id: mesaId }],
  ];
  let ultimo = '';
  for (const [ruta, extra] of rutas) {
    for (const fmt of [alIngles, alEspanol]) {
      try {
        const r = await api.post(ruta, { ...extra, items: items.map(fmt) });
        const d = r?.data ?? {};
        const id = Number(d.id ?? d.order_id ?? d.orderId ?? 0);
        return id > 0 ? id : null; // creó el pedido aunque no devuelva id
      } catch (e: any) {
        ultimo = textoError(e);
      }
    }
  }
  throw new Error(ultimo || 'Ninguna ruta de pedidos respondió');
};

const agregar = async (orderId: number, items: LineaBorrador[]): Promise<void> => {
  const rutas = [`/pos/orders/${orderId}/items`, `/pos/orders/${orderId}/add-items`, `/pos/orders/${orderId}/lines`];
  let ultimo = '';
  for (const ruta of rutas) {
    for (const fmt of [alIngles, alEspanol]) {
      try { await api.post(ruta, { items: items.map(fmt) }); return; }
      catch (e: any) { ultimo = textoError(e); }
    }
  }
  throw new Error(ultimo || 'No se pudieron agregar los ítems');
};

export const enviarComanda = async (
  mesaId: number,
  orderId: number | null,
  items: LineaBorrador[],
): Promise<number | null> => {
  if (!items.length) throw new Error('La comanda está vacía');
  if (orderId) {
    await agregar(orderId, items);
    return orderId;
  }
  return crearPedido(mesaId, items);
};

export const sumarItemCuenta = async (orderId: number, recipeId: number, notes = ''): Promise<void> => {
  const cuerpos = [
    { recipe_id: recipeId, quantity: 1, notes },
    { receta_id: recipeId, cantidad: 1, notas: notes },
  ];
  let ultimo = '';
  for (const ruta of [`/pos/orders/${orderId}/items`, `/pos/orders/${orderId}/add-items`]) {
    for (const c of cuerpos) {
      try { await api.post(ruta, c); return; } catch (e: any) { ultimo = textoError(e); }
    }
  }
  throw new Error(ultimo || 'No se pudo sumar el ítem');
};

export const restarItemCuenta = async (orderId: number, itemId: number): Promise<void> => {
  const rutas = [`/pos/orders/${orderId}/items/${itemId}`, `/pos/order-items/${itemId}`];
  let ultimo = '';
  for (const ruta of rutas) {
    try { await api.delete(ruta); return; } catch (e: any) { ultimo = textoError(e); }
    try { await api.patch(ruta, { quantity: 0 }); return; } catch { /* siguiente */ }
  }
  throw new Error(ultimo || 'No se pudo restar el ítem');
};