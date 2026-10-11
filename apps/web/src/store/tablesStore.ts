import { create } from 'zustand';
import type { Table, TableStatus } from '@/types/domain';

interface TablesState {
  tables: Table[];
  selectedTableId: string | null;
  filterStatus: TableStatus | 'ALL';
  setTables: (tables: Table[]) => void;
  upsertTable: (table: Table) => void;
  selectTable: (id: string | null) => void;
  setFilterStatus: (status: TableStatus | 'ALL') => void;
  clear: () => void;
}

export const useTablesStore = create<TablesState>((set) => ({
  tables: [],
  selectedTableId: null,
  filterStatus: 'ALL',
  setTables: (tables) => set({ tables }),
  upsertTable: (table) =>
    set((s) => {
      const idx = s.tables.findIndex((t) => t.id === table.id);
      if (idx === -1) return { tables: [...s.tables, table] };
      const next = s.tables.slice();
      next[idx] = table;
      return { tables: next };
    }),
  selectTable: (selectedTableId) => set({ selectedTableId }),
  setFilterStatus: (filterStatus) => set({ filterStatus }),
  clear: () => set({ tables: [], selectedTableId: null, filterStatus: 'ALL' }),
}));
