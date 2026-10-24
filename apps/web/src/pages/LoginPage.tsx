import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuthStore, type UsuarioSesion } from '../store/authStore';
import PinPad from '@/components/auth/PinPad';
import { LogoKarei } from '@/components/brand/LogoKarei';

interface LoginResponse {
  access_token: string;
  token_type: string;
  user: UsuarioSesion;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const usuario = useAuthStore((s) => s.usuario);
  const setSession = useAuthStore((s) => s.setSession);
  const homePorRol = useAuthStore((s) => s.homePorRol);

  const [pestana, setPestana] = useState<'admin' | 'equipo'>('admin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [cargando, setCargando] = useState(false);
  const [mensajeError, setMensajeError] = useState<string | null>(null);
  const [pinError, setPinError] = useState(false);

  // ya con sesión → directo a su home
  if (token && usuario) return <Navigate to={homePorRol()} replace />;

  const entrarAdmin = async (e: FormEvent) => {
    e.preventDefault();
    if (cargando) return;
    setMensajeError(null);
    setCargando(true);
    try {
      // OAuth2 exige form-urlencoded; forzamos el header porque la instancia
      // de axios lo trae fijo en application/json.
      const body = new URLSearchParams();
      body.set('username', email.trim());
      body.set('password', password);
      const { data } = await api.post<LoginResponse>('/auth/login', body, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      setSession(data.access_token, data.user);
      navigate(homePorRol(), { replace: true });
    } catch (err: any) {
      const detalle = err?.response?.data?.detail;
      setMensajeError(
        typeof detalle === 'string' ? detalle : 'No pudimos iniciar sesión. Revisa tus credenciales.'
      );
    } finally {
      setCargando(false);
    }
  };

  const entrarConPin = async (pin: string) => {
    setMensajeError(null);
    setCargando(true);
    try {
      const { data } = await api.post<LoginResponse>('/auth/login-pin', { pin });
      setSession(data.access_token, data.user);
      navigate(homePorRol(), { replace: true });
    } catch (err: any) {
      const detalle = err?.response?.data?.detail;
      setMensajeError(typeof detalle === 'string' ? detalle : 'PIN incorrecto');
      setPinError(true);
      window.setTimeout(() => setPinError(false), 450);
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center">
          <LogoKarei variante="dark" sizeMark={84} />
          <p className="mt-3 text-sm text-slate-400">ERP Gastronómico</p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl backdrop-blur">
          {/* pestañas */}
          <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl bg-slate-800/80 p-1">
            <button
              type="button"
              onClick={() => { setPestana('admin'); setMensajeError(null); }}
              className={`rounded-lg py-2 text-sm font-semibold transition-colors ${
                pestana === 'admin' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Administrador
            </button>
            <button
              type="button"
              onClick={() => { setPestana('equipo'); setMensajeError(null); }}
              className={`rounded-lg py-2 text-sm font-semibold transition-colors ${
                pestana === 'equipo' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Equipo
            </button>
          </div>

          {mensajeError && (
            <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {mensajeError}
            </div>
          )}

          {pestana === 'admin' ? (
            <form onSubmit={entrarAdmin} className="space-y-4">
              <div>
                <label htmlFor="email" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Correo
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@karei.app"
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label htmlFor="password" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Contraseña
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-amber-500"
                />
              </div>
              <button
                type="submit"
                disabled={cargando}
                className="w-full rounded-lg bg-amber-500 py-2.5 text-sm font-bold text-slate-950 transition-colors hover:bg-amber-400 disabled:opacity-60"
              >
                {cargando ? 'Entrando...' : 'Entrar'}
              </button>
            </form>
          ) : (
            <div className="flex flex-col items-center">
              <p className="mb-5 text-center text-sm text-slate-400">Ingresa tu PIN de 4 dígitos</p>
              <PinPad onCompleto={entrarConPin} error={pinError} cargando={cargando} />
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          Acceso privado · Solo personal autorizado
        </p>
      </div>
    </div>
  );
}