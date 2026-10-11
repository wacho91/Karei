import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Table } from '@/types/domain';

interface TablesResponse {
  items: Table[];
  meta: { page: number; size: number; total: number; pages: number };
}

export function useTables(branchId?: string) {
  return useQuery({
    queryKey: ['tables', branchId ?? 'all'],
    queryFn: async () => {
      const { data } = await api.get<TablesResponse>('/tables', {
        params: branchId ? { branch_id: branchId } : undefined,
      });
      return data.items;
    },
  });
}
