// Kārei · PanelPago.tsx (E-14u) — COBRAR CON MÉTODO DE PAGO Y PROPINA
// Al confirmar llama a la prop cobrar({ method, tip }) → el backend
// registra el pago con su método y el dashboard lo desglosa.
import { useMemo, useState } from 'react';

type Props = {
  abierto?: boolean;
  cuenta?: any;
  mesa?: any;
  mesaId?: any;
  cobrar?: (p: any) => any;
  onCobrar?: (p: any) => any;
  pagar?: (p: any) => any;
  onPagar?: (p: any) => any;
  cobrando?: boolean;
  onCerrar?: () => any;
  cerrar?: () => any;
  className?: string;
};

const dinero = (v: any): string => {
  const n = Number(v ?? 0);
  return '$' + (Number.isFinite(n) ? Math.round(n) : 0).toLocaleString('es-CO', { maximumFractionDigits: 0 });
};

const itemsDe = (c: any): any[] => {
  const lista = c?.items ?? c?.lineas ?? c?.detalle ?? [];
  return Array.isArray(lista) ? lista : [];
};

const nombreItem = (it: any): string =>
  String(it?.nombre ?? it?.name ?? it?.recipe_name ?? 'Ítem');
const cantidadItem = (it: any): number => Number(it?.cantidad ?? it?.quantity ?? it?.qty ?? 1);
const precioItem = (it: any): number => Number(it?.precio ?? it?.unit_price ?? it?.price ?? 0);

const PROPINAS = [0, 10, 15];
const METODOS = [
  { clave: 'efectivo', label: 'Efectivo', icono: '💵' },
  { clave: 'tarjeta', label: 'Tarjeta · Transf.', icono: '💳' },
  { clave: 'nequi', label: 'Nequi', icono: '📱' },
] as const;

export default function PanelPago({
  cuenta, mesa, mesaId,
  cobrar, onCobrar, pagar, onPagar,
  cobrando: cobrandoProp,
  onCerrar, cerrar, className = '',
}: Props) {
  const [pct, setPct] = useState<number>(0);
  const [metodo, setMetodo] = useState<string>('efectivo');
  const [cobrandoLocal, setCobrandoLocal] = useState(false);
  const cobrando = cobrandoProp === true || cobrandoLocal;

  const alCerrar = () => { (onCerrar ?? cerrar)?.(); };

  const items = useMemo(() => itemsDe(cuenta), [cuenta]);

  const subtotal = Number(cuenta?.subtotal ?? cuenta?.total ?? 0) ||
    items.reduce((s, it) => s + cantidadItem(it) * precioItem(it), 0);
  const propinaFinal = Math.round(subtotal * (pct / 100));
  const total = subtotal + propinaFinal;

  const nombreMesa = String(
    cuenta?.mesa_nombre ?? mesa?.nombre ?? mesa?.name ?? (mesaId ? `Mesa ${mesaId}` : ''),
  );

  const confirmar = async () => {
    if (cobrando || !items.length) return;
    const accion = cobrar ?? onCobrar ?? pagar ?? onPagar;
    if (!accion) return;
    setCobrandoLocal(true);
    try {
      await accion({
        method: metodo, payment_method: metodo, metodo_pago: metodo,
        tip: propinaFinal, propina: propinaFinal,
      });
    } finally {
      setCobrandoLocal(false);
    }
  };

  if (!items.length) {
    return (
      <div className={`rounded-2xl border border-slate-800 bg-slate-900/60 p-5 ${className}`}>
        <h2 className="text-base font-bold text-slate-100">Cobrar cuenta</h2>
        <p className="mt-3 text-sm text-slate-400">No hay cuenta abierta para cobrar.</p>
        <button
          type="button"
          onClick={alCerrar}
          className="mt-4 rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 hover:border-amber-400/60 hover:text-amber-300"
        >
          Volver
        </button>
      </div>
    );
  }

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 ${className}`}>
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
        <header className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-slate-100">Cobrar cuenta</h2>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-400">
              {nombreMesa} · {items.length} producto(s)
            </p>
          </div>
          <button
            type="button"
            onClick={alCerrar}
            className="rounded-lg px-2 py-1 text-lg leading-none text-slate-500 hover:text-slate-200"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </header>

        <div className="mt-4 max-h-44 space-y-1.5 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          {items.map((it: any, i: number) => (
            <div key={String(it?.id ?? it?.item_id ?? i)} className="flex items-baseline justify-between gap-2">
              <span className="text-sm text-slate-200">
                <span className="font-bold text-amber-400">{cantidadItem(it)}× </span>
                {nombreItem(it)}
              </span>
              <span className="text-xs font-semibold text-slate-300">
                {dinero(cantidadItem(it) * precioItem(it))}
              </span>
            </div>
          ))}
        </div>

        <p className="mt-4 text-[11px] font-bold uppercase tracking-wide text-slate-500">Propina</p>
        <div className="mt-1.5 grid grid-cols-3 gap-2">
          {PROPINAS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPct(p)}
              className={`rounded-xl py-2 text-sm font-bold transition ${
                pct === p
                  ? 'bg-amber-500 text-slate-950'
                  : 'border border-slate-700 bg-slate-800/60 text-slate-300 hover:border-amber-400/50'
              }`}
            >
              {p}%
            </button>
          ))}
        </div>

        <p className="mt-4 text-[11px] font-bold uppercase tracking-wide text-slate-500">Método de pago</p>
        <div className="mt-1.5 grid grid-cols-3 gap-2">
          {METODOS.map((m) => (
            <button
              key={m.clave}
              type="button"
              onClick={() => setMetodo(m.clave)}
              className={`rounded-xl px-2 py-2 text-xs font-bold transition ${
                metodo === m.clave
                  ? 'bg-amber-500 text-slate-950'
                  : 'border border-slate-700 bg-slate-800/60 text-slate-300 hover:border-amber-400/50'
              }`}
            >
              <span className="mr-1">{m.icono}</span>
              {m.label}
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-1 rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-sm">
          <div className="flex justify-between text-slate-400">
            <span>Subtotal</span><span className="font-semibold text-slate-200">{dinero(subtotal)}</span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>Propina ({pct}%)</span>
            <span className="font-semibold text-slate-200">{dinero(propinaFinal)}</span>
          </div>
          <div className="flex justify-between border-t border-slate-800 pt-1.5 text-base">
            <span className="font-bold text-slate-100">Total</span>
            <span className="font-bold text-emerald-400">{dinero(total)}</span>
          </div>
        </div>

        <button
          type="button"
          disabled={cobrando}
          onClick={confirmar}
          className="mt-4 w-full rounded-xl bg-emerald-500 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
        >
          {cobrando ? 'Cobrando…' : `Confirmar cobro · ${dinero(total)}`}
        </button>
        <button
          type="button"
          onClick={alCerrar}
          className="mt-2 w-full py-1 text-xs font-semibold text-slate-500 hover:text-slate-300"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}