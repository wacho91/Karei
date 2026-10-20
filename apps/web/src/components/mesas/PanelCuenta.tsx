// src/components/mesas/PanelCuenta.tsx — v2 (E-11)
// FIX crash: cuenta null ya NO revienta (antes: cuenta.items sin guardia).
// Pedido abierto, líneas con − / +, total y botón Cobrar.
import { toastOk } from '../../lib/alertas';

const lineasDe = (c: any): any[] => {
  const l = c?.items ?? c?.lineas ?? c?.lines ?? c?.order?.items ?? [];
  return Array.isArray(l) ? l : [];
};
const idDe = (c: any): string => {
  const id = c?.order?.id ?? c?.orderId ?? c?.order_id ?? c?.id;
  return id === undefined || id === null ? '' : String(id);
};
const nombreL = (l: any) => l?.name ?? l?.nombre ?? l?.recipe_name ?? l?.recipe?.name ?? 'Producto';
const cant = (l: any) => Math.max(1, Number(l?.quantity ?? l?.qty ?? l?.cantidad ?? 1) || 1);
const precio = (l: any) => Number(l?.price ?? l?.precio ?? l?.unit_price ?? l?.price_at_sale ?? 0) || 0;
const pesos = (n: number) => '$' + Math.round(n).toLocaleString('es-CO');

type Props = { [k: string]: any };

export default function PanelCuenta(props: Props) {
  const p = props;
  const cta = p.cuenta ?? p.pedido ?? null;
  const lineas = lineasDe(cta);
  const oid = idDe(cta);
  const mesaTxt = p.mesa?.name ?? p.mesa?.nombre ?? p.mesa?.code ?? 'Mesa';
  const total = lineas.reduce((s: number, l: any) => s + cant(l) * precio(l), 0);
  const sumar = p.sumarItem ?? p.sumar;
  const restar = p.restarItem ?? p.restar;
  const cobrar = p.onCobrar ?? p.alCobrar ?? p.cobrar;
  const cerrar = p.onCerrar ?? p.cerrar ?? p.alCerrar;

  return (
    <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-bold text-white mr-auto">{mesaTxt}</h2>
        <span className={`text-xs px-2 py-0.5 rounded-full ${oid ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-700 text-slate-300'}`}>
          {oid ? `Pedido #${oid.slice(0, 8)}` : 'Cuenta abierta'}
        </span>
        {cerrar && (
          <button onClick={() => cerrar()} title="Cerrar panel"
            className="w-6 h-6 rounded-full bg-slate-700 text-slate-300 text-xs hover:bg-slate-600">✕</button>
        )}
      </div>

      {lineas.length === 0 ? (
        <p className="text-xs text-slate-400 py-3 text-center">
          Sin productos todavía. Agrégalos desde el Menú rápido de abajo.
        </p>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {lineas.map((l: any, i: number) => (
            <div key={l?.id ?? l?.item_id ?? i} className="flex items-center gap-2 bg-slate-900/60 rounded-lg px-2 py-1.5">
              <span className="text-sm text-white flex-1 truncate">{cant(l)} × {nombreL(l)}</span>
              <span className="text-xs text-slate-400">{pesos(cant(l) * precio(l))}</span>
              {restar && <button onClick={() => restar(l)} className="w-6 h-6 rounded-md bg-slate-700 text-white text-sm hover:bg-slate-600">−</button>}
              {sumar && <button onClick={() => sumar(l)} className="w-6 h-6 rounded-md bg-amber-500 text-slate-900 text-sm font-bold hover:bg-amber-400">+</button>}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 border-t border-slate-700 pt-3">
        <span className="text-sm text-slate-400">Total</span>
        <span className="text-lg font-bold text-white mr-auto">{pesos(total)}</span>
        <button onClick={() => { cobrar ? cobrar() : toastOk('Sin acción de cobro'); }}
          disabled={lineas.length === 0}
          className="px-4 py-2 rounded-lg bg-amber-500 text-slate-900 text-sm font-semibold hover:bg-amber-400 disabled:opacity-40">
          Cobrar
        </button>
      </div>
    </div>
  );
}