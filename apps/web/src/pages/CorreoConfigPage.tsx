// src/pages/CorreoConfigPage.tsx — E-14z-i · CORREO DE LA PLATAFORMA
// ═══════════════════════════════════════════════════════════════════════════
// Configura el SMTP DESDE LA APP (adiós variables de entorno):
//   GET  /saas/correo/config  → estado actual (activo / fuente / máscara)
//   PUT  /saas/correo/config  → guarda (contraseña vacía = conserva la actual)
//   POST /saas/correo/probar  → envía un correo de prueba al destino que digas
//
// Solo ADMIN (la ruta /correo está protegida y el backend también valida).
// La contraseña NUNCA vuelve del backend: solo "••••abcd" y tiene_password.
// ═══════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useState } from 'react';
import * as apiModule from '../lib/api';
import { toastOk, alertaError } from '../lib/alertas';

const api: any = (apiModule as any).default ?? (apiModule as any).api ?? apiModule;
// axios → r.data · wrapper propio → r · backend envuelto → r.data.data
const EXTRAER = (r: any) => {
  const a = r?.data ?? r;
  return a?.data !== undefined && a?.ok !== undefined && !a?.version ? a.data : a;
};

const _detalle = (e: any, fallback: string): string => {
  const d = e?.response?.data?.detail ?? e?.detail ?? e?.message;
  return typeof d === 'string' && d ? d : fallback;
};

const inputCls =
  'w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 ' +
  'placeholder:text-slate-500 focus:border-amber-500/60 focus:outline-none focus:ring-1 focus:ring-amber-500/40';
const labelCls = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400';

export default function CorreoConfigPage() {
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [probando, setProbando] = useState(false);

  const [host, setHost] = useState('');
  const [puerto, setPuerto] = useState('587');
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [de, setDe] = useState('');

  const [activo, setActivo] = useState(false);
  const [fuente, setFuente] = useState('dev');
  const [tienePassword, setTienePassword] = useState(false);
  const [mascara, setMascara] = useState('');
  const [hayEntorno, setHayEntorno] = useState(false);

  const [destino, setDestino] = useState('');
  const [resultado, setResultado] = useState<{ ok: boolean; msg: string } | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const c: any = EXTRAER(await api.get('/saas/correo/config'));
      setHost(String(c?.smtp_host ?? ''));
      setPuerto(String(c?.smtp_port ?? 587));
      setUsuario(String(c?.smtp_user ?? ''));
      setDe(String(c?.smtp_from ?? ''));
      setActivo(!!c?.activo);
      setFuente(String(c?.fuente ?? 'dev'));
      setTienePassword(!!c?.tiene_password);
      setMascara(String(c?.password_mascara ?? ''));
      setHayEntorno(!!c?.hay_entorno);
    } catch (e: any) {
      alertaError(_detalle(e, 'No se pudo leer la configuración de correo'));
    } finally {
      setCargando(false);
      setPassword('');
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const guardar = async () => {
    if (guardando) return;
    setGuardando(true);
    setResultado(null);
    try {
      const r: any = EXTRAER(await api.put('/saas/correo/config', {
        smtp_host: host,
        smtp_port: Number(puerto) || 587,
        smtp_user: usuario,
        smtp_password: password, // vacío → el backend conserva la guardada
        smtp_from: de,
      }));
      if (r?.activo) toastOk(r?.aviso ?? 'Configuración de correo guardada');
      else alertaError(r?.aviso ?? 'Guardado, pero el SMTP aún está incompleto');
      await cargar(); // refresca chips y máscara
    } catch (e: any) {
      alertaError(_detalle(e, 'No se pudo guardar la configuración'));
    } finally {
      setGuardando(false);
    }
  };

  const probar = async () => {
    if (probando) return;
    setProbando(true);
    setResultado(null);
    try {
      const r: any = EXTRAER(await api.post('/saas/correo/probar', { destino }));
      const ok = !!r?.ok;
      setResultado({ ok, msg: String(r?.mensaje ?? (ok ? 'Enviado' : 'Falló el envío')) });
      if (ok) toastOk('Correo de prueba enviado');
    } catch (e: any) {
      setResultado({ ok: false, msg: _detalle(e, 'No se pudo enviar el correo de prueba') });
    } finally {
      setProbando(false);
    }
  };

  const chipActivo = activo
    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
    : 'border-amber-500/40 bg-amber-500/10 text-amber-300';
  const textoChip = cargando ? 'Consultando…'
    : activo ? `SMTP ACTIVO (${fuente === 'bd' ? 'configurado en la app' : 'variables de entorno'})`
    : 'MODO DEV · link de verificación por consola/pantalla';

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold text-white">Correo de la plataforma</h1>
        <span className={`rounded-full border px-3 py-1 text-xs font-bold ${chipActivo}`}>
          {textoChip}
        </span>
      </div>
      <p className="text-sm text-slate-400">
        Este buzón es con el que Kārei envía los correos de verificación de registro
        de todos los restaurantes. Configúralo una vez y olvídate de la terminal.
        {!activo && !cargando && ' Mientras esté apagado, los links de verificación salen por la consola del backend y en pantalla (modo dev).'}
      </p>

      {hayEntorno && !activo && (
        <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 p-3 text-xs text-sky-200">
          Detecté variables de entorno KAREI_SMTP_* activas. Lo que guardes aquí tiene prioridad
          sobre ellas.
        </div>
      )}

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
          <div>
            <label className={labelCls}>Servidor SMTP</label>
            <input className={inputCls} value={host} onChange={(e) => setHost(e.target.value)}
              placeholder="smtp.gmail.com" autoComplete="off" />
          </div>
          <div>
            <label className={labelCls}>Puerto</label>
            <input className={inputCls} value={puerto}
              onChange={(e) => setPuerto(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="587" inputMode="numeric" />
          </div>
        </div>
        <p className="text-xs text-slate-500">587 = STARTTLS (Gmail y la mayoría) · 465 = SSL directo.</p>

        <div>
          <label className={labelCls}>Usuario (correo que envía)</label>
          <input className={inputCls} value={usuario} onChange={(e) => setUsuario(e.target.value)}
            placeholder="notificaciones@tumarca.com" autoComplete="off" />
        </div>

        <div>
          <label className={labelCls}>Contraseña de aplicación</label>
          <input className={inputCls} type="password" value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={tienePassword ? `Guardada (${mascara}) — déjala vacía para conservarla` : '16 letras de la contraseña de aplicación'}
            autoComplete="new-password" />
        </div>

        <div>
          <label className={labelCls}>Nombre visible en De: (opcional)</label>
          <input className={inputCls} value={de} onChange={(e) => setDe(e.target.value)}
            placeholder="vacío = usa el usuario de arriba" autoComplete="off" />
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <button onClick={guardar} disabled={guardando || cargando}
            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-slate-900 hover:bg-amber-400 disabled:opacity-50">
            {guardando ? 'Guardando…' : 'Guardar configuración'}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-3">
        <h2 className="text-sm font-bold text-white">Prueba de envío</h2>
        <p className="text-xs text-slate-400">
          Envía un correo real con la configuración guardada. Si llega, el SMTP quedó listo.
        </p>
        <div className="flex flex-wrap gap-2">
          <input className={`${inputCls} flex-1 min-w-[220px]`} value={destino}
            onChange={(e) => setDestino(e.target.value)}
            placeholder="tu-correo@gmail.com" inputMode="email" />
          <button onClick={probar} disabled={probando || !destino.trim()}
            className="rounded-lg border border-amber-500/50 px-4 py-2 text-sm font-bold text-amber-300 hover:bg-amber-500/10 disabled:opacity-50">
            {probando ? 'Enviando…' : 'Enviar prueba'}
          </button>
        </div>
        {resultado && (
          <div className={`rounded-lg border p-3 text-xs ${
            resultado.ok
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
              : 'border-red-500/40 bg-red-500/10 text-red-200'}`}>
            {resultado.msg}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-xs leading-relaxed text-slate-400">
        <p className="mb-2 font-bold text-slate-200">Gmail en 3 pasos</p>
        <p>1. Activa la Verificación en 2 pasos de la cuenta de Google.</p>
        <p>2. Entra a <span className="text-amber-300">myaccount.google.com/apppasswords</span> y crea una
          «Contraseña de aplicación» (16 letras).</p>
        <p>3. Pega esas 16 letras arriba (NO es tu contraseña normal). Servidor smtp.gmail.com, puerto 587.</p>
        <p className="mt-2">Para apagar el SMTP y volver al modo dev: guarda con el campo «Servidor» vacío.</p>
      </div>
    </div>
  );
}