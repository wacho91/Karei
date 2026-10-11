import { create } from 'zustand';
import type { OrderItem } from '@/types/domain';

export interface CartLine {
  productId: string;
  productName: string;
  unitPriceCents: number;
  taxRate: number;
  quantity: number;
  notes?: string;
}

interface CartState {
  lines: CartLine[];
  addLine: (line: CartLine) => void;
  removeLine: (productId: string) => void;
  setQuantity: (productId: string, quantity: number) => void;
  clear: () => void;
  subtotalCents: () => number;
  taxCents: () => number;
  totalCents: () => number;
  toOrderItems: () => Array<Pick<OrderItem, 'product_id' | 'quantity' | 'notes'>>;
}

export const useCartStore = create<CartState>((set, get) => ({
  lines: [],
  addLine: (line) =>
    set((s) => {
      const idx = s.lines.findIndex((l) => l.productId === line.productId);
      if (idx === -1) return { lines: [...s.lines, line] };
      const next = s.lines.slice();
      next[idx] = { ...next[idx], quantity: next[idx].quantity + line.quantity };
      return { lines: next };
    }),
  removeLine: (productId) =>
    set((s) => ({ lines: s.lines.filter((l) => l.productId !== productId) })),
  setQuantity: (productId, quantity) =>
    set((s) => ({
      lines: s.lines
        .map((l) => (l.productId === productId ? { ...l, quantity } : l))
        .filter((l) => l.quantity > 0),
    })),
  clear: () => set({ lines: [] }),
  subtotalCents: () =>
    get().lines.reduce((acc, l) => acc + l.unitPriceCents * l.quantity, 0),
  taxCents: () =>
    get().lines.reduce(
      (acc, l) => acc + Math.round(l.unitPriceCents * l.quantity * l.taxRate),
      0,
    ),
  totalCents: () => get().subtotalCents() + get().taxCents(),
  toOrderItems: () =>
    get().lines.map((l) => ({
      product_id: l.productId,
      quantity: l.quantity,
      notes: l.notes,
    })),
}));
