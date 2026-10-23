// src/components/mesas/MapaMesas.tsx — v3 (E-14y) · Mapa EN VIVO + ZONAS PLEGABLES
// ─────────────────────────────────────────────────────────────────────────
// QUÉ CAMBIA FRENTE AL MAPA VIEJO (el del repo original):
// 1. SIN barra propia: ni botones fantasma, ni "Nueva mesa" duplicado,
//    ni demo/diagnóstico. El encabezado lo pone TablesPage (un solo botón:
//    ＋ Nueva mesa). Este componente SOLO dibuja el mapa.
// 2. MESAS DE VERDAD: redondas con sillas alrededor (hasta 6 puestos) y
//    rectangulares largas (8+ puestos), pintadas según su estado.
// 3. ESTADO REAL EN VIVO: consulta GET /pos/mapa (add-on pos_cuenta_live
//    E-14x) cada 10 segundos. Una mesa se pinta OCUPADA cuando tiene
//    pedidos sin pagar (aunque el campo status de `tables` diga "Libre")
//    y muestra su consumo abierto ($ y # de comandas). Vuelve a LIBRE sola
//    al cobrar. Si el add-on aún no está, usa los props viejos (ocupadas,
//    mesa.status) — nunca se rompe.
// 4. Zonas agrupadas (Salón, Terraza...) con contador, mesa seleccionada
//    resaltada, eliminar con confirmación (✕ al pasar el mouse).
// 5. NUEVO v3 — ZONAS PLEGABLES (como en Recetas): clic en el título de una
//    zona para recogerla o volver a mostrarla (animación suave). Botón
//    "Recoger todas / Mostrar todas" junto a la línea En vivo. Lo recogido
//    se recuerda entre recargas (localStorage).
// Props que acepta (los mismos de siempre + 1 nuevo): mesas, ocupadas,
//   seleccionar / alSeleccionar / onSeleccionar / alClick / onClick,
//   eliminarMesa / onEliminar / eliminar, mesaSeleccionada (nuevo, id).
// ─────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import * as apiModule from '../../lib/api';

const api: any = (apiModule as any).default ?? (apiModule as any).api ?? apiModule;

type Mesa = Record<string, any>;

/** 'Mesa-1' / 'MESA 1' → 'mesa1' (llave para casar front y add-on) */
const norma = (x: any): string =>
  String(x ?? '').trim().replace(/-/g, '').toLowerCase();

/** primer campo con valor de una lista de aliases */
const de = (m: Mesa, campos: string[]): any => {
  for (const c of campos) {
    const v = m?.[c];
    if (v !== null && v !== undefined && v !== '') return v;
  }
  return undefined;
};

const nombreDe = (m: Mesa): string =>
  String(de(m, ['nombre', 'name', 'label', 'etiqueta']) ??
    (m?.number != null ? `Mesa ${m.number}` : m?.code ?? 'Mesa'));

const zonaDe = (m: Mesa): string =>
  String(de(m, ['zona', 'zone', 'area', 'section', 'sector',
    'ubicacion', 'location', 'ambiente']) ?? 'Mesas').trim() || 'Mesas';

const puestosDe = (m: Mesa): number => {
  const v = de(m, ['capacidad', 'capacity', 'seats', 'puestos',
    'personas', 'sillas']);
  const n = parseInt(String(v ?? 4), 10);
  return Number.isFinite(n) && n > 0 ? n : 4;
};

const formaDe = (m: Mesa): 'redonda' | 'rectangular' =>
  puestosDe(m) > 6 ? 'rectangular' : 'redonda';

/** ── Silla dibujada (vista superior) ─────────────────────────────────── */
function Silla({ ocupada, estilo }: { ocupada: boolean; estilo: React.CSSProperties }) {
  return (
    <span
      className={
        'absolute block h-2.5 w-4 rounded-[4px] border transition-colors ' +
        (ocupada
          ? 'border-amber-400/60 bg-amber-500/40'
          : 'border-slate-600 bg-slate-700/80')
      }
      style={estilo}
    />
  );
}

