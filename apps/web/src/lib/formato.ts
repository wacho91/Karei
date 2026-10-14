/** Formato único de dinero para todo Kārei.
 *  Precios enteros: miles con punto, SIN decimales que confundan ($1.059, no $1.059,182).
 *  Costos por unidad SÍ conservan decimales ($2,6 por gramo es información real). */

export const formatoCOP = (valor: number): string =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(valor);

export const formatoCOPDecimales = (valor: number): string =>
  new Intl.NumberFormat('es-CO', {
    maximumFractionDigits: 2,
  }).format(valor);