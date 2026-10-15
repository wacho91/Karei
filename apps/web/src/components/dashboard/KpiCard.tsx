interface Props {
  titulo: string;
  valor: string;
  detalle?: string;
  color?: 'amber' | 'emerald' | 'rose' | 'sky';
}

const COLORES = {
  amber: 'text-amber-500',
  emerald: 'text-emerald-500',
  rose: 'text-rose-500',
  sky: 'text-sky-500',
};

export const KpiCard = ({ titulo, valor, detalle, color = 'amber' }: Props) => (
  <div className="bg-slate-800/50 border border-slate-700 p-6 rounded-xl shadow-sm">
    <p className={`text-sm font-medium uppercase mb-1 ${COLORES[color]}`}>{titulo}</p>
    <p className="text-4xl font-bold text-white">{valor}</p>
    {detalle && <p className="text-xs text-slate-500 mt-2">{detalle}</p>}
  </div>
);