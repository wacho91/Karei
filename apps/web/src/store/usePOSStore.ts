import { create } from 'zustand';

export type OrderItem = { name: string; quantity: number; price: number };
export type TableStatus = 'AVAILABLE' | 'OCCUPIED' | 'BILLING';
export type Table = {
  id: number;
  name: string;
  status: TableStatus;
  total: number;
  items: OrderItem[];
};

// Generamos las 25 mesas
const initialTables: Table[] = Array.from({ length: 25 }, (_, i) => ({
  id: i + 1,
  name: i >= 20 ? `Terraza ${i - 19}` : `Mesa ${i + 1}`,
  status: 'AVAILABLE',
  total: 0,
  items: []
}));

interface POSState {
  tables: Table[];
  addItemToTable: (tableId: number, item: OrderItem) => void;
  checkoutTable: (tableId: number) => void;
}

export const usePOSStore = create<POSState>((set) => ({
  tables: initialTables,
  addItemToTable: (tableId, item) => set((state) => ({
    tables: state.tables.map(t => {
      if (t.id === tableId) {
        const existing = t.items.find(i => i.name === item.name);
        const newItems = existing 
          ? t.items.map(i => i.name === item.name ? { ...i, quantity: i.quantity + 1 } : i) 
          : [...t.items, { ...item, quantity: 1 }];
        const newTotal = newItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
        return { ...t, items: newItems, total: newTotal, status: 'OCCUPIED' };
      }
      return t;
    })
  })),
  checkoutTable: (tableId) => set((state) => ({
    tables: state.tables.map(t => t.id === tableId ? { ...t, status: 'AVAILABLE', items: [], total: 0 } : t)
  }))
});