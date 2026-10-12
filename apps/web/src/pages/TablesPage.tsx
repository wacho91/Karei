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

// Datos de prueba (simulando lo que vendrá del backend)
const initialTables: Table[] = [
  { id: 1, name: "Mesa 1", status: "OCCUPIED", total: 45000, items: [{ name: "Hamburguesa Doble", quantity: 1, price: 25000 }, { name: "Limonada", quantity: 2, price: 10000 }] },
  { id: 2, name: "Mesa 2", status: "AVAILABLE", total: 0, items: [] },
  { id: 3, name: "Mesa 3", status: "BILLING", total: 120000, items: [{ name: "Pasta Carbonara", quantity: 2, price: 45000 }, { name: "Vino Tinto", quantity: 1, price: 30000 }] },
  { id: 4, name: "Mesa 4", status: "OCCUPIED", total: 89000, items: [{ name: "Pizza Margarita", quantity: 1, price: 35000 }, { name: "Cerveza Artesanal", quantity: 3, price: 18000 }] },
  { id: 5, name: "Mesa 5", status: "AVAILABLE", total: 0, items: [] },
  { id: 6, name: "Terraza 1", status: "OCCUPIED", total: 32000, items: [{ name: "Ensalada César", quantity: 1, price: 18000 }, { name: "Agua", quantity: 1, price: 4000 }] },
];

export default function TablesPage() {
  const [tables] = useState(initialTables);
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [tipPercent, setTipPercent] = useState(0); // 0%, 10%, 15%

  const getStatusStyle = (status: TableStatus) => {
    switch (status) {
      case "AVAILABLE": return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
      case "OCCUPIED": return "bg-amber-500/20 text-amber-400 border-amber-500/30";
      case "BILLING": return "bg-rose-500/20 text-rose-400 border-rose-500/30";
      default: return "bg-slate-500/20 text-slate-400 border-slate-500/30";
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
      <p className="text-slate-400 mb-8">Selecciona una mesa para ver la cuenta o tomar un pedido.</p>
      
      <div className="flex gap-6">
        
        {/* === COLUMNA IZQUIERDA: MAPA DE MESAS === */}
        <div className="w-2/3 grid grid-cols-2 md:grid-cols-3 gap-4">
          {tables.map((table) => (
            <div 
              key={table.id} 
              onClick={() => setSelectedTable(table)}
              className={`bg-slate-800/50 p-6 rounded-2xl shadow-sm cursor-pointer transition-all border-2 ${selectedTable?.id === table.id ? 'border-amber-500' : 'border-slate-700 hover:border-slate-500'}`}
            >
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-white">{table.name}</h2>
                <span className={`text-xs font-bold px-3 py-1 rounded-full border ${getStatusStyle(table.status)}`}>
                  {getStatusText(table.status)}
                </span>
              </div>
              <div className="border-t border-slate-700 pt-3">
                <p className="text-xs text-slate-400">Consumo</p>
                <p className="text-xl font-bold text-amber-500">$ {table.total.toLocaleString()}</p>
              </div>
            </div>
          ))}
        </div>

        {/* === COLUMNA DERECHA: CUENTA DE MESA === */}
        <div className="w-1/3 bg-slate-800/50 border border-slate-700 p-6 rounded-2xl shadow-sm flex flex-col">
          {!selectedTable ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500">
              <span className="text-5xl mb-4">🛎️</span>
              <p>Selecciona una mesa para ver la cuenta en vivo.</p>
            </div>
          ) : (
            <>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-white">{selectedTable.name}</h2>
                <span className={`text-xs font-bold px-3 py-1 rounded-full border ${getStatusStyle(selectedTable.status)}`}>
                  {getStatusText(selectedTable.status)}
                </span>
              </div>

              <div className="flex-1 overflow-y-auto mb-4 border-y border-slate-700 py-4">
                {selectedTable.items.length === 0 ? (
                  <p className="text-slate-500 text-center text-sm">Mesa libre. Sin consumos.</p>
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

                <button className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 rounded-lg mt-4 transition-colors disabled:opacity-50" disabled={selectedTable.items.length === 0}>
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