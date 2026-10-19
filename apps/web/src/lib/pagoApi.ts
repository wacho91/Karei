// Kārei · cobro y cierre de cuenta
import { api, textoError } from './http';

export interface DatosPago {
  metodo: string;
  propina: number;
}

export const cobrarCuenta = async (
  orderId: number | null,
  mesaId: number,
  d: DatosPago,
): Promise<void> => {
  const conId = orderId
    ? [`/pos/orders/${orderId}/checkout`, `/pos/orders/${orderId}/close`, `/pos/orders/${orderId}/pay`]
    : [];
  const rutas = [
    ...conId,
    `/pos/tables/${mesaId}/checkout`,
    `/pos/tables/${mesaId}/close`,
    orderId ? `/pos/checkout/${orderId}` : '/pos/checkout',
  ];
  const cuerpos = [
    { payment_method: d.metodo, tip: d.propina, tip_amount: d.propina },
    { metodo_pago: d.metodo, propina: d.propina },
    {},
  ];
  let ultimo = '';
  for (const ruta of rutas) {
    for (const cuerpo of cuerpos) {
      try { await api.post(ruta, cuerpo); return; }
      catch (e: any) { ultimo = textoError(e); }
    }
  }
  throw new Error(ultimo || 'Ninguna ruta de cobro respondió');
};