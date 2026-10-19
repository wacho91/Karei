// Kārei · menú rápido para armar la comanda, con badge de cantidades
import { useMemo, useState } from 'react';
import { fmt } from '../../lib/tipos';
import type { LineaBorrador, Receta } from '../../lib/tipos';

interface Props {
  recetas: Receta[];
  borrador: LineaBorrador[];
  onAgregar: (r: Receta) => void;
}

export default function MenuRapido({ recetas, borrador, onAgregar }: Props) {
  const [q, setQ] = useState('');

  const cantidadDe = useMemo(() => {
    const m = new Map<number, number>();
    borrador.forEach((b) => m.set(b.recipe_id, (m.get(b.recipe_id) ?? 0) + b.cantidad));
    return m;
  }, [borrador]);

  const lista = recetas.filter((r) => r.nombre.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold">Menú rápido</h2>
        <span className="text-xs text-zinc-500">{recetas.length} ítems</span>
      </div>

      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…"
        className="w-full mb-3 rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm outline-none focus:border-amber-500" />

      {!recetas.length && (
        <p className="text-sm text-zinc-500 py-3 text-center">
          Sin menú cargado. Crea recetas en la sección Recetas y vuelve aquí.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto">
        {lista.map((r) => {
          const n = cantidadDe.get(r.id) ?? 0;
          return (
            <button key={r.id} onClick={() => onAgregar(r)}
              className="relative rounded-lg border border-zinc-800 bg-zinc-950 hover:border-amber-500/60 px-3 py-2 text-left">
              {n > 0 && (
                <span className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-amber-500 text-zinc-950 text-[11px] font-bold flex items-center justify-center">{n}</span>
              )}
              <p className="text-sm truncate">{r.nombre}</p>
              <p className="text-xs text-amber-400">{fmt(r.precio)}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}