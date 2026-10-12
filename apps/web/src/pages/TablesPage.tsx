import { useState } from 'react';

// Tipos
type OrderItem = { name: string; quantity: number; price: number };
type TableStatus = 'AVAILABLE' | 'OCCUPIED' | 'BILLING';
type Table = {
  id: number;
  name: string;
  status: TableStatus;
  total: number;
  items: OrderItem[];
};

// Generamos 25 mesas: 20 internas + 5 terraza
const initialTables: Table[] = Array.from({ length: 25 }, (_, i) => {
  const id = i + 1;
  const isTerrace = i >= 20;
  const name = isTerrace ? `Terraza ${i - 19}` : `Mesa ${id}`;
  
  // Simulamos estados variados
  const statuses: TableStatus[] = ['AVAILABLE', 'OCCUPIED', 'BILLING'];
  const status = i % 4 === 0 ? 'OCCUPIED' : (i % 7 === 0 ? 'BILLING' : 'AVAILABLE');
  const total = status === 'AVAILABLE' ? 0 : Math.floor(Math.random() * 100000) + 15000;
  const items = status === 'AVAILABLE' ? [] : [{ name: 'Plato del Día', quantity: Math.floor(Math.random() * 3) + 1, price: 25000 }];

  return { id, name, status, total, items };
});

export default function TablesPage() {
  const [tables] = useState(initialTables);
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [tipPercent, setTipPercent] = useState(0);

  const getStatusStyle = (status: TableStatus) => {
    switch (status) {
      case "AVAILABLE": return "border-emerald-500/50 bg-emerald-500/10 text-emerald-400";
      case "OCCUPIED": return "border-amber-500/50 bg-amber-500/10 text-amber-400";
      case "BILLING": return "border-rose-500/50 bg-rose-500/10 text-rose-400";
      default: return "border-slate-500/50 bg-slate-500/10 text-slate-400";
    }
  };

  const getStatusText = (status: TableStatus) => {
    switch (status) {
      case "AVAILABLE": return "Libre";
      case "OCCUPIED": return "Ocupada";
      case "BILLING": return "Cobrando";
      default: return status;
    }
  };

  const tipAmount = selectedTable ? (selectedTable.total * tipPercent) / 100 : 0;
  const finalTotal = selectedTable ? selectedTable.total + tipAmount : 0;

  return (
    <div>
      <h1 className="text-3xl font-bold text-white mb-2">POS / Comedor 🍽️</h1>
      <p className="text-slate-400 mb-8">Mapa del restaurante. Haz clic en una mesa para ver la cuenta.</p>
      
      <div className="flex gap-8">
        
        {/* === COLUMNA IZQUIERDA: MAPA DE MESAS REDONDAS === */}
        <div className="w-2/3 bg-slate-800/30 p-6 rounded-2xl border border-slate-700">
          <h3 className="text-slate-400 text-sm font-bold uppercase mb-4">Zona Interior (20 mesas)</h3>
          <div className="grid grid-cols-4 sm:grid-cols-5 gap-6 mb-8">
            {tables.slice(0, 20).map((table) => (
              <div 
                key={table.id} 
                onClick={() => setSelectedTable(table)}
                className={`w-20 h-20 rounded-full flex flex-col items-center justify-center cursor-pointer border-4 transition-all ${selectedTable?.id === table.id ? 'border-amber-400 scale-110' : getStatusStyle(table.status)} hover:scale-105`}
              >
                <span className="text-xs font-bold text-white">{table.name}</span>
                {table.total > 0 && <span className="text-[10px] text-slate-300">${(table.total / 1000)}k</span>}
              </div>
            ))}
          </div>

          <h3 className="text-slate-400 text-sm font-bold uppercase mb-4">Zona Terraza (5 mesas)</h3>
          <div className="grid grid-cols-4 sm:grid-cols-5 gap-6">
            {tables.slice(20, 25).map((table) => (
              <div 
                key={table.id} 
                onClick={() => setSelectedTable(table)}
                className={`w-20 h-20 rounded-full flex flex-col items-center justify-center cursor-pointer border-4 transition-all ${selectedTable?.id === table.id ? 'border-amber-400 scale-110' : getStatusStyle(table.status)} hover:scale-105`}
              >
                <span className="text-xs font-bold text-white">{table.name}</span>
                {table.total > 0 && <span className="text-[10px] text-slate-300">${(table.total / 1000)}k</span>}
              </div>
            ))}
          </div>
        </div>

        {/* === COLUMNA DERECHA: CUENTA DE MESA === */}
        <div className="w-1/3 bg-slate-800/50 border border-slate-700 p-6 rounded-2xl shadow-sm flex flex-col h-[600px] sticky top-8">
          {!selectedTable ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500">
              <span className="text-5xl mb-4">🛎️</span>
              <p>Selecciona una mesa para ver la cuenta en vivo.</p>
            </div>
          ) : (
            <>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-white">{selectedTable.name}</h2>
                <span className={`text-xs font-bold px-3 py-1 rounded-full border-2 ${getStatusStyle(selectedTable.status)}`}>
                  {getStatusText(selectedTable.status)}
                </span>
              </div>

              <div className="flex-1 overflow-y-auto mb-4 border-y border-slate-700 py-4">
                {selectedTable.items.length === 0 ? (
                  <p className="text-slate-500 text-center text-sm py-8">Mesa libre. Sin consumos.<br/>¡Ideal para recibir clientes!</p>
                ) : (
                  <ul className="space-y-3">
                    {selectedTable.items.map((item, index) => (
                      <li key={index} className="flex justify-between text-slate-300">
                        <span>{item.quantity}x {item.name}</span>
                        <span className="font-medium">$ {(item.quantity * item.price).toLocaleString()}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Propinas y Total */}
              <div className="space-y-3">
                <div className="flex justify-between text-sm text-slate-400">
                  <span>Subtotal</span>
                  <span>$ {selectedTable.total.toLocaleString()}</span>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-400">Propina ({tipPercent}%)</span>
                  <div className="flex gap-2">
                    <button onClick={() => setTipPercent(0)} className={`px-2 py-1 text-xs rounded ${tipPercent === 0 ? 'bg-amber-500 text-slate-900' : 'bg-slate-700 text-slate-300'}`}>0%</button>
                    <button onClick={() => setTipPercent(10)} className={`px-2 py-1 text-xs rounded ${tipPercent === 10 ? 'bg-amber-500 text-slate-900' : 'bg-slate-700 text-slate-300'}`}>10%</button>
                    <button onClick={() => setTipPercent(15)} className={`px-2 py-1 text-xs rounded ${tipPercent === 15 ? 'bg-amber-500 text-slate-900' : 'bg-slate-700 text-slate-300'}`}>15%</button>
                  </div>
                </div>

                <div className="flex justify-between items-center border-t border-slate-700 pt-3 mt-2">
                  <span className="text-lg font-bold text-white">Total a Pagar</span>
                  <span className="text-2xl font-extrabold text-amber-500">$ {finalTotal.toLocaleString()}</span>
                </div>

                <button className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 rounded-lg mt-4 transition-colors disabled:opacity-50 disabled:cursor-not-allowed" disabled={selectedTable.items.length === 0}>
                  💵 Cobrar y Liberar Mesa
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}