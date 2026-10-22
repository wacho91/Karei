// Kārei · PanelCuenta.tsx (E-14t) — CUENTA DE MESA EN VIVO
// Consulta GET /pos/tables/{id}/cuenta cada 8 s (pos_compat, sin auth).
// Cuando cocina envía/prepara/lista/entrega, la mesa LO VE sola.
import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as apiModule from '../lib/api';

const api: any = (apiModule as any).default ?? (apiModule as any).api ?? apiModule;

type Props = {
  mesaId: string | null;
  mesaNombre?: string;
  onCobrar?: (cuenta: any) => void;
  className?: string;
};

const dinero = (v: any): string => {
  const n = Number(v ?? 0);
  return '$' + (Number.isFinite(n) ? n : 0).toLocaleString('es-CO', { maximumFractionDigits: 0 });
};

const extraerCuenta = (res: any): any => {
  const d = res?.data ?? res;
  if (!d || typeof d !== 'object') return null;
  return d;
};

const itemsDe = (c: any): any[] => {
  const lista = c?.items ?? c?.lineas ?? c?.detalle ?? [];
  return Array.isArray(lista) ? lista : [];
};

const pedidosDe = (c: any): any[] => {
  const lista = c?.pedidos ?? c?.comandas ?? [];
  return Array.isArray(lista) ? lista : [];
};

type EstadoCocina = 'sin_enviar' | 'en_cocina' | 'preparando' | 'listo' | 'entregado' | 'otro';

const estadoCocinaDe = (x: any): EstadoCocina => {
  const s = String(x ?? '').toLowerCase();
  if (s.includes('entreg') || s.includes('deliver') || s.includes('servid') || s.includes('served') || s.includes('complet') || s.includes('finaliz')) return 'entregado';
  if (s.includes('list') || s.includes('ready') || s.includes('preparad') || s.includes('done')) return 'listo';
  if (s.includes('prepar') || s.includes('cocin') || s.includes('progress') || s.includes('cook')) return 'preparando';
  if (s.includes('envi') || s.includes('sent') || s.includes('kitchen')) return 'en_cocina';
  if (s.includes('sin_enviar') || s.includes('abiert') || s.includes('open') || s.includes('pendiente') || s === '') return 'sin_enviar';
  return 'en_cocina';
};

const CHIP: Record<EstadoCocina, { texto: string; clase: string }> = {
  sin_enviar: { texto: 'Sin enviar', clase: 'bg-slate-700/60 text-slate-300' },
  en_cocina: { texto: 'En cocina', clase: 'bg-amber-400/15 text-amber-300' },
  preparando: { texto: 'Preparando', clase: 'bg-sky-400/15 text-sky-300' },
  listo: { texto: 'Listo para servir', clase: 'bg-emerald-400/20 text-emerald-300' },
  entregado: { texto: 'Entregado a la mesa', clase: 'bg-emerald-500/25 text-emerald-200' },
  otro: { texto: 'En proceso', clase: 'bg-slate-700/60 text-slate-300' },
};

const nombreItem = (it: any): string =>
  String(it?.nombre ?? it?.name ?? it?.recipe_name ?? it?.recipe?.name ?? 'Ítem');
const cantidadItem = (it: any): number => Number(it?.cantidad ?? it?.quantity ?? it?.qty ?? 1);
const precioItem = (it: any): number =>
  Number(it?.precio ?? it?.unit_price ?? it?.price ?? 0);
const notaItem = (it: any): string => {
  const n = it?.notes ?? it?.nota ?? it?.note;
  return typeof n === 'string' ? n.trim() : '';
};

