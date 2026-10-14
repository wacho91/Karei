/** Universos de medida: masa→gramos, volumen→mililitros, conteo→unidades.
 *  Se compra en la unidad del mercado; se cocina y se hace stock en la de uso. */

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

export const UNIDADES_USO: { value: UnidadUso; label: string }[] = [
  { value: 'G', label: 'Gramos (G)' },
  { value: 'ML', label: 'Mililitros (ML)' },
  { value: 'UND', label: 'Unidades (UND)' },
];

const USO_DE_COMPRA: Record<UnidadCompra, UnidadUso> = {
  KG: 'G', G: 'G',
  L: 'ML', ML: 'ML',
  UND: 'UND', PAQUETE: 'UND',
};

/** Familia de uso válida según la compra. KG solo se usa en G (física pura). */
export const unidadUsoDe = (compra: UnidadCompra): UnidadUso => USO_DE_COMPRA[compra];

/** Opciones de uso que el formulario permite elegir para la compra elegida. */
export const usosValidosDe = (compra: UnidadCompra): { value: UnidadUso; label: string }[] =>
  UNIDADES_USO.filter((u) => u.value === USO_DE_COMPRA[compra]);

/** Contenido sugerido. null = lo define el usuario (ej: paquete de 8 panes). */
export const contenidoSugerido = (compra: UnidadCompra): number | null =>
  ({ KG: 1000, G: 1, L: 1000, ML: 1, UND: 1, PAQUETE: null })[compra];

/** Nombre legible para hints y placeholders. */
export const nombreUso = (uso: string): string =>
  ({ G: 'gramos', ML: 'mililitros', UND: 'unidades' })[uso] ?? uso;