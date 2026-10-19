// Kārei · modal de cobro con propina y método de pago
import { useState } from 'react';
import { fmt } from '../../lib/tipos';
import { confirmar } from '../../lib/alertas';

interface Props {
  mesaNombre: string;
  total: number;
  onConfirmar: (metodo: string, pctPropina: number) => Promise<void>;
  onCerrar: () => void;
}

const PCT = [0, 10, 15];
const METODOS = ['efectivo', 'tarjeta', 'nequi'];

export default function PanelPago({ mesaNombre, total, onConfirmar, onCerrar }: Props) {
  const [pct, setPct] = useState(0);
  const [metodo, setMetodo] = useState('efectivo');
  const [ocupado, setOcupado] = useState(false);
  const propina = Math.round((total * pct) / 100);

  async function cobrar() {
    const ok = await confirmar('Cobrar cuenta', `${mesaNombre} · Total ${fmt(total + propina)} (${metodo})`);
    if (!ok) return;
    setOcupado(true);
    try {
      await onConfirmar(metodo, pct);
      onCerrar();
    } catch { /* el hook ya mostró el aviso */ }
    finally { setOcupado(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onCerrar}>
      <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900 p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-semibold mb-1">Cobrar · {mesaNombre}</h2>
        <p className="text-sm text-zinc-500 mb-4">Elige propina y método de pago.</p>

        <div className="grid grid-cols-3 gap-2 mb-3">
          {PCT.map((p) => (
            <button key={p} onClick={() => setPct(p)}
              className={`rounded-lg py-2 text-sm border ${pct === p ? 'border-amber-500 bg-amber-500/10 text-amber-400' : 'border-zinc-800 bg-zinc-950 text-zinc-300'}`}>
              {p}% propina
            </button>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2 mb-4">
          {METODOS.map((m) => (
            <button key={m} onClick={() => setMetodo(m)}
              className={`rounded-lg py-2 text-sm capitalize border ${metodo === m ? 'border-amber-500 bg-amber-500/10 text-amber-400' : 'border-zinc-800 bg-zinc-950 text-zinc-300'}`}>
              {m}
            </button>
          ))}
        </div>

        <div className="rounded-lg bg-zinc-950 border border-zinc-800 p-3 text-sm space-y-1 mb-4">
          <div className="flex justify-between"><span className="text-zinc-400">Consumo</span><span>{fmt(total)}</span></div>
          <div className="flex justify-between"><span className="text-zinc-400">Propina {pct}%</span><span>{fmt(propina)}</span></div>
          <div className="flex justify-between font-bold text-amber-400 pt-1 border-t border-zinc-800">
            <span>Total</span><span>{fmt(total + propina)}</span>
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={onCerrar} className="flex-1 rounded-xl bg-zinc-800 hover:bg-zinc-700 py-2.5 font-medium">Cancelar</button>
          <button onClick={cobrar} disabled={ocupado}
            className="flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 py-2.5 font-semibold text-white disabled:opacity-50">
            {ocupado ? 'Cobrando…' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
}