/** ── Mesa REDONDA con sillas alrededor ──────────────────────────────── */
function MesaRedonda({ puestos, ocupada }: { puestos: number; ocupada: boolean }) {
  const n = Math.min(Math.max(puestos, 2), 8);
  return (
    <div className="relative mx-auto h-24 w-24">
      {Array.from({ length: n }).map((_, i) => {
        const ang = (360 / n) * i - 90; // la primera silla arriba
        return (
          <Silla
            key={i}
            ocupada={ocupada}
            estilo={{
              left: '50%',
              top: '50%',
              transform:
                `translate(-50%,-50%) rotate(${ang}deg) translate(0,-42px) rotate(${-ang}deg)`,
            }}
          />
        );
      })}
      <div
        className={
          'absolute inset-[13px] flex items-center justify-center rounded-full border-2 transition-colors ' +
          (ocupada
            ? 'border-amber-400/80 bg-amber-500/25 shadow-[0_0_16px_rgba(251,191,36,0.30)]'
            : 'border-slate-600 bg-slate-700/60')
        }
      >
        <span className={'text-[11px] font-semibold ' + (ocupada ? 'text-amber-100' : 'text-slate-400')}>
          {puestos}
        </span>
      </div>
    </div>
  );
}

/** ── Mesa RECTANGULAR larga (8+ puestos) ────────────────────────────── */
function MesaRectangular({ puestos, ocupada }: { puestos: number; ocupada: boolean }) {
  const n = Math.min(Math.max(puestos, 8), 12);
  const arriba = Math.ceil(n / 2);
  const abajo = n - arriba;
  const fila = (k: number, lado: 'arriba' | 'abajo') =>
    Array.from({ length: k }).map((_, i) => (
      <Silla
        key={`${lado}-${i}`}
        ocupada={ocupada}
        estilo={{
          left: `${((i + 1) / (k + 1)) * 100}%`,
          [lado === 'arriba' ? 'top' : 'bottom']: '-4px',
          transform: 'translateX(-50%)',
        }}
      />
    ));
  return (
    <div className="relative mx-auto h-24 w-44">
      {fila(arriba, 'arriba')}
      {fila(abajo, 'abajo')}
      <div
        className={
          'absolute inset-x-5 inset-y-4 flex items-center justify-center rounded-xl border-2 transition-colors ' +
          (ocupada
            ? 'border-amber-400/80 bg-amber-500/25 shadow-[0_0_16px_rgba(251,191,36,0.30)]'
            : 'border-slate-600 bg-slate-700/60')
        }
      >
        <span className={'text-[11px] font-semibold ' + (ocupada ? 'text-amber-100' : 'text-slate-400')}>
          {puestos} p
        </span>
      </div>
    </div>
  );
}

/** ── Tarjeta de una mesa ────────────────────────────────────────────── */
function TarjetaMesa({
  mesa, ocupada, total, nPedidos, seleccionada, alElegir, alEliminar,
}: {
  mesa: Mesa; ocupada: boolean; total: number; nPedidos: number;
  seleccionada: boolean; alElegir: (m: Mesa) => void; alEliminar: (m: Mesa) => void;
}) {
  const nombre = nombreDe(mesa);
  const zona = zonaDe(mesa);
  const puestos = puestosDe(mesa);
  const forma = formaDe(mesa);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => alElegir(mesa)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') alElegir(mesa); }}
      className={
        'group relative cursor-pointer rounded-2xl border p-3 outline-none transition-all hover:-translate-y-0.5 ' +
        (seleccionada
          ? 'border-amber-400/80 bg-amber-500/10 ring-2 ring-amber-400/70'
          : ocupada
            ? 'border-amber-500/40 bg-slate-800/60 hover:border-amber-400/70'
            : 'border-slate-700/70 bg-slate-800/50 hover:border-slate-500')
      }
    >
      <button
        onClick={(e) => { e.stopPropagation(); alEliminar(mesa); }}
        title={`Eliminar ${nombre}`}
        className="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-md text-slate-500 opacity-0 transition-all hover:bg-red-500/15 hover:text-red-400 focus:opacity-100 group-hover:opacity-100"
      >
        ✕
      </button>

      <div className="pr-6 text-sm font-semibold text-white">{nombre}</div>
      <div className="mb-2 text-[11px] text-slate-400">
        {puestos} personas · {zona}
      </div>

      {forma === 'redonda'
        ? <MesaRedonda puestos={puestos} ocupada={ocupada} />
        : <MesaRectangular puestos={puestos} ocupada={ocupada} />}

      <div className="mt-3 flex min-h-[26px] flex-wrap items-center gap-1.5">
        {ocupada ? (
          <>
            <span className="rounded-full border border-amber-400/40 bg-amber-500/20 px-2 py-0.5 text-[11px] font-semibold text-amber-200">
              Ocupada
            </span>
            {total > 0 && (
              <span className="rounded-full border border-slate-600 bg-slate-900/60 px-2 py-0.5 text-[11px] font-bold text-white">
                ${total.toLocaleString('es-CO')}
              </span>
            )}
            {nPedidos > 0 && (
              <span className="text-[11px] text-slate-400">
                {nPedidos} comanda{nPedidos > 1 ? 's' : ''}
              </span>
            )}
          </>
        ) : (
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
            Libre
          </span>
        )}
        {seleccionada && (
          <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[11px] font-bold text-slate-900">
            Abierta
          </span>
        )}
      </div>
    </div>
  );
}

