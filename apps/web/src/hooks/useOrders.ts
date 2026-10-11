import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Order } from '@/types/domain';

interface OrdersResponse {
  items: Order[];
  meta: { page: number; size: number; total: number; pages: number };
}

export function useOrders(params?: { status?: string; branchId?: string }) {
  return useQuery({
    queryKey: ['orders', params ?? {}],
    queryFn: async () => {
      const { data } = await api.get<OrdersResponse>('/orders', { params });
      return data.items;
    },
  });
}

export function useCreateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      branch_id: string;
      session_id?: string | null;
      channel: string;
      items: Array<{ product_id: string; quantity: number; notes?: string }>;
    }) => {
      const { data } = await api.post<Order>('/orders', payload);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}
