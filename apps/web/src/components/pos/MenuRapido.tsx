import { useAgregarItems, useMenuRecetas } from '@/hooks/usePos';
import { formatoCOP } from '@/lib/formato';

interface Props {
  tableId: string;
  bloqueado: boolean; // true si el pedido ya fue enviado a cocina
  onAgregado: (nombre: string) => void;
}

export const MenuRapido = ({ tableId, bloqueado, onAgregado }: Props) => {
  const { data: recetas, isLoading } = useMenuRecetas();
  const agregar = useAgregarItems();

  const handleAgregar = (recipeId: string, nombre: string) => {
    agregar.mutate(
      { tableId, items: [{ recipe_id: recipeId, quantity: 1 }] },
      { onSuccess: () => onAgregado(nombre) },
    );
  };

  if (isLoading) return <p className="text-slate-500 text-sm text-center py-4">Cargando menú...</p>;

  return (
    <div className="bg-slate-800/50 border border-slate-700 p-6 rounded-2xl shadow-sm">
      <h3 className="text-slate-300 text-sm font-bold uppercase tracking-widest mb-4">
        {bloqueado ? '🔒 Menú (cuenta en cocina)' : 'Menú Rápido'}
      </h3>
      <div className="grid grid-cols-2 gap-3">
        {recetas?.map((r) => (
          <button
            key={r.id}
            onClick={() => handleAgregar(r.id, r.name)}
            disabled={bloqueado || agregar.isPending}
            className="bg-slate-900/50 hover:bg-amber-500/10 hover:border-amber-500/50 disabled:opacity-40 disabled:hover:bg-slate-900/50 border border-slate-700 text-white text-sm font-medium py-3 px-4 rounded-lg transition-colors text-left"
          >
            {r.name}
            <span className="block text-amber-500 text-xs mt-1">{formatoCOP(r.price)}</span>
          </button>
        ))}
        {recetas?.length === 0 && (
          <p className="text-slate-500 text-sm col-span-2 text-center py-2">
            Sin recetas activas. Créalas en el módulo de Recetas.
          </p>
        )}
      </div>
    </div>
  );
};