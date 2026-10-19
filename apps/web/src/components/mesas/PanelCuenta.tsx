// Kārei · panel de la cuenta abierta de la mesa seleccionada
import { fmt } from '../../lib/tipos';
import type { Cuenta, LineaCuenta } from '../../lib/tipos';

interface Props {
  cuenta: Cuenta;
  onSumar: (item: LineaCuenta) => void;
  onRestar: (item: LineaCuenta) => void;
  onCobrar: () => void;
}

export default function PanelCuenta({ cuenta, onSumar, onRestar, onCobrar }: Props) {
  const conNotas = cuenta.items.filter((i) => i.notes);

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold">Cuenta actual</h2>
        {/* Guard anti-NaN: si no hay id real, no mostramos número */}
        <span className="text-xs text-zinc-500">
          {cuenta.orderId ? `Pedido #${cuenta.orderId}` : 'Cuenta abierta'}
        </span>
      </div>

      <div className="space-y-2">
        {cuenta.items.map((i, idx) => (
          <div key={i.id || idx} className="flex items-center gap-2 rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm truncate">{i.nombre}</p>
              <p className="text-xs text-zinc-500">{fmt(i.precio)} × {i.cantidad}</p>
            </div>
            <button onClick={() => onRestar(i)} className="w-7 h-7 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300">−</button>
            <span className="w-6 text-center text-sm">{i.cantidad}</span>
            <button onClick={() => onSumar(i)} className="w-7 h-7 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300">+</button>
          </div>
        ))}
      </div>

      {conNotas.length > 0 && (
        <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
          <p className="font-semibold mb-1">Especificaciones</p>
          {conNotas.map((i) => (<p key={i.id || i.nombre}>· {i.nombre}: {i.notes}</p>))}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between border-t border-zinc-800 pt-3">
        <span className="text-sm text-zinc-400">Total</span>
        <span className="text-lg font-bold text-amber-400">{fmt(cuenta.total)}</span>
      </div>

      <button onClick={onCobrar}
        className="mt-4 w-full rounded-xl bg-emerald-600 hover:bg-emerald-500 py-2.5 font-semibold text-white">
        Cobrar cuenta
      </button>
    </div>
  );
}