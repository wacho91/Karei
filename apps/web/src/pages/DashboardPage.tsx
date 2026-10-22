import { KpiCard } from '@/components/dashboard/KpiCard';
import { GraficaVentas } from '@/components/dashboard/GraficaVentas';
import { TopPlatos } from '@/components/dashboard/TopPlatos';
import { useDashboard } from '@/hooks/useDashboard';
import { useMesas } from '@/hooks/usePos';
import { formatoCOP } from '@/lib/formato';
import PanelPagosMetodo from './PanelPagosMetodo';

export default function DashboardPage() {
  const { data, isLoading, isError, refetch } = useDashboard();
  const { data: mesas } = useMesas();

  if (isError) {
    return (
      <div className="text-center py-20">
        <span className="text-6xl">📡</span>
        <p className="text-rose-400 mt-4 font-bold">No se pudo conectar con el backend.</p>
        <button onClick={() => refetch()} className="mt-4 bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold px-4 py-2 rounded-lg text-sm">
          🔄 Reintentar
        </button>
      </div>
    );
  }

  if (isLoading || !data) {
    return <p className="text-slate-500 text-center py-20">Cargando dashboard...</p>;
  }

  const { kpis } = data;
  const foodCostColor = kpis.food_cost_pct <= 32 ? 'emerald' : kpis.food_cost_pct <= 40 ? 'amber' : 'rose';
  const foodCostDetalle = kpis.food_cost_pct <= 32
    ? '✅ En el rango ideal (28-32%)'
    : kpis.food_cost_pct <= 40 ? '⚠️ Un poco alto' : '🚨 Revisar costos y precios';

  return (
    <div>
      <h1 className="text-3xl font-bold text-white mb-2">Dashboard 📊</h1>
      <p className="text-slate-400 mb-8">Resumen financiero y operativo en tiempo real.</p>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
        <KpiCard titulo="Ingresos de Hoy" valor={formatoCOP(kpis.ingresos_hoy)} detalle={`${kpis.pedidos_hoy} pedido(s) cobrado(s)`} />
        <KpiCard titulo="Ticket Promedio" valor={formatoCOP(kpis.ticket_promedio)} detalle="Por pedido cobrado hoy" color="sky" />
        <KpiCard titulo="Food Cost Real" valor={`${kpis.food_cost_pct}%`} detalle={foodCostDetalle} color={foodCostColor} />
        <KpiCard titulo="Utilidad Bruta Hoy" valor={formatoCOP(kpis.utilidad_bruta)} detalle={`Costo de ventas: ${formatoCOP(kpis.costo_ventas_hoy)}`} color="emerald" />
      </div>

      {/* 💰 REPORTES DE PAGO POR MÉTODO (E-14u): cuánto entró en efectivo,
          cuánto por tarjeta/transferencia y cuánto por Nequi — hoy, últimos
          7 días e histórico + los últimos cobros. El bloque se trae TODO
          solo (polling cada 15 s), no necesita props ni datos de arriba. */}
      <PanelPagosMetodo className="mb-8" />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-8">
        {/* Ventas 7 días */}
        <div className="xl:col-span-2 bg-slate-800/50 border border-slate-700 p-6 rounded-xl shadow-sm">
          <h2 className="text-lg font-semibold text-white mb-4">📈 Ingresos últimos 7 días</h2>
          <GraficaVentas datos={data.ventas_7_dias} />
        </div>

        {/* Top platos */}
        <div className="bg-slate-800/50 border border-slate-700 p-6 rounded-xl shadow-sm">
          <h2 className="text-lg font-semibold text-white mb-4">🏆 Platos más vendidos</h2>
          <TopPlatos platos={data.top_platos} />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Mesas */}
        <div className="bg-slate-800/50 border border-slate-700 p-6 rounded-xl shadow-sm">
          <h2 className="text-lg font-semibold text-white mb-4">🍽️ Estado del Salón</h2>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="bg-slate-900/50 p-4 rounded-xl border border-emerald-500/30 text-center">
              <p className="text-3xl font-extrabold text-emerald-400">{data.mesas.libres}</p>
              <p className="text-xs text-slate-400 uppercase tracking-wider">Libres</p>
            </div>
            <div className="bg-slate-900/50 p-4 rounded-xl border border-amber-500/30 text-center">
              <p className="text-3xl font-extrabold text-amber-400">{data.mesas.ocupadas}</p>
              <p className="text-xs text-slate-400 uppercase tracking-wider">Ocupadas</p>
            </div>
          </div>
          {mesas && mesas.length > 0 && (
            <p className="text-xs text-slate-500">
              {mesas.map((m) => m.name).join(' · ')}
            </p>
          )}
        </div>

        {/* Alertas de stock */}
        <div className="bg-slate-800/50 border border-slate-700 p-6 rounded-xl shadow-sm">
          <h2 className="text-lg font-semibold text-white mb-4">⚠️ Alertas de Compra</h2>
          {data.alertas_stock.length === 0 ? (
            <p className="text-slate-500 text-sm py-4 text-center">Todo el inventario por encima del mínimo. 😌</p>
          ) : (
            <ul className="space-y-2">
              {data.alertas_stock.map((a) => (
                <li key={a.nombre} className="flex justify-between text-sm p-3 bg-slate-900/50 rounded-lg">
                  <span className="text-slate-300 capitalize">{a.nombre}</span>
                  <span className="text-rose-400 font-bold">
                    {a.stock}{a.unidad} <span className="text-slate-500 font-normal">(mín: {a.minimo}{a.unidad})</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}