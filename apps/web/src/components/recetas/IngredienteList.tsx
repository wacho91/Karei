import type { Ingrediente } from '@/types/inventario';
import { useListaFiltrada } from '@/hooks/useListaFiltrada';
import { SeccionColapsable } from '@/components/ux/SeccionColapsable';
import { Buscador } from '@/components/ux/Buscador';
import { Paginador } from '@/components/ux/Paginador';
import { formatoCOP, formatoCOPDecimales } from '@/lib/formato';

const textoDe = (ing: Ingrediente) => `${ing.name} ${ing.usage_unit}`;

interface Props {
  ingredientes: Ingrediente[];
  onEditar: (ing: Ingrediente) => void;
  onComprar: (ing: Ingrediente) => void;
  onEliminar: (id: string) => void;
}

export const IngredienteList = ({ ingredientes, onEditar, onComprar, onEliminar }: Props) => {
  const lista = useListaFiltrada(ingredientes, textoDe);

  return (
    <SeccionColapsable titulo="📦 Inventario">
      <Buscador valor={lista.busqueda} onChange={lista.cambiarBusqueda} placeholder="Buscar ingrediente..." />

      {lista.visibles.length === 0 ? (
        <p className="text-slate-500 text-sm py-4 text-center">
          {lista.busqueda ? 'Sin resultados para tu búsqueda.' : 'Sin ingredientes.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {lista.visibles.map((ing) => {
            const alerta = ing.stock <= ing.min_stock;
            return (
              <li key={ing.id} className="flex justify-between items-center text-slate-300 text-sm p-3 bg-slate-900/50 rounded-lg">
                <div>
                  <p className="capitalize">{ing.name}</p>
                  <p className="text-xs text-slate-500">
                    ${formatoCOPDecimales(ing.cost_per_unit)}/{ing.usage_unit} · Stock: {ing.stock}{ing.usage_unit}
                    {alerta && <span className="text-rose-400 font-bold"> ⚠️ Bajo</span>}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-amber-400 font-medium">{formatoCOP(ing.purchase_price)}</span>
                  <button onClick={() => onComprar(ing)} title="Registrar compra"
                    className="text-slate-600 hover:text-emerald-400 transition-colors">📥</button>
                  <button onClick={() => onEditar(ing)} title="Editar"
                    className="text-slate-600 hover:text-amber-400 transition-colors">✏️</button>
                  <button onClick={() => onEliminar(ing.id)} title="Eliminar"
                    className="text-slate-600 hover:text-rose-400 transition-colors">🗑️</button>
                </div>
              </li>
            );
          })}
        </ul>
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