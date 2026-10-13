import { useState } from 'react';

type OrderItem = { name: string; quantity: number; price: number };
type TableStatus = 'AVAILABLE' | 'OCCUPIED' | 'BILLING';
type Table = {
  id: number;
  name: string;
  status: TableStatus;
  total: number;
  items: OrderItem[];
};

// Menú simulado (luego lo traeremos del backend)
const mockMenu = [
  { name: "Hamburguesa", price: 25000 },
  { name: "Pizza Margarita", price: 35000 },
  { name: "Ensalada César", price: 18000 },
  { name: "Limonada", price: 8000 },
  { name: "Cerveza", price: 10000 },
  { name: "Pasta Carbonara", price: 30000 },
];

// Generamos 25 mesas
const initialTables: Table[] = Array.from({ length: 25 }, (_, i) => {
  const id = i + 1;
  const isTerrace = i >= 20;
  const name = isTerrace ? `Terraza ${i - 19}` : `Mesa ${id}`;
  const status = i % 4 === 0 ? 'OCCUPIED' : (i % 7 === 0 ? 'BILLING' : 'AVAILABLE');
  const total = status === 'AVAILABLE' ? 0 : Math.floor(Math.random() * 100000) + 15000;
  const items = status === 'AVAILABLE' ? [] : [{ name: 'Plato del Día', quantity: Math.floor(Math.random() * 3) + 1, price: 25000 }];
  return { id, name, status, total, items };
});

const TableNode = ({ table, isSelected, onClick }: { table: Table; isSelected: boolean; onClick: () => void }) => {
  const statusColors = {
    AVAILABLE: 'border-emerald-500/40 bg-slate-800/60 text-white shadow-emerald-500/10',
    OCCUPIED: 'border-amber-500/50 bg-slate-800/60 text-white shadow-amber-500/10',
    BILLING: 'border-rose-500/50 bg-slate-800/60 text-white shadow-rose-500/10',
  };
  const dotColors = {
    AVAILABLE: 'bg-emerald-400 shadow-emerald-300',
    OCCUPIED: 'bg-amber-400 shadow-amber-300',
    BILLING: 'bg-rose-400 shadow-rose-300',
  };
  const isTerrace = table.name.includes('Terraza');

  return (
    <div className="relative flex flex-col items-center justify-end h-32">
      {isTerrace && (
        <div className={`absolute top-0 transition-transform ${isSelected ? 'text-amber-400 scale-110' : 'text-slate-500'}`}>
          <svg width="32" height="18" viewBox="0 0 32 18" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M16 0C7 0 1 6 0 14H32C31 6 25 0 16 0Z" fill="currentColor" opacity="0.6"/>
            <rect x="15" y="14" width="2" height="4" fill="currentColor" opacity="0.8"/>
          </svg>
        </div>
      )}
      <div 
        onClick={onClick}
        className={`relative w-24 h-24 mt-6 rounded-full border-4 flex flex-col items-center justify-center cursor-pointer transition-all duration-300 shadow-lg ${isSelected ? 'scale-110 border-amber-400 ring-4 ring-amber-400/30' : statusColors[table.status]} hover:scale-105 hover:shadow-xl`}
        style={{ backgroundImage: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.05) 0%, rgba(0,0,0,0.2) 70%)' }}
      >
        <span className={`absolute top-2 w-3 h-3 rounded-full shadow-md animate-pulse ${dotColors[table.status]}`}></span>
        <span className="text-lg font-extrabold text-white tracking-tight">{table.name.replace('Mesa ', '').replace('Terraza ', 'T')}</span>
        {table.total > 0 ? (
          <span className="text-[11px] font-bold text-amber-400">$ {(table.total / 1000).toFixed(0)}k</span>
        ) : (
          <span className="text-[10px] text-slate-400">Libre</span>
        )}
      </div>
    </div>
  );
};

export default function TablesPage() {
  const [tables, setTables] = useState(initialTables);
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [tipPercent, setTipPercent] = useState(0);

  // Lógica para agregar un item a la mesa seleccionada
  const addItemToTable = (itemName: string, itemPrice: number) => {
    if (!selectedTable) return;

    // Actualizamos el estado de las mesas
    const updatedTables = tables.map(t => {
      if (t.id === selectedTable.id) {
        const existingItem = t.items.find(i => i.name === itemName);
        let newItems;
        if (existingItem) {
          newItems = t.items.map(i => i.name === itemName ? { ...i, quantity: i.quantity + 1 } : i
          );
        } else {
          newItems = [...t.items, { name: itemName, quantity: 1, price: itemPrice }];
        }
        const newTotal = newItems.reduce((sum, item) => sum + (item.quantity * item.price), 0);
        const newStatus = t.status === 'AVAILABLE' ? 'OCCUPIED' : t.status;
        const updatedTable = { ...t, items: newItems, total: newTotal, status: newStatus as TableStatus };
        setSelectedTable(updatedTable); // Actualizamos el panel derecho
        return updatedTable;
      }
      return t;
    });
    setTables(updatedTables);
  };

  // Lógica para cobrar y liberar la mesa
  const checkoutTable = () => {
    if (!selectedTable) return;
    const updatedTables = tables.map(t => 
      t.id === selectedTable.id ? { ...t, status: 'AVAILABLE' as TableStatus, items: [], total: 0 } : t
    );
    setTables(updatedTables);
    setSelectedTable({ ...selectedTable, status: 'AVAILABLE', items: [], total: 0 });
    setTipPercent(0);
    alert('¡Mesa cobrada y liberada con éxito!');
  };

  const tipAmount = selectedTable ? (selectedTable.total * tipPercent) / 100 : 0;
  const finalTotal = selectedTable ? selectedTable.total + tipAmount : 0;

  return (
    <div>
      <h1 className="text-3xl font-bold text-white mb-2">POS / Comedor 🍽️</h1>
      <p className="text-slate-400 mb-8">Mapa del restaurante. Haz clic en una mesa para ver la cuenta o tomar un pedido.</p>
      
      <div className="flex gap-8">
        
        {/* === COLUMNA IZQUIERDA: PLANO DEL COMEDOR === */}
        <div className="w-2/3 bg-slate-800/10 p-8 rounded-2xl border border-slate-700/30 shadow-inner" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.03) 1px, transparent 1px)', backgroundSize: '24px 24px' }}>
          <div className="mb-12">
            <h3 className="text-slate-300 text-sm font-bold uppercase tracking-widest mb-6 flex items-center gap-2">
              <span className="w-2 h-2 bg-amber-500 rounded-full"></span> Zona Interior
            </h3>
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-8 justify-items-center">
              {tables.slice(0, 20).map((table) => (
                <TableNode key={table.id} table={table} isSelected={selectedTable?.id === table.id} onClick={() => { setSelectedTable(table); setTipPercent(0); }} />
              ))}
            </div>
          </div>
          <div className="border-t border-slate-700/50 pt-10">
            <h3 className="text-slate-300 text-sm font-bold uppercase tracking-widest mb-6 flex items-center gap-2">
              <span className="w-2 h-2 bg-emerald-500 rounded-full"></span> Zona Terraza
            </h3>
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-8 justify-items-center">
              {tables.slice(20, 25).map((table) => (
                <TableNode key={table.id} table={table} isSelected={selectedTable?.id === table.id} onClick={() => { setSelectedTable(table); setTipPercent(0); }} />
              ))}
            </div>
          </div>
        </div>

        {/* === COLUMNA DERECHA: CUENTA DE MESA Y MENÚ === */}
        <div className="w-1/3 flex flex-col gap-6">
          
          {/* Panel de Cuenta */}
          <div className="bg-slate-800/50 border border-slate-700 p-6 rounded-2xl shadow-sm flex flex-col backdrop-blur-sm">
            {!selectedTable ? (
              <div className="flex flex-col items-center justify-center h-48 text-slate-500">
                <span className="text-6xl mb-6">🛎️</span>
                <p className="text-lg font-medium text-slate-400">Selecciona una mesa</p>
                <p className="text-sm text-slate-600">para ver la cuenta en vivo.</p>
              </div>
            ) : (
              <>
                <div className="flex justify-between items-center mb-4 pb-4 border-b border-slate-700">
                  <div>
                    <h2 className="text-2xl font-bold text-white">{selectedTable.name}</h2>
                    <p className={`text-xs font-bold uppercase tracking-wider mt-1 ${selectedTable.status === 'AVAILABLE' ? 'text-emerald-400' : selectedTable.status === 'BILLING' ? 'text-rose-400' : 'text-amber-400'}`}>
                      {selectedTable.status === 'AVAILABLE' ? 'Libre' : selectedTable.status === 'BILLING' ? 'Cobrando' : 'Ocupada'}
                    </p>
                  </div>
                </div>

                <div className="max-h-40 overflow-y-auto mb-4 py-2">
                  {selectedTable.items.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-20 text-center text-slate-500">
                      <span className="text-3xl mb-2">🍽️</span>
                      <p className="text-sm text-slate-600">Mesa libre. Agrega items del menú.</p>
                    </div>
                  ) : (
                    <ul className="space-y-3">
                      {selectedTable.items.map((item, index) => (
                        <li key={index} className="flex justify-between items-center text-slate-300 text-sm">
                          <div className="flex items-center gap-2">
                            <span className="bg-slate-700 text-amber-400 w-7 h-7 flex items-center justify-center rounded-md font-bold text-xs">{item.quantity}x</span>
                            <span>{item.name}</span>
                          </div>
                          <span className="font-medium">$ {(item.quantity * item.price).toLocaleString()}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="space-y-3 bg-slate-900/50 p-4 rounded-xl border border-slate-700">
                  <div className="flex justify-between text-sm text-slate-400">
                    <span>Subtotal</span>
                    <span>$ {selectedTable.total.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-400">Propina</span>
                    <div className="flex gap-2">
                      <button onClick={() => setTipPercent(0)} className={`px-3 py-1 text-xs rounded-lg ${tipPercent === 0 ? 'bg-amber-500 text-slate-900' : 'bg-slate-700 text-slate-300'}`}>0%</button>
                      <button onClick={() => setTipPercent(10)} className={`px-3 py-1 text-xs rounded-lg ${tipPercent === 10 ? 'bg-amber-500 text-slate-900' : 'bg-slate-700 text-slate-300'}`}>10%</button>
                      <button onClick={() => setTipPercent(15)} className={`px-3 py-1 text-xs rounded-lg ${tipPercent === 15 ? 'bg-amber-500 text-slate-900' : 'bg-slate-700 text-slate-300'}`}>15%</button>
                    </div>
                  </div>
                  <div className="flex justify-between items-center border-t border-slate-700 pt-3 mt-2">
                    <span className="text-lg font-bold text-white">Total</span>
                    <span className="text-2xl font-extrabold text-amber-500">$ {finalTotal.toLocaleString()}</span>
                  </div>
                  <button onClick={checkoutTable} className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 rounded-lg mt-2 transition-colors disabled:opacity-40 shadow-lg shadow-emerald-500/20" disabled={selectedTable.items.length === 0}>
                    💵 Cobrar y Liberar
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Menú Rápido (Solo visible si hay mesa seleccionada) */}
          {selectedTable && (
            <div className="bg-slate-800/50 border border-slate-700 p-6 rounded-2xl shadow-sm">
              <h3 className="text-slate-300 text-sm font-bold uppercase tracking-widest mb-4">Menú Rápido</h3>
              <div className="grid grid-cols-2 gap-3">
                {mockMenu.map((item) => (
                  <button 
                    key={item.name} 
                    onClick={() => addItemToTable(item.name, item.price)}
                    className="bg-slate-900/50 hover:bg-amber-500/10 hover:border-amber-500/50 border border-slate-700 text-white text-sm font-medium py-3 px-4 rounded-lg transition-colors text-left"
                  >
                    {item.name}
                    <span className="block text-amber-500 text-xs mt-1">$ {item.price.toLocaleString()}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}