/** ── MAPA DE MESAS (componente principal) ───────────────────────────── */
export function MapaMesas(props: any) {
  const {
    mesas, ocupadas, seleccionar, alSeleccionar, onSeleccionar, alClick, onClick,
    eliminarMesa, onEliminar, eliminar, mesaSeleccionada,
  } = props;

  const lista: Mesa[] = Array.isArray(mesas) ? mesas : (Array.isArray(mesas?.data) ? mesas.data : []);
  const [vivo, setVivo] = useState<Record<string, any>>({});
  const [resumen, setResumen] = useState<any>(null);

  // ── ZONAS PLEGABLES (como en Recetas): se recogen y se vuelven a mostrar.
  // Lo recogido se recuerda entre recargas en localStorage.
  const [plegadas, setPlegadas] = useState<Record<string, boolean>>(() => {
    try {
      const g = JSON.parse(localStorage.getItem('karei-zonas-plegadas') ?? '{}');
      return g && typeof g === 'object' ? g : {};
    } catch { return {}; }
  });
  useEffect(() => {
    try { localStorage.setItem('karei-zonas-plegadas', JSON.stringify(plegadas)); } catch { /* noop */ }
  }, [plegadas]);
  const toggleZona = (z: string) => setPlegadas((p) => ({ ...p, [z]: !p[z] }));

  // ── ESTADO EN VIVO: GET /pos/mapa cada 10 s (add-on E-14x) ──────────
  useEffect(() => {
    let montado = true;
    const cargar = async () => {
      try {
        const r: any = await api.get('/pos/mapa');
        const d: any = r?.data ?? r;
        const arr: any[] = Array.isArray(d) ? d : (d?.mesas ?? d?.tables ?? []);
        const idx: Record<string, any> = {};
        for (const t of arr) {
          for (const k of [t?.id, t?.table_id, t?.mesa_id, t?.code, t?.nombre, t?.name]) {
            if (k !== null && k !== undefined && k !== '') idx[norma(k)] = t;
          }
        }
        if (!montado) return;
        setVivo(idx);
        setResumen(d?.resumen ?? null);
      } catch {
        /* add-on aún no instalado o backend apagado → se usan los props */
      }
    };
    cargar();
    const t = setInterval(cargar, 10000);
    return () => { montado = false; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const infoDe = (m: Mesa): { ocupada: boolean; total: number; nPedidos: number } => {
    const v = vivo[norma(m?.id)] ?? vivo[norma(m?.code)] ??
      vivo[norma(m?.nombre)] ?? vivo[norma(m?.name)];
    if (v) {
      return {
        ocupada: v.estado === 'OCUPADA' || v.ocupada === true,
        total: Number(v.total ?? v.subtotal ?? 0) || 0,
        nPedidos: Number(v.n_pedidos ?? v.n_comandas ?? 0) || 0,
      };
    }
    // ── Fallbacks (si el add-on aún no está): props viejos ────────────
    const st = String(m?.status ?? m?.estado ?? '').toUpperCase();
    if (st.includes('OCUP') || st.includes('OCCUPIED')) {
      return { ocupada: true, total: 0, nPedidos: 0 };
    }
    const idN = norma(m?.id); const codeN = norma(m?.code); const nomN = norma(m?.name);
    const enOcupadas = (Array.isArray(ocupadas) ? ocupadas : []).some((o: any) => {
      const k = typeof o === 'object' && o !== null
        ? norma(o.id ?? o.table_id ?? o.mesa_id ?? o.code ?? o.name)
        : norma(o);
      return k && (k === idN || k === codeN || k === nomN);
    });
    if (enOcupadas || m?.ocupada === true) {
      return { ocupada: true, total: 0, nPedidos: 0 };
    }
    return { ocupada: false, total: 0, nPedidos: 0 };
  };

  const elegir = (m: Mesa) => {
    const f = seleccionar ?? alSeleccionar ?? onSeleccionar ?? alClick ?? onClick;
    f?.(m);
  };

  const quitar = (m: Mesa) => {
    const f = eliminarMesa ?? onEliminar ?? eliminar;
    if (!f) return;
    const nombre = nombreDe(m);
    if (window.confirm(`¿Eliminar ${nombre}? Esta acción no se puede deshacer.`)) {
      f(m?.id ?? m?.code ?? m);
    }
  };

  // ── Agrupar por zona + orden natural (Mesa 2 antes que Mesa 10) ─────
  const gruposMap: Record<string, Mesa[]> = {};
  for (const m of lista) {
    const z = zonaDe(m);
    (gruposMap[z] ??= []).push(m);
  }
  const zonas = Object.keys(gruposMap).sort((a, b) => a.localeCompare(b, 'es'));
  for (const z of zonas) {
    gruposMap[z].sort((a, b) =>
      nombreDe(a).localeCompare(nombreDe(b), 'es', { numeric: true }));
  }

  const todasAbiertas = zonas.every((z) => !plegadas[z]);
  const alternarTodas = () =>
    setPlegadas(todasAbiertas
      ? Object.fromEntries(zonas.map((z) => [z, true]))
      : {});

  const ocupadasTotal = lista.reduce((acc, m) => acc + (infoDe(m).ocupada ? 1 : 0), 0);
  const res = resumen ?? {
    total_mesas: lista.length, ocupadas: ocupadasTotal,
    libres: lista.length - ocupadasTotal, consumo_abierto: null,
  };

  if (!lista.length) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-700 p-10 text-center">
        <p className="text-sm font-semibold text-slate-300">Todavía no hay mesas creadas</p>
        <p className="mt-1 text-xs text-slate-500">
          Usa el botón <span className="font-semibold text-amber-300">＋ Nueva mesa</span> (arriba a la derecha) para crear la primera.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Línea de estado en vivo — informativa, SIN botones */}
      <div className="flex items-center gap-2 text-[11px] text-slate-500">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        <span className="font-semibold text-emerald-400">En vivo</span>
        <span>
          · {res.total_mesas} mesas · {res.ocupadas} ocupada{res.ocupadas === 1 ? '' : 's'} ·{' '}
          {res.libres} libre{res.libres === 1 ? '' : 's'}
          {res.consumo_abierto != null && res.consumo_abierto > 0
            ? ` · $${Number(res.consumo_abierto).toLocaleString('es-CO')} abierto`
            : ''}
        </span>
        {zonas.length > 1 && (
          <button
            type="button"
            onClick={alternarTodas}
            className="ml-auto rounded-md border border-slate-700 px-2 py-0.5 text-[10px] font-semibold text-slate-400 transition-colors hover:border-amber-400/60 hover:text-amber-300"
          >
            {todasAbiertas ? 'Recoger todas' : 'Mostrar todas'}
          </button>
        )}
      </div>

      {zonas.map((z) => {
        const arr = gruposMap[z];
        const oc = arr.reduce((acc, m) => acc + (infoDe(m).ocupada ? 1 : 0), 0);
        const abierta = !plegadas[z];
        return (
          <section key={z}>
            {/* Título de zona = botón plegable (como en Recetas) */}
            <button
              type="button"
              onClick={() => toggleZona(z)}
              aria-expanded={abierta}
              title={abierta ? 'Recoger zona' : 'Mostrar zona'}
              className="group mb-2 flex w-full items-center gap-2 border-b border-slate-800 pb-1 text-left transition-colors hover:border-slate-600"
            >
              <span
                className={
                  'text-[10px] text-slate-500 transition-transform duration-200 group-hover:text-amber-300 ' +
                  (abierta ? '' : '-rotate-90')
                }
              >
                ▾
              </span>
              <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400 group-hover:text-slate-200">
                {z}
              </h3>
              <span className="text-[10px] text-slate-600">
                {arr.length} mesa{arr.length === 1 ? '' : 's'}{oc > 0 ? ` · ${oc} ocupada${oc === 1 ? '' : 's'}` : ''}
              </span>
            </button>
            {/* Contenido plegable: animación suave de altura */}
            <div
              style={{
                display: 'grid',
                gridTemplateRows: abierta ? '1fr' : '0fr',
                transition: 'grid-template-rows 220ms ease',
              }}
            >
              <div className="overflow-hidden" style={{ minHeight: 0 }}>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                  {arr.map((m) => {
                    const inf = infoDe(m);
                    const selId = mesaSeleccionada != null ? String(mesaSeleccionada) : null;
                    const seleccionada =
                      selId != null && selId !== '' &&
                      [m?.id, m?.code, m?.nombre, m?.name].some(
                        (k: any) => k != null && String(k) === selId);
                    return (
                      <TarjetaMesa
                        key={String(m?.id ?? m?.code ?? nombreDe(m))}
                        mesa={m}
                        ocupada={inf.ocupada}
                        total={inf.total}
                        nPedidos={inf.nPedidos}
                        seleccionada={seleccionada}
                        alElegir={elegir}
                        alEliminar={quitar}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}

export default MapaMesas;