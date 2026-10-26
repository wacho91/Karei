// src/components/mesas/MapaMesas.tsx — v2 · E-14t41 — MAPA CON SWEETALERT
// ─────────────────────────────────────────────────────────────────────────
// Reemplazo COMPLETO del mapa (el que tenías era de la reestructuración
// vieja y usaba el confirm() NATIVO del navegador: el cuadrito gris
// "localhost:3000 dice: ¿Eliminar Terraza 2?..."). Ahora:
//   · Eliminar mesa pide confirmación con SweetAlert2 tema Kārei
//     (confirmarAccion de lib/alertas) y avisa el resultado con toast.
//   · Tarjetas Libre (punto verde) / Ocupada (punto rojo pulsante).
//   · Resalta la mesa que tienes abierta (prop nueva opcional mesaId).
//   · Agrupa por áreas si llegan del hook (useMesas v10), o las arma él
//     mismo agrupando por el campo área de cada mesa.
//
// Contrato de props INTACTO con TablesPage (shotgun): mesas, areas,
// ocupadas, seleccionar/alSeleccionar/onSeleccionar/alClick/onClick,
// eliminarMesa/onEliminar/eliminar. Nuevo OPCIONAL: mesaId (resalta la
// mesa abierta en el panel derecho).
//
// Este componente se define a NIVEL DE MÓDULO (lección E-14z-g): nunca
// dentro de otro componente, para que el cursor y el hover no se pierdan.
// ─────────────────────────────────────────────────────────────────────────
import { confirmarAccion, toastOk, alertaError } from '../../lib/alertas';

const _txt = (v: any) => String(v ?? '').trim();
const nombreDe = (m: any) =>
  _txt(m?.nombre ?? m?.name ?? m?.label) ||
  (m?.code != null ? `Mesa ${m.code}` : '') || 'Mesa';
const areaDe = (m: any) => _txt(m?.area ?? m?.area_name ?? m?.zona ?? m?.zone) || 'Salón';
const capDe = (m: any) =>
  Number(m?.capacidad ?? m?.capacity ?? m?.seats ?? m?.personas ?? 0) || 0;
const idDe = (m: any) => m?.id ?? m?._id ?? m?.code ?? nombreDe(m);

interface Grupo { nombre: string; mesas: any[]; }

export function MapaMesas(props: any) {
  const p: any = props ?? {};
  const mesas: any[] = Array.isArray(p.mesas) ? p.mesas : [];
  const ocupadasSet = new Set<string>(
    (Array.isArray(p.ocupadas) ? p.ocupadas : []).map((x: any) => String(x)),
  );

  const selFn: any = p.seleccionar ?? p.alSeleccionar ?? p.onSeleccionar ?? p.alClick ?? p.onClick;
  const delFn: any = p.eliminarMesa ?? p.onEliminar ?? p.eliminar;
  const selId = p.mesaId != null ? String(p.mesaId) : '';

  // Grupos: del hook (areas) o armados en cliente por el campo área
  const grupos: Grupo[] = [];
  if (Array.isArray(p.areas) && p.areas.length) {
    for (const a of p.areas) {
      const lista = (a?.mesas ?? a?.tables ?? []).filter(Boolean);
      if (lista.length) {
        grupos.push({ nombre: _txt(a?.nombre ?? a?.name ?? a?.id) || 'Salón', mesas: lista });
      }
    }
  }
  if (!grupos.length && mesas.length) {
    const tmp: any = {};
    for (const m of mesas) {
      const a = areaDe(m);
      (tmp[a] = tmp[a] || []).push(m);
    }
    for (const nombre of Object.keys(tmp)) grupos.push({ nombre, mesas: tmp[nombre] });
  }

  const sel = (m: any) => selFn?.(m);

  // ── ELIMINAR CON SWEETALERT (adiós al confirm nativo del navegador) ──
  const del = async (m: any) => {
    if (!delFn) return;
    const ok = await confirmarAccion({
      titulo: `¿Eliminar ${nombreDe(m)}?`,
      texto:
        'Esta acción no se puede deshacer.\n' +
        'Si la mesa tiene historial de ventas, el sistema NO la elimina (trazabilidad contable).',
      textoSi: 'Sí, eliminar mesa',
      peligro: true,
    });
    if (!ok) return;
    try {
      const r = await delFn(idDe(m));
      if (r === false) {
        alertaError('No se pudo eliminar la mesa',
          'Si tiene pedidos o pagos asociados, se conserva por trazabilidad contable.');
        return;
      }
      toastOk(`Mesa «${nombreDe(m)}» eliminada`);
    } catch (e: any) {
      alertaError('No se pudo eliminar la mesa', e?.message ?? '');
    }
  };

  if (!mesas.length && !grupos.length) {
    return (
      <div className="rounded-xl border border-dashed border-slate-700 p-6 text-center">
        <p className="text-sm text-slate-400">
          El mapa está vacío. Crea la primera mesa con{' '}
          <span className="font-semibold text-amber-300">＋ Nueva mesa</span>.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {grupos.map((g: Grupo) => (
        <div key={g.nombre}>
          <div className="mb-2 flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-300/80">
              {g.nombre}
            </span>
            <span className="h-px flex-1 bg-slate-700/60" />
            <span className="text-[11px] text-slate-500">{g.mesas.length}</span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {g.mesas.map((m: any) => {
              const id = idDe(m);
              const ocupada = ocupadasSet.has(String(id)) || !!m?.ocupada;
              const esSel = selId !== '' && String(id) === selId;
              const cap = capDe(m);
              return (
                <div
                  key={String(id)}
                  role="button"
                  onClick={() => sel(m)}
                  className={
                    'group relative cursor-pointer rounded-2xl border p-4 transition ' +
                    (esSel
                      ? 'border-amber-400 bg-amber-500/10 ring-2 ring-amber-400/40'
                      : ocupada
                        ? 'border-red-500/40 bg-red-500/5 hover:border-red-400/70'
                        : 'border-slate-700 bg-slate-800/60 hover:border-amber-500/50')
                  }
                >
                  {delFn && (
                    <button
                      onClick={(e: any) => { e.stopPropagation(); del(m); }}
                      title={`Eliminar ${nombreDe(m)}`}
                      className="absolute right-2 top-2 hidden h-7 w-7 items-center justify-center rounded-lg border border-red-500/40 text-xs text-red-300 hover:bg-red-500/20 group-hover:flex"
                    >
                      🗑
                    </button>
                  )}
                  <div className="flex items-center gap-2">
                    {ocupada ? (
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                      </span>
                    ) : (
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                    )}
                    <span
                      className={
                        'text-[11px] font-semibold ' +
                        (ocupada ? 'text-red-300' : 'text-emerald-300')
                      }
                    >
                      {ocupada ? 'Ocupada' : 'Libre'}
                    </span>
                  </div>
                  <p
                    className={
                      'mt-2 text-base font-bold leading-tight ' +
                      (esSel ? 'text-amber-200' : 'text-white')
                    }
                  >
                    {nombreDe(m)}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {cap > 0 ? `${cap} ${cap === 1 ? 'puesto' : 'puestos'}` : '—'}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export default MapaMesas;