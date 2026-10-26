//
// OnboardingWizard.tsx · v2 (E-14z-j) — Kārei ERP Gastronómico
// ═══════════════════════════════════════════════════════════════════════════
// POR QUÉ RE-ENTREGADO (v2)
// -------------------------
// Cristian montó AppLayout v4 (E-14z-i) y Vite botó:
//   [plugin:vite:import-analysis] Failed to resolve import
//   "@/components/onboarding/OnboardingWizard" from "src/components/layout/AppLayout.tsx"
// El archivo SÍ existía (v1 · E-14z-e) pero no quedó guardado en la ruta
// exacta. Esta v2 va CON EL FIX DEL CURSOR incluido (mismo patrón E-14z-g
// de RegistroPage): Campo, Chip e inputCls viven a NIVEL DE MÓDULO — antes
// estaban DENTRO del componente y cada tecla remontaba el <input> (se
// perdía el cursor al escribir).
//
// DÓNDE VA (EXACTO — esta es la clave del error)
// ----------------------------------------------
//   apps/web/src/components/onboarding/OnboardingWizard.tsx
//
//   · Carpeta del proyecto:  D:\Prime_TeamIA\proyectos_generados\Karei\apps\web
//   · Ruta completa del archivo:
//       src\components\onboarding\OnboardingWizard.tsx
//   · La carpeta "onboarding" DENTRO de src/components hay que CREARLA
//     (es nueva). Si guardaste la v1 directo en src/components/ (sin la
//     subcarpeta), BÓRRALA de ahí para no dejar duplicados.
//
// QUÉ ES
// ------
// Configuración inicial guiada para cada restaurante que empieza con Kārei:
// 4 pasos cortos que llenan los MISMOS 17 campos del ⚙ "Datos del
// restaurante" de Ventas, con chips de selección y resumen final.
//
// CERO cambios de backend: usa el GET/PUT /pos/facturacion/config que ya
// existe (pos_facturacion.py E-14w) y guarda la clave nueva
// "onboarding_hecho" en karei_config — el PUT acepta cualquier clave/valor.
//
// CÓMO FUNCIONA
// -------------
// · Solo lo ve el ADMIN (meseros y cocina no configuran nada).
// · Aparece mientras karei_config no traiga onboarding_hecho = "si".
// · Completar → PUT con todo + onboarding_hecho:"si" → no vuelve a
//   aparecer NUNCA (vive en la BD: ni borrando caché ni cambiando navegador).
// · "Configurarlo después" → se pospone SOLO en esta sesión del navegador
//   (sessionStorage); al cerrar y reabrir vuelve a preguntar hasta que se
//   complete. Así ningún cliente se queda sin configurar.
// · Prellena con lo que ya haya en la config. Si detecta los datos
//   FICTICIOS de fábrica (Kārei Restaurante · NIT 900.123.456-7 ·
//   Resolución 1876…) los muestra VACÍOS para que cada cliente entre los
//   suyos con conciencia — nada de tirillas con el NIT de otro.
// · Si se salta la resolución DIAN, la tirilla sale como COMPROBANTE DE
//   PAGO (comportamiento que Tirilla.tsx ya tiene: sin resolucion_numero
//   no hay FACTURA DE VENTA ni CUFE).
// ═══════════════════════════════════════════════════════════════════════════

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MarkKarei } from '@/components/brand/LogoKarei';
import { useAuthStore } from '../../store/authStore';
import * as apiModule from '../../lib/api';

const api: any = (apiModule as any).default ?? (apiModule as any).api ?? apiModule;

