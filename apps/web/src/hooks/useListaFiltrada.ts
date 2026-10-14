import { useMemo, useState } from 'react';

export const REGISTROS_POR_PAGINA = 5;

/** Lista reutilizable con búsqueda textual y paginación client-side. */
export function useListaFiltrada<T>(
  items: T[],
  extraerTexto: (item: T) => string,
) {
  const [busqueda, setBusqueda] = useState('');
  const [pagina, setPagina] = useState(1);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => extraerTexto(item).toLowerCase().includes(q));
  }, [items, busqueda, extraerTexto]);

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / REGISTROS_POR_PAGINA));
  const paginaSegura = Math.min(pagina, totalPaginas);

  const visibles = useMemo(() => {
    const inicio = (paginaSegura - 1) * REGISTROS_POR_PAGINA;
    return filtrados.slice(inicio, inicio + REGISTROS_POR_PAGINA);
  }, [filtrados, paginaSegura]);

  const cambiarBusqueda = (valor: string) => {
    setBusqueda(valor);
    setPagina(1); // nueva búsqueda siempre arranca en la página 1
  };

  return {
    busqueda,
    cambiarBusqueda,
    visibles,
    totalFiltrados: filtrados.length,
    pagina: paginaSegura,
    totalPaginas,
    paginaAnterior: () => setPagina((p) => Math.max(1, p - 1)),
    paginaSiguiente: () => setPagina((p) => Math.min(totalPaginas, p + 1)),
  };
}