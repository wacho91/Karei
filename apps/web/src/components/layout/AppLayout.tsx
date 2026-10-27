//
// AppLayout.tsx · v4 (E-14z-i) — Kārei ERP Gastronómico
// ═══════════════════════════════════════════════════════════════════════════
// CAMBIOS vs v3 (E-14z-e):
//   1. + item de NAV «Correo» (solo ADMIN) → /correo (SMTP desde la app).
// TODO lo demás queda EXACTO igual (NAV con roles, COLOR_ROL, logout,
// MarkKarei en sidebar y header móvil, OnboardingWizard). Sin cambios de lógica.
// ═══════════════════════════════════════════════════════════════════════════

import { NavLink, Outlet, useNavigate, Navigate } from 'react-router-dom';
import { useAuthStore, type Rol } from '../../store/authStore';
import { MarkKarei } from '@/components/brand/LogoKarei';
import OnboardingWizard from '@/components/onboarding/OnboardingWizard';

interface ItemNav {
  to: string;
  etiqueta: string;
  d: string; // path del ícono SVG
  roles: Rol[];
}

const NAV: ItemNav[] = [
  {
    to: '/dashboard', etiqueta: 'Dashboard', roles: ['ADMIN'],
    d: 'M3 13h7V3H3v10Zm11 8h7V11h-7v10ZM3 21h7v-6H3v6Zm11-18v6h7V3h-7Z',
  },
  {
    to: '/ventas', etiqueta: 'Ventas', roles: ['ADMIN'],
    d: 'M18 17H6v-2h12v2Zm0-4H6v-2h12v2Zm0-4H6V7h12v2ZM3 22l1.5-1.5L6 22l1.5-1.5L9 22l1.5-1.5L12 22l1.5-1.5L15 22l1.5-1.5L18 22l1.5-1.5L21 22V2l-1.5 1.5L18 2l-1.5 1.5L15 2l-1.5 1.5L12 2l-1.5 1.5L9 2 7.5 3.5 6 2 4.5 3.5 3 2v20Z',
  },
  {
    to: '/pos', etiqueta: 'Mesas', roles: ['WAITER'],
    d: 'M3 3h8v8H3V3Zm10 0h8v8h-8V3ZM3 13h8v8H3v-8Zm10 0h8v8h-8v-8Z',
  },
  {
    to: '/cocina', etiqueta: 'Cocina', roles: ['KITCHEN'],
    d: 'M12 2a10 10 0 1 0 .01 20.01A10 10 0 0 0 12 2Zm1 5h-2v6l5 3 1-1.73-4-2.27V7Z',
  },
  {
    to: '/recetas', etiqueta: 'Recetas', roles: ['ADMIN'],
    d: 'M6 2h9l5 5v15H6V2Zm8 1.5V8h4.5L14 3.5ZM8 12h8v-2H8v2Zm0 4h8v-2H8v2Z',
  },
  // {
  //   to: '/correo', etiqueta: 'Correo', roles: ['ADMIN'],
  //   d: 'M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Zm0 4.24-8 5-8-5V6l8 5 8-5v2.24Z',
  // },
];

const COLOR_ROL: Record<string, string> = {
  ADMIN: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  WAITER: 'bg-sky-500/15 text-sky-300 border-sky-500/40',
  KITCHEN: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
};

export default function AppLayout() {
  const usuario = useAuthStore((s) => s.usuario);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  if (!usuario) return <Navigate to="/login" replace />;

  const esAdmin = (usuario.roles ?? []).includes('ADMIN');
  const items = NAV.filter(
    (item) => esAdmin || item.roles.some((r) => (usuario.roles ?? []).includes(r))
  );

  const salir = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex h-screen bg-slate-950">
      {/* Sidebar oscuro */}
      <aside className="hidden w-64 flex-col border-r border-slate-800 bg-slate-900 md:flex">
        <div className="border-b border-slate-800 px-5 py-5">
          <div className="flex items-center gap-2.5">
            <MarkKarei size={34} variante="dark" />
            <div>
              <p className="text-2xl font-black tracking-tight text-white">
                Kārei<span className="text-amber-400">.</span>
              </p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-amber-400/80">
                ERP Gastronómico
              </p>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-amber-500/15 text-amber-300 ring-1 ring-inset ring-amber-500/30'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                }`
              }
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 shrink-0">
                <path d={item.d} />
              </svg>
              {item.etiqueta}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-slate-800 p-3">
          <div className="rounded-xl bg-slate-800/60 p-3">
            <p className="truncate text-sm font-semibold text-slate-100">{usuario.full_name}</p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {(usuario.roles ?? []).map((r) => (
                <span key={r} className={`rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wide ${COLOR_ROL[r]}`}>
                  {r}
                </span>
              ))}
            </div>
          </div>
          <button
            onClick={salir}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-sm font-medium text-slate-400 transition-colors hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-400"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
              <path d="M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5v-2H5V5h5V3Zm4.6 3.6L13.2 8l2.9 3H8v2h8.1l-2.9 3 1.4 1.4L19.9 12l-5.3-5.4Z" />
            </svg>
            Salir
          </button>
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Barra superior + nav horizontal (móvil) */}
        <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-4 py-3 md:hidden">
          <div className="flex items-center gap-2">
            <MarkKarei size={24} variante="dark" />
            <p className="text-xl font-black text-white">Kārei<span className="text-amber-400">.</span></p>
          </div>
          <button onClick={salir} className="text-sm font-medium text-slate-400 hover:text-red-400">
            Salir
          </button>
        </header>
        <nav className="flex gap-2 overflow-x-auto border-b border-slate-800 bg-slate-900 px-3 py-2 md:hidden">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold ${
                  isActive ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300'
                }`
              }
            >
              {item.etiqueta}
            </NavLink>
          ))}
        </nav>

        <main className="flex-1 overflow-y-auto bg-slate-950 p-4 md:p-6">
          <Outlet />
        </main>
      </div>

      {/* Onboarding SaaS: solo ADMIN, solo mientras no esté configurado */}
      <OnboardingWizard />
    </div>
  );
}