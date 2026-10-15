import type { Mesa, MesaStatus } from '@/types/pos';
import { formatoCOP } from '@/lib/formato';

const BORDES: Record<MesaStatus, string> = {
  AVAILABLE: 'border-emerald-500/40',
  OCCUPIED: 'border-amber-500/60',
  BILLING: 'border-rose-500/50',
  RESERVED: 'border-sky-500/50',
  OUT_OF_SERVICE: 'border-slate-600/40',
};

const PUNTOS: Record<MesaStatus, string> = {
  AVAILABLE: 'bg-emerald-400',
  OCCUPIED: 'bg-amber-400',
  BILLING: 'bg-rose-400',
  RESERVED: 'bg-sky-400',
  OUT_OF_SERVICE: 'bg-slate-500',
};

interface Props {
  mesa: Mesa;
  seleccionada: boolean;
  onClick: () => void;
}

export const MesaCard = ({ mesa, seleccionada, onClick }: Props) => {
  const esTerraza = (mesa.zone ?? '').toLowerCase().includes('terraza');
  const ocupada = mesa.status !== 'AVAILABLE';

  return (
    <div className="relative flex flex-col items-center justify-end h-32">
      {esTerraza && (
        <div className={`absolute top-0 ${seleccionada ? 'text-amber-400 scale-110' : 'text-slate-500'}`}>
          <svg width="32" height="18" viewBox="0 0 32 18" fill="none">
            <path d="M16 0C7 0 1 6 0 14H32C31 6 25 0 16 0Z" fill="currentColor" opacity="0.6" />
            <rect x="15" y="14" width="2" height="4" fill="currentColor" opacity="0.8" />
          </svg>
        </div>
      )}
      <button
        onClick={onClick}
        className={`relative w-24 h-24 mt-6 rounded-full border-4 flex flex-col items-center justify-center cursor-pointer transition-all duration-300 shadow-lg
          ${BORDES[mesa.status]} bg-slate-800/60 hover:scale-105 hover:shadow-xl
          ${seleccionada ? 'scale-110 border-amber-400 ring-4 ring-amber-400/30' : ''}`}
        style={{ backgroundImage: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.05) 0%, rgba(0,0,0,0.2) 70%)' }}
      >
        <span className={`absolute top-2 w-3 h-3 rounded-full shadow-md animate-pulse ${PUNTOS[mesa.status]}`} />
        <span className="text-lg font-extrabold text-white tracking-tight">{mesa.code}</span>
        {ocupada ? (
          <span className="text-[11px] font-bold text-amber-400">
            {formatoCOP(mesa.open_total)}
          </span>
        ) : (
          <span className="text-[10px] text-slate-400">Libre</span>
        )}
      </button>
      <span className="text-[10px] text-slate-500 mt-1">{mesa.name}</span>
    </div>
  );
};