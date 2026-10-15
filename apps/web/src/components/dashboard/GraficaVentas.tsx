import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import type { DashboardResumen } from '@/types/dashboard';
import { formatoCOP } from '@/lib/formato';

export const GraficaVentas = ({ datos }: { datos: DashboardResumen['ventas_7_dias'] }) => {
  if (datos.length === 0) {
    return (
      <p className="text-slate-500 text-sm text-center py-12">
        Aún no hay ventas. Cobra tu primera mesa y esta gráfica cobra vida. 📈
      </p>
    );
  }
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <AreaChart data={datos} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="colorIngresos" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.5} />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="fecha" stroke="#64748b" tick={{ fontSize: 11 }} tickFormatter={(v) => String(v).slice(5)} />
          <YAxis stroke="#64748b" tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
          <Tooltip
            contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
            labelStyle={{ color: '#e2e8f0' }}
            formatter={(value: number) => [formatoCOP(value), 'Ingresos']}
          />
          <Area type="monotone" dataKey="ingresos" stroke="#f59e0b" strokeWidth={2} fill="url(#colorIngresos)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};