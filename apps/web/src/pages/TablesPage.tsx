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

// Generamos 25 mesas redondas
const initialTables: Table[] = Array.from({ length: 25 }, (_, i) => {
  const id = i + 1;
  const isTerrace = i >= 20;
  const name = isTerrace ? `Terraza ${i - 19}` : `Mesa ${id}`;
  const status = i % 4 === 0 ? 'OCCUPIED' : (i % 7 === 0 ? 'BILLING' : 'AVAILABLE');
  const total = status === 'AVAILABLE' ? 0 : Math.floor(Math.random() * 100000) + 15000;
  const items = status === 'AVAILABLE' ? [] : [{ name: 'Plato del Día', quantity: Math.floor(Math.random() * 3) + 1, price: 25000 }];
  return { id, name, status, total, items };
});

// Componente visual de la Mesa Real
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

  const statusText = {
    AVAILABLE: 'Libre',
    OCCUPIED: 'Ocupada',
    BILLING: 'Cobrando',
  };

  return (
    <div 
      onClick={onClick}
      className={`relative w-24 h-24 rounded-full border-4 flex flex-col items-center justify-center cursor-pointer transition-all duration-300 shadow-lg ${isSelected ? 'scale-110 border-amber-400 ring-4 ring-amber-400/30' : statusColors[table.status]} hover:scale-105 hover:shadow-xl`}
      style={{ backgroundImage: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.05) 0%, rgba(0,0,0,0.2) 70%)' }}
    >
      {/* Indicador tipo "Vela/LED" */}
      <span className={`absolute top-2 w-3 h-3 rounded-full shadow-md animate-pulse ${dotColors[table.status]}`}></span>
      
      <span className="text-lg font-extrabold text-white tracking-tight">{table.name.replace('Mesa ', '').replace('Terraza ', 'T')}</span>
      {table.total > 0 ? (
        <span className="text-[11px] font-bold text-amber-400">$ {(table.total / 1000).toFixed(0)}k</span>
      ) : (
        <span className="text-[10px] text-slate-400">{statusText[table.status]}</span>
      )}
    </div>
  );
};

export default function TablesPage() {
  const [tables] = useState(initialTables);
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [tipPercent, setTipPercent] = useState(0);

  const tipAmount = selectedTable ? (selectedTable.total * tipPercent) / 100 : 0;
  const finalTotal = selectedTable ? selectedTable.total + tipAmount : 0;

  return (
    <div>
      <h1 className="text-3xl font-bold text-white mb-2">POS / Comedor 🍽️</h1>
      <p className="text-slate-400 mb-8">Mapa del restaurante. Haz clic en una mesa para ver la cuenta.</p>
      
      <div className="flex gap-8">
        
        {/* === COLUMNA IZQUIERDA: PLANO DEL COMEDOR === */}
        <div className="w-2/3 bg-slate-800/10 p-8 rounded-2xl border border-slate-700/30 shadow-inner" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.03) 1px, transparent 1px)', backgroundSize: '24px 24px' }}>
          
          <div className="mb-12">
            <h3 className="text-slate-300 text-sm font-bold uppercase tracking-widest mb-6 flex items-center gap-2">
              <span className="w-2 h-2 bg-amber-500 rounded-full"></span> Zona Interior
            </h3>
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-8 justify-items-center">
              {tables.slice(0, 20).map((table) => (
                <TableNode key={table.id} table={table} isSelected={selectedTable?.id === table.id} onClick={() => setSelectedTable(table)} />
              ))}
            </div>
          </div>

          <div className="border-t border-slate-700/50 pt-10">
            <h3 className="text-slate-300 text-sm font-bold uppercase tracking-widest mb-6 flex items-center gap-2">
              <span className="w-2 h-2 bg-emerald-500 rounded-full"></span> Zona Terraza
            </h3>
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-8 justify-items-center">
              {tables.slice(20, 25).map((table) => (
                <TableNode key={table.id} table={table} isSelected={selectedTable?.id === table.id} onClick={() => setSelectedTable(table)} />
              ))}
            </div>
          </div>
        </div>

        {/* === COLUMNA DERECHA: CUENTA DE MESA === */}
        <div className="w-1/3 bg-slate-800/50 border border-slate-700 p-6 rounded-2xl shadow-sm flex flex-col h-[700px] sticky top-8 backdrop-blur-sm">
          {!selectedTable ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500">
              <span className="text-6xl mb-6">🛎️</span>
              <p className="text-lg font-medium text-slate-400">Selecciona una mesa</p>
              <p className="text-sm text-slate-600">para ver la cuenta en vivo.</p>
            </div>
          ) : (
            <>
              <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-700">
                <div>
                  <h2 className="text-2xl font-bold text-white">{selectedTable.name}</h2>
                  <p className={`text-xs font-bold uppercase tracking-wider mt-1 ${selectedTable.status === 'AVAILABLE' ? 'text-emerald-400' : selectedTable.status === 'BILLING' ? 'text-rose-400' : 'text-amber-400'}`}>
                    {selectedTable.status === 'AVAILABLE' ? 'Libre' : selectedTable.status === 'BILLING' ? 'Cobrando' : 'Ocupada'}
                  </p>
                </div>
                <div className={`w-6 h-6 rounded-full shadow-md ${selectedTable.status === 'AVAILABLE' ? 'bg-emerald-400 shadow-emerald-400/50' : selectedTable.status === 'BILLING' ? 'bg-rose-400 shadow-rose-400/50' : 'bg-amber-400 shadow-amber-400/50'}`}></div>
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