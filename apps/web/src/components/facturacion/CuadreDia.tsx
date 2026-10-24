// src/components/facturacion/CuadreDia.tsx (E-14z-d) — CUADRE DEL DÍA · INFORME Z
// ----------------------------------------------------------------------------
// v2 E-14z-d: SELLO DE MARCA Kārei al pie del papel (MarkKarei variante print,
// negro vectorial con trazo grueso) — mismo patrón que la Tirilla v3: el
// encabezado es del restaurante y el sello Kārei firma como proveedor
// tecnológico junto a "Facturado con Kārei". Nada más cambió.
// QUÉ RESUELVE: el reporte de cierre que se imprime y FIRMA al terminar el
// día (el Informe Z que la DIAN pide al POS). En una sola hoja térmica 80mm:
//   · LO QUE SE VENDIÓ: plato a plato con cantidades y total del día.
//   · EL TOTAL de la venta + discriminación base / IVA (configurable).
//   · RECAUDO POR MÉTODO: cuánto quedó en EFECTIVO en la caja, cuánto entró
//     por Nequi y cuánto por tarjeta — las "consignaciones" del día —
//     con las propinas aparte (la propina no es venta).
//   · Rango de tirillas, horario (primer/último cobro) y firmas de
//     Cajero(a) / Administrador(a).
//
// NUEVO E-14y (acordado con Cristian):
//   · MARCO FISCAL DEL DÍA: línea de resolución DIAN activa (número, fecha,
//     prefijo y rango autorizado) al pie, antes del legal.
//   · SELLO DE CONTROL DEL CUADRE: un QR que codifica el resumen firmado del
//     día (fecha · resolución · rango de tirillas · nº de cobros · venta ·
//     recaudo · propinas) + un CÓDIGO DE CONTROL determinista (mismo día →
//     mismo sello). Es un sello de CONTROL INTERNO: el CUFE y el QR de
//     verificación DIAN viven en cada FACTURA DE VENTA, no en el Z.
//
// SE USA (en VentasPage): <CuadreDia abierto onCerrar={fn} />
// IMPRIMIR: botón 🖨️ → window.print() con CSS que OCULTA la app y deja solo
// el cuadre a 74mm (misma técnica probada de Tirilla.tsx).
//
// SIN dependencias nuevas (react-query + @/lib/api + QrCodigo propio).
import { useQuery } from '@tanstack/react-query';
import * as apiModule from '@/lib/api';
import QrCodigo from './QrCodigo';
import { MarkKarei } from '@/components/brand/LogoKarei';

const api: any = (apiModule as any).default ?? (apiModule as any).api ?? apiModule;

const dinero = (v: any): string => {
  const n = Number(v ?? 0);
  return '$' + (Number.isFinite(n) ? Math.round(n) : 0).toLocaleString('es-CO', { maximumFractionDigits: 0 });
};

const diaBonito = (s: any): string => {
  const m = String(s ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(s ?? '');
};

const horaDe = (s: any): string => {
  const m = String(s ?? '').match(/^\d{4}-\d{2}-\d{2}[ T](\d{2}:\d{2})/);
  return m ? m[1] : '';
};

/** Código de control determinista (16 hex en 4 grupos) a partir del resumen.
 *  Mismo día → mismo código; sirve para comparar cuadres archivados. */
const selloControl = (s: string): string => {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    a = ((a ^ s.charCodeAt(i)) * 0x01000193) >>> 0;
    b = ((b + s.charCodeAt(i) * (i + 7)) * 2654435761) >>> 0;
  }
  const out: string[] = [];
  for (let i = 0; i < 4; i++) {
    a = (a * 1664525 + 1013904223) >>> 0;
    b = (b * 22695477 + 1) >>> 0;
    out.push(((a >>> 7) ^ (b >>> 9)).toString(16).padStart(8, '0').slice(0, 4));
  }
  return out.join('-');
};

const ETIQUETA_METODO: Record<string, string> = {
  efectivo: 'Efectivo', tarjeta: 'Tarjeta · Transferencia', nequi: 'Nequi', otros: 'Otros',
};

type Props = {
  abierto?: boolean;
  onCerrar?: () => any;
  cerrar?: () => any;
  className?: string;
};

