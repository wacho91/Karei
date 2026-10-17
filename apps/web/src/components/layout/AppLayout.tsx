import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore, type Rol } from '../../store/authStore';

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
    to: '/pos', etiqueta: 'Mesas', roles: ['WAITER'],
    d: 'M3 3h8v8H3V3Zm10 0h8v8h-8V3ZM3 13h8v8H3v-8Zm10 0h8v8h-8v-8Z',
  },
  {
    to: '/kds', etiqueta: 'Cocina', roles: ['KITCHEN'],
    d: 'M12 2a10 10 0 1 0 .01 20.01A10 10 0 0 0 12 2Zm1 5h-2v6l5 3 1-1.73-4-2.27V7Z',
  },
  {
    to: '/inventario', etiqueta: 'Inventario', roles: ['ADMIN'],
    d: 'M3 3h18v4H3V3Zm1 6h16v12H4V9Zm5 3v2h6v-2H9Z',
  },
  {
    to: '/recetas', etiqueta: 'Recetas', roles: ['ADMIN'],
    d: 'M6 2h9l5 5v15H6V2Zm8 1.5V8h4.5L14 3.5ZM8 12h8v-2H8v2Zm0 4h8v-2H8v2Z',
  },
  {
    to: '/compras', etiqueta: 'Compras', roles: ['ADMIN'],
    d: 'M6 7V6a6 6 0 1 1 12 0v1h3l-1.2 14H4.2L3 7h3Zm2 0h8V6a4 4 0 0 0-8 0v1Z',
  },
];

const COLOR_ROL: Record<string, string> = {
  ADMIN: 'bg-amber-100 text-amber-800 border-amber-300',
  WAITER: 'bg-sky-100 text-sky-800 border-sky-300',
  KITCHEN: 'bg-emerald-100 text-emerald-800 border-emerald-300',
};

export default function AppLayout() {
  const usuario = useAuthStore((s) => s.usuario);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  if (!usuario) return null; // RutaProtegida ya garantió la sesión

  const esAdmin = (usuario.roles ?? []).includes('ADMIN');
  const items = NAV.filter(
    (item) => esAdmin || item.roles.some((r) => (usuario.roles ?? []).includes(r))
  );

  const salir = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Sidebar (escritorio/tableta) */}
      <aside className="hidden w-60 flex-col border-r border-slate-200 bg-white md:flex">
        <div className="border-b border-slate-100 px-5 py-5">
          <p className="text-2xl font-black tracking-tight text-slate-900">Kārei</p>
          <p className="text-xs text-slate-500">ERP Gastronómico</p>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive ? 'bg-amber-50 text-amber-700' : 'text-slate-600 hover:bg-slate-100'
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

        <div className="border-t border-slate-100 p-3">
          <p className="truncate px-2 text-sm font-semibold text-slate-800">{usuario.full_name}</p>
          <div className="flex flex-wrap gap-1 px-2 pt-1.5">
            {(usuario.roles ?? []).map((r) => (
              <span key={r} className={`rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wide ${COLOR_ROL[r]}`}>
                {r}
              </span>
            ))}
          </div>
          <button
            onClick={salir}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-red-600"
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
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden">
          <p className="text-xl font-black text-slate-900">Kārei</p>
          <button onClick={salir} className="text-sm font-medium text-slate-600 hover:text-red-600">
            Salir
          </button>
        </header>
        <nav className="flex gap-2 overflow-x-auto border-b border-slate-200 bg-white px-3 py-2 md:hidden">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold ${
                  isActive ? 'bg-amber-500 text-slate-950' : 'bg-slate-100 text-slate-600'
                }`
              }
            >
              {item.etiqueta}
            </NavLink>
          ))}
        </nav>

        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}