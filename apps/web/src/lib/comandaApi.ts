// Kārei · enviar comanda y modificar ítems de la cuenta (ids crudos)
import { api, textoError } from './http';
import { campo } from './tipos';
import type { Id, LineaBorrador } from './tipos';

const alIngles = (l: LineaBorrador) => ({ recipe_id: l.recipe_id, quantity: l.cantidad, notes: l.notes });
const alEspanol = (l: LineaBorrador) => ({ receta_id: l.recipe_id, cantidad: l.cantidad, notas: l.notes });

const crearPedido = async (mesaId: Id, items: LineaBorrador[]): Promise<Id | null> => {
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
        const id = campo(d, 'id', 'order_id', 'orderId');
        return id !== undefined && id !== null && id !== '' ? id : null; // creó aunque sin id
      } catch (e: any) {
        ultimo = textoError(e);
      }
    }
  }
  throw new Error(ultimo || 'Ninguna ruta de pedidos respondió');
};

const agregar = async (orderId: Id, items: LineaBorrador[]): Promise<void> => {
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
  mesaId: Id,
  orderId: Id | null,
  items: LineaBorrador[],
): Promise<Id | null> => {
  if (!items.length) throw new Error('La comanda está vacía');
  if (orderId) {
    await agregar(orderId, items);
    return orderId;
  }
  return crearPedido(mesaId, items);
};

export const sumarItemCuenta = async (orderId: Id, recipeId: Id, notes = ''): Promise<void> => {
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

export const restarItemCuenta = async (orderId: Id, itemId: Id): Promise<void> => {
  const rutas = [`/pos/orders/${orderId}/items/${itemId}`, `/pos/order-items/${itemId}`];
  let ultimo = '';
  for (const ruta of rutas) {
    try { await api.delete(ruta); return; } catch (e: any) { ultimo = textoError(e); }
    try { await api.patch(ruta, { quantity: 0 }); return; } catch { /* siguiente */ }
  }
  throw new Error(ultimo || 'No se pudo restar el ítem');
};