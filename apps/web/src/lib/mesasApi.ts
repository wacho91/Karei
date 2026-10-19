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

export const traerMesas = async (): Promise<Mesa[]> => {
  let ultimo = '';
  for (const ruta of ['/pos/tables', '/tables', '/pos/mesas']) {
    try {
      const r = await api.get(ruta);
      const mesas = primerArray(r?.data).map(normalizar).filter((x: Mesa) => x.id > 0);
      if (mesas.length) return mesas;
      ultimo = `${ruta}: respondió sin mesas`;
    } catch (e: any) {
      ultimo = `${ruta}: ${textoError(e)}`;
    }
  }
  throw new Error(ultimo || 'No se pudieron cargar las mesas');
};

// El backend exige  code  y  name  (error 422 confirmado en pantalla).
// Mandamos el cuerpo en inglés + extras ES; si rechaza, probamos solo ES.
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