// ── Datos ficticios de fábrica (pos_facturacion.py _CONFIG_DEFECTO).
// Si la config trae EXACTAMENTE estos valores, el wizard los vacía para
// que el cliente entre los suyos. Si trae otros (ya configurados), se respetan.
const FICTICIOS: Record<string, string> = {
  nombre: 'Kārei Restaurante',
  slogan: 'Comida con alma',
  nit: '900.123.456-7',
  direccion: 'Cra 43A # 18-90, El Poblado',
  ciudad: 'Medellín, Antioquia',
  telefono: '+57 300 123 4567',
  resolucion_numero: '18760000000001',
  resolucion_prefijo: 'POS1',
  resolucion_rango_ini: '1',
  resolucion_rango_fin: '5000',
  resolucion_fecha: '2025-01-15',
  resolucion_vigencia: '12 meses (2025-2026)',
};

const DEFAULTS_SANOS: Record<string, string> = {
  regimen: 'Responsable de IVA',
  iva_pct: '19',
  iva_incluido: 'si',
  pie_gracias: '¡Gracias por su visita! Vuelva pronto',
};

const PASOS = [
  { titulo: 'Tu restaurante', sub: 'Lo que sale en el encabezado de cada tirilla' },
  { titulo: 'Impuestos', sub: 'Cómo Kārei discrimina el IVA al cobrar' },
  { titulo: 'Resolución DIAN', sub: 'Opcional: sin ella se imprime comprobante de pago' },
  { titulo: 'Último retoque', sub: 'El pie de tu tirilla y el resumen final' },
];

const EXTRAER = (r: any) => r?.data ?? r;

// ─────────────────────────────────────────────────────────────────────────
// NIVEL DE MÓDULO (fix del cursor): inputCls, Campo y Chip viven FUERA de
// OnboardingWizard. Así su tipo NO cambia entre renders y React no remonta
// el <input> en cada tecla → el cursor nunca se pierde.
// ─────────────────────────────────────────────────────────────────────────
const inputCls =
  'w-full rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 outline-none transition-colors focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/20';

const Campo = ({
  etiqueta,
  placeholder,
  tipo = 'text',
  value,
  onChange,
}: {
  etiqueta: string;
  placeholder?: string;
  tipo?: string;
  value?: string;
  onChange: (v: string) => void;
}) => (
  <label className="block">
    <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
      {etiqueta}
    </span>
    <input
      type={tipo}
      value={value ?? ''}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={inputCls}
    />
  </label>
);

const Chip = ({
  activo,
  onClick,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  children: any;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`rounded-xl border px-4 py-2 text-sm font-semibold transition-all ${
      activo
        ? 'border-amber-500/60 bg-amber-500/15 text-amber-300 ring-1 ring-inset ring-amber-500/30'
        : 'border-slate-700 bg-slate-800/60 text-slate-400 hover:border-slate-600 hover:text-slate-200'
    }`}
  >
    {children}
  </button>
);

