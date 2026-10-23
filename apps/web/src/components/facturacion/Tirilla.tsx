// Kārei · Tirilla.tsx (E-14v) — FACTURA / TIRILLA DE PAGO 80mm
// ----------------------------------------------------------------------------
// QUÉ RESUELVE: al confirmar un cobro (o desde la página Ventas) se muestra
// la TIRILLA estilo impresora térmica con todo lo que exige el art. 617 ET
// + Res. 42/2020 en lo aplicable sin resolución DIAN real:
//   razón social + NIT · consecutivo (POS1-000001) · fecha/hora · items con
//   valor unitario y total · base, IVA discriminado (configurable) · propina
//   voluntaria (Ley 1275 de 2009) · forma de pago (contado) · medio de pago
//   · "consumidor final" · nombre del software.
//
// DOS MODOS:
//   <Tirilla pagoId={id} onCerrar={fn} />      → descarga la factura del
//                                                add-on y la muestra.
//   <Tirilla factura={data} onCerrar={fn} />   → ya tienes los datos.
//
// IMPRIMIR: botón 🖨️ → window.print() con CSS de impresión que OCULTA toda
// la app y solo deja visible la tirilla a 80mm. Funciona en cualquier
// impresora térmica instalada en el sistema (58/80mm) o PDF.
//
// SIN dependencias nuevas (react-query + ../lib/api).
import { useQuery } from '@tanstack/react-query';
import * as apiModule from '@/lib/api';

const api: any = (apiModule as any).default ?? (apiModule as any).api ?? apiModule;

const dinero = (v: any): string => {
  const n = Number(v ?? 0);
  return '$' + (Number.isFinite(n) ? Math.round(n) : 0).toLocaleString('es-CO', { maximumFractionDigits: 0 });
};

const fechaBonita = (iso: any): string => {
  const s = String(iso ?? '');
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}:\d{2})/);
  if (!m) return s;
  return `${m[3]}/${m[2]}/${m[1]} ${m[4]}`;
};

const ETIQUETA_METODO: Record<string, string> = {
  efectivo: 'Efectivo', tarjeta: 'Tarjeta · Transferencia', nequi: 'Nequi',
};

type Props = {
  pagoId?: any;
  factura?: any;
  abierto?: boolean;
  onCerrar?: () => any;
  cerrar?: () => any;
  className?: string;
};

export default function Tirilla({ pagoId, factura, abierto = true, onCerrar, cerrar, className = '' }: Props) {
  const consulta = useQuery({
    queryKey: ['karei-factura', String(pagoId)],
    queryFn: async () => {
      const r: any = await api.get(`/pos/facturacion/factura/${pagoId}`);
      return r?.data ?? r;
    },
    enabled: abierto && !factura && pagoId != null,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const data: any = factura ?? consulta?.data ?? null;
  const cerrarTirilla = () => { (onCerrar ?? cerrar)?.(); };

  // ── CSS de impresión: SOLO la tirilla sale en el papel ──
  const cssImpresion = `
@media print {
  body * { visibility: hidden !important; }
  .karei-tirilla-print, .karei-tirilla-print * { visibility: visible !important; }
  .karei-tirilla-print {
    position: fixed !important; left: 0 !important; top: 0 !important;
    margin: 0 !important; width: 74mm !important; max-width: 74mm !important;
    box-shadow: none !important; border: none !important; border-radius: 0 !important;
  }
  .karei-tirilla-botones { display: none !important; }
}`;

  if (!abierto) return null;

  if (!data) {
    return (
      <div className={`fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 ${className}`}>
        <style>{cssImpresion}</style>
        <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-5 text-center">
          {consulta?.isLoading ? (
            <p className="text-sm text-slate-300">Generando tirilla… 🧾</p>
          ) : (
            <>
              <p className="text-sm text-rose-300">No pude generar la tirilla.</p>
              <p className="mt-1 text-xs text-slate-500">
                Revisa que el backend tenga pos_facturacion.py (E-14v) y reinicia uvicorn.
              </p>
            </>
          )}
          <button
            type="button"
            onClick={cerrarTirilla}
            className="mt-4 w-full rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 hover:border-amber-400/60 hover:text-amber-300"
          >
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  const cfg: any = data?.config ?? {};
  const pago: any = data?.pago ?? {};
  const items: any[] = Array.isArray(data?.items) ? data.items : [];
  const tot: any = data?.totales ?? {};
  const metodoEtiqueta = ETIQUETA_METODO[String(pago?.metodo ?? '')] ?? String(pago?.metodo ?? '—');

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/70 p-4 ${className}`}>
      <style>{cssImpresion}</style>
      <div className="karei-tirilla-print w-full max-w-[340px] rounded-xl bg-white px-4 py-5 font-mono text-[11px] leading-[1.45] text-slate-900 shadow-2xl">
        {/* ── ENCABEZADO: razón social + NIT (art. 617 ET lit. b) ── */}
        <p className="text-center text-[13px] font-bold uppercase tracking-wide">{cfg?.nombre ?? 'Kārei'}</p>
        {cfg?.slogan ? <p className="text-center italic">{cfg.slogan}</p> : null}
        <p className="text-center">NIT {cfg?.nit ?? ''}</p>
        <p className="text-center">{cfg?.direccion ?? ''}</p>
        <p className="text-center">{cfg?.ciudad ?? ''} · Tel {cfg?.telefono ?? ''}</p>
        <p className="text-center">{cfg?.regimen ?? ''}</p>

        <p className="my-2 text-center">{'='.repeat(36)}</p>

        {/* ── TÍTULO + resolución DIAN (aparece si está configurada) ── */}
        <p className="text-center text-[12px] font-bold">COMPROBANTE DE PAGO</p>
        {cfg?.resolucion_numero ? (
          <>
            <p className="text-center">Res. DIAN {cfg.resolucion_numero}</p>
            <p className="text-center">
              Prefijo {cfg.resolucion_prefijo} · Rango {cfg.resolucion_prefijo}-{cfg.resolucion_rango_ini} al {cfg.resolucion_prefijo}-{cfg.resolucion_rango_fin}
            </p>
            <p className="text-center">Vigencia: {cfg.resolucion_vigencia}</p>
          </>
        ) : null}

        <p className="my-2 text-center">{'='.repeat(36)}</p>

        {/* ── METADATOS del cobro ── */}
        <div className="flex justify-between">
          <span className="font-bold">{pago?.tirilla_no ?? 'S/N'}</span>
          <span>{fechaBonita(pago?.fecha)}</span>
        </div>
        <p>Mesa: {pago?.mesa ?? '—'}</p>
        <p>Cliente: Consumidor final</p>
        <p>Forma de pago: Contado</p>

        <p className="my-2">{'-'.repeat(36)}</p>

        {/* ── ITEMS: cantidad, descripción, vr.unit, total (art. 617 lit. f) ── */}
        <div className="flex justify-between font-bold">
          <span>Cant Descripción</span><span>Total</span>
        </div>
        {items.map((it: any, i: number) => (
          <div key={String(it?.id ?? i)} className="mt-0.5">
            <div className="flex justify-between">
              <span className="pr-1">{it?.cantidad}× {it?.nombre}</span>
              <span>{dinero((Number(it?.cantidad ?? 1)) * (Number(it?.precio_unit ?? 0)))}</span>
            </div>
            {it?.notes ? <p className="pl-3 text-[10px] italic">({String(it.notes)})</p> : null}
          </div>
        ))}

        <p className="my-2">{'-'.repeat(36)}</p>

        {/* ── TOTALES: base + IVA discriminado + propina + TOTAL ── */}
        <div className="flex justify-between"><span>Subtotal</span><span>{dinero(tot?.subtotal)}</span></div>
        {Number(tot?.iva) > 0 && (
          <div className="flex justify-between">
            <span>IVA {tot?.iva_pct}% {tot?.iva_incluido ? '(incluido)' : ''}</span>
            <span>{dinero(tot?.iva)}</span>
          </div>
        )}
        {Number(tot?.propina) > 0 && (
          <div className="flex justify-between"><span>Propina voluntaria</span><span>{dinero(tot?.propina)}</span></div>
        )}
        <div className="mt-1 flex justify-between border-t border-dashed border-slate-400 pt-1 text-[13px] font-bold">
          <span>TOTAL</span><span>{dinero(tot?.total)}</span>
        </div>

        <p className="my-2">{'-'.repeat(36)}</p>

        {/* ── MEDIO DE PAGO (Res. 42/2020 num. 11) ── */}
        <div className="flex justify-between">
          <span>Medio de pago:</span><span className="font-bold">{metodoEtiqueta}</span>
        </div>

        <p className="my-2 text-center">{'='.repeat(36)}</p>

        {/* ── PIE legal + cortesía ── */}
        <p className="text-center">La propina es VOLUNTARIA</p>
        <p className="text-center">(Ley 1275 de 2009)</p>
        <p className="mt-1 text-center">Facturado con {cfg?.software_nombre ?? 'Kārei'}</p>
        {cfg?.software_nit ? <p className="text-center">NIT software {cfg.software_nit}</p> : null}
        <p className="mt-2 text-center font-bold">{cfg?.pie_gracias ?? '¡Gracias por su visita!'}</p>
      </div>

      {/* ── BOTONES (no salen en el papel) ── */}
      <div className="karei-tirilla-botones fixed bottom-5 left-1/2 z-10 flex -translate-x-1/2 gap-2">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-bold text-slate-950 shadow-lg transition hover:bg-emerald-400"
        >
          🖨️ Imprimir tirilla
        </button>
        <button
          type="button"
          onClick={cerrarTirilla}
          className="rounded-xl border border-slate-600 bg-slate-900/90 px-5 py-2.5 text-sm font-semibold text-slate-200 shadow-lg transition hover:border-amber-400/60 hover:text-amber-300"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}