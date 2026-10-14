import type { Ingrediente } from '@/types/inventario';

interface Props {
  ingredientes: Ingrediente[];
  onEditar: (ing: Ingrediente) => void;
  onComprar: (ing: Ingrediente) => void;
  onEliminar: (id: string) => void;
}

export const IngredienteList = ({ ingredientes, onEditar, onComprar, onEliminar }: Props) => (
  <div className="bg-slate-800/30 border border-slate-700 p-4 rounded-2xl">
    <h3 className="text-slate-400 text-sm font-bold uppercase tracking-widest mb-4">Inventario</h3>
    {ingredientes.length === 0 ? (
      <p className="text-slate-500 text-sm py-4 text-center">Sin ingredientes.</p>
    ) : (
      <ul className="space-y-2">
        {ingredientes.map((ing) => {
          const alerta = ing.stock <= ing.min_stock;
          return (
            <li key={ing.id} className="flex justify-between items-center text-slate-300 text-sm p-3 bg-slate-900/50 rounded-lg">
              <div>
                <p className="capitalize">{ing.name}</p>
                <p className="text-xs text-slate-500">
                  ${ing.cost_per_unit.toLocaleString()}/{ing.usage_unit} · Stock: {ing.stock}{ing.usage_unit}
                  {alerta && <span className="text-rose-400 font-bold"> ⚠️ Bajo</span>}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-amber-400 font-medium">${ing.purchase_price.toLocaleString()}</span>
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
  </div>
);