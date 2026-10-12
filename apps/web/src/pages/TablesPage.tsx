import { useState } from 'react';

// Datos de prueba (luego los conectaremos al backend)
const initialTables = [
  { id: 1, name: "Mesa 1", status: "OCCUPIED", total: 45000 },
  { id: 2, name: "Mesa 2", status: "AVAILABLE", total: 0 },
  { id: 3, name: "Mesa 3", status: "BILLING", total: 120000 },
  { id: 4, name: "Mesa 4", status: "OCCUPIED", total: 89000 },
  { id: 5, name: "Mesa 5", status: "AVAILABLE", total: 0 },
  { id: 6, name: "Terraza 1", status: "OCCUPIED", total: 32000 },
];

export default function TablesPage() {
  const [tables] = useState(initialTables);

  // Función para asignar colores según el estado
  const getStatusStyle = (status: string) => {
    switch (status) {
      case "AVAILABLE": return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
      case "OCCUPIED": return "bg-amber-500/20 text-amber-400 border-amber-500/30";
      case "BILLING": return "bg-rose-500/20 text-rose-400 border-rose-500/30";
      default: return "bg-slate-500/20 text-slate-400 border-slate-500/30";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "AVAILABLE": return "Libre";
      case "OCCUPIED": return "Ocupada";
      case "BILLING": return "Cobrando";
      default: return status;
    }
  };

  return (
    <div>
      <h1 className="text-3xl font-bold text-white mb-2">POS / Comedor 🍽️</h1>
      <p className="text-slate-400 mb-8">Selecciona una mesa para ver la cuenta o tomar un pedido.</p>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {tables.map((table) => (
          <div 
            key={table.id} 
            className="bg-slate-800/50 border border-slate-700 p-6 rounded-2xl shadow-sm hover:border-amber-500/50 transition-all cursor-pointer group"
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-white group-hover:text-amber-500 transition-colors">{table.name}</h2>
              <span className={`text-xs font-bold px-3 py-1 rounded-full border ${getStatusStyle(table.status)}`}>
                {getStatusText(table.status)}
              </span>
            </div>
            <div className="mt-4 border-t border-slate-700 pt-4">
              <p className="text-sm text-slate-400">Consumo Actual</p>
              <p className="text-2xl font-bold text-white">$ {table.total.toLocaleString()}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}