export default function OnboardingWizard() {
  const usuario = useAuthStore((s) => s.usuario);
  const esAdmin = !!(usuario?.roles ?? []).includes('ADMIN');

  const queryClient = useQueryClient();
  const [paso, setPaso] = useState(0);
  const [form, setForm] = useState<Record<string, string> | null>(null);
  const [sinResolucion, setSinResolucion] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const qConfig = useQuery({
    queryKey: ['karei-config-fac'],
    queryFn: async () => EXTRAER(await api.get('/pos/facturacion/config')),
    retry: 1,
  });

  const config: any = qConfig?.data?.config ?? {};
  const hecho = String(config?.onboarding_hecho ?? '') === 'si';
  const pospuesto =
    typeof window !== 'undefined' && sessionStorage.getItem('karei-onboarding-despues') === '1';

  // Form inicial una sola vez: prellena con lo que exista y vacía ficticios.
  if (form === null && qConfig.isSuccess) {
    const base: Record<string, string> = {};
    const todas = [
      'nombre', 'slogan', 'nit', 'direccion', 'ciudad', 'telefono',
      'regimen', 'iva_pct', 'iva_incluido',
      'resolucion_numero', 'resolucion_prefijo', 'resolucion_rango_ini',
      'resolucion_rango_fin', 'resolucion_fecha', 'resolucion_vigencia',
      'software_nombre', 'software_nit', 'pie_gracias',
    ];
    for (const k of todas) {
      const val = String(config?.[k] ?? '');
      if (k in FICTICIOS && val === FICTICIOS[k]) base[k] = '';
      else if (val) base[k] = val;
      else base[k] = DEFAULTS_SANOS[k] ?? '';
    }
    base.onboarding_hecho = 'no';
    setForm(base);
    setSinResolucion(!base.resolucion_numero);
  }

  const set = (k: string, v: string) => setForm((f: any) => ({ ...f, [k]: v }));

  const faltanPaso1 = !form?.nombre?.trim() || !form?.nit?.trim();
  const errorResolucion =
    !!form?.resolucion_numero?.trim() && !form?.resolucion_prefijo?.trim()
      ? 'Si hay número de resolución, el prefijo es obligatorio (ej: POS1).'
      : '';

  const resumenListo = useMemo(() => {
    if (!form) return [] as { k: string; v: string }[];
    return [
      { k: 'Restaurante', v: form.nombre },
      { k: 'NIT', v: form.nit },
      { k: 'Ciudad', v: form.ciudad || '—' },
      { k: 'IVA', v: `${form.iva_pct}%${form.iva_incluido === 'si' ? ' · incluido en precios' : ' · añadido al total'}` },
      {
        k: 'Resolución DIAN',
        v: form.resolucion_numero
          ? `${form.resolucion_numero} · ${form.resolucion_prefijo}`
          : 'Sin resolución → tirilla tipo COMPROBANTE DE PAGO',
      },
    ];
  }, [form]);

  // ── No toca renderizar: esperando config, ya hecho, pospuesto o no-admin
  if (!esAdmin || qConfig.isLoading || hecho || pospuesto) return null;
  if (!form) return null; // config lista pero form aún inicializándose (1 frame)

  const despues = () => {
    sessionStorage.setItem('karei-onboarding-despues', '1');
    queryClient.invalidateQueries({ queryKey: ['karei-config-fac'] });
  };

  const guardar = async () => {
    setGuardando(true);
    setError('');
    try {
      await api.put('/pos/facturacion/config', { ...form, onboarding_hecho: 'si' });
      sessionStorage.removeItem('karei-onboarding-despues');
      queryClient.invalidateQueries({ queryKey: ['karei-config-fac'] });
      // El wizard desaparece solo: config.onboarding_hecho pasa a "si".
    } catch {
      setError('No pude guardar. ¿Está corriendo el backend? Cierra, reintenta y sigue desde donde ibas.');
    } finally {
      setGuardando(false);
    }
  };

  const avanzar = () => {
    setError('');
    if (paso === 2 && errorResolucion) return;
    if (paso < 3) setPaso(paso + 1);
    else guardar();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl shadow-black/60">
        {/* Cabecera con la marca */}
        <div className="border-b border-slate-800 px-6 py-5">
          <div className="flex items-center gap-3">
            <MarkKarei size={42} variante="dark" />
            <div>
              <p className="text-lg font-black tracking-tight text-white">
                Bienvenido a Kārei<span className="text-amber-400">.</span>
              </p>
              <p className="text-xs text-slate-400">Configuremos tu restaurante en 4 pasos cortos</p>
            </div>
          </div>
          <div className="mt-4 flex gap-1.5">
            {PASOS.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full transition-colors ${i <= paso ? 'bg-amber-500' : 'bg-slate-800'}`}
              />
            ))}
          </div>
        </div>

        {/* Cuerpo del paso */}
        <div className="px-6 py-5">
          <h2 className="text-base font-bold text-slate-100">
            {paso + 1}/4 · {PASOS[paso].titulo}
          </h2>
          <p className="mb-4 text-sm text-slate-400">{PASOS[paso].sub}</p>

          {paso === 0 && (
            <div className="space-y-3.5">
              <Campo
                etiqueta="Nombre comercial *"
                placeholder="Ej: Asados Doña Lua"
                value={form.nombre}
                onChange={(v) => set('nombre', v)}
              />
              <div className="grid grid-cols-2 gap-3.5">
                <Campo
                  etiqueta="NIT *"
                  placeholder="900.000.000-0"
                  value={form.nit}
                  onChange={(v) => set('nit', v)}
                />
                <Campo
                  etiqueta="Teléfono"
                  placeholder="+57 300 000 0000"
                  value={form.telefono}
                  onChange={(v) => set('telefono', v)}
                />
              </div>
              <Campo
                etiqueta="Dirección"
                placeholder="Cra 00 # 00-00"
                value={form.direccion}
                onChange={(v) => set('direccion', v)}
              />
              <div className="grid grid-cols-2 gap-3.5">
                <Campo
                  etiqueta="Ciudad"
                  placeholder="Medellín, Antioquia"
                  value={form.ciudad}
                  onChange={(v) => set('ciudad', v)}
                />
                <Campo
                  etiqueta="Eslogan (opcional)"
                  placeholder="Comida con alma"
                  value={form.slogan}
                  onChange={(v) => set('slogan', v)}
                />
              </div>
              {faltanPaso1 && (
                <p className="text-xs text-amber-400/90">
                  El nombre comercial y el NIT son los mínimos para que la tirilla salga con tu identidad.
                </p>
              )}
            </div>
          )}

          {paso === 1 && (
            <div className="space-y-4">
              <div>
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">Régimen</span>
                <div className="flex flex-wrap gap-2">
                  {['Responsable de IVA', 'No responsable de IVA', 'Régimen simple'].map((r) => (
                    <Chip key={r} activo={form.regimen === r} onClick={() => set('regimen', r)}>{r}</Chip>
                  ))}
                </div>
              </div>
              <div>
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">IVA que aplica en tu carta</span>
                <div className="flex flex-wrap gap-2">
                  {['19', '8'].map((p) => (
                    <Chip key={p} activo={form.iva_pct === p} onClick={() => set('iva_pct', p)}>{p}%</Chip>
                  ))}
                </div>
                <p className="mt-1.5 text-xs text-slate-500">
                  19% general · 8% el que más usan restaurantes en Colombia. Ajustable luego en ⚙.
                </p>
              </div>
              <div>
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                  ¿El IVA va incluido en tus precios?
                </span>
                <div className="flex flex-wrap gap-2">
                  <Chip activo={form.iva_incluido === 'si'} onClick={() => set('iva_incluido', 'si')}>Sí, precio final</Chip>
                  <Chip activo={form.iva_incluido === 'no'} onClick={() => set('iva_incluido', 'no')}>No, se suma al total</Chip>
                </div>
                <p className="mt-1.5 text-xs text-slate-500">
                  Lo normal en cartas colombianas es incluido: el cliente paga lo que dice la carta y la tirilla
                  discrimina base/IVA.
                </p>
              </div>
            </div>
          )}

          {paso === 2 && (
            <div className="space-y-3.5">
              <button
                type="button"
                onClick={() => {
                  const nuevo = !sinResolucion;
                  setSinResolucion(nuevo);
                  if (nuevo) {
                    ['resolucion_numero', 'resolucion_prefijo', 'resolucion_rango_ini',
                     'resolucion_rango_fin', 'resolucion_fecha', 'resolucion_vigencia']
                      .forEach((k) => set(k, ''));
                  }
                }}
                className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors ${
                  sinResolucion
                    ? 'border-amber-500/50 bg-amber-500/10 text-amber-200'
                    : 'border-slate-700 bg-slate-800/60 text-slate-300'
                }`}
              >
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${sinResolucion ? 'border-amber-500 bg-amber-500 text-slate-950' : 'border-slate-600'}`}>
                  {sinResolucion ? '✓' : ''}
                </span>
                <span>
                  Aún no tengo resolución DIAN — imprimir como <b>comprobante de pago</b>
                </span>
              </button>

              {!sinResolucion && (
                <>
                  <div className="grid grid-cols-2 gap-3.5">
                    <Campo
                      etiqueta="Número de resolución"
                      placeholder="18760000000001"
                      value={form.resolucion_numero}
                      onChange={(v) => set('resolucion_numero', v)}
                    />
                    <Campo
                      etiqueta="Prefijo"
                      placeholder="POS1"
                      value={form.resolucion_prefijo}
                      onChange={(v) => set('resolucion_prefijo', v)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3.5">
                    <Campo
                      etiqueta="Rango inicial"
                      placeholder="1"
                      value={form.resolucion_rango_ini}
                      onChange={(v) => set('resolucion_rango_ini', v)}
                    />
                    <Campo
                      etiqueta="Rango final"
                      placeholder="5000"
                      value={form.resolucion_rango_fin}
                      onChange={(v) => set('resolucion_rango_fin', v)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3.5">
                    <Campo
                      etiqueta="Fecha resolución"
                      tipo="date"
                      value={form.resolucion_fecha}
                      onChange={(v) => set('resolucion_fecha', v)}
                    />
                    <Campo
                      etiqueta="Vigencia"
                      placeholder="12 meses (2026-2027)"
                      value={form.resolucion_vigencia}
                      onChange={(v) => set('resolucion_vigencia', v)}
                    />
                  </div>
                  {errorResolucion && <p className="text-xs text-red-400">{errorResolucion}</p>}
                </>
              )}
              <p className="text-xs text-slate-500">
                Sin resolución la tirilla dice COMPROBANTE DE PAGO. En cuanto la tengas, se llena aquí o en ⚙ y
                automáticamente pasa a FACTURA DE VENTA con CUFE y QR.
              </p>
            </div>
          )}

          {paso === 3 && (
            <div className="space-y-4">
              <Campo
                etiqueta="Mensaje final de la tirilla"
                placeholder="¡Gracias por su visita! Vuelva pronto"
                value={form.pie_gracias}
                onChange={(v) => set('pie_gracias', v)}
              />
              <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-3.5 text-xs text-slate-400">
                El pie de fabricante es fijo — es la marca que respalda tu facturación:
                <span className="mt-1 block font-semibold text-slate-200">
                  {form.software_nombre || 'Kārei · software gastronómico'} · NIT {form.software_nit || '901.456.789-0'}
                </span>
              </div>
              <div className="rounded-xl border border-slate-700/60 bg-slate-800/40 p-4">
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-amber-400">Resumen</p>
                <dl className="space-y-1.5 text-sm">
                  {resumenListo.map((r) => (
                    <div key={r.k} className="flex items-start justify-between gap-3">
                      <dt className="shrink-0 text-slate-500">{r.k}</dt>
                      <dd className="text-right font-medium text-slate-200">{r.v || '—'}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          )}

          {error && (
            <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>
          )}
        </div>

        {/* Pie de botones */}
        <div className="flex items-center justify-between gap-3 border-t border-slate-800 px-6 py-4">
          <button
            type="button"
            onClick={paso === 0 ? despues : () => setPaso(paso - 1)}
            className="text-sm font-medium text-slate-500 transition-colors hover:text-slate-300"
          >
            {paso === 0 ? 'Configurarlo después' : '← Atrás'}
          </button>
          <button
            type="button"
            onClick={avanzar}
            disabled={guardando || (paso === 0 && faltanPaso1) || (paso === 2 && !!errorResolucion)}
            className="rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-bold text-slate-950 transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {guardando ? 'Guardando…' : paso === 3 ? '🚀 Guardar y empezar' : 'Siguiente →'}
          </button>
        </div>
      </div>
    </div>
  );
}