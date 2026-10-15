export type DashboardResumen = {
  kpis: {
    ingresos_hoy: number;
    pedidos_hoy: number;
    ticket_promedio: number;
    costo_ventas_hoy: number;
    food_cost_pct: number;
    utilidad_bruta: number;
  };
  ventas_7_dias: { fecha: string; ingresos: number; pedidos: number }[];
  top_platos: { nombre: string; cantidad: number; ingresos: number }[];
  alertas_stock: { nombre: string; stock: number; minimo: number; unidad: string }[];
  mesas: { libres: number; ocupadas: number };
};