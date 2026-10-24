//
// RegistroPage.tsx · E-14z-f (Fase SaaS — tramo 1 del onboarding)
// ═══════════════════════════════════════════════════════════════════════════
// QUÉ ES
// ------
// Página PÚBLICA de registro de Kārei (sin sesión): el dueño del restaurante
// crea su cuenta con un wizard de 4 pasos y sale con TODO listo:
//   1 · Tu restaurante   → Tenant (trial 30 días) + Branch principal
//   2 · Tu cuenta admin  → User ADMIN (pendiente de verificar correo)
//   3 · Tu equipo        → Meseros/cocina con PIN (saltable)
//   4 · Resumen          → POST /saas/registro → pantalla "revisa tu correo"
//
// El backend (saas_registro.py add-on) crea todo y devuelve el link de
// verificación en modo dev. Al validar el correo: admin ACTIVE + equipo
// ACTIVE → el PIN ya funciona. El equipo entra por la pestaña "equipo"
// del login (PIN de 4), el admin por correo+contraseña (flujo existente).
//
// DÓNDE VA
// --------
// src/pages/RegistroPage.tsx
// Y en App.tsx, junto a la ruta /login (público, sin AppLayout):
//   <Route path="/registro" element={<RegistroPage />} />
// ═══════════════════════════════════════════════════════════════════════════

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MarkKarei } from '@/components/brand/LogoKarei';
import * as apiModule from '../lib/api';

const api: any = (apiModule as any).default ?? (apiModule as any).api ?? apiModule;

const PASOS = [
  { titulo: 'Tu restaurante', sub: 'Esto crea tu cuenta Kārei con 30 días de prueba' },
  { titulo: 'Tu cuenta de admin', sub: 'Con este correo entrarás tú: te enviaremos un link de verificación' },
  { titulo: 'Tu equipo', sub: 'Meseros y cocina entran solo con su PIN de 4 dígitos' },
  { titulo: 'Todo listo', sub: 'Revisa y crea tu cuenta' },
];

type Miembro = { full_name: string; rol: 'WAITER' | 'KITCHEN'; pin: string };

const EXTRAER = (r: any) => r?.data ?? r;

const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

