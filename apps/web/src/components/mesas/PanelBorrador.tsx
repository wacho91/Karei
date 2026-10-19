// Kārei · comanda en construcción (aún no enviada a cocina)
import { fmt } from '../../lib/tipos';
import type { LineaBorrador } from '../../lib/tipos';

interface Props {
  mesaNombre: string;
  items: LineaBorrador[];
  onAjustar: (clave: string, delta: number) => void;
  onNota: (clave: string, notas: string) => void;
  onLimpiar: () => void;
  onEnviar: () => void;
}

export default function PanelBorrador({ mesaNombre, items, onAjustar, onNota, onLimpiar, onEnviar }: Props) {
  const total = items.reduce((s, i) => s + i.precio * i.cantidad, 0);

  return (
    <div className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold">Nuevo pedido · {mesaNombre}</h2>
        <button onClick={onLimpiar} className="text-xs text-zinc-400 hover:text-red-400">Limpiar</button>
      </div>

      {!items.length && (
        <p className="text-sm text-zinc-500 py-4 text-center">
          Elige ítems del menú rápido para armar la comanda.
        </p>
      )}

      <div className="space-y-2">
        {items.map((i) => (
          <div key={i.clave} className="rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2">
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">{i.nombre}</p>
                <p className="text-xs text-zinc-500">{fmt(i.precio)} × {i.cantidad}</p>
              </div>
              <button onClick={() => onAjustar(i.clave, -1)} className="w-7 h-7 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300">−</button>
              <span className="w-6 text-center text-sm">{i.cantidad}</span>
              <button onClick={() => onAjustar(i.clave, 1)} className="w-7 h-7 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300">+</button>
            </div>
            <input value={i.notes} onChange={(e) => onNota(i.clave, e.target.value)}
              placeholder="Especificaciones (sin cebolla, término…)"
              className="mt-2 w-full rounded-md bg-zinc-900 border border-zinc-800 px-2 py-1 text-xs outline-none focus:border-amber-500" />
          </div>
        ))}
      </div>

      {items.length > 0 && (
        <>
          <div className="mt-3 flex justify-between text-sm border-t border-zinc-800 pt-2">
            <span className="text-zinc-400">Total</span>
            <span className="font-bold text-amber-400">{fmt(total)}</span>
          </div>
          <button onClick={onEnviar}
            className="mt-3 w-full rounded-xl bg-amber-500 hover:bg-amber-400 py-2.5 font-semibold text-zinc-950">
            Enviar a cocina ({items.length})
          </button>
        </>
      )}
    </div>
  );
}