export default function CuadreDia({ abierto = true, onCerrar, cerrar, className = '' }: Props) {
  const consulta = useQuery({
    queryKey: ['karei-cuadre-dia'],
    queryFn: async () => {
      const r: any = await api.get('/pos/facturacion/cuadre');
      return r?.data ?? r;
    },
    enabled: abierto,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const data: any = consulta?.data ?? null;
  const cerrarCuadre = () => { (onCerrar ?? cerrar)?.(); };

  // ── CSS de impresión: SOLO el cuadre sale en el papel ──
  const cssImpresion = `
@media print {
  body * { visibility: hidden !important; }
  .karei-cuadre-print, .karei-cuadre-print * { visibility: visible !important; }
  .karei-cuadre-print {
    position: fixed !important; left: 0 !important; top: 0 !important;
    margin: 0 !important; width: 74mm !important; max-width: 74mm !important;
    box-shadow: none !important; border: none !important; border-radius: 0 !important;
  }
  .karei-cuadre-botones { display: none !important; }
}`;

  if (!abierto) return null;

  if (!data) {
    return (
      <div className={`fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 ${className}`}>
        <style>{cssImpresion}</style>
        <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-5 text-center">
          {consulta?.isLoading ? (
            <p className="text-sm text-slate-300">Armando el cuadre del día… 📋</p>
          ) : (
            <>
              <p className="text-sm text-rose-300">No pude armar el cuadre.</p>
              <p className="mt-1 text-xs text-slate-500">
                Revisa que el backend tenga pos_facturacion.py (E-14w) y reinicia uvicorn.
              </p>
            </>
          )}
          <button
            type="button"
            onClick={cerrarCuadre}
            className="mt-4 w-full rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 hover:border-amber-400/60 hover:text-amber-300"
          >
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  const cfg: any = data?.config ?? {};
  const res: any = data?.resumen ?? {};
  const productos: any[] = Array.isArray(data?.por_producto) ? data.por_producto : [];
  const metodos: any[] = Array.isArray(data?.por_metodo) ? data.por_metodo : [];

  // ── SELLO DEL CUADRE (E-14y): payload determinista del resumen del día ──
  // Mismo día → mismo QR y mismo código de control (comparable entre copias).
  const payloadSello = [
    'KAREI-Z',
    `F${String(data?.fecha ?? '')}`,
    cfg?.resolucion_numero ? `R${cfg.resolucion_numero}` : 'R-',
    data?.tickets?.desde && data?.tickets?.hasta
      ? `T${data.tickets.desde}-${data.tickets.hasta}`
      : 'T-',
    `C${Number(res?.n_pagos ?? 0)}`,
    `V${Number(res?.venta_total ?? 0).toFixed(2)}`,
    `G${Number(res?.gran_total ?? 0).toFixed(2)}`,
    `P${Number(res?.propinas ?? 0).toFixed(2)}`,
  ].join('|');
  const codigoSello = selloControl(payloadSello);

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/70 p-4 ${className}`}>
      <style>{cssImpresion}</style>
      <div className="karei-cuadre-print w-full max-w-[340px] rounded-xl bg-white px-4 py-5 font-mono text-[11px] leading-[1.45] text-slate-900 shadow-2xl">
        {/* ── ENCABEZADO del restaurante ── */}
        <p className="text-center text-[13px] font-bold uppercase tracking-wide">{cfg?.nombre ?? 'Kārei'}</p>
        {cfg?.slogan ? <p className="text-center italic">{cfg.slogan}</p> : null}
        <p className="text-center">NIT {cfg?.nit ?? ''}</p>
        <p className="text-center">{cfg?.direccion ?? ''}</p>
        <p className="text-center">{cfg?.ciudad ?? ''} · Tel {cfg?.telefono ?? ''}</p>
        <p className="text-center">{cfg?.regimen ?? ''}</p>

        <p className="my-2 text-center">{'='.repeat(36)}</p>

        {/* ── TÍTULO + datos del corte ── */}
        <p className="text-center text-[12px] font-bold">CUADRE DE CAJA DEL DÍA</p>
        <p className="text-center text-[12px] font-bold">(INFORME Z)</p>
        <p className="text-center">Fecha: {diaBonito(data?.fecha)}</p>
        {horaDe(data?.generado_en) ? <p className="text-center">Generado: {horaDe(data?.generado_en)}</p> : null}
        {data?.tickets?.desde ? (
          <p className="text-center">Tirillas {data.tickets.desde} → {data.tickets.hasta}</p>
        ) : null}
        <p className="text-center">
          {res?.n_pagos ?? 0} cobro(s)
          {data?.primer_pago ? ` · de ${data.primer_pago} a ${data.ultimo_pago}` : ''}
        </p>

        <p className="my-2 text-center">{'='.repeat(36)}</p>

        {/* ── LO QUE SE VENDIÓ (plato a plato) ── */}
        <p className="text-center font-bold underline">LO QUE SE VENDIÓ</p>
        {productos.length === 0 ? (
          <p className="mt-1 text-center">Sin ventas registradas hoy</p>
        ) : (
          <div className="mt-1">
            {productos.map((p: any, i: number) => (
              <div key={String(p?.nombre ?? i)} className="flex justify-between">
                <span className="pr-1">{p?.cantidad}× {p?.nombre}</span>
                <span>{dinero(p?.total)}</span>
              </div>
            ))}
          </div>
        )}

        <p className="my-2">{'-'.repeat(36)}</p>

        {/* ── TOTALES de la venta ── */}
        <div className="flex justify-between"><span>Base sin IVA</span><span>{dinero(res?.base)}</span></div>
        {Number(res?.iva) > 0 && (
          <div className="flex justify-between">
            <span>IVA {res?.iva_pct}% {res?.iva_incluido ? '(incluido)' : ''}</span>
            <span>{dinero(res?.iva)}</span>
          </div>
        )}
        <div className="mt-1 flex justify-between border-t border-dashed border-slate-400 pt-1 text-[13px] font-bold">
          <span>TOTAL VENTA DEL DÍA</span><span>{dinero(res?.venta_total)}</span>
        </div>
        {res?.leyenda_iva ? <p className="mt-0.5 text-center text-[10px] italic">({res.leyenda_iva})</p> : null}

        <p className="my-2 text-center">{'='.repeat(36)}</p>

        {/* ── RECAUDO POR MÉTODO (las "consignaciones") ── */}
        <p className="text-center font-bold underline">RECAUDO POR MÉTODO</p>
        <div className="mt-1">
          {metodos.map((m: any) => (
            <div key={String(m?.metodo)} className="flex justify-between">
              <span>{ETIQUETA_METODO[String(m?.metodo)] ?? String(m?.metodo ?? '')} ({m?.n ?? 0})</span>
              <span>{dinero(m?.total)}</span>
            </div>
          ))}
        </div>
        <div className="mt-1 flex justify-between"><span>Propinas (aparte)</span><span>{dinero(res?.propinas)}</span></div>
        <div className="mt-1 flex justify-between border-t border-dashed border-slate-400 pt-1 text-[13px] font-bold">
          <span>RECAUDADO TOTAL</span><span>{dinero(res?.gran_total)}</span>
        </div>

        {/* ── MARCO FISCAL DEL DÍA (E-14y): resolución activa que respalda
            las tirillas del rango. Si cambia la resolución en ⚙, esta línea
            refleja la vigente al instante. ── */}
        {cfg?.resolucion_numero ? (
          <>
            <p className="my-2 text-center">{'='.repeat(36)}</p>
            <p className="text-center">Resolución DIAN No. {cfg.resolucion_numero}</p>
            {cfg?.resolucion_fecha ? <p className="text-center">de {cfg.resolucion_fecha}</p> : null}
            {cfg?.resolucion_prefijo ? (
              <p className="text-center">
                Prefijo {cfg.resolucion_prefijo} · Autorizado {cfg.resolucion_prefijo}-{cfg.resolucion_rango_ini} al {cfg.resolucion_prefijo}-{cfg.resolucion_rango_fin}
              </p>
            ) : null}
          </>
        ) : null}

        {/* ── SELLO DE CONTROL DEL CUADRE (E-14y) ── */}
        <p className="my-2 text-center">{'='.repeat(36)}</p>
        <p className="text-center font-bold underline">SELLO DE CONTROL DEL CUADRE</p>
        <div className="mt-2 flex justify-center">
          <QrCodigo texto={payloadSello} lado="22mm" />
        </div>
        <p className="mt-1 text-center text-[10px]">Código de control: {codigoSello}</p>
        <p className="mt-0.5 text-center text-[9px] italic">
          Sello de control interno — el CUFE y el QR de verificación están en cada factura.
        </p>

        <p className="my-2 text-center">{'='.repeat(36)}</p>

        {/* ── PIE legal + sello Kārei ── */}
        <p className="text-center">La propina es VOLUNTARIA</p>
        <p className="text-center">(Ley 1275 de 2009)</p>
        <div className="mt-1.5 flex justify-center">
          <MarkKarei size={34} variante="print" />
        </div>
        <p className="text-center">Facturado con {cfg?.software_nombre ?? 'Kārei'}</p>

        {/* ── FIRMAS (solo salen en el papel) ── */}
        <div className="mt-8 grid grid-cols-2 gap-4 text-center">
          <p className="border-t border-slate-500 pt-1">Cajero(a)</p>
          <p className="border-t border-slate-500 pt-1">Administrador(a)</p>
        </div>
      </div>

      {/* ── BOTONES (no salen en el papel) ── */}
      <div className="karei-cuadre-botones fixed bottom-5 left-1/2 z-10 flex -translate-x-1/2 gap-2">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-bold text-slate-950 shadow-lg transition hover:bg-emerald-400"
        >
          🖨️ Imprimir cuadre
        </button>
        <button
          type="button"
          onClick={cerrarCuadre}
          className="rounded-xl border border-slate-600 bg-slate-900/90 px-5 py-2.5 text-sm font-semibold text-slate-200 shadow-lg transition hover:border-amber-400/60 hover:text-amber-300"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}