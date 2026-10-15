import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { DashboardResumen } from '@/types/dashboard';

export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const { data } = await api.get<DashboardResumen>('/dashboard/summary');
      return data;
    },
    refetchInterval: 30_000,
  });
}