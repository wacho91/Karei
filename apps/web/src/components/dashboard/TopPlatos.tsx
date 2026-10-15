import { formatoCOP } from '@/lib/formato';

interface Plato {
  nombre: string;
  cantidad: number;
  ingresos: number;
}

export const TopPlatos = ({ platos }: { platos: Plato[] }) => {
  if (platos.length === 0) {
    return <p className="text-slate-500 text-sm text-center py-6">Sin ventas registradas.</p>;
  }
  const max = Math.max(...platos.map((p) => p.cantidad));
  return (
    <ul className="space-y-3">
      {platos.map((p, i) => (
        <li key={p.nombre}>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-slate-300">
              {['🥇', '🥈', '🥉'][i] ?? '•'} {p.nombre} <span className="text-slate-500">×{p.cantidad}</span>
            </span>
            <span className="text-amber-400 font-medium">{formatoCOP(p.ingresos)}</span>
          </div>
          <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div className="h-full bg-amber-500" style={{ width: `${(p.cantidad / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
};