function ChipEstado({ estado }: { estado: EstadoCocina }) {
  const chip = CHIP[estado] ?? CHIP.otro;
  return (
    <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${chip.clase}`}>
      {chip.texto}
    </span>
  );
}

export default function PanelCuenta({ mesaId, mesaNombre, onCobrar, className = '' }: Props) {
  const queryClient = useQueryClient();

  const consulta = useQuery({
    queryKey: ['karei-cuenta-mesa', String(mesaId ?? '')],
    queryFn: async () => {
      const res = await api.get(`/pos/tables/${mesaId}/cuenta`);
      return extraerCuenta(res);
    },
    enabled: !!mesaId,
    refetchInterval: 8000, // ← la mesa se entera SOLA de lo que hace cocina
    retry: 1,
  });

  const cuenta = consulta?.data ?? null;
  const cargando = !!mesaId && consulta?.isLoading;

  const items = useMemo(() => itemsDe(cuenta), [cuenta]);

  // Comandas agrupadas: prioridad pedidos[] del backend; si no vino, se
  // agrupan los items planos por su comanda/order_number.
  const comandas = useMemo(() => {
    const peds = pedidosDe(cuenta);
    if (peds.length) {
      return peds.map((p: any) => ({
        clave: String(p?.id ?? p?.order_number ?? ''),
        codigo: String(p?.order_number ?? p?.code ?? ''),
        estado: estadoCocinaDe(p?.estado_cocina ?? p?.status),
        items: Array.isArray(p?.items) ? p.items : [],
      }));
    }
    const grupos = new Map<string, any>();
    for (const it of items) {
      const clave = String(it?.comanda ?? it?.order_number ?? 'cuenta');
      if (!grupos.has(clave)) {
        grupos.set(clave, { clave, codigo: clave, estado: estadoCocinaDe(it?.estado_cocina), items: [] });
      }
      grupos.get(clave).items.push(it);
    }
    return [...grupos.values()];
  }, [cuenta, items]);

  const total = Number(cuenta?.total ?? 0) ||
    items.reduce((s, it) => s + cantidadItem(it) * precioItem(it), 0);

  const hayListos = cuenta?.hay_listos === true;
  const hayEntregados = cuenta?.hay_entregados === true;
  const puedeCobrar = cuenta?.puede_cobrar === true && !!onCobrar;

  if (!mesaId) {
    return (
      <aside className={`rounded-2xl border border-slate-800 bg-slate-900/50 p-5 ${className}`}>
        <p className="text-sm text-slate-400">Selecciona una mesa para ver su cuenta.</p>
      </aside>
    );
  }

  return (
    <aside className={`rounded-2xl border border-slate-800 bg-slate-900/50 p-5 ${className}`}>
      <header className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-bold text-slate-100">
            {mesaNombre || cuenta?.mesa_nombre || 'Mesa'}
          </h2>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-400">
            Cuenta abierta
          </p>
        </div>
        <button
          type="button"
          onClick={() => queryClient.invalidateQueries({ queryKey: ['karei-cuenta-mesa'] })}
          className="rounded-xl border border-slate-700 px-3 py-1.5 text-[11px] font-semibold text-slate-300 hover:border-amber-400/60 hover:text-amber-300"
        >
          Actualizar
        </button>
      </header>

      {cargando ? (
        <p className="mt-6 text-sm text-slate-400">Cargando cuenta…</p>
      ) : comandas.length === 0 ? (
        <div className="mt-5 rounded-xl border border-dashed border-slate-700 px-4 py-6 text-center">
          <p className="text-sm text-slate-300">Sin pedidos todavía.</p>
          <p className="mt-1 text-xs text-slate-500">
            Agrega productos del menú y envíalos a cocina: aparecerán aquí con su estado en vivo.
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {hayListos && (
            <p className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-300">
              Hay platos listos para recoger en cocina.
            </p>
          )}
          {hayEntregados && (
            <p className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-300/90">
              Pedido entregado a la mesa — pendiente de cobro.
            </p>
          )}

          {comandas.map((cm) => (
            <section
              key={cm.clave}
              className={`rounded-xl border bg-slate-950/60 p-3 ${
                cm.estado === 'entregado' ? 'border-emerald-500/50' : 'border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  {cm.codigo ? `Comanda ${cm.codigo}` : 'Comanda'}
                </p>
                <ChipEstado estado={cm.estado} />
              </div>
              <ul className="mt-2.5 space-y-2">
                {cm.items.map((it: any, i: number) => {
                  const nota = notaItem(it);
                  return (
                    <li key={String(it?.id ?? it?.item_id ?? i)}>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm text-slate-100">
                          <span className="font-bold text-amber-400">{cantidadItem(it)}× </span>
                          {nombreItem(it)}
                        </span>
                        <span className="text-xs font-semibold text-slate-300">
                          {dinero(cantidadItem(it) * precioItem(it))}
                        </span>
                      </div>
                      {nota && (
                        <p className="mt-1 rounded-lg border border-amber-400/40 bg-amber-400/10 px-2 py-1 text-[11px] text-amber-200">
                          {nota}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <footer className="mt-4 border-t border-slate-800 pt-3">
        <div className="flex items-baseline justify-between">
          <span className="text-xs uppercase tracking-wide text-slate-500">Total</span>
          <span className="text-xl font-bold text-amber-400">{dinero(total)}</span>
        </div>
        <button
          type="button"
          disabled={!puedeCobrar}
          title={onCobrar ? undefined : 'El cobro se activa en la fase de Facturación'}
          onClick={() => onCobrar?.(cuenta)}
          className="mt-3 w-full rounded-xl bg-emerald-400 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
        >
          Cobrar
        </button>
        <p className="mt-2 text-center text-[10px] text-slate-600">
          Se actualiza solo cada 8 s · estados en vivo desde cocina
        </p>
      </footer>
    </aside>
  );
}