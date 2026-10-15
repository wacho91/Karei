import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  CheckoutResultado, ComandaCocina, Mesa, MesaInput, Pedido, RecetaMenu,
} from '@/types/pos';

// ============ CONSULTAS ============

export function useMesas() {
  return useQuery({
    queryKey: ['pos', 'tables'],
    queryFn: async () => {
      const { data } = await api.get<Mesa[]>('/pos/tables');
      return data;
    },
    refetchInterval: 15_000,
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

export function useComandasCocina() {
  return useQuery({
    queryKey: ['pos', 'kitchen'],
    queryFn: async () => {
      const { data } = await api.get<ComandaCocina[]>('/pos/kitchen/orders');
      return data;
    },
    refetchInterval: 10_000,
  });
}

// ============ MUTACIONES ============

function useInvalidarPOS() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['pos'] });
    qc.invalidateQueries({ queryKey: ['inventory'] });
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

export function useActualizarMesa() {
  const invalidar = useInvalidarPOS();
  return useMutation({
    mutationFn: async (p: { mesaId: string; datos: Partial<MesaInput> }) => {
      const { data } = await api.put<Mesa>(`/pos/tables/${p.mesaId}`, p.datos);
      return data;
    },
    onSuccess: invalidar,
  });
}

export function useDesactivarMesa() {
  const invalidar = useInvalidarPOS();
  return useMutation({
    mutationFn: async (mesaId: string) => {
      const { data } = await api.delete<{ mensaje: string }>(`/pos/tables/${mesaId}`);
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

export function useAvanzarComanda() {
  const invalidar = useInvalidarPOS();
  return useMutation({
    mutationFn: async (orderId: string) => {
      const { data } = await api.post<{ order_number: string; status: string }>(
        `/pos/orders/${orderId}/advance`,
      );
      return data;
    },
    onSuccess: invalidar,
  });
}

/** Orquestador del Nuevo Pedido: abre la mesa si está libre, agrega items
 *  y opcionalmente envía directo a cocina. Todo en un solo clic. */
export function useEnviarNuevaComanda() {
  const invalidar = useInvalidarPOS();
  return useMutation({
    mutationFn: async (p: {
      tableId: string;
      items: { recipe_id: string; quantity: number }[];
      directoACocina: boolean;
    }) => {
      // 1. Estado fresco de la mesa
      const { data: mesas } = await api.get<Mesa[]>('/pos/tables');
      const mesa = mesas.find((m) => m.id === p.tableId);
      if (!mesa) throw new Error('Mesa no encontrada');

      // 2. Si está libre, se abre sola (llegaron clientes)
      if (mesa.status === 'AVAILABLE') {
        await api.post(`/pos/tables/${p.tableId}/open`);
      }

      // 3. Si ya tiene pedido en cocina, no se puede agregar esta ronda
      const { data: pedido } = await api.get<Pedido | null>(`/pos/tables/${p.tableId}/order`);
      if (pedido && pedido.status !== 'CONFIRMED') {
        throw new Error(`${mesa.name} ya tiene un pedido en cocina. Agrégalo desde el POS.`);
      }

      // 4. Agregar los items a la cuenta
      const { data: actualizado } = await api.post<Pedido>(
        `/pos/tables/${p.tableId}/items`,
        { items: p.items },
      );

      // 5. Si el mesero quiere, directo a cocina
      if (p.directoACocina) {
        await api.post(`/pos/orders/${actualizado.id}/send`);
      }
      return actualizado;
    },
    onSuccess: invalidar,
  });
}