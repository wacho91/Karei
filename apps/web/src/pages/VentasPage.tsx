// src/pages/VentasPage.tsx (E-14x) — HISTORIAL DE VENTAS + CIERRE DE CAJA + CUADRE
// ----------------------------------------------------------------------------
// QUÉ RESUELVE:
//  · Historial de todos los pagos (karei_payments) con filtros por periodo
//    y método + re-imprimir la tirilla de cualquier cobro 🧾.
//  · CIERRE DE CAJA (Informe Z, requisito POS de la DIAN): totales de hoy
//    por método, nº de cobros, propinas, rango de tirillas y horario.
//  · E-14x: el Informe Z muestra la resolución DIAN activa (número, fecha,
//    prefijo y rango autorizado). El CUFE/QR sigue viviendo en cada FACTURA
//    (tirilla del cobro o re-impresión 🧾) — el Z es reporte interno y no
//    lleva documento digital.
//  · 🖨️ CUADRE DEL DÍA (E-14w): botón que abre el INFORME Z IMPRIMIBLE —
//    qué se vendió plato a plato, total de la venta, base/IVA y cuánto se
//    recaudó por método (efectivo/nequi/tarjeta) con propinas aparte, con
//    firmas de cajero y administrador. Componente CuadreDia.tsx.
//  · ⚙ Datos del restaurante: los que salen en la tirilla (nombre, NIT,
//    dirección, régimen, IVA, resolución DIAN, pie…). Cuando un cliente del
//    SaaS reciba sus permisos, este mismo formulario es la base del modal
//    de onboarding que acordamos con Cristian.
//
// RUTA sugerida: /ventas (ADMIN). El add-on backend es pos_facturacion.py.
//
// SIN dependencias nuevas (react-query + ../lib/api, mismo patrón del POS).
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as apiModule from '../lib/api';
import Tirilla from '../components/facturacion/Tirilla';
import CuadreDia from '../components/facturacion/CuadreDia';

const api: any = (apiModule as any).default ?? (apiModule as any).api ?? apiModule;

const dinero = (v: any): string => {
  const n = Number(v ?? 0);
  return '$' + (Number.isFinite(n) ? Math.round(n) : 0).toLocaleString('es-CO', { maximumFractionDigits: 0 });
};

const extraer = (res: any): any => res?.data ?? res;

const DIAS_DE = { hoy: 1, semana: 7, mes: 30, todo: 0 } as const;
const PERIODOS = [
  { clave: 'hoy', etiqueta: 'Hoy' },
  { clave: 'semana', etiqueta: '7 días' },
  { clave: 'mes', etiqueta: '30 días' },
  { clave: 'todo', etiqueta: 'Todo' },
] as const;
const METODOS_FILTRO = [
  { clave: '', etiqueta: 'Todos' },
  { clave: 'efectivo', etiqueta: '💵 Efectivo' },
  { clave: 'tarjeta', etiqueta: '💳 Tarjeta' },
  { clave: 'nequi', etiqueta: '📱 Nequi' },
] as const;
const CHIP_METODO: Record<string, string> = {
  efectivo: 'border-emerald-500/40 text-emerald-300',
  tarjeta: 'border-sky-500/40 text-sky-300',
  nequi: 'border-violet-500/40 text-violet-300',
};

// Campos del formulario ⚙ (grupo → campos)
const CAMPOS_CONFIG: { grupo: string; campos: { clave: string; etiqueta: string }[] }[] = [
  {
    grupo: 'Restaurante',
    campos: [
      { clave: 'nombre', etiqueta: 'Nombre comercial' },
      { clave: 'slogan', etiqueta: 'Eslogan (opcional)' },
      { clave: 'nit', etiqueta: 'NIT' },
      { clave: 'direccion', etiqueta: 'Dirección' },
      { clave: 'ciudad', etiqueta: 'Ciudad' },
      { clave: 'telefono', etiqueta: 'Teléfono' },
    ],
  },
  {
    grupo: 'Impuestos (IVA)',
    campos: [
      { clave: 'regimen', etiqueta: 'Régimen (ej: Responsable de IVA)' },
      { clave: 'iva_pct', etiqueta: 'IVA % (19 estándar · 8 restaurantes)' },
      { clave: 'iva_incluido', etiqueta: '¿IVA incluido en precios? (si/no)' },
    ],
  },
  {
    grupo: 'Resolución DIAN (ficticia por ahora)',
    campos: [
      { clave: 'resolucion_numero', etiqueta: 'Número de resolución' },
      { clave: 'resolucion_prefijo', etiqueta: 'Prefijo (POS1, KR…)' },
      { clave: 'resolucion_rango_ini', etiqueta: 'Rango inicial' },
      { clave: 'resolucion_rango_fin', etiqueta: 'Rango final' },
      { clave: 'resolucion_fecha', etiqueta: 'Fecha resolución (AAAA-MM-DD)' },
      { clave: 'resolucion_vigencia', etiqueta: 'Vigencia' },
    ],
  },
  {
    grupo: 'Software y pie de tirilla',
    campos: [
      { clave: 'software_nombre', etiqueta: 'Nombre del software' },
      { clave: 'software_nit', etiqueta: 'NIT del fabricante' },
      { clave: 'pie_gracias', etiqueta: 'Mensaje final' },
    ],
  },
];

export default function VentasPage() {
  const queryClient = useQueryClient();
  const [periodo, setPeriodo] = useState<string>('semana');
  const [metodo, setMetodo] = useState<string>('');
  const [tirillaId, setTirillaId] = useState<any>(null);
  const [cuadreAbierto, setCuadreAbierto] = useState(false);
  const [modalConfig, setModalConfig] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);

  const dias = DIAS_DE[periodo as keyof typeof DIAS_DE] ?? 7;

  const qPagos = useQuery({
    queryKey: ['karei-ventas', periodo, metodo],
    queryFn: async () => {
      const p = new URLSearchParams({ dias: String(dias) });
      if (metodo) p.set('metodo', metodo);
      const r: any = await api.get(`/pos/facturacion/pagos?${p.toString()}`);
      return extraer(r);
    },
    refetchInterval: 30000,
    retry: 1,
  });

  const qCierre = useQuery({
    queryKey: ['karei-cierre-caja'],
    queryFn: async () => extraer(await api.get('/pos/facturacion/cierre')),
    refetchInterval: 60000,
    retry: 1,
  });

  const qConfig = useQuery({
    queryKey: ['karei-config-fac'],
    queryFn: async () => extraer(await api.get('/pos/facturacion/config')),
    retry: 1,
  });

  const pagos: any[] = Array.isArray(qPagos?.data?.pagos) ? qPagos.data.pagos : [];
  const cierre: any = qCierre?.data ?? null;
  const config: any = qConfig?.data?.config ?? {};
  const nombreResto: string = config?.nombre ?? 'Kārei';

  const abrirConfig = () => {
    setForm({ ...config });
    setModalConfig(true);
  };

  const guardarConfig = async () => {
    setGuardando(true);
    try {
      await api.put('/pos/facturacion/config', form);
      queryClient.invalidateQueries({ queryKey: ['karei-config-fac'] });
      setModalConfig(false);
    } catch {
      // el modal muestra el estado por si reintenta
    } finally {
      setGuardando(false);
    }
  };

  const resumenPeriodo = useMemo(() => {
    const sub = pagos.reduce((s, p) => s + Number(p?.subtotal ?? 0), 0);
    const prop = pagos.reduce((s, p) => s + Number(p?.propina ?? 0), 0);
    const tot = pagos.reduce((s, p) => s + Number(p?.total ?? 0), 0);
    return { sub, prop, tot };
  }, [pagos]);

  return (
    <div className="p-4 space-y-4">
      {/* ── Encabezado ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto">
          <h1 className="text-xl font-bold text-white">Ventas · Caja 🧾</h1>
          <p className="text-xs text-slate-400">
            {nombreResto} · cada cobro queda registrado con su tirilla consecutiva
          </p>
        </div>
        <button onClick={abrirConfig}
          className="px-3 py-1.5 rounded-lg border border-slate-600 text-slate-300 text-sm hover:bg-slate-800">
          ⚙️ Datos del restaurante
        </button>
      </div>

      {/* ── CIERRE DE CAJA (Informe Z) ── */}
      <section className="bg-slate-800/50 border border-slate-700 p-6 rounded-xl shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-100">
              Cierre de caja · {cierre?.fecha ?? 'hoy'}
            </h2>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Informe Z · {cierre?.n_pagos ?? 0} cobro(s)
              {cierre?.primer_pago ? ` · de ${cierre.primer_pago} a ${cierre.ultimo_pago}` : ''}
              {cierre?.tickets?.desde ? ` · tirillas ${cierre.tickets.desde} → ${cierre.tickets.hasta}` : ''}
            </p>
            {/* E-14x: marco fiscal del día — la resolución activa que respalda
                las tirillas del rango. Si algún día cambias de resolución en
                ⚙, esta línea refleja la vigente al instante. */}
            {config?.resolucion_numero ? (
              <p className="mt-0.5 text-[11px] text-slate-500">
                Resolución DIAN No. {config.resolucion_numero}
                {config?.resolucion_fecha ? ` del ${config.resolucion_fecha}` : ''}
                {config?.resolucion_prefijo ? ` · Prefijo ${config.resolucion_prefijo}` : ''}
                {config?.resolucion_rango_ini && config?.resolucion_rango_fin
                  ? ` · Autorizado ${config.resolucion_prefijo}-${config.resolucion_rango_ini} al ${config.resolucion_prefijo}-${config.resolucion_rango_fin}`
                  : ''}
                {` · CUFE y QR en cada factura 🧾`}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-[11px] font-bold text-emerald-300">
              Total del día · {dinero(cierre?.total ?? 0)}
            </span>
            <button onClick={() => setCuadreAbierto(true)} title="Informe Z imprimible: qué se vendió + recaudo por método"
              className="rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-bold text-slate-950 transition hover:bg-emerald-400">
              🖨️ Cuadre del día (Z)
            </button>
          </div>
        </header>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {(cierre?.por_metodo ?? []).map((m: any) => (
            <div key={m?.metodo}
              className={`rounded-xl border bg-slate-950/60 p-3 ${CHIP_METODO[m?.metodo] ?? 'border-slate-600'}`}>
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                {m?.metodo === 'efectivo' ? '💵 Efectivo'
                  : m?.metodo === 'tarjeta' ? '💳 Tarjeta · Transferencia'
                  : m?.metodo === 'nequi' ? '📱 Nequi' : '🧾 Otros'}
              </p>
              <p className="mt-1 text-xl font-bold text-slate-100">{dinero(m?.total)}</p>
              <p className="text-[11px] text-slate-500">{m?.n} cobro(s) · propina {dinero(m?.propina)}</p>
            </div>
          ))}
          <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500"> Plata del día</p>
            <p className="mt-1 text-xl font-bold text-emerald-300">{dinero(cierre?.total ?? 0)}</p>
            <p className="text-[11px] text-slate-500">Subtotal {dinero(cierre?.subtotal ?? 0)} · propina {dinero(cierre?.propina ?? 0)}</p>
          </div>
        </div>
      </section>

      {/* ── FILTROS ── */}
      <div className="flex flex-wrap items-center gap-2">
        {PERIODOS.map((p) => (
          <button key={p.clave} onClick={() => setPeriodo(p.clave)}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition ${
              periodo === p.clave ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}>
            {p.etiqueta}
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-slate-700" />
        {METODOS_FILTRO.map((m) => (
          <button key={m.clave} onClick={() => setMetodo(m.clave)}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition ${
              metodo === m.clave ? 'bg-slate-200 text-slate-900' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}>
            {m.etiqueta}
          </button>
        ))}
        <span className="ml-auto text-xs text-slate-500">
          {pagos.length} pago(s) · {dinero(resumenPeriodo.tot)}
          {resumenPeriodo.prop > 0 ? ` · propinas ${dinero(resumenPeriodo.prop)}` : ''}
        </span>
      </div>

      {/* ── HISTORIAL ── */}
      <section className="bg-slate-800/50 border border-slate-700 p-6 rounded-xl shadow-sm">
        {qPagos?.isLoading ? (
          <p className="py-6 text-center text-sm text-slate-400">Cargando ventas…</p>
        ) : pagos.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">
            No hay pagos registrados en este filtro — cobra una mesa en el POS y aparece aquí con su tirilla. 🧾
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-2">Tirilla</th>
                  <th className="px-2 py-2">Fecha</th>
                  <th className="px-2 py-2">Mesa</th>
                  <th className="px-2 py-2">Método</th>
                  <th className="px-2 py-2 text-right">Subtotal</th>
                  <th className="px-2 py-2 text-right">Propina</th>
                  <th className="px-2 py-2 text-right">Total</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {pagos.map((p: any) => (
                  <tr key={String(p?.id)} className="hover:bg-slate-900/40">
                    <td className="px-2 py-2 font-mono text-xs font-bold text-amber-300">{p?.tirilla_no}</td>
                    <td className="px-2 py-2 text-slate-300">{p?.fecha}</td>
                    <td className="px-2 py-2 text-slate-300">{p?.mesa ?? '—'}</td>
                    <td className="px-2 py-2">
                      <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold ${CHIP_METODO[String(p?.metodo ?? '')] ?? 'border-slate-600 text-slate-300'}`}>
                        {String(p?.metodo ?? '—')}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right text-slate-300">{dinero(p?.subtotal)}</td>
                    <td className="px-2 py-2 text-right text-slate-400">{dinero(p?.propina)}</td>
                    <td className="px-2 py-2 text-right font-bold text-emerald-300">{dinero(p?.total)}</td>
                    <td className="px-2 py-2 text-right">
                      <button onClick={() => setTirillaId(p?.id)} title="Ver / imprimir tirilla"
                        className="rounded-lg border border-slate-600 px-2 py-1 text-xs hover:border-amber-400/60 hover:text-amber-300">
                        🧾
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── MODAL TIRILLA ── */}
      {tirillaId && (
        <Tirilla pagoId={tirillaId} onCerrar={() => setTirillaId(null)} cerrar={() => setTirillaId(null)} />
      )}

      {/* ── MODAL CUADRE DEL DÍA (Informe Z imprimible) ── */}
      {cuadreAbierto && (
        <CuadreDia abierto onCerrar={() => setCuadreAbierto(false)} cerrar={() => setCuadreAbierto(false)} />
      )}

      {/* ── MODAL CONFIG DEL RESTAURANTE ── */}
      {modalConfig && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/70 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
            <header className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold text-slate-100">⚙️ Datos del restaurante</h2>
                <p className="text-[11px] text-slate-500">
                  Estos datos salen en la tirilla. Ficticios por ahora — cuando el negocio quede
                  formal, se reemplazan aquí y nada más.
                </p>
              </div>
              <button onClick={() => setModalConfig(false)}
                className="rounded-lg px-2 py-1 text-lg leading-none text-slate-500 hover:text-slate-200">✕</button>
            </header>

            <div className="mt-4 max-h-[60vh] space-y-4 overflow-y-auto pr-1">
              {CAMPOS_CONFIG.map((g) => (
                <div key={g.grupo}>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-amber-400/90">{g.grupo}</p>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {g.campos.map((c) => (
                      <label key={c.clave} className="block">
                        <span className="text-[11px] text-slate-400">{c.etiqueta}</span>
                        <input
                          value={form[c.clave] ?? ''}
                          onChange={(e) => setForm((f) => ({ ...f, [c.clave]: e.target.value }))}
                          className="mt-0.5 w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-amber-400/60"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={guardarConfig}
                disabled={guardando}
                className="flex-1 rounded-xl bg-amber-500 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-amber-400 disabled:bg-slate-800 disabled:text-slate-500"
              >
                {guardando ? 'Guardando…' : 'Guardar datos'}
              </button>
              <button
                type="button"
                onClick={() => setModalConfig(false)}
                className="rounded-xl border border-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-300 hover:border-amber-400/60 hover:text-amber-300"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}