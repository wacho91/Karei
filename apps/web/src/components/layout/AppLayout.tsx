   import { Outlet, NavLink } from 'react-router-dom';

export default function AppLayout() {
  return (
    <div className="min-h-screen bg-slate-900 text-white flex">
      
      {/* === SIDEBAR (Menú Lateral) === */}
      <aside className="w-64 bg-slate-950 border-r border-slate-800 p-4 flex flex-col">
        <div className="mb-8 px-4 py-4">
          <h1 className="text-3xl font-extrabold text-amber-500">Kārei 🍜</h1>
          <p className="text-slate-500 text-xs tracking-widest uppercase mt-1">GastroTech SaaS</p>
        </div>
        
        <nav className="flex-1 space-y-2">
          <NavLink to="/" end className={({ isActive }) => `flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${isActive ? 'bg-amber-500 text-slate-900' : 'text-slate-400 hover:bg-slate-800 hover:text-white`}'>
            📊 Dashboard
          </NavLink>
          <NavLink to="/pos" className={({ isActive }) => `flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${isActive ? 'bg-amber-500 text-slate-900' : 'text-slate-400 hover:bg-slate-800 hover:text-white`}'>
            🍽️ POS / Mesas
          </NavLink>
          <NavLink to="/recetas" className={({ isActive }) => `flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${isActive ? 'bg-amber-500 text-slate-900' : 'text-slate-400 hover:bg-slate-800 hover:text-white`}'>
            📖 Recetas
          </NavLink>
        </nav>
        
        <div className="mt-auto pt-4 border-t border-slate-800">
          <button className="w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium text-slate-400 hover:bg-rose-500/10 hover:text-rose-400 transition-colors">
            🚪 Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* === CONTENIDO PRINCIPAL === */}
      <main className="flex-1 p-8 overflow-y-auto">
        <Outlet /> {/* Aquí se renderizarán las páginas como el Dashboard */}
      </main>
    </div>
  );
}