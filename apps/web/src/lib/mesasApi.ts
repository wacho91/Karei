// Kārei · API de mesas: listar, crear, eliminar
import { api, primerArray, textoError } from './http';
import { campo, capacidadMesa, estadoMesa, nombreMesa, zonaMesa } from './tipos';
import type { Mesa } from './tipos';

export interface DatosMesa {
  nombre: string;
  zona: string;
  capacidad: number;
}

const normalizar = (m: any): Mesa => ({
  id: Number(campo(m, 'id', 'table_id', 'mesa_id', 'id_mesa') ?? 0),
  nombre: nombreMesa(m),
  zona: zonaMesa(m),
  capacidad: capacidadMesa(m),
  estado: estadoMesa(m),
});

// null = "esta respuesta no trae lista de mesas"
const extraer = (data: any): Mesa[] | null => {
  if (Array.isArray(data)) return data.map(normalizar);
  if (Array.isArray(data?.items) || Array.isArray(data?.mesas) || Array.isArray(data?.tables)) {
    return (data.items ?? data.mesas ?? data.tables).map(normalizar);
  }
  const anidado = primerArray(data);
  return anidado.length ? anidado.map(normalizar) : null;
};

const RUTAS = ['/pos/tables', '/tables', '/pos/mesas'];

export const traerMesas = async (): Promise<Mesa[]> => {
  let ultimo = '';
  for (const ruta of RUTAS) {
    try {
      const r = await api.get(ruta);
      const mesas = extraer(r?.data);
      // La ruta existe y respondió: es la verdad definitiva (aunque vacía).
      if (mesas) return mesas;
      ultimo = `${ruta}: respuesta sin lista ${JSON.stringify(r?.data)?.slice(0, 80)}`;
    } catch (e: any) {
      ultimo = `${ruta}: ${textoError(e)}`;
      if (e?.response?.status !== 404) break; // 404 = probar la siguiente ruta
    }
  }
  throw new Error(ultimo || 'No se pudieron cargar las mesas');
};

// El backend exige  code  y  name  (422 confirmado). Inglés primero, ES de apoyo.
const cuerpos = (d: DatosMesa): any[] => [
  { code: d.nombre, name: d.nombre, zone: d.zona, capacity: d.capacidad, zona: d.zona, capacidad: d.capacidad },
  { nombre: d.nombre, zona: d.zona, capacidad: d.capacidad },
];

export const crearMesa = async (d: DatosMesa): Promise<Mesa> => {
  let ultimo = '';
  for (const cuerpo of cuerpos(d)) {
    for (const ruta of ['/pos/tables', '/tables']) {
      try {
        const r = await api.post(ruta, cuerpo);
        const id = Number(campo(r?.data, 'id', 'table_id') ?? 0);
        return normalizar(id > 0 ? r.data : { ...cuerpo, id });
      } catch (e: any) {
        ultimo = textoError(e);
      }
    }
  }
  throw new Error(ultimo || 'El backend rechazó la mesa');
};

export const eliminarMesa = async (id: number): Promise<void> => {
  for (const ruta of [`/pos/tables/${id}`, `/tables/${id}`, `/pos/mesas/${id}`]) {
    try { await api.delete(ruta); return; } catch { /* prueba la siguiente */ }
  }
};

const DEMO: DatosMesa[] = [
  { nombre: 'Mesa 1', zona: 'Salón', capacidad: 4 },
  { nombre: 'Mesa 2', zona: 'Salón', capacidad: 4 },
  { nombre: 'Mesa 3', zona: 'Salón', capacidad: 4 },
  { nombre: 'Terraza 1', zona: 'Terraza', capacidad: 8 },
];

export const crearMesasDemo = async (): Promise<number> => {
  let ok = 0;
  for (const d of DEMO) {
    try { await crearMesa(d); ok++; } catch { /* continúa con la siguiente */ }
  }
  return ok;
};