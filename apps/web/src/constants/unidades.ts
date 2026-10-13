export const UNIDADES_COMPRA = [
  { value: "KG", label: "Kilogramo (KG)" },
  { value: "G", label: "Gramo (G)" },
  { value: "L", label: "Litro (L)" },
  { value: "ML", label: "Mililitro (ML)" },
  { value: "UND", label: "Unidad" },
  { value: "PAQUETE", label: "Paquete" },
];

export const UNIDADES_USO = [
  { value: "G", label: "Gramos (G)" },
  { value: "ML", label: "Mililitros (ML)" },
  { value: "UND", label: "Unidad(es)" },
];

const FACTOR: Record<string, number> = { KG: 1000, G: 1, L: 1000, ML: 1, UND: 1, PAQUETE: 1 };

/** Sugiere cuántas unidades de uso trae la compra (KG→G = 1000). */
export const sugerirContenido = (compra: string, uso: string): number =>
  Math.floor((FACTOR[compra] ?? 1) / (FACTOR[uso] ?? 1)) || 1;