// Kārei · PanelPagosMetodo.tsx (E-14u) — REPORTES DE PAGO POR MÉTODO
// Dashboard: cuánta plata entró en efectivo, tarjeta/transferencia y Nequi.
// Consulta GET /pos/reportes/pagos cada 15 s. Sin dependencias nuevas.
import { useQuery } from '@tanstack/react-query';
import * as apiModule from '../lib/api';

const api: any = (apiModule as any).default ?? (apiModule as any).api ?? apiModule;

const dinero = (v: any): string => {
  const n = Number(v ?? 0);
  return '$' + (Number.isFinite(n) ? Math.round(n) : 0).toLocaleString('es-CO', { maximumFractionDigits: 0 });
};

const extraer = (res: any): any => res?.data ?? res;

const METODOS_UI = [
  { clave: 'efectivo', etiqueta: 'Efectivo', icono: '💵', borde: 'border-emerald-500/40', texto: 'text-emerald-300' },
  { clave: 'tarjeta', etiqueta: 'Tarjeta · Transferencia', icono: '💳', borde: 'border-sky-500/40', texto: 'text-sky-300' },
  { clave: 'nequi', etiqueta: 'Nequi', icono: '📱', borde: 'border-violet-500/40', texto: 'text-violet-300' },
];

const chipDe = (metodo: string): string => {
  const m = METODOS_UI.find((x) => x.clave === metodo);
  if (m) return `${m.borde} ${m.texto}`;
  return 'border-slate-600 text-slate-300';
};

export default function PanelPagosMetodo({ className = '' }: { className?: string }) {
  const consulta = useQuery({
    queryKey: ['karei-pagos-metodo'],
    queryFn: async () => extraer(await api.get('/pos/reportes/pagos')),
    refetchInterval: 15000,
    retry: 1,
  });

  const rep: any = consulta?.data ?? null;
  const res: any = rep?.resumen ?? {};
  const hoy = res?.hoy ?? {};
  const semana = res?.semana ?? {};
  const historico = res?.historico ?? {};
  const ultimos: any[] = Array.isArray(rep?.ultimos) ? rep.ultimos : [];

  return (
    <section className={`rounded-2xl border border-slate-800 bg-slate-900/50 p-5 ${className}`}>
      <header className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-bold text-slate-100">Pagos por método</h2>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Caja y cuentas · se actualiza solo cada 15 s
          </p>
        </div>
        <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-[11px] font-bold text-emerald-300">
          Hoy · {dinero(hoy?.total ?? 0)}
        </span>
      </header>

      {consulta?.isLoading ? (
        <p className="mt-6 text-sm text-slate-400">Cargando reportes…</p>
      ) : !rep ? (
        <p className="mt-6 rounded-xl border border-dashed border-slate-700 px-4 py-5 text-center text-sm text-slate-400">
          No pude leer el reporte de pagos — revisa que el backend tenga el
          add-on E-14u actualizado y reinicia uvicorn.
        </p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {METODOS_UI.map((m) => (
              <div key={m.clave} className={`rounded-xl border bg-slate-950/60 p-3 ${m.borde}`}>
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  <span className="mr-1">{m.icono}</span>{m.etiqueta}
                </p>
                <p className={`mt-1 text-xl font-bold ${m.texto}`}>
                  {dinero(hoy?.[m.clave] ?? 0)}
                </p>
                <p className="text-[11px] text-slate-500">
                  {(hoy?.[m.clave] ?? 0) > 0 ? `${m.etiqueta} de hoy` : 'Sin pagos hoy'}
                </p>
              </div>
            ))}
            {(hoy?.otros ?? 0) > 0 && (
              <div className="rounded-xl border border-slate-600 bg-slate-950/60 p-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">🧾 Otros</p>
                <p className="mt-1 text-xl font-bold text-slate-300">{dinero(hoy?.otros ?? 0)}</p>
                <p className="text-[11px] text-slate-500">Otros métodos de hoy</p>
              </div>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-2.5 text-xs">
            <span className="text-slate-400">
              Hoy: <b className="text-slate-100">{dinero(hoy?.total ?? 0)}</b>
              <span className="ml-1 text-slate-600">({rep?.n_pagos_hoy ?? 0} cobros)</span>
            </span>
            <span className="text-slate-400">
              Últimos 7 días: <b className="text-slate-100">{dinero(semana?.total ?? 0)}</b>
            </span>
            <span className="text-slate-400">
              Histórico: <b className="text-slate-100">{dinero(historico?.total ?? 0)}</b>
              <span className="ml-1 text-slate-600">({historico?.n_pagos ?? 0} cobros)</span>
            </span>
          </div>

          <p className="mt-4 text-[11px] font-bold uppercase tracking-wide text-slate-500">
            Últimos cobros
          </p>
          {ultimos.length === 0 ? (
            <p className="mt-2 rounded-xl border border-dashed border-slate-700 px-4 py-4 text-center text-xs text-slate-500">
              Aún no hay pagos registrados desde la actualización E-14u —
              aparece en cuanto cobres una mesa (los cobros anteriores no
              guardaron método de pago).
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-slate-800/70">
              {ultimos.slice(0, 8).map((p: any) => (
                <li key={String(p?.id ?? `${p?.paid_at}-${p?.total}`)} className="flex items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold ${chipDe(String(p?.metodo ?? ''))}`}>
                      {p?.metodo_etiqueta ?? p?.metodo ?? '—'}
                    </span>
                    <span className="ml-2 text-xs text-slate-400">
                      {p?.mesa ? `${p.mesa} · ` : ''}{p?.hora ?? ''}
                    </span>
                  </div>
                  <span className="text-sm font-bold text-slate-100">{dinero(p?.total ?? 0)}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}