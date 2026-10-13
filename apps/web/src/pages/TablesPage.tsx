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
  
  const status = i % 4 === 0 ? 'OCCUPIED' : (i % 7 === 0 ? 'BILLING' : 'AVAILABLE');
  const total = status === 'AVAILABLE' ? 0 : Math.floor(Math.random() * 100000) + 15000;
  const items = status === 'AVAILABLE' ? [] : [{ name: 'Plato del Día', quantity: Math.floor(Math.random() * 3) + 1, price: 25000 }];

  return { id, name, status, total, items };
});

export default function TablesPage() {
  const [tables] = useState(initialTables);
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [tipPercent, setTipPercent] = useState(0);

  // Estilos para el borde y fondo de la tarjeta según el estado
  const getStatusStyle = (status: TableStatus) => {
    switch (status) {
      case "AVAILABLE": return "border-slate-600/50 bg-slate-800/40 hover:border-emerald-500/50";
      case "OCCUPIED": return "border-amber-500/30 bg-amber-500/5 hover:border-amber-500/60";
      case "BILLING": return "border-rose-500/30 bg-rose-500/5 hover:border-rose-500/60";
      default: return "border-slate-600/50 bg-slate-800/40";
    }
  };

  // Color del indicador (punto de luz)
  const getDotColor = (status: TableStatus) => {
    switch (status) {
      case "AVAILABLE": return "bg-emerald-400 shadow-emerald-400/50";
      case "OCCUPIED": return "bg-amber-400 shadow-amber-400/50";
      case "BILLING": return "bg-rose-400 shadow-rose-400/50";
      default: return "bg-slate-400";
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
        
        {/* === COLUMNA IZQUIERDA: MAPA DE MESAS === */}
        <div className="w-2/3 bg-slate-800/20 p-6 rounded-2xl border border-slate-700/50">
          <h3 className="text-slate-400 text-sm font-bold uppercase tracking-wider mb-6">Zona Interior (20 mesas)</h3>
          <div className="grid grid-cols-4 sm:grid-cols-5 gap-5 mb-10">
            {tables.slice(0, 20).map((table) => (
              <div 
                key={table.id} 
                onClick={() => setSelectedTable(table)}
                className={`relative h-28 rounded-xl border-2 flex flex-col items-center justify-center gap-1 cursor-pointer transition-all duration-300 shadow-sm hover:shadow-lg hover:-translate-y-1 ${selectedTable?.id === table.id ? 'border-amber-400 bg-slate-800 shadow-amber-500/20 scale-105' : getStatusStyle(table.status)}`}
              >
                {/* Indicador de estado (Punto de luz) */}
                <span className={`absolute top-3 right-3 w-3 h-3 rounded-full shadow-md ${getDotColor(table.status)}`}></span>
                
                <span className="text-base font-bold text-white">{table.name}</span>
                {table.total > 0 ? (
                  <span className="text-sm font-medium text-amber-500">$ {(table.total / 1000).toFixed(0)}k</span>
                ) : (
                  <span className="text-xs text-slate-500">Libre</span>
                )}
              </div>
            ))}
          </div>

          <h3 className="text-slate-400 text-sm font-bold uppercase tracking-wider mb-6">Zona Terraza (5 mesas)</h3>
          <div className="grid grid-cols-4 sm:grid-cols-5 gap-5">
            {tables.slice(20, 25).map((table) => (
              <div 
                key={table.id} 
                onClick={() => setSelectedTable(table)}
                className={`relative h-28 rounded-xl border-2 flex flex-col items-center justify-center gap-1 cursor-pointer transition-all duration-300 shadow-sm hover:shadow-lg hover:-translate-y-1 ${selectedTable?.id === table.id ? 'border-amber-400 bg-slate-800 shadow-amber-500/20 scale-105' : getStatusStyle(table.status)}`}
              >
                <span className={`absolute top-3 right-3 w-3 h-3 rounded-full shadow-md ${getDotColor(table.status)}`}></span>
                <span className="text-base font-bold text-white">{table.name}</span>
                {table.total > 0 ? (
                  <span className="text-sm font-medium text-amber-500">$ {(table.total / 1000).toFixed(0)}k</span>
                ) : (
                  <span className="text-xs text-slate-500">Libre</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* === COLUMNA DERECHA: CUENTA DE MESA === */}
        <div className="w-1/3 bg-slate-800/50 border border-slate-700 p-6 rounded-2xl shadow-sm flex flex-col h-[650px] sticky top-8">
          {!selectedTable ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500">
              <span className="text-6xl mb-6">🛎️</span>
              <p className="text-lg font-medium">Selecciona una mesa</p>
              <p className="text-sm text-slate-600">para ver la cuenta en vivo.</p>
            </div>
          ) : (
            <>
              <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-700">
                <div>
                  <h2 className="text-2xl font-bold text-white">{selectedTable.name}</h2>
                  <p className={`text-xs font-bold uppercase tracking-wider mt-1 ${getStatusText(selectedTable.status) === 'Libre' ? 'text-emerald-400' : getStatusText(selectedTable.status) === 'Cobrando' ? 'text-rose-400' : 'text-amber-400'}`}>
                    {getStatusText(selectedTable.status)}
                  </p>
                </div>
                <div className={`w-5 h-5 rounded-full shadow-md ${getDotColor(selectedTable.status)}`}></div>
              </div>

              <div className="flex-1 overflow-y-auto mb-4 py-2">
                {selectedTable.items.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center text-slate-500">
                    <span className="text-4xl mb-4">🍽️</span>
                    <p className="font-medium">Mesa libre.</p>
                    <p className="text-sm text-slate-600">Lista para recibir clientes.</p>
                  </div>
                ) : (
                  <ul className="space-y-4">
                    {selectedTable.items.map((item, index) => (
                      <li key={index} className="flex justify-between items-center text-slate-300">
                        <div className="flex items-center gap-3">
                          <span className="bg-slate-700 text-amber-400 w-8 h-8 flex items-center justify-center rounded-lg font-bold text-sm">{item.quantity}x</span>
                          <span>{item.name}</span>
                        </div>
                        <span className="font-medium">$ {(item.quantity * item.price).toLocaleString()}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Propinas y Total */}
              <div className="space-y-4 bg-slate-900/50 p-4 rounded-xl border border-slate-700">
                <div className="flex justify-between text-sm text-slate-400">
                  <span>Subtotal</span>
                  <span>$ {selectedTable.total.toLocaleString()}</span>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-400">Propina</span>
                  <div className="flex gap-2">
                    <button onClick={() => setTipPercent(0)} className={`px-3 py-1 text-xs rounded-lg transition-colors ${tipPercent === 0 ? 'bg-amber-500 text-slate-900' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>0%</button>
                    <button onClick={() => setTipPercent(10)} className={`px-3 py-1 text-xs rounded-lg transition-colors ${tipPercent === 10 ? 'bg-amber-500 text-slate-900' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>10%</button>
                    <button onClick={() => setTipPercent(15)} className={`px-3 py-1 text-xs rounded-lg transition-colors ${tipPercent === 15 ? 'bg-amber-500 text-slate-900' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>15%</button>
                  </div>
                </div>

                <div className="flex justify-between items-center border-t border-slate-700 pt-4 mt-2">
                  <span className="text-lg font-bold text-white">Total</span>
                  <span className="text-3xl font-extrabold text-amber-500">$ {finalTotal.toLocaleString()}</span>
                </div>

                <button className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 rounded-lg mt-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20" disabled={selectedTable.items.length === 0}>
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