export default function RegistroPage() {
  const [paso, setPaso] = useState(0);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const [restaurante, setRestaurante] = useState({ commercial_name: '', legal_name: '', nit: '', ciudad: '', telefono: '' });
  const [admin, setAdmin] = useState({ full_name: '', email: '', password: '', password2: '' });
  const [equipo, setEquipo] = useState<Miembro[]>([]);
  const [creado, setCreado] = useState<any>(null);

  const setR = (k: string, v: string) => setRestaurante((f) => ({ ...f, [k]: v }));
  const setA = (k: string, v: string) => setAdmin((f) => ({ ...f, [k]: v }));

  // ── Validaciones por paso
  const errorPaso0 = !restaurante.commercial_name.trim() || !restaurante.legal_name.trim() || !restaurante.nit.trim();
  const errorPaso1 =
    !admin.full_name.trim() || !emailOk(admin.email) || admin.password.length < 8 || admin.password !== admin.password2;
  const pinRepetidos = new Set(equipo.map((m) => m.pin)).size !== equipo.length;
  const equipoMalo = equipo.some((m) => !m.full_name.trim() || !/^[0-9]{4}$/.test(m.pin)) || pinRepetidos;

  const avanzar = () => { setError(''); setPaso((p) => Math.min(p + 1, 3)); };
  const regresar = () => { setError(''); setPaso((p) => Math.max(p - 1, 0)); };

  const registrar = async () => {
    setGuardando(true);
    setError('');
    try {
      const r: any = await api.post('/saas/registro', {
        restaurante: {
          commercial_name: restaurante.commercial_name.trim(),
          legal_name: restaurante.legal_name.trim(),
          nit: restaurante.nit.trim(),
          ciudad: restaurante.ciudad.trim() || null,
          telefono: restaurante.telefono.trim() || null,
        },
        admin: {
          full_name: admin.full_name.trim(),
          email: admin.email.trim().toLowerCase(),
          password: admin.password,
        },
        equipo: equipo.map((m) => ({ full_name: m.full_name.trim(), rol: m.rol, pin: m.pin })),
      });
      setCreado(EXTRAER(r));
    } catch (e: any) {
      const detalle = e?.response?.data?.detail ?? e?.message ?? '';
      setError(typeof detalle === 'string' && detalle ? detalle : 'No pude crear la cuenta. Intenta de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  const inputCls =
    'w-full rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 outline-none transition-colors focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/20';
  const labelCls = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400';

  const Campo = ({ k, etiqueta, placeholder, tipo = 'text', valor, onChange }: any) => (
    <label className="block">
      <span className={labelCls}>{etiqueta}</span>
      <input type={tipo} value={valor[k] ?? ''} placeholder={placeholder}
        onChange={(e) => onChange(k, e.target.value)} className={inputCls} />
    </label>
  );

  const Chip = ({ activo, onClick, children }: any) => (
    <button type="button" onClick={onClick}
      className={`rounded-xl border px-4 py-2 text-sm font-semibold transition-all ${
        activo
          ? 'border-amber-500/60 bg-amber-500/15 text-amber-300 ring-1 ring-inset ring-amber-500/30'
          : 'border-slate-700 bg-slate-800/60 text-slate-400 hover:border-slate-600 hover:text-slate-200'
      }`}>
      {children}
    </button>
  );

  // ══════════════════════════════════════════════ PANTALLA FINAL (creado)
  if (creado) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
        <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center shadow-2xl shadow-black/60">
          <MarkKarei size={56} variante="dark" className="mx-auto" />
          <h1 className="mt-4 text-xl font-black text-white">¡Ya casi, {admin.full_name.split(' ')[0]}!</h1>
          <p className="mt-2 text-sm text-slate-400">
            Tu restaurante <b className="text-slate-200">{restaurante.commercial_name}</b> quedó creado con
            30 días de prueba. Te enviamos el link de verificación a:
          </p>
          <p className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm font-bold text-amber-300">
            {admin.email}
          </p>
          {creado?.verificacion_url && (
            <div className="mt-4 rounded-xl border border-slate-700 bg-slate-800/50 p-3 text-left">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Modo desarrollo (sin SMTP)</p>
              <a href={creado.verificacion_url} className="mt-1 block break-all text-xs text-sky-400 underline decoration-sky-700 hover:text-sky-300">
                {creado.verificacion_url}
              </a>
              <p className="mt-1 text-[11px] text-slate-500">Al abrirlo, tú y tu equipo quedan activos.</p>
            </div>
          )}
          <p className="mt-4 text-xs text-slate-500">
            {creado?.equipo_creados > 0
              ? `${creado.equipo_creados} persona(s) del equipo ya tienen su PIN — podrán entrar apenas verifiques tu correo.`
              : 'Después puedes agregar meseros y cocina sin afán.'}
          </p>
          <Link to="/login" className="mt-6 inline-block rounded-xl bg-amber-500 px-6 py-2.5 text-sm font-bold text-slate-950 transition-colors hover:bg-amber-400">
            Ir a iniciar sesión
          </Link>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════ WIZARD
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
      <div className="max-h-[94vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl shadow-black/60">
        {/* Cabecera de marca */}
        <div className="border-b border-slate-800 px-6 py-5">
          <div className="flex items-center gap-3">
            <MarkKarei size={42} variante="dark" />
            <div>
              <p className="text-lg font-black tracking-tight text-white">
                Crea tu Kārei<span className="text-amber-400">.</span>
              </p>
              <p className="text-xs text-slate-400">El ERP gastronómico colombiano — 30 días de prueba, sin tarjeta</p>
            </div>
          </div>
          <div className="mt-4 flex gap-1.5">
            {PASOS.map((_, i) => (
              <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i <= paso ? 'bg-amber-500' : 'bg-slate-800'}`} />
            ))}
          </div>
        </div>

        {/* Cuerpo */}
        <div className="px-6 py-5">
          <h2 className="text-base font-bold text-slate-100">{paso + 1}/4 · {PASOS[paso].titulo}</h2>
          <p className="mb-4 text-sm text-slate-400">{PASOS[paso].sub}</p>

          {paso === 0 && (
            <div className="space-y-3.5">
              <Campo k="commercial_name" etiqueta="Nombre comercial *" placeholder="Ej: Asados Doña Lua" valor={restaurante} onChange={setR} />
              <Campo k="legal_name" etiqueta="Razón social *" placeholder="Ej: Asados Doña Lua S.A.S." valor={restaurante} onChange={setR} />
              <div className="grid grid-cols-2 gap-3.5">
                <Campo k="nit" etiqueta="NIT *" placeholder="900.000.000-0" valor={restaurante} onChange={setR} />
                <Campo k="telefono" etiqueta="Teléfono" placeholder="+57 300 000 0000" valor={restaurante} onChange={setR} />
              </div>
              <Campo k="ciudad" etiqueta="Ciudad" placeholder="Medellín, Antioquia" valor={restaurante} onChange={setR} />
            </div>
          )}

          {paso === 1 && (
            <div className="space-y-3.5">
              <Campo k="full_name" etiqueta="Tu nombre completo *" placeholder="Ej: Cristian Restrepo" valor={admin} onChange={setA} />
              <Campo k="email" etiqueta="Correo del admin *" tipo="email" placeholder="tucorreo@ejemplo.com" valor={admin} onChange={setA} />
              <div className="grid grid-cols-2 gap-3.5">
                <Campo k="password" etiqueta="Contraseña * (mín. 8)" tipo="password" placeholder="••••••••" valor={admin} onChange={setA} />
                <Campo k="password2" etiqueta="Repetir contraseña *" tipo="password" placeholder="••••••••" valor={admin} onChange={setA} />
              </div>
              {admin.password && admin.password2 && admin.password !== admin.password2 && (
                <p className="text-xs text-red-400">Las contraseñas no coinciden.</p>
              )}
              {!emailOk(admin.email) && admin.email && (
                <p className="text-xs text-amber-400/90">Revisa el correo: con ese entrarás y es donde llega el link.</p>
              )}
            </div>
          )}

          {paso === 2 && (
            <div className="space-y-3">
              {equipo.length === 0 && (
                <p className="rounded-xl border border-slate-800 bg-slate-800/40 px-4 py-3 text-sm text-slate-400">
                  Agrega aquí a tus meseras y cocineros. Cada uno entra a la app <b className="text-slate-200">solo con su PIN de 4 dígitos</b> (pestaña “Equipo” del login).
                </p>
              )}
              {equipo.map((m, i) => (
                <div key={i} className="rounded-xl border border-slate-700/70 bg-slate-800/50 p-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
                    <input
                      value={m.full_name}
                      placeholder="Nombre (ej: Laura)"
                      onChange={(e) => setEquipo((arr) => arr.map((x, j) => (j === i ? { ...x, full_name: e.target.value } : x)))}
                      className={inputCls}
                    />
                    <div className="flex gap-1.5">
                      {(['WAITER', 'KITCHEN'] as const).map((r) => (
                        <Chip key={r} activo={m.rol === r}
                          onClick={() => setEquipo((arr) => arr.map((x, j) => (j === i ? { ...x, rol: r } : x)))}>
                          {r === 'WAITER' ? 'Mesero' : 'Cocina'}
                        </Chip>
                      ))}
                    </div>
                    <input
                      value={m.pin}
                      inputMode="numeric" maxLength={4}
                      placeholder="PIN ••••"
                      onChange={(e) => setEquipo((arr) => arr.map((x, j) => (j === i ? { ...x, pin: e.target.value.replace(/[^0-9]/g, '') } : x)))}
                      className={`${inputCls} sm:w-28 text-center tracking-[0.3em]`}
                    />
                    <button type="button" onClick={() => setEquipo((arr) => arr.filter((_, j) => j !== i))}
                      className="rounded-xl border border-slate-700 px-3 text-sm text-slate-500 transition-colors hover:border-red-500/40 hover:text-red-400">
                      ✕
                    </button>
                  </div>
                </div>
              ))}
              {pinRepetidos && <p className="text-xs text-red-400">Hay PINs repetidos: cada persona debe tener uno distinto.</p>}
              <button type="button"
                onClick={() => setEquipo((arr) => [...arr, { full_name: '', rol: 'WAITER', pin: '' }])}
                className="w-full rounded-xl border border-dashed border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-400 transition-colors hover:border-amber-500/50 hover:text-amber-300">
                ＋ Agregar persona
              </button>
            </div>
          )}

          {paso === 3 && (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-700/60 bg-slate-800/40 p-4">
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-amber-400">Resumen</p>
                <dl className="space-y-1.5 text-sm">
                  {[
                    ['Restaurante', restaurante.commercial_name],
                    ['Razón social', restaurante.legal_name],
                    ['NIT', restaurante.nit],
                    ['Admin', `${admin.full_name} · ${admin.email}`],
                    ['Equipo', equipo.length ? `${equipo.length} persona(s): ${equipo.map((m) => `${m.full_name} (${m.rol === 'WAITER' ? 'Mesero' : 'Cocina'})`).join(', ')}` : 'Sin equipo (puedes agregarlo después)'],
                  ].map(([k, v]) => (
                    <div key={k} className="flex items-start justify-between gap-3">
                      <dt className="shrink-0 text-slate-500">{k}</dt>
                      <dd className="text-right font-medium text-slate-200">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <p className="text-xs text-slate-500">
                Al crear tu cuenta: tenant en prueba 30 días, tu correo queda pendiente y te llega el link de
                verificación. El PIN del equipo se activa junto con tu correo.
              </p>
            </div>
          )}

          {error && (
            <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>
          )}
        </div>

        {/* Pie de botones */}
        <div className="flex items-center justify-between gap-3 border-t border-slate-800 px-6 py-4">
          {paso === 0 ? (
            <Link to="/login" className="text-sm font-medium text-slate-500 transition-colors hover:text-slate-300">
              Ya tengo cuenta
            </Link>
          ) : (
            <button type="button" onClick={regresar} className="text-sm font-medium text-slate-500 transition-colors hover:text-slate-300">
              ← Atrás
            </button>
          )}
          <button
            type="button"
            onClick={paso === 3 ? registrar : avanzar}
            disabled={guardando || (paso === 0 && errorPaso0) || (paso === 1 && errorPaso1) || (paso === 2 && equipoMalo)}
            className="rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-bold text-slate-950 transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {guardando ? 'Creando…' : paso === 3 ? '🚀 Crear mi cuenta' : 'Siguiente →'}
          </button>
        </div>
      </div>
    </div>
  );
}