// Kārei · tarjeta de mesa con chip de estado de color
import type { MouseEvent } from 'react';
import { estadoMesa, capacidadMesa } from '../../lib/tipos';
import type { Mesa } from '../../lib/tipos';
import { confirmar } from '../../lib/alertas';

interface Props {
  mesa: Mesa;
  ocupada: boolean;
  seleccionada: boolean;
  onClick: () => void;
  onEliminar: () => void;
}

const ETIQUETA: Record<string, string> = {
  libre: 'Libre', ocupada: 'Ocupada', reservada: 'Reservada',
  cerrada: 'Cerrada', fuera_de_servicio: 'Fuera de servicio',
};

export default function MesaCard({ mesa, ocupada, seleccionada, onClick, onEliminar }: Props) {
  const base = estadoMesa(mesa);
  const ocup = ocupada || /ocup|abiert|activ/.test(base);
  const etiqueta = ocup ? 'Ocupada' : (ETIQUETA[base] ?? 'Libre');
  const color = ocup
    ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
    : /reserv/.test(base)
      ? 'bg-blue-500/15 text-blue-400 border-blue-500/30'
      : /cerrad|fuera/.test(base)
        ? 'bg-red-500/15 text-red-400 border-red-500/30'
        : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';

  async function eliminar(e: MouseEvent) {
    e.stopPropagation();
    if (await confirmar('Eliminar mesa', `¿Eliminar ${mesa.nombre}? Esta acción no se deshace.`)) onEliminar();
  }

  return (
    <button onClick={onClick}
      className={`w-full text-left rounded-xl border p-4 transition ${
        seleccionada ? 'border-amber-500 bg-amber-500/10' : 'border-zinc-800 bg-zinc-900 hover:border-zinc-600'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-zinc-100 truncate">{mesa.nombre}</p>
          <p className="text-xs text-zinc-500">{capacidadMesa(mesa)} personas · {mesa.zona}</p>
        </div>
        <span onClick={eliminar} className="text-zinc-600 hover:text-red-400 cursor-pointer px-1 text-lg leading-none">×</span>
      </div>
      <span className={`mt-3 inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium ${color}`}>
        {etiqueta}
      </span>
    </button>
  );
}