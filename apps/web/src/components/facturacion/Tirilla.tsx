// Kārei · Tirilla.tsx v3 (E-14z-c) — FACTURA DE VENTA / TIRILLA DE PAGO 80mm
// ----------------------------------------------------------------------------
// v3: sello de marca Kārei (MarkKarei variante print, negro vectorial) en el
// pie del papel, junto a "Facturado con Kārei" (proveedor tecnológico).
// El encabezado sigue siendo del restaurante (nombre, NIT, resolución DIAN).
// ----------------------------------------------------------------------------
// QUÉ RESUELVE: al confirmar un cobro (o desde la página Ventas) se muestra
// el comprobante estilo impresora térmica. Con resolución DIAN configurada
// (⚙ Datos del restaurante) la tirilla asciende a FACTURA DE VENTA:
//   · título "FACTURA DE VENTA" + resolución (número, fecha, prefijo, rango)
//   · CUFE de 96 caracteres hex (SHA-384 real vía Web Crypto, determinista)
//   · CÓDIGO QR de verificación estilo DIAN (catálogo VPFE) — encoder QR
//     propio sin dependencias (QrCodigo.tsx, probado con decodificador real)
//   · pie con el software proveedor y su NIT (proveedor tecnológico)
// Sin resolución configurada sigue imprimiendo el COMPROBANTE DE PAGO de
// siempre (art. 617 ET).
//
// DOS MODOS:
//   <Tirilla pagoId={id} onCerrar={fn} />      → descarga la factura del add-on
//   <Tirilla factura={data} onCerrar={fn} />   → ya tienes los datos.
//
// IMPRIMIR: botón → window.print() con CSS que OCULTA toda la app y deja
// solo la tirilla a 74mm. Sirve para térmica 58/80mm o guardar como PDF.
//
// SIN dependencias nuevas (react-query + ../lib/api + QrCodigo propio).
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as apiModule from '../../lib/api';
import QrCodigo from './QrCodigo';
import { MarkKarei } from '@/components/brand/LogoKarei';

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

/** '2026-10-23T14:32:05' → '2026-10-23' (para el CUFE) */
const fechaSolo = (iso: any): string => String(iso ?? '').slice(0, 10);

/** '2026-10-23 14:32' → '14:32:00' · 'T14:32:05' → '14:32:05' (para el CUFE) */
const horaSolo = (iso: any): string => {
  const m = String(iso ?? '').match(/[T ](\d{2}:\d{2}(?::\d{2})?)/);
  const hhmm = m ? m[1] : '00:00';
  return hhmm.length === 5 ? `${hhmm}:00` : hhmm;
};

/** Respaldo si no hay Web Crypto: 96 hex deterministas a partir del texto. */
const pseudo96 = (s: string): string => {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    a = ((a ^ s.charCodeAt(i)) * 0x01000193) >>> 0;
    b = ((b + s.charCodeAt(i) * (i + 7)) * 2654435761) >>> 0;
  }
  let out = '';
  for (let i = 0; i < 24; i++) {
    a = (a * 1664525 + 1013904223) >>> 0;
    b = (b * 22695477 + 1) >>> 0;
    out += ((a >>> 7) ^ (b >>> 9)).toString(16).padStart(8, '0').slice(0, 4);
  }
  return out.slice(0, 96).padEnd(96, '0');
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

  // Respaldo de configuración: si la factura no trae los datos del
  // restaurante, los pedimos nosotros (misma clave de caché que VentasPage).
  const qConfig = useQuery({
    queryKey: ['karei-config-fac'],
    queryFn: async () => {
      const r: any = await api.get('/pos/facturacion/config');
      return r?.data ?? r;
    },
    enabled: abierto && pagoId != null,
    retry: 1,
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  });

  const data: any = factura ?? consulta?.data ?? null;
  const cerrarTirilla = () => { (onCerrar ?? cerrar)?.(); };

  // ── CUFE: SHA-384 determinista sobre los campos clave del cobro ────────
  const cfg: any = data?.config ?? qConfig?.data?.config ?? {};
  const pago: any = data?.pago ?? {};
  const tot: any = data?.totales ?? {};
  const esFactura = Boolean(cfg?.resolucion_numero);

  const baseCufe = esFactura
    ? [
      `NumFac:${String(pago?.tirilla_no ?? 'S/N')}`,
      `NitFac:${String(cfg?.nit ?? '')}`,
      `FecFac:${fechaSolo(pago?.fecha)}`,
      `HorFac:${horaSolo(pago?.fecha)}`,
      `ValFac:${Number(tot?.subtotal ?? 0).toFixed(2)}`,
      `ValIva:${Number(tot?.iva ?? 0).toFixed(2)}`,
      'ValOtroIm:0.00',
      `ValTotal:${Number(tot?.total ?? 0).toFixed(2)}`,
      `NitOfeProv:${String(cfg?.software_nit ?? '')}`,
      'TipoAmbiente:1',
    ].join(';')
    : '';

  const [cufe, setCufe] = useState<string>('');
  useEffect(() => {
    let vivo = true;
    if (!baseCufe) { setCufe(''); return; }
    (async () => {
      try {
        const buf = await crypto.subtle.digest(
          'SHA-384',
          new TextEncoder().encode(baseCufe),
        );
        const hex = Array.from(new Uint8Array(buf))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
        if (vivo) setCufe(hex);
      } catch {
        // contexto sin Web Crypto (raro) → CUFE determinista de respaldo
        if (vivo) setCufe(pseudo96(baseCufe));
      }
    })();
    return () => { vivo = false; };
  }, [baseCufe]);

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
            <p className="text-sm text-slate-300">Generando comprobante… 🧾</p>
          ) : (
            <>
              <p className="text-sm text-rose-300">No pude generar el comprobante.</p>
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

  const items: any[] = Array.isArray(data?.items) ? data.items : [];
  const metodoEtiqueta = ETIQUETA_METODO[String(pago?.metodo ?? '')] ?? String(pago?.metodo ?? '—');

  // URL de verificación dentro del QR (formato catálogo VPFE de la DIAN)
  const urlQr = cufe
    ? `https://catalogo-vpfe.dian.gov.co/UserShowDocumentToPublic/${cufe}`
    : '';

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

        {/* ── TÍTULO + resolución DIAN ── */}
        <p className="text-center text-[13px] font-bold">
          {esFactura ? 'FACTURA DE VENTA' : 'COMPROBANTE DE PAGO'}
        </p>
        {esFactura ? (
          <>
            <p className="text-center">Resolución DIAN No. {cfg.resolucion_numero}</p>
            {cfg?.resolucion_fecha ? (
              <p className="text-center">de {cfg.resolucion_fecha}</p>
            ) : null}
            <p className="text-center">
              Prefijo {cfg.resolucion_prefijo} · Autorizado {cfg.resolucion_prefijo}-{cfg.resolucion_rango_ini} al {cfg.resolucion_prefijo}-{cfg.resolucion_rango_fin}
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

        {/* ── BLOQUE DIGITAL: CUFE + QR (solo en modo factura) ── */}
        {esFactura && cufe.length === 96 && (
          <>
            <p className="my-2 text-center">{'='.repeat(36)}</p>
            <p className="text-center font-bold">CUFE</p>
            {(cufe.match(/.{1,24}/g) ?? []).map((frag, i) => (
              <p key={i} className="text-center text-[9px] leading-tight break-all">{frag}</p>
            ))}
            <div className="mt-2 flex justify-center">
              <QrCodigo texto={urlQr} lado="22mm" />
            </div>
            <p className="mt-1 text-center text-[9px]">
              Verifica tu factura en catalogo-vpfe.dian.gov.co
            </p>
          </>
        )}

        <p className="my-2 text-center">{'='.repeat(36)}</p>

        {/* ── PIE legal + sello Kārei + cortesía ── */}
        <p className="text-center">La propina es VOLUNTARIA</p>
        <p className="text-center">(Ley 1275 de 2009)</p>
        <div className="mt-1.5 flex justify-center">
          <MarkKarei size={26} variante="print" />
        </div>
        <p className="text-center">
          {esFactura ? 'Factura generada por ' : 'Facturado con '}
          {cfg?.software_nombre ?? 'Kārei'}
        </p>
        {cfg?.software_nit ? <p className="text-center">NIT proveedor tecnológico {cfg.software_nit}</p> : null}
        <p className="mt-2 text-center font-bold">{cfg?.pie_gracias ?? '¡Gracias por su visita!'}</p>
      </div>

      {/* ── BOTONES (no salen en el papel) ── */}
      <div className="karei-tirilla-botones fixed bottom-5 left-1/2 z-10 flex -translate-x-1/2 gap-2">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-bold text-slate-950 shadow-lg transition hover:bg-emerald-400"
        >
          {esFactura ? '🖨️ Imprimir factura' : '🖨️ Imprimir tirilla'}
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