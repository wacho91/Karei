import { ComandaCard } from '@/components/cocina/ComandaCard';
import { useComandasCocina } from '@/hooks/usePos';

export default function CocinaPage() {
  const { data: comandas, isLoading } = useComandasCocina();

  const pendientes = comandas?.filter((c) => c.status === 'SENT_TO_KITCHEN').length ?? 0;
  const preparando = comandas?.filter((c) => c.status === 'IN_PREPARATION').length ?? 0;
  const listas = comandas?.filter((c) => c.status === 'READY').length ?? 0;

  return (
    <div>
      <h1 className="text-3xl font-bold text-white mb-2">Cocina 👨‍🍳</h1>
      <p className="text-slate-400 mb-6">
        Comandas en vivo. Las rojas llevan más de 10 minutos esperando.
      </p>

      {/* Semáforo de la cocina */}
      <div className="flex gap-4 mb-8">
        <div className="bg-slate-800/50 border border-amber-500/40 rounded-xl px-5 py-3">
          <p className="text-2xl font-extrabold text-amber-400">{pendientes}</p>
          <p className="text-xs text-slate-400 uppercase tracking-wider">Pendientes</p>
        </div>
        <div className="bg-slate-800/50 border border-sky-500/40 rounded-xl px-5 py-3">
          <p className="text-2xl font-extrabold text-sky-400">{preparando}</p>
          <p className="text-xs text-slate-400 uppercase tracking-wider">Preparando</p>
        </div>
        <div className="bg-slate-800/50 border border-emerald-500/40 rounded-xl px-5 py-3">
          <p className="text-2xl font-extrabold text-emerald-400">{listas}</p>
          <p className="text-xs text-slate-400 uppercase tracking-wider">Listas</p>
        </div>
      </div>

      {isLoading ? (
        <p className="text-slate-500 text-center py-16">Cargando comandas...</p>
      ) : !comandas || comandas.length === 0 ? (
        <div className="text-center py-20">
          <span className="text-7xl">😌</span>
          <p className="text-slate-400 mt-4 text-lg">Cocina en calma. No hay comandas pendientes.</p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-6">
          {comandas.map((c) => (
            <ComandaCard key={c.id} comanda={c} />
          ))}
        </div>
      )}
    </div>
  );
}