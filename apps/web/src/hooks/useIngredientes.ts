import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { CompraInput, Ingrediente, IngredienteInput } from '@/types/inventario';

type ApiError = { response?: { data?: { detail?: string } } };

const extraerError = (err: unknown, fallback: string): string => {
  const detalle = (err as ApiError)?.response?.data?.detail;
  return detalle ?? fallback;
};

export const useIngredientes = () => {
  const [ingredientes, setIngredientes] = useState<Ingrediente[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const { data } = await api.get<Ingrediente[]>('/inventory/ingredients');
      setIngredientes(data);
    } catch (err) {
      setError(extraerError(err, 'No se pudo cargar el inventario. ¿Está el backend corriendo?'));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const crear = async (datos: IngredienteInput): Promise<boolean> => {
    try {
      await api.post('/inventory/ingredients', datos);
      await cargar();
      return true;
    } catch (err) {
      setError(extraerError(err, 'Error al guardar el ingrediente'));
      return false;
    }
  };

  const actualizar = async (id: string, datos: IngredienteInput): Promise<boolean> => {
    try {
      await api.put(`/inventory/ingredients/${id}`, datos);
      await cargar();
      return true;
    } catch (err) {
      setError(extraerError(err, 'Error al actualizar el ingrediente'));
      return false;
    }
  };

  /** Amortiguación de mercado: suma stock y actualiza el precio si cambió. */
  const registrarCompra = async (id: string, datos: CompraInput): Promise<boolean> => {
    try {
      await api.post(`/inventory/ingredients/${id}/purchases`, datos);
      await cargar();
      return true;
    } catch (err) {
      setError(extraerError(err, 'Error al registrar la compra'));
      return false;
    }
  };

  const eliminar = async (id: string) => {
    try {
      await api.delete(`/inventory/ingredients/${id}`);
      await cargar();
    } catch (err) {
      setError(extraerError(err, 'No se puede eliminar: está en uso por recetas'));
    }
  };

  return { ingredientes, cargando, error, crear, actualizar, registrarCompra, eliminar };
};