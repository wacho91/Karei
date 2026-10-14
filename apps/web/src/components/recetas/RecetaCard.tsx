import type { Receta } from '@/types/inventario';
import { formatoCOP } from '@/lib/formato';

const colorBarra = (margen: number) =>
  margen >= 65 ? 'bg-emerald-500' : margen >= 40 ? 'bg-amber-500' : 'bg-rose-500';

const colorTexto = (margen: number) =>
  margen >= 65 ? 'text-emerald-400' : margen >= 40 ? 'text-amber-400' : 'text-rose-400';

interface Props {
  receta: Receta;
  onEditar: (receta: Receta) => void;
}

export const RecetaCard = ({ receta, onEditar }: Props) => {
  const foodCost = receta.price > 0 ? (receta.cost / receta.price) * 100 : 0;

  return (
    <div className="bg-slate-900/50 border border-slate-700 p-4 rounded-xl">
      <div className="flex justify-between items-start">
        <h4 className="text-lg font-bold text-white mb-2">{receta.name}</h4>
        <button onClick={() => onEditar(receta)} title="Editar"
          className="text-slate-600 hover:text-amber-400 transition-colors text-sm">✏️</button>
      </div>
      <div className="space-y-1 text-xs text-slate-400">
        <p>Costo: <span className="text-amber-400 font-medium">{formatoCOP(receta.cost)}</span></p>
        <p>Venta: <span className="text-white font-medium">{formatoCOP(receta.price)}</span></p>
        <p>
          Margen: <span className={`font-bold ${colorTexto(receta.margin)}`}>{receta.margin.toFixed(1)}%</span>
          {' · '}Food Cost: <span className="text-rose-400">{foodCost.toFixed(1)}%</span>
        </p>
      </div>
      <div className="w-full h-1.5 bg-slate-700 rounded-full mt-3 overflow-hidden">
        <div className={`h-full ${colorBarra(receta.margin)}`} style={{ width: `${Math.min(receta.margin, 100)}%` }} />
      </div>
    </div>
  );
};