import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Receta, RecetaInput } from '@/types/inventario';

type ApiError = { response?: { data?: { detail?: string } } };

const extraerError = (err: unknown, fallback: string): string => {
  const detalle = (err as ApiError)?.response?.data?.detail;
  return detalle ?? fallback;
};

export const useRecetas = () => {
  const [recetas, setRecetas] = useState<Receta[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const { data } = await api.get<Receta[]>('/inventory/recipes');
      setRecetas(data);
    } catch (err) {
      setError(extraerError(err, 'No se pudo cargar el menú'));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const crear = async (datos: RecetaInput): Promise<boolean> => {
    try {
      await api.post('/inventory/recipes', datos);
      await cargar();
      return true;
    } catch (err) {
      setError(extraerError(err, 'Error al guardar la receta'));
      return false;
    }
  };

  return { recetas, cargando, error, crear };
};