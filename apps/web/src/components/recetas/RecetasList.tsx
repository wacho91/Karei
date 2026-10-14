import type { Receta } from '@/types/inventario';
import { useListaFiltrada } from '@/hooks/useListaFiltrada';
import { SeccionColapsable } from '@/components/ux/SeccionColapsable';
import { Buscador } from '@/components/ux/Buscador';
import { Paginador } from '@/components/ux/Paginador';
import { RecetaCard } from './RecetaCard';

const textoDe = (receta: Receta) => receta.name;

interface Props {
  recetas: Receta[];
  onEditar: (receta: Receta) => void;
}

export const RecetaList = ({ recetas, onEditar }: Props) => {
  const lista = useListaFiltrada(recetas, textoDe);

  return (
    <SeccionColapsable titulo="🍽️ Menú del Restaurante">
      <Buscador valor={lista.busqueda} onChange={lista.cambiarBusqueda} placeholder="Buscar plato del menú..." />

      {lista.visibles.length === 0 ? (
        <p className="text-slate-500 text-sm py-4 text-center">
          {lista.busqueda ? 'Sin resultados para tu búsqueda.' : 'Aún no has creado recetas.'}
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {lista.visibles.map((receta) => (
            <RecetaCard key={receta.id} receta={receta} onEditar={onEditar} />
          ))}
        </div>
      )}

      <Paginador
        pagina={lista.pagina}
        totalPaginas={lista.totalPaginas}
        totalRegistros={lista.totalFiltrados}
        onAnterior={lista.paginaAnterior}
        onSiguiente={lista.paginaSiguiente}
      />
    </SeccionColapsable>
  );
};