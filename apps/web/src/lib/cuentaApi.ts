// Kārei · lectura de la cuenta abierta de una mesa (ids crudos)
import { api, primerArray, soltar, textoError } from './http';
import { campo, num, precioItem, cantidadItem } from './tipos';
import type { Cuenta, Id, LineaCuenta } from './tipos';

const PLANTILLAS = (id: Id): string[] => [
  `/pos/tables/${id}/account`,
  `/pos/tables/${id}/orders`,
  `/pos/tables/${id}/order`,
  `/pos/tables/${id}/current-order`,
  `/pos/orders?table_id=${id}`,
  `/pos/current-order?table_id=${id}`,
];

const idDe = (x: any): Id | null => {
  const v = campo(x, 'orderId', 'order_id', 'id', 'id_orden', 'pedido_id');
  return v !== undefined && v !== null && v !== '' ? v : null;
};

const aLinea = (i: any): LineaCuenta => ({
  id: campo(i, 'id', 'item_id', 'line_id', 'detail_id') ?? 0,
  recipeId: campo(i, 'recipe_id', 'receta_id', 'recipeId', 'product_id') ?? 0,
  nombre: String(campo(i, 'nombre', 'name', 'recipe_name', 'receta', 'title', 'description') ?? 'Ítem'),
  precio: precioItem(i),
  cantidad: cantidadItem(i),
  notes: String(campo(i, 'notes', 'notas', 'note') ?? ''),
});

export const traerCuenta = async (mesaId: Id): Promise<Cuenta> => {
  let ultimo = '';
  for (const ruta of PLANTILLAS(mesaId)) {
    try {
      const r = await api.get(ruta);
      const data = soltar(r?.data);
      // Si responde un array de pedidos, usa el primero que traiga ítems.
      const raiz: any = Array.isArray(data)
        ? (data.find((o: any) => o?.items?.length) ?? data[0])
        : data;
      const items: LineaCuenta[] = primerArray(raiz?.items ?? raiz).map(aLinea);
      if (!items.length) { ultimo = `${ruta}: sin ítems`; continue; }
      const orden = campo(raiz, 'order', 'orden', 'pedido') ?? raiz;
      const subtotal = items.reduce((s, i) => s + i.precio * i.cantidad, 0);
      return {
        orderId: idDe(orden) ?? idDe(raiz) ?? idDe(data),
        mesaId,
        items,
        estado: String(campo(raiz, 'estado', 'status', 'state') ?? 'abierta'),
        total: num(campo(raiz, 'total', 'total_amount', 'amount'), subtotal),
      };
    } catch (e: any) {
      ultimo = textoError(e);
    }
  }
  throw new Error(ultimo || 'Sin cuenta abierta');
};