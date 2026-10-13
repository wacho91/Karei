import { useState } from 'react';
import { usePOSStore } from '../store/usePOSStore';

const mockMenu = [
  { name: "Hamburguesa Doble", price: 25000 },
  { name: "Pizza Margarita", price: 35000 },
  { name: "Ensalada César", price: 18000 },
  { name: "Pasta Carbonara", price: 30000 },
  { name: "Limonada de Coco", price: 8000 },
  { name: "Cerveza Artesanal", price: 12000 },
  { name: "Tacos al Pastor", price: 22000 },
  { name: "Sopa de Tomate", price: 15000 },
];

export default function ProductsPage() {
  const tables = usePOSStore((state) => state.tables);
  const addItemToTable = usePOSStore((state) => state.addItemToTable);
  
  const [selectedTable, setSelectedTable] = useState(1);
  const [cart, setCart] = useState<any[]>([]);

  const addItem = (item: any) => {
    const existing = cart.find(i => i.name === item.name);
    if (existing) {
      setCart(cart.map(i => i.name === item.name ? { ...i, quantity: i.quantity + 1 } : i));
    } else {
      setCart([...cart, { ...item, quantity: 1 }]);
    }
  };

  const sendOrder = () => {
    cart.forEach(item => {
      for (let i = 0; i < item.quantity; i++) {
        addItemToTable(selectedTable, { name: item.name, price: item.price, quantity: 1 });
      }
    });
    alert(`Pedido enviado a la Mesa ${selectedTable} con éxito!`);
    setCart([]);
  };

  return (
    <div>
      <h1 className="text-3xl font-bold text-white mb-2">Nuevo Pedido 📝</h1>
      <p className="text-slate-400 mb-8">Selecciona los productos y envíalos a la mesa.</p>

      <div className="flex gap-8">
        
        {/* === MENÚ === */}
        <div className="w-2/3">
          <h3 className="text-slate-300 text-sm font-bold uppercase tracking-widest mb-4">Menú</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {mockMenu.map((item) => (
              <button 
                key={item.name} 
                onClick={() => addItem(item)}
                className="bg-slate-800/50 hover:bg-amber-500/10 hover:border-amber-500/50 border border-slate-700 p-4 rounded-xl text-left transition-colors"
              >
                <span className="block text-white font-bold">{item.name}</span>
                <span className="block text-amber-500 text-sm mt-1">$ {item.price.toLocaleString()}</span>
              </button>
            ))}
          </div>
        </div>

        {/* === CARRITO === */}
        <div className="w-1/3 bg-slate-800/50 border border-slate-700 p-6 rounded-2xl shadow-sm sticky top-8 h-[500px] flex flex-col">
          <h3 className="text-slate-300 text-sm font-bold uppercase tracking-widest mb-4">Carrito</h3>
          
          <select 
            value={selectedTable} 
            onChange={(e) => setSelectedTable(Number(e.target.value))}
            className="w-full bg-slate-900 border border-slate-700 text-white p-3 rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            {tables.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>

          <div className="flex-1 overflow-y-auto mb-4 border-y border-slate-700 py-4">
            {cart.length === 0 && (
              <p className="text-slate-500 text-center text-sm py-8">Agrega productos al carrito.</p>
            )}
            
            {cart.length > 0 && (
              <ul className="space-y-2">
                {cart.map((item, index) => (
                  <li key={index} className="flex justify-between text-slate-300 text-sm">
                    <span>{item.quantity}x {item.name}</span>
                    <span className="font-medium text-amber-400">$ {(item.quantity * item.price).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button 
            onClick={sendOrder} 
            disabled={cart.length === 0}
            className="w-full bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold py-3 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            🚀 Enviar a Mesa
          </button>
        </div>
      </div>
    </div>
  );
}