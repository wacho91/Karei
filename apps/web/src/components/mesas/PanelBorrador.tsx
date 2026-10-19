// Comanda nueva para la mesa: cantidades −/+ y especificaciones por ítem
import { fmt, type LineaBorrador } from '../../lib/tipos';

interface Props {
  nombreMesaTxt: string;
  lineas: LineaBorrador[];
  enviando: boolean;
  onCantidad: (clave: string, delta: number) => void;
  onNotas: (clave: string, notas: string) => void;
  onEnviar: () => void;
  onCancelar: () => void;
}

export default function PanelBorrador(props: Props) {
  const { nombreMesaTxt, lineas, enviando, onCantidad, onNotas, onEnviar, onCancelar } = props;
  const unidades = lineas.reduce((s, l) => s + l.cantidad, 0);
  const total = lineas.reduce((s, l) => s + l.precio * l.cantidad, 0);

  return (
    <aside className="flex flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-zinc-100">Nuevo pedido</h2>
          <p className="text-xs text-zinc-500">{nombreMesaTxt}</p>
        </div>
        <button onClick={onCancelar} className="text-xs text-zinc-500 hover:text-zinc-300">Limpiar</button>
      </header>

      {lineas.length === 0 && (
        <p className="text-sm text-zinc-500">Elige productos del menú rápido para armar la comanda.</p>
      )}

      <ul className="flex flex-col gap-2">
        {lineas.map(l => (
          <li key={l.clave} className="rounded-xl border border-zinc-800 bg-zinc-900 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-zinc-200">{l.nombre}</span>
              <span className="text-sm font-semibold text-amber-400">{fmt(l.precio * l.cantidad)}</span>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <button onClick={() => onCantidad(l.clave, -1)}
                className="h-7 w-7 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700">−</button>
              <span className="w-6 text-center text-sm text-zinc-200">{l.cantidad}</span>
              <button onClick={() => onCantidad(l.clave, +1)}
                className="h-7 w-7 rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30">+</button>
            </div>
            <textarea
              value={l.notes}
              onChange={e => onNotas(l.clave, e.target.value)}
              placeholder="Especificaciones: sin cebolla, término medio…"
              rows={2}
              className="mt-2 w-full resize-none rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 placeholder-zinc-600 focus:border-amber-500 focus:outline-none"
            />
          </li>
        ))}
      </ul>

      {lineas.length > 0 && (
        <footer className="mt-auto border-t border-zinc-800 pt-3">
          <div className="mb-3 flex items-center justify-between text-sm">
            <span className="text-zinc-400">Por enviar ({unidades})</span>
            <span className="text-lg font-bold text-zinc-100">{fmt(total)}</span>
          </div>
          <button disabled={enviando} onClick={onEnviar}
            className="w-full rounded-xl bg-amber-500 py-2.5 text-sm font-bold text-zinc-950 hover:bg-amber-400 disabled:opacity-40">
            {enviando ? 'Enviando…' : `Enviar a cocina (${unidades})`}
          </button>
        </footer>
      )}
    </aside>
  );
}