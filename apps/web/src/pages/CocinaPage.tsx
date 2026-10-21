import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as hooksPos from '../hooks/usePos';
import * as apiModule from '../lib/api';

// Compatibles con `export default` o `export const`
const api: any = (apiModule as any).default ?? (apiModule as any).api ?? apiModule;
const useComandasCocina = (hooksPos as any).useComandasCocina;
const useAvanzarComanda =
  (hooksPos as any).useAvanzarComanda ?? (hooksPos as any).useAvanzarPedido ?? null;

type EstadoKds = 'pendiente' | 'preparando' | 'lista';
type Aviso = { tipo: 'ok' | 'error'; texto: string };

const extraerLista = (x: any): any[] => {
  if (Array.isArray(x)) return x;
  if (Array.isArray(x?.data)) return x.data;
  if (Array.isArray(x?.data?.data)) return x.data.data;
  return [];
};

const estadoDe = (c: any): EstadoKds => {
  const s = String(c?.status ?? c?.estado ?? '').toLowerCase();
  if (s.includes('list') || s.includes('ready') || s.includes('done')) return 'lista';
  if (s.includes('prepar') || s.includes('progress') || s.includes('cook')) return 'preparando';
  return 'pendiente';
};

const minutosDe = (c: any): number => {
  const base = c?.created_at ?? c?.createdAt ?? c?.opened_at ?? c?.created;
  if (!base) return 0;
  const t = new Date(base).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 60000));
};

const textoMesaDe = (c: any): string => {
  const t = c?.table_name ?? c?.mesa ?? c?.table_label ?? c?.table?.name ?? c?.table?.label;
  if (typeof t === 'string' && t.trim()) return t;
  if (c?.table_number != null) return `Mesa ${c.table_number}`;
  if (c?.table?.number != null) return `Mesa ${c.table.number}`;
  return 'Mesa';
};

const codigoDe = (c: any): string => {
  const cod = c?.code ?? c?.ticket ?? c?.number ?? c?.folio;
  return cod != null ? String(cod) : '';
};

const nombreItem = (it: any): string =>
  String(it?.recipe_name ?? it?.nombre ?? it?.name ?? it?.recipe?.name ?? it?.recipe?.nombre ?? 'Ítem');

const cantidadItem = (it: any): number => Number(it?.quantity ?? it?.qty ?? 1);

const notaItem = (it: any): string => {
  const n = it?.notes ?? it?.nota ?? it?.note;
  return typeof n === 'string' ? n.trim() : '';
};

// Respaldo por si el hook de comandas no está disponible
const useComandasRespaldo = () =>
  useQuery({
    queryKey: ['karei-cocina'],
    queryFn: async () => {
      const res = await api.get('/pos/kitchen/orders');
      return res.data;
    },
    refetchInterval: 12000,
  });

const useComandas = useComandasCocina ?? useComandasRespaldo;

const bordePorEstado: Record<EstadoKds, string> = {
  pendiente: 'border-amber-400/40',
  preparando: 'border-sky-400/40',
  lista: 'border-emerald-400/40',
};

// Rutas de avance; al ENTREGAR se intenta primero la ruta de entrega
// (pos_compat E-14q) y luego las de avance de toda la vida.
const rutasAvance = (id: string, esEntrega: boolean): string[] =>
  esEntrega
    ? [
        `/pos/kitchen/orders/${id}/deliver`,
        `/pos/kitchen/orders/${id}/advance`,
        `/pos/kitchen/orders/${id}/status`,
      ]
    : [`/pos/kitchen/orders/${id}/advance`, `/pos/kitchen/orders/${id}/status`];

function TarjetaComanda({
  comanda,
  avanzando,
  onAvanzar,
}: {
  comanda: any;
  avanzando: boolean;
  onAvanzar: (id: string, esEntrega?: boolean) => void;
}) {
  const estado = estadoDe(comanda);
  const minutos = minutosDe(comanda);
  const codigo = codigoDe(comanda);
  const items: any[] = Array.isArray(comanda?.items) ? comanda.items : [];
  const tieneNotas = items.some((it) => notaItem(it) !== '');

  return (
    <div className={`rounded-2xl border bg-slate-900 p-4 ${bordePorEstado[estado]}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-slate-100">{textoMesaDe(comanda)}</p>
          {codigo && (
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Comanda {codigo}</p>
          )}
        </div>
        <span
          className={`rounded-full px-2 py-1 text-[11px] font-bold ${
            minutos >= 10 ? 'bg-rose-500/15 text-rose-300' : 'bg-slate-800 text-slate-300'
          }`}
        >
          {minutos} min
        </span>
      </div>

      {tieneNotas && (
        <span className="mt-2 inline-block rounded-full bg-amber-400/15 px-2.5 py-1 text-[11px] font-bold text-amber-300">
          Tiene especificaciones
        </span>
      )}

      <ul className="mt-3 space-y-2.5">
        {items.map((it, i) => {
          const nota = notaItem(it);
          return (
            <li key={String(it?.id ?? i)}>
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-bold text-amber-400">{cantidadItem(it)}×</span>
                <span className="text-sm text-slate-100">{nombreItem(it)}</span>
              </div>
              {nota && (
                <div className="mt-1 rounded-lg border border-amber-400/40 bg-amber-400/10 px-2.5 py-1.5">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-amber-300">Especificación</p>
                  <p className="text-xs leading-snug text-amber-200">{nota}</p>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {estado !== 'lista' ? (
        <button
          type="button"
          onClick={() => onAvanzar(String(comanda?.id ?? ''))}
          disabled={avanzando || !comanda?.id}
          className={`mt-3 w-full rounded-xl py-2.5 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${
            estado === 'pendiente'
              ? 'bg-sky-400 text-slate-950 hover:bg-sky-300'
              : 'bg-emerald-400 text-slate-950 hover:bg-emerald-300'
          }`}
        >
          {avanzando ? 'Actualizando…' : estado === 'pendiente' ? 'Iniciar preparación' : 'Marcar como lista'}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => onAvanzar(String(comanda?.id ?? ''), true)}
          disabled={avanzando || !comanda?.id}
          className="mt-3 w-full rounded-xl bg-emerald-400 py-2.5 text-xs font-bold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {avanzando ? 'Actualizando…' : 'Entregar'}
        </button>
      )}
    </div>
  );
}

const COLUMNAS: { estado: EstadoKds; titulo: string; pista: string; chip: string }[] = [
  { estado: 'pendiente', titulo: 'Pendientes', pista: 'Por iniciar', chip: 'bg-amber-400/15 text-amber-300' },
  { estado: 'preparando', titulo: 'En preparación', pista: 'En manos de cocina', chip: 'bg-sky-400/15 text-sky-300' },
  { estado: 'lista', titulo: 'Listas', pista: 'Para entregar al mesero', chip: 'bg-emerald-400/15 text-emerald-300' },
];

export default function CocinaPage() {
  const queryClient = useQueryClient();
  const respuesta: any = useComandas();
  const mutacionAvance: any = useAvanzarComanda ? useAvanzarComanda() : null;
  const [avanzandoId, setAvanzandoId] = useState<string | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);

  const comandas = useMemo(() => extraerLista(respuesta), [respuesta]);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 3200);
    return () => clearTimeout(t);
  }, [aviso]);

  const avanzar = async (id: string, esEntrega = false) => {
    if (!id || avanzandoId) return;
    setAvanzandoId(id);
    const rutas = rutasAvance(id, esEntrega);
    try {
      let enviado = false;
      // 1) Intento por el hook del proyecto (si existe)
      if (mutacionAvance?.mutateAsync) {
        try {
          await mutacionAvance.mutateAsync(id);
          enviado = true;
        } catch {
          enviado = false; // cae al plan B de rutas directas
        }
      }
      // 2) Plan B: cadena de rutas directas (deliver → advance → status)
      if (!enviado) {
        let ultimo: any = null;
        for (const ruta of rutas) {
          try {
            await api.post(ruta, {});
            enviado = true;
            break;
          } catch (e: any) {
            ultimo = e;
            const st = e?.response?.status;
            if (st !== 404 && st !== 405) throw e;
          }
        }
        if (!enviado) throw ultimo ?? new Error('No se pudo actualizar la comanda');
      }
      await queryClient.invalidateQueries();
      setAviso({
        tipo: 'ok',
        texto: esEntrega ? 'Comanda entregada al mesero.' : 'Comanda actualizada.',
      });
    } catch (e: any) {
      const detalle = e?.response?.data?.detail;
      setAviso({
        tipo: 'error',
        texto: typeof detalle === 'string' ? detalle : 'No se pudo actualizar la comanda.',
      });
    } finally {
      setAvanzandoId(null);
    }
  };

  if (respuesta?.isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 px-6 py-10 text-sm text-slate-400">Cargando comandas…</div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Cocina</h1>
            <p className="text-sm text-slate-400">
              Comandas en vivo. Las especificaciones del cliente aparecen resaltadas en ámbar.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-2 text-xs text-slate-400">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
              En vivo
            </span>
            <button
              type="button"
              onClick={() => queryClient.invalidateQueries()}
              className="rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-300 hover:border-amber-400/60 hover:text-amber-300"
            >
              Actualizar
            </button>
          </div>
        </header>

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {COLUMNAS.map((col) => {
            const tarjetas = comandas.filter((c: any) => estadoDe(c) === col.estado);
            return (
              <section key={col.estado} className="rounded-2xl border border-slate-800 bg-slate-900/40 p-3">
                <div className="flex items-center justify-between px-1 pb-3">
                  <div>
                    <h2 className="text-sm font-bold text-slate-100">{col.titulo}</h2>
                    <p className="text-[11px] text-slate-500">{col.pista}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${col.chip}`}>
                    {tarjetas.length}
                  </span>
                </div>
                <div className="space-y-3">
                  {tarjetas.length === 0 && (
                    <p className="rounded-xl border border-dashed border-slate-800 px-3 py-6 text-center text-xs text-slate-600">
                      Sin comandas aquí
                    </p>
                  )}
                  {tarjetas.map((c: any, i: number) => (
                    <TarjetaComanda
                      key={String(c?.id ?? i)}
                      comanda={c}
                      avanzando={avanzandoId === String(c?.id ?? '')}
                      onAvanzar={avanzar}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {aviso && (
        <div
          className={`fixed bottom-5 right-5 z-50 rounded-xl border px-4 py-3 text-sm font-medium shadow-xl ${
            aviso.tipo === 'ok'
              ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
              : 'border-rose-500/40 bg-rose-500/15 text-rose-300'
          }`}
        >
          {aviso.texto}
        </div>
      )}
    </div>
  );
}