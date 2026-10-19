// PanelPago.tsx v2 — cobro con propina 0/10/15 % bien visible + método de pago
import { useState } from 'react';
import { fmt as _fmt } from '../../lib/tipos';
import * as _alertas from '../../lib/alertas';

const fmt: any = _fmt ?? ((n: any) => `$${Number(n || 0).toLocaleString('es-CO')}`);
const confirmar: any = (_alertas as any).confirmar ?? (_alertas as any).default ?? (async () => true);

function campo(o: any, ...ks: string[]) {
  for (const k of ks) { const v = o?.[k]; if (v != null && v !== '') return v; }
  return undefined;
}

const METODOS = [
  { id: 'efectivo', label: 'Efectivo' },
  { id: 'tarjeta', label: 'Tarjeta' },
  { id: 'nequi', label: 'Nequi' },
];
const PROPINAS = [0, 10, 15];

export default function PanelPago(props: any) {
  const cuenta = props?.cuenta ?? props?.pos?.cuenta ?? null;
  const onCobrar = props?.onCobrar ?? props?.cobrar ?? props?.onConfirmar;
  const onCerrar = props?.onCerrar ?? props?.onClose ?? props?.onCancelar ?? props?.onVolver;
  const [propina, setPropina] = useState(0);
  const [metodo, setMetodo] = useState('efectivo');
  const items = Array.isArray(cuenta?.items) ? cuenta.items : [];
  const subtotal = items.reduce((t: number, it: any) =>
    t + (Number(campo(it, 'precio', 'price') ?? 0) || 0) * (Number(campo(it, 'cantidad', 'quantity', 'qty') ?? 1) || 1), 0);
  const monto = Math.round(subtotal * (propina / 100));
  const total = subtotal + monto;

  if (!cuenta) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <p className="text-sm text-slate-400">No hay cuenta abierta para cobrar.</p>
        <button onClick={() => onCerrar?.()}
          className="mt-3 w-full rounded-lg bg-slate-800 py-2 text-sm text-slate-200 hover:bg-slate-700">Volver</button>
      </div>
    );
  }

  const confirmarCobro = async () => {
    const ok = await confirmar('Cobrar cuenta',
      `Total: ${fmt(total)} · ${metodo}${propina ? ` · propina ${propina}%` : ''}`);
    if (!ok) return;
    onCobrar?.(metodo, propina);
    onCerrar?.();
  };

  return (
    <div className="space-y-4 rounded-xl border border-amber-500/30 bg-slate-900/60 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-amber-400">Cobrar cuenta</h3>
        <button onClick={() => onCerrar?.()} className="text-xs text-slate-500 hover:text-slate-300">Cerrar</button>
      </div>

      <div>
        <p className="mb-1 text-xs text-slate-400">Propina</p>
        <div className="grid grid-cols-3 gap-2">
          {PROPINAS.map((p) => (
            <button key={p} onClick={() => setPropina(p)}
              className={`rounded-lg border py-2 text-sm font-medium ${propina === p
                ? 'border-amber-500 bg-amber-500 text-slate-950'
                : 'border-slate-700 bg-slate-800 text-slate-300 hover:border-amber-500/50'}`}>
              {p}%
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1 text-xs text-slate-400">Método de pago</p>
        <div className="grid grid-cols-3 gap-2">
          {METODOS.map((m) => (
            <button key={m.id} onClick={() => setMetodo(m.id)}
              className={`rounded-lg border py-2 text-xs font-medium ${metodo === m.id
                ? 'border-emerald-500 bg-emerald-500 text-slate-950'
                : 'border-slate-700 bg-slate-800 text-slate-300 hover:border-emerald-500/50'}`}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1 border-t border-slate-800 pt-3 text-sm">
        <div className="flex justify-between text-slate-400"><span>Subtotal</span><span>{fmt(subtotal)}</span></div>
        <div className="flex justify-between text-amber-400"><span>Propina ({propina}%)</span><span>{fmt(monto)}</span></div>
        <div className="flex justify-between text-base font-bold text-white"><span>Total</span><span>{fmt(total)}</span></div>
      </div>

      <button onClick={confirmarCobro}
        className="w-full rounded-lg bg-emerald-500 py-2.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400">
        Confirmar cobro · {fmt(total)}
      </button>
    </div>
  );
}