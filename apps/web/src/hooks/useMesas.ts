// src/hooks/useMesas.ts — v10 · E-14x — MAPA DE MESAS EN VIVO
// ─────────────────────────────────────────────────────────────────────────
// Reemplazo completo del hook. Habla DIRECTO con el add-on pos_mesas.py:
//     GET    /pos/mapa          → mapa completo agrupado por área (poll 8 s)
//     POST   /pos/mesas         → crear mesa (crea el área si es nueva)
//     DELETE /pos/mesas/{id}    → elimina mesa SOLO si no tiene ventas
//     POST   /pos/mesas/limpiar → elimina TODAS las mesas sin ventas
//
// ARREGLA el bug reportado por Cristian: antes el modal "Nueva mesa" se
// quedaba en "Creando..." pegado porque el backend respondía 404 y el
// error se perdía. Ahora: SIEMPRE se resetea y el error se muestra.
//
// COMPATIBLE con TablesPage/MapaMesas existentes: expone las mismas props
// que el v9 (mesas, recargar, crearMesa, crearMesasDemo, eliminarMesa,
// ocupadas) MÁS las nuevas (areas, total, libres, limpiarSinVentas...).
import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as apiModule from '../lib/api';

const api: any = (apiModule as any).default ?? (apiModule as any).api ?? apiModule;
// axios → r.data · wrapper propio → r · backend envuelto → r.data.data
const EXTRAER = (r: any) => {
  const a = r?.data ?? r;
  return a?.data !== undefined && a?.ok !== undefined ? a.data : a;
};

const _detalle = (e: any, fallback: string): string => {
  const d = e?.response?.data?.detail ?? e?.detail ?? e?.message;
  return (typeof d === 'string' && d) ? d : fallback;
};

// Orden natural: Mesa 2 antes que Mesa 10
const _natural = (s: string) =>
  String(s ?? '').toLowerCase().split(/(\d+)/).filter(Boolean)
    .map((p) => (/\d/.test(p) ? Number(p) : p));

export interface DatosMesa {
  nombre?: string; area?: string; capacidad?: number | string;
  name?: string; zone?: string; capacity?: number | string;
}

export function useMesas() {
  const qc = useQueryClient();
  const [errAccion, setErrAccion] = useState('');

  const q = useQuery({
    queryKey: ['karei-pos-mapa'],
    queryFn: async () => {
      const r = await api.get('/pos/mapa');
      return EXTRAER(r);
    },
    refetchInterval: 8000, // En vivo: el mapa se refresca solo, como el PanelCuenta
    retry: 1,
  });

  const data: any = q.data ?? {};
  const mesas: any[] = useMemo(() => {
    if (Array.isArray(data)) return data;
    return data?.mesas ?? data?.tables ?? [];
  }, [data]);

  const areas: any[] = useMemo(() => {
    if (Array.isArray(data?.areas) && data.areas.length) return data.areas;
    // Fallback: agrupar en cliente por el campo área de cada mesa
    const grupos: any = {};
    for (const m of mesas) {
      const nombre = m?.area ?? m?.area_name ?? m?.zona ?? m?.zone ?? 'Salón';
      (grupos[nombre] = grupos[nombre] ||
        { id: nombre, nombre, name: nombre, mesas: [], tables: [] }).mesas.push(m);
      grupos[nombre].tables.push(m);
    }
    return Object.values(grupos).sort((a: any, b: any) =>
      _natural(a.nombre) < _natural(b.nombre) ? -1 : 1);
  }, [data, mesas]);

  const ocupadas: string[] = useMemo(
    () => (Array.isArray(data?.ocupadas_ids) && data.ocupadas_ids.length
      ? data.ocupadas_ids.map(String)
      : mesas.filter((m: any) => m?.ocupada).map((m: any) => String(m.id))),
    [data, mesas]);

  const total: number = Number(data?.total ?? mesas.length) || 0;
  const ocupadasN: number = Number(data?.ocupadas ?? ocupadas.length) || 0;
  const libres: number = Number(data?.libres ?? Math.max(0, total - ocupadasN)) || 0;

  const recargar = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['karei-pos-mapa'] });
  }, [qc]);

  // ── CREAR MESA ─────────────────────────────────────────────────────────
  // Devuelve la mesa creada, o `false` si falló (con el motivo en errAccion).
  // JAMÁS lanza: así ningún modal se queda en "Creando..." pegado.
  const crearMesa = useCallback(async (datos: DatosMesa | any) => {
    setErrAccion('');
    const cuerpo = {
      nombre: datos?.nombre ?? datos?.name ?? datos?.label ?? datos?.code ?? '',
      area: datos?.area ?? datos?.zona ?? datos?.zone ?? datos?.area_name ?? 'Salón',
      capacidad: datos?.capacidad ?? datos?.capacity ?? datos?.seats ?? datos?.personas ?? 4,
    };
    try {
      const r = EXTRAER(await api.post('/pos/mesas', cuerpo));
      recargar();
      return r?.mesa ?? r;
    } catch (e: any) {
      setErrAccion(_detalle(e, 'No se pudo crear la mesa'));
      return false;
    }
  }, [recargar]);

  // ── MESAS DEMO (botón "Mesas demo") ────────────────────────────────────
  const crearMesasDemo = useCallback(async () => {
    setErrAccion('');
    const demo = [
      { nombre: 'Mesa 1', area: 'Salón', capacidad: 4 },
      { nombre: 'Mesa 2', area: 'Salón', capacidad: 4 },
      { nombre: 'Mesa 3', area: 'Salón', capacidad: 4 },
      { nombre: 'Mesa 4', area: 'Salón', capacidad: 4 },
      { nombre: 'Terraza 1', area: 'Terraza', capacidad: 8 },
      { nombre: 'Terraza 2', area: 'Terraza', capacidad: 8 },
    ];
    let creadas = 0, omitidas = 0, ultimoError = '';
    for (const d of demo) {
      try {
        await api.post('/pos/mesas', d);
        creadas += 1;
      } catch (e: any) {
        if (e?.response?.status === 409) omitidas += 1; // ya existía
        else { omitidas += 1; ultimoError = _detalle(e, ''); }
      }
    }
    recargar();
    if (ultimoError) setErrAccion(ultimoError);
    return { creadas, omitidas };
  }, [recargar]);

  // ── ELIMINAR UNA MESA (solo si no tiene historial de ventas) ───────────
  const eliminarMesa = useCallback(async (id: any) => {
    setErrAccion('');
    if (id === null || id === undefined || id === '') return false;
    try {
      await api.delete(`/pos/mesas/${id}`);
      recargar();
      return true;
    } catch (e: any) {
      setErrAccion(_detalle(e, 'No se pudo eliminar la mesa'));
      return false;
    }
  }, [recargar]);

  // ── LIMPIAR TODAS LAS MESAS SIN VENTAS (lo que pidió Cristian) ─────────
  // Devuelve { eliminadas, conservadas, detalle_eliminadas,
  //            detalle_conservadas } o `false` si falló.
  const limpiarSinVentas = useCallback(async () => {
    setErrAccion('');
    try {
      const r = EXTRAER(await api.post('/pos/mesas/limpiar', {}));
      recargar();
      return r;
    } catch (e: any) {
      setErrAccion(_detalle(e, 'No se pudo limpiar el mapa'));
      return false;
    }
  }, [recargar]);

  return {
    // datos
    mesas, data, areas, ocupadas, total, libres,
    ocupadasCount: ocupadasN, ocupadasN,
    cargando: q.isLoading, cargandoMapa: q.isFetching, error: q.error as any,
    errAccion,
    // acciones (alias en doble nombre para compatibilidad con el v9)
    recargar, cargar: recargar, refetch: recargar,
    crearMesa, crear: crearMesa,
    crearMesasDemo, crearDemo: crearMesasDemo, crearMesas: crearMesasDemo,
    eliminarMesa, borrarMesa: eliminarMesa,
    limpiarSinVentas, limpiarSinHistorial: limpiarSinVentas,
    limpiar: limpiarSinVentas,
  };
}

export default useMesas;