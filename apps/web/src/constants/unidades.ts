/** Universos de medida. La conversión es automática y a prueba de errores:
 *  masa→gramos, volumen→mililitros, conteo→unidades. Nunca se mezclan. */

export type UnidadCompra = 'KG' | 'G' | 'L' | 'ML' | 'UND' | 'PAQUETE';
export type UnidadUso = 'G' | 'ML' | 'UND';

export const UNIDADES_COMPRA: { value: UnidadCompra; label: string }[] = [
  { value: 'KG', label: 'Kilogramo (KG)' },
  { value: 'G', label: 'Gramo (G)' },
  { value: 'L', label: 'Litro (L)' },
  { value: 'ML', label: 'Mililitro (ML)' },
  { value: 'UND', label: 'Unidad' },
  { value: 'PAQUETE', label: 'Paquete' },
];

const USO_DE_COMPRA: Record<UnidadCompra, UnidadUso> = {
  KG: 'G', G: 'G',
  L: 'ML', ML: 'ML',
  UND: 'UND', PAQUETE: 'UND',
};

/** Unidad de uso derivada de la compra. Ej: comprar KG → se usa en G. */
export const unidadUsoDe = (compra: UnidadCompra): UnidadUso => USO_DE_COMPRA[compra];

/** Contenido sugerido según la compra. null = lo define el usuario (ej: paquete de 8 panes). */
export const contenidoSugerido = (compra: UnidadCompra): number | null =>
  ({ KG: 1000, G: 1, L: 1000, ML: 1, UND: 1, PAQUETE: null })[compra];