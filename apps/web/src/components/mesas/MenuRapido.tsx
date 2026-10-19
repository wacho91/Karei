// Productos rápidos; el badge muestra cuántos van en el borrador
import { fmt, type Receta } from '../../lib/tipos';

interface Props {
  recetas: Receta[];
  cantidades: Record<number, number>;
  onAgregar: (receta: Receta) => void;
}

export default function MenuRapido({ recetas, cantidades, onAgregar }: Props) {
  if (!recetas?.length) return null;

  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-500">Menú rápido</h2>
      <div className="flex flex-wrap gap-2">
        {recetas.map((r, i) => {
          const cant = cantidades[r.id] ?? 0;
          return (
            <button
              key={r.id ?? i}
              onClick={() => onAgregar(r)}
              className="relative rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-left hover:border-amber-500/60"
            >
              <span className="block text-sm text-zinc-200">{r?.name ?? r?.nombre ?? `Receta ${r?.id}`}</span>
              <span className="block text-xs text-zinc-500">{fmt(Number(r?.price ?? r?.precio ?? 0))}</span>
              {cant > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-[11px] font-bold text-zinc-950">
                  {cant}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}