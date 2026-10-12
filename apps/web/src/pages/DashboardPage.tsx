export default function DashboardPage() {
  return (
    <div>
      <h1 className="text-3xl font-bold text-white mb-2">Dashboard 📊</h1>
      <p className="text-slate-400 mb-8">Resumen financiero y operativo del restaurante.</p>
      
      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-slate-800/50 border border-slate-700 p-6 rounded-xl shadow-sm">
          <p className="text-sm text-amber-500 font-medium uppercase mb-1">Ingresos del Día</p>
          <p className="text-4xl font-bold text-white">$ 1,250,000</p>
          <p className="text-xs text-slate-500 mt-2">+15% vs ayer</p>
        </div>
        
        <div className="bg-slate-800/50 border border-slate-700 p-6 rounded-xl shadow-sm">
          <p className="text-sm text-emerald-500 font-medium uppercase mb-1">Food Cost Promedio</p>
          <p className="text-4xl font-bold text-white">28.5%</p>
          <p className="text-xs text-slate-500 mt-2">Objetivo: &lt; 30%</p>
        </div>
        
        <div className="bg-slate-800/50 border border-slate-700 p-6 rounded-xl shadow-sm">
          <p className="text-sm text-rose-500 font-medium uppercase mb-1">Utilidad Neta</p>
          <p className="text-4xl font-bold text-white">$ 890,000</p>
          <p className="text-xs text-slate-500 mt-2">Margen: 71%</p>
        </div>
      </div>

      {/* Tabla de Mesas Activas (Simulada por ahora) */}
      <div className="bg-slate-800/50 border border-slate-700 p-6 rounded-xl shadow-sm">
        <h2 className="text-lg font-semibold text-white mb-4">🍽️ Estado de Mesas</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900/50 border-b border-slate-700">
              <tr>
                <th className="px-4 py-3 font-semibold text-slate-400">Mesa</th>
                <th className="px-4 py-3 font-semibold text-slate-400">Estado</th>
                <th className="px-4 py-3 font-semibold text-slate-400">Consumo Actual</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              <tr className="hover:bg-slate-900/50">
                <td className="px-4 py-3 font-medium text-white">Mesa 1</td>
                <td className="px-4 py-3"><span className="bg-amber-500/20 text-amber-400 px-2 py-1 rounded-full text-xs">Ocupada</span></td>
                <td className="px-4 py-3 text-slate-300">$ 45,000</td>
              </tr>
              <tr className="hover:bg-slate-900/50">
                <td className="px-4 py-3 font-medium text-white">Mesa 2</td>
                <td className="px-4 py-3"><span className="bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded-full text-xs">Libre</span></td>
                <td className="px-4 py-3 text-slate-300">$ 0</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}