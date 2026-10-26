// src/components/mesas/MapaMesas.tsx — v3 · E-14t44 — MAPA PREMIUM (look de salón real)
// ─────────────────────────────────────────────────────────────────────────
// Qué cambió vs la v2 (MISMA lógica, otro nivel visual — pedazo del socio):
//   · Tarjetas tipo POS real: la mesa se DIBUJA como mesa (elipse con el
//     nombre adentro) rodeada de sillitas según su capacidad verdadera.
//   · Estados con color completo: Libre (verde esmeralda), Ocupada (rojo
//     con punto pulsante), y la mesa que tienes abierta lleva aro ámbar
//     con brillo + badge «ABIERTA».
//   · Hover con elevación (se levanta la tarjeta) y sombra de color.
//   · Leyenda arriba del mapa con el conteo, y estado vacío con una mini
//     mesa dibujada en vez del cajón gris de antes.
//   · Eliminar SIGUE con SweetAlert2 tema Kārei (confirmarAccion) — nada
//     de cuadritos grises del navegador.
//
// Contrato de props INTACTO con TablesPage (shotgun): mesas, areas,
// ocupadas, seleccionar/alSeleccionar/onSeleccionar/alClick/onClick,
// eliminarMesa/onEliminar/eliminar. Opcional: mesaId (resalta la abierta).
//
// Subcomponentes a NIVEL DE MÓDULO (lección E-14z-g): nunca dentro de otro
// componente, para que el hover y el cursor no se pierdan.
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

// ── Sillitas alrededor de la mesa (máx. 8 dibujadas; el total real va en el pie) ──
function Sillas({ n, color }: { n: number; color: string }) {
  if (n <= 0) return null;
  return (
    <div className="flex gap-1.5">
      {Array.from({ length: n }).map((_, i) => (
        <span key={i} className={'h-1.5 w-1.5 rounded-full ' + color} />
      ))}
    </div>
  );
}

// ── Tarjeta de una mesa: pill de estado + mesa dibujada + pie ──
function TarjetaMesa(props: any) {
  const m = props.mesa;
  const ocupada = !!props.ocupada;
  const esSel = !!props.esSel;
  const cap = capDe(m);
  const nSillas = Math.min(cap, 8);
  const arriba = Math.ceil(nSillas / 2);
  const abajo = Math.floor(nSillas / 2);

  // Marco y fondo de la tarjeta según estado
  const marco = esSel
    ? 'border-amber-400/90 shadow-lg shadow-amber-500/20 ring-2 ring-amber-400/40'
    : ocupada
      ? 'border-red-500/40 shadow-lg shadow-black/20 hover:border-red-400/70 hover:shadow-red-500/10'
      : 'border-slate-700/80 shadow-lg shadow-black/20 hover:border-emerald-400/60 hover:shadow-emerald-500/10';
  const fondo = esSel
    ? 'bg-gradient-to-b from-amber-500/15 via-slate-900/40 to-slate-900/60'
    : ocupada
      ? 'bg-gradient-to-b from-red-950/50 via-slate-900/40 to-slate-900/60'
      : 'bg-gradient-to-b from-slate-800/80 via-slate-900/40 to-slate-900/60';

  const sillaColor = esSel
    ? 'bg-amber-300/90'
    : ocupada
      ? 'bg-red-400/80'
      : 'bg-emerald-400/80';

  // La elipse (la mesa en sí)
  const elipse = esSel
    ? 'border-amber-300/90 bg-gradient-to-br from-amber-400/30 via-amber-500/10 to-transparent'
    : ocupada
      ? 'border-red-400/60 bg-gradient-to-br from-red-500/25 via-red-500/5 to-transparent'
      : 'border-emerald-400/50 bg-gradient-to-br from-emerald-500/20 via-emerald-500/5 to-transparent';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={props.alElegir}
      onKeyDown={(e: any) => {
        if (e?.key === 'Enter' || e?.key === ' ') props.alElegir?.();
      }}
      className={
        'group relative cursor-pointer select-none rounded-2xl border p-4 transition-all duration-200 hover:-translate-y-0.5 ' +
        marco + ' ' + fondo
      }
    >
      {/* Fila superior: estado + papelera (aparece al pasar el mouse) */}
      <div className="flex items-start justify-between gap-2">
        <span
          className={
            'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ' +
            (ocupada ? 'bg-red-500/15 text-red-300' : 'bg-emerald-500/15 text-emerald-300')
          }
        >
          {ocupada ? (
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-400" />
            </span>
          ) : (
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          )}
          {ocupada ? 'Ocupada' : 'Libre'}
        </span>
        {props.puedeDel && (
          <button
            onClick={(e: any) => { e.stopPropagation(); props.alEliminar(); }}
            title={'Eliminar ' + nombreDe(m)}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-red-500/40 bg-slate-900/60 text-xs text-red-300 opacity-0 transition hover:bg-red-500/25 hover:text-red-200 focus:opacity-100 group-hover:opacity-100"
          >
            🗑
          </button>
        )}
      </div>

      {/* La mesa dibujada: sillas arriba + elipse con el nombre + sillas abajo */}
      <div className="flex flex-col items-center gap-1.5 py-3">
        <Sillas n={arriba} color={sillaColor} />
        <div
          className={
            'flex h-14 w-28 items-center justify-center rounded-[50%] border-2 shadow-inner ' + elipse
          }
        >
          <span
            className={
              'max-w-[88px] truncate px-1 text-center text-sm font-black leading-tight ' +
              (esSel ? 'text-amber-100' : 'text-white')
            }
          >
            {nombreDe(m)}
          </span>
        </div>
        <Sillas n={abajo} color={sillaColor} />
      </div>

      {/* Pie: capacidad + badge de mesa abierta */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-slate-400">
          {cap > 0 ? cap + ' ' + (cap === 1 ? 'puesto' : 'puestos') : 'Capacidad libre'}
        </span>
        {esSel && (
          <span className="text-[10px] font-black uppercase tracking-wider text-amber-300">
            ● Abierta
          </span>
        )}
      </div>
    </div>
  );
}

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

  // ── ELIMINAR CON SWEETALERT (igual que v2: nada de confirm nativo) ──
  const del = async (m: any) => {
    if (!delFn) return;
    const ok = await confirmarAccion({
      titulo: '¿Eliminar ' + nombreDe(m) + '?',
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
        alertaError(
          'No se pudo eliminar la mesa',
          'Si tiene pedidos o pagos asociados, se conserva por trazabilidad contable.',
        );
        return;
      }
      toastOk('Mesa «' + nombreDe(m) + '» eliminada');
    } catch (e: any) {
      alertaError('No se pudo eliminar la mesa', e?.message ?? '');
    }
  };

  if (!mesas.length && !grupos.length) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-slate-700 p-10 text-center">
        {/* Mini mesa decorativa mientras el salón está vacío */}
        <div className="mx-auto mb-4 flex w-fit flex-col items-center gap-1.5 opacity-60">
          <div className="flex gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
            <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
          </div>
          <div className="flex h-12 w-24 items-center justify-center rounded-[50%] border-2 border-slate-600 bg-slate-800/50">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Kārei
            </span>
          </div>
          <div className="flex gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
            <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
          </div>
        </div>
        <p className="text-sm font-semibold text-slate-300">El mapa está vacío</p>
        <p className="mt-1 text-sm text-slate-500">
          Crea la primera mesa con{' '}
          <span className="font-semibold text-amber-300">＋ Nueva mesa</span> o usa{' '}
          <span className="font-semibold text-amber-300">Mesas demo</span> para poblar el salón de
          un clic.
        </p>
      </div>
    );
  }

  // Conteo global para la leyenda
  let total = 0;
  let libres = 0;
  for (const g of grupos) {
    for (const m of g.mesas) {
      total += 1;
      const id = idDe(m);
      if (!(ocupadasSet.has(String(id)) || !!m?.ocupada)) libres += 1;
    }
  }

  return (
    <div className="space-y-6">
      {/* Leyenda + resumen del salón */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-400" /> Libre
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-red-500" /> Ocupada
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-amber-400" /> Mesa abierta (su cuenta está en el
          panel)
        </span>
        <span className="ml-auto font-semibold text-slate-500">
          {total} {total === 1 ? 'mesa' : 'mesas'} · {libres} {libres === 1 ? 'libre' : 'libres'}
        </span>
      </div>

      {grupos.map((g: Grupo) => (
        <div key={g.nombre}>
          <div className="mb-3 flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-300/80">
              {g.nombre}
            </span>
            <span className="h-px flex-1 bg-gradient-to-r from-slate-700/80 to-transparent" />
            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-400">
              {g.mesas.length}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {g.mesas.map((m: any) => {
              const id = idDe(m);
              const ocupada = ocupadasSet.has(String(id)) || !!m?.ocupada;
              const esSel = selId !== '' && String(id) === selId;
              return (
                <TarjetaMesa
                  key={String(id)}
                  mesa={m}
                  ocupada={ocupada}
                  esSel={esSel}
                  puedeDel={!!delFn}
                  alElegir={() => sel(m)}
                  alEliminar={() => del(m)}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export default MapaMesas;