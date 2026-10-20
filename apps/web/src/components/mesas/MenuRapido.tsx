// src/components/mesas/MenuRapido.tsx — v2 (E-11)
// FIX crash: lista undefined ya NO revienta (antes: .forEach sin guardia).
// Buscador + tarjetas de productos; clic en + va al borrador del pedido.
import { useMemo, useState } from 'react';
import { alertaError, toastOk } from '../../lib/alertas';

const nombreR = (r: any) => r?.name ?? r?.nombre ?? r?.title ?? 'Producto';
const precioR = (r: any) => Number(r?.price ?? r?.precio ?? r?.sale_price ?? 0) || 0;
const pesos = (n: number) => '$' + Math.round(n).toLocaleString('es-CO');

type Props = { [k: string]: any };

export default function MenuRapido(props: Props) {
  const p = props;
  const [q, setQ] = useState('');
  const lista: any[] = useMemo(() => {
    const base = p.recetas ?? p.menu ?? p.items ?? [];
    return Array.isArray(base) ? base : [];
  }, [p.recetas, p.menu, p.items]);

  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return lista;
    return lista.filter((r: any) => String(nombreR(r)).toLowerCase().includes(t));
  }, [lista, q]);

  const agregar = p.alBorrador ?? p.agregar ?? p.onAgregar;
  const recargar = p.onRecargar ?? p.recargar ?? p.reintentar;
  const error = p.error ?? p.errorMenu ?? '';

  return (
    <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-bold text-white mr-auto">Menú rápido</h2>
        {recargar && (
          <button onClick={() => recargar()} className="text-xs px-2 py-1 rounded-lg bg-slate-700 text-slate-200 hover:bg-slate-600">Refrescar</button>
        )}
      </div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto..."
        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500" />

      {error ? (
        <div className="space-y-2">
          <p className="text-xs text-red-300 break-words">{error}</p>
          {recargar && (
            <button onClick={() => recargar()} className="px-3 py-1.5 rounded-lg bg-amber-500 text-slate-900 text-xs font-semibold hover:bg-amber-400">Reintentar</button>
          )}
        </div>
      ) : filtrados.length === 0 ? (
        <p className="text-xs text-slate-400 py-3 text-center">
          {lista.length === 0 ? 'Sin productos en el menú. Créalos en la sección Recetas.' : 'Nada coincide con la búsqueda.'}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
          {filtrados.map((r: any, i: number) => (
            <div key={r?.id ?? r?.recipe_id ?? i} className="flex items-center gap-1 bg-slate-900/60 rounded-lg px-2 py-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white truncate">{nombreR(r)}</p>
                <p className="text-[11px] text-slate-400">{pesos(precioR(r))}</p>
              </div>
              <button
                onClick={() => { try { agregar?.(r); toastOk(`${nombreR(r)} al pedido`); } catch (e: any) { alertaError(e?.message ?? 'No se pudo agregar'); } }}
                className="w-7 h-7 rounded-lg bg-amber-500 text-slate-900 text-sm font-bold hover:bg-amber-400">+</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}