// Cuenta abierta de la mesa: ítems con −/+, especificaciones y botón de cobro
import { fmt, precioItem, cantidadItem } from '../../lib/tipos';

interface Props {
  nombreMesaTxt: string;
  orderId: number;
  items: any[];
  total: number;
  cargando: boolean;
  procesando: boolean;
  onSumar: (item: any) => void;
  onRestar: (item: any) => void;
  onCobrar: () => void;
}

export default function PanelCuenta(props: Props) {
  const { nombreMesaTxt, orderId, items, total, cargando, procesando, onSumar, onRestar, onCobrar } = props;

  return (
    <aside className="flex flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
      <header>
        <h2 className="text-lg font-bold text-zinc-100">Cuenta en curso</h2>
        <p className="text-xs text-zinc-500">{nombreMesaTxt} · orden #{orderId}</p>
      </header>

      {cargando && <p className="text-sm text-zinc-500">Buscando la cuenta…</p>}

      {!cargando && items.length === 0 && (
        <p className="text-sm text-zinc-500">La cuenta está vacía. Agrega productos desde el menú rápido.</p>
      )}

      <ul className="flex flex-col gap-2">
        {items.map((it, i) => {
          const cant = cantidadItem(it);
          const notas = it?.notes ?? it?.nota ?? null;
          return (
            <li key={it?.id ?? i} className="rounded-xl border border-zinc-800 bg-zinc-900 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-zinc-200">
                  {cant}× {it?.name ?? it?.nombre ?? it?.recipe_name ?? 'Ítem'}
                </span>
                <span className="text-sm font-semibold text-amber-400">{fmt(precioItem(it) * cant)}</span>
              </div>
              {notas && (
                <p className="mt-1 rounded-lg bg-amber-500/10 px-2 py-1 text-xs text-amber-300">
                  Especificación: {notas}
                </p>
              )}
              <div className="mt-2 flex items-center gap-2">
                <button disabled={procesando} onClick={() => onRestar(it)}
                  className="h-7 w-7 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-40">−</button>
                <span className="w-6 text-center text-sm text-zinc-200">{cant}</span>
                <button disabled={procesando} onClick={() => onSumar(it)}
                  className="h-7 w-7 rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 disabled:opacity-40">+</button>
              </div>
            </li>
          );
        })}
      </ul>

      <footer className="mt-auto border-t border-zinc-800 pt-3">
        <div className="mb-3 flex items-center justify-between text-sm">
          <span className="text-zinc-400">Total</span>
          <span className="text-lg font-bold text-zinc-100">{fmt(total)}</span>
        </div>
        <button disabled={procesando || items.length === 0} onClick={onCobrar}
          className="w-full rounded-xl bg-emerald-500 py-2.5 text-sm font-bold text-zinc-950 hover:bg-emerald-400 disabled:opacity-40">
          Cobrar cuenta
        </button>
      </footer>
    </aside>
  );
}