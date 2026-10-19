// Kārei · núcleo HTTP: cliente api + utilidades defensivas
import axiosLib from 'axios';
import * as apiModule from './api';

type Obj = Record<string, any>;

// El cliente del proyecto puede exportarse por defecto o con otro nombre.
const m: any = apiModule;
const candidato: any = m.default ?? m.api ?? m.client ?? m.axiosInstance ?? m.axios;
export const api: any = candidato ?? axiosLib.create({ baseURL: '/api/v1' });

/** Mensaje de error legible desde una excepción axios. */
export const textoError = (e: any): string => {
  const d = e?.response?.data;
  const detalle = d?.detail ?? d?.message ?? d;
  if (typeof detalle === 'string' && detalle) return detalle;
  if (detalle && typeof detalle === 'object') {
    try { return JSON.stringify(detalle); } catch { /* sigue */ }
  }
  return e?.message ?? 'Error de red';
};

/** Devuelve el primer array de objetos encontrado a cualquier profundidad. */
export const primerArray = (x: any, profundidad = 4): Obj[] => {
  if (Array.isArray(x)) return x.filter((e) => e && typeof e === 'object');
  if (x && typeof x === 'object' && profundidad > 0) {
    for (const k of Object.keys(x)) {
      const hallado = primerArray(x[k], profundidad - 1);
      if (hallado.length) return hallado;
    }
  }
  return [];
};

/** Aplana envolturas {data: {...}} típicas de algunos backends. */
export const soltar = (x: any): any => {
  let v = x;
  for (let i = 0; i < 3; i++) {
    const dentro = v?.data;
    if (v && typeof v === 'object' && !Array.isArray(v)
      && dentro && typeof dentro === 'object' && dentro.id === undefined) {
      v = dentro;
    } else break;
  }
  return v;
};