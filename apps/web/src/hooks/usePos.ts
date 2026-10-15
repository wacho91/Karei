import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { CheckoutResultado, Mesa, MesaInput, Pedido, RecetaMenu } from '@/types/pos';

// ============ CONSULTAS ============

export function useMesas() {
  return useQuery({
    queryKey: ['pos', 'tables'],
    queryFn: async () => {
      const { data } = await api.get<Mesa[]>('/pos/tables');
      return data;
    },
    refetchInterval: 15_000, // el mapa se actualiza solo cada 15s
  });
}

export function usePedidoActivo(tableId: string | null) {
  return useQuery({
    queryKey: ['pos', 'order', tableId],
    queryFn: async () => {
      const { data } = await api.get<Pedido | null>(`/pos/tables/${tableId}/order`);
      return data;
    },
    enabled: !!tableId,
  });
}

export function useMenuRecetas() {
  return useQuery({
    queryKey: ['inventory', 'recipes'],
    queryFn: async () => {
      const { data } = await api.get<RecetaMenu[]>('/inventory/recipes');
      return data.filter((r) => r.is_active);
    },
  });
}

// ============ MUTACIONES ============

function useInvalidarPOS() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['pos'] });
    qc.invalidateQueries({ queryKey: ['inventory'] }); // el descuento de stock se ve al instante
  };
}

export function useCrearMesa() {
  const invalidar = useInvalidarPOS();
  return useMutation({
    mutationFn: async (datos: MesaInput) => {
      const { data } = await api.post<Mesa>('/pos/tables', datos);
      return data;
    },
    onSuccess: invalidar,
  });
}

export function useAbrirMesa() {
  const invalidar = useInvalidarPOS();
  return useMutation({
    mutationFn: async (tableId: string) => {
      const { data } = await api.post<Mesa>(`/pos/tables/${tableId}/open`);
      return data;
    },
    onSuccess: invalidar,
  });
}

export function useAgregarItems() {
  const invalidar = useInvalidarPOS();
  return useMutation({
    mutationFn: async (p: { tableId: string; items: { recipe_id: string; quantity: number }[] }) => {
      const { data } = await api.post<Pedido>(`/pos/tables/${p.tableId}/items`, { items: p.items });
      return data;
    },
    onSuccess: invalidar,
  });
}

export function useQuitarItem() {
  const invalidar = useInvalidarPOS();
  return useMutation({
    mutationFn: async (p: { tableId: string; itemId: string }) => {
      const { data } = await api.delete<Pedido>(`/pos/tables/${p.tableId}/items/${p.itemId}`);
      return data;
    },
    onSuccess: invalidar,
  });
}

export function useEnviarACocina() {
  const invalidar = useInvalidarPOS();
  return useMutation({
    mutationFn: async (orderId: string) => {
      const { data } = await api.post<{ order: Pedido; warnings: string[] }>(
        `/pos/orders/${orderId}/send`,
      );
      return data;
    },
    onSuccess: invalidar,
  });
}

export function useCobrar() {
  const invalidar = useInvalidarPOS();
  return useMutation({
    mutationFn: async (p: { tableId: string; tip: number; method: string }) => {
      const { data } = await api.post<CheckoutResultado>(`/pos/tables/${p.tableId}/checkout`, {
        tip: p.tip,
        method: p.method,
      });
      return data;
    },
    onSuccess: invalidar,
  });
}