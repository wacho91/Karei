// Modal de cobro: propina, método de pago y confirmación
import { useState } from 'react';
import { fmt } from '../../lib/tipos';

interface Props {
  total: number;
  procesando: boolean;
  onConfirmar: (propinaPct: number, metodo: string) => void;
  onCerrar: () => void;
}

const METODOS = [
  { id: 'efectivo', label: 'Efectivo' },
  { id: 'tarjeta', label: 'Tarjeta' },
  { id: 'nequi', label: 'Nequi' },
];

export default function PanelPago({ total, procesando, onConfirmar, onCerrar }: Props) {
  const [propina, setPropina] = useState(10);
  const [metodo, setMetodo] = useState('efectivo');
  const valorPropina = Math.round(total * (propina / 100));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onCerrar}>
      <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900 p-5" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-zinc-100">Cobrar cuenta</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Total consumido: <span className="font-semibold text-zinc-200">{fmt(total)}</span>
        </p>

        <p className="mt-4 text-xs font-semibold uppercase tracking-widest text-zinc-500">Propina</p>
        <div className="mt-2 flex gap-2">
          {[0, 10, 15].map(p => (
            <button key={p} onClick={() => setPropina(p)}
              className={`flex-1 rounded-xl border py-2 text-sm ${
                propina === p ? 'border-amber-500 bg-amber-500/10 text-amber-400' : 'border-zinc-800 text-zinc-400 hover:border-zinc-600'
              }`}>
              {p}%
            </button>
          ))}
        </div>

        <p className="mt-4 text-xs font-semibold uppercase tracking-widest text-zinc-500">Método de pago</p>
        <div className="mt-2 flex gap-2">
          {METODOS.map(m => (
            <button key={m.id} onClick={() => setMetodo(m.id)}
              className={`flex-1 rounded-xl border py-2 text-sm ${
                metodo === m.id ? 'border-amber-500 bg-amber-500/10 text-amber-400' : 'border-zinc-800 text-zinc-400 hover:border-zinc-600'
              }`}>
              {m.label}
            </button>
          ))}
        </div>

        <div className="mt-4 flex justify-between border-t border-zinc-800 pt-3 text-sm">
          <span className="text-zinc-400">Propina ({propina}%)</span>
          <span className="text-zinc-200">{fmt(valorPropina)}</span>
        </div>
        <div className="mt-1 flex justify-between text-sm">
          <span className="font-semibold text-zinc-300">Total a pagar</span>
          <span className="text-lg font-bold text-amber-400">{fmt(total + valorPropina)}</span>
        </div>

        <div className="mt-4 flex gap-2">
          <button onClick={onCerrar} className="flex-1 rounded-xl border border-zinc-700 py-2.5 text-sm text-zinc-300 hover:border-zinc-500">Cancelar</button>
          <button disabled={procesando} onClick={() => onConfirmar(propina, metodo)}
            className="flex-1 rounded-xl bg-emerald-500 py-2.5 text-sm font-bold text-zinc-950 hover:bg-emerald-400 disabled:opacity-40">
            {procesando ? 'Cobrando…' : 'Confirmar cobro'}
          </button>
        </div>
      </div>
    </div>
  );
}