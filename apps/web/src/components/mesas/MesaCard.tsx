// Tarjeta individual de una mesa en el mapa
import type { MouseEvent } from 'react';
import { confirmar } from '../../lib/alertas';
import { nombreMesa, zonaMesa, capacidadMesa, mesaOcupada, type Mesa } from '../../lib/tipos';

interface Props {
  mesa: Mesa;
  seleccionada: boolean;
  onSeleccionar: (mesa: Mesa) => void;
  onQuitar: (mesa: Mesa) => void;
}

export default function MesaCard({ mesa, seleccionada, onSeleccionar, onQuitar }: Props) {
  const ocupada = mesaOcupada(mesa);

  const pedirConfirmacion = (e: MouseEvent) => {
    e.stopPropagation();
    confirmar(`¿Quitar ${nombreMesa(mesa)}?`, 'Esta acción no se deshace.', 'Sí, quitar').then(ok => {
      if (ok) onQuitar(mesa);
    });
  };

  return (
    <div
      onClick={() => onSeleccionar(mesa)}
      className={`relative cursor-pointer rounded-2xl border p-4 transition ${
        seleccionada ? 'border-amber-500 bg-amber-500/10' : 'border-zinc-800 bg-zinc-900 hover:border-zinc-600'
      }`}
    >
      <span
        onClick={pedirConfirmacion}
        title="Quitar mesa"
        className="absolute right-2 top-2 cursor-pointer rounded-full px-1.5 text-zinc-600 hover:bg-red-500/20 hover:text-red-400"
      >
        ×
      </span>
      <p className="text-base font-semibold text-zinc-100">{nombreMesa(mesa)}</p>
      <p className="text-xs text-zinc-500">{zonaMesa(mesa)} · {capacidadMesa(mesa)} pax</p>
      <span
        className={`mt-3 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${
          ocupada ? 'bg-red-500/15 text-red-400' : 'bg-emerald-500/15 text-emerald-400'
        }`}
      >
        {ocupada ? 'Ocupada' : 'Libre'}
      </span>
    </div>
  );
}