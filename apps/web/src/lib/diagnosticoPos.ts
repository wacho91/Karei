// Kārei · diagnóstico: pruebas puntuales + volcado de rutas del openapi
import axiosLib from 'axios';
import { api, textoError } from './http';

const etiqueta = (r: any): string => `${r?.status ?? '?'} ${r?.statusText ?? ''}`.trim();

const probar = async (metodo: 'get' | 'post', ruta: string, cuerpo?: any): Promise<string> => {
  try {
    const r = await api[metodo](ruta, cuerpo);
    const d = r?.data;
    const muestra = typeof d === 'string' ? d.slice(0, 110) : JSON.stringify(d)?.slice(0, 110) ?? '(vacío)';
    return `OK  ${metodo.toUpperCase().padEnd(4)} ${ruta} → ${etiqueta(r)} · ${muestra}`;
  } catch (e: any) {
    return `ERR ${metodo.toUpperCase().padEnd(4)} ${ruta} → ${textoError(e).slice(0, 150)}`;
  }
};

// Descubre TODAS las rutas reales del backend vía openapi.json
const listarRutas = async (): Promise<string[]> => {
  const intentos: Array<() => Promise<any>> = [
    () => api.get('/openapi.json'),
    () => axiosLib.get('/api/v1/openapi.json', { timeout: 2500 }),
    () => axiosLib.get('http://127.0.0.1:8000/openapi.json', { timeout: 2500 }),
    () => axiosLib.get('http://127.0.0.1:8000/api/v1/openapi.json', { timeout: 2500 }),
    () => axiosLib.get('http://127.0.0.1:5000/openapi.json', { timeout: 2500 }),
    () => axiosLib.get('http://127.0.0.1:8080/openapi.json', { timeout: 2500 }),
  ];
  for (const p of intentos) {
    try {
      const r = await p();
      if (r?.data?.paths) return Object.keys(r.data.paths).sort();
    } catch { /* siguiente intento */ }
  }
  return [];
};

export const diagnosticoPos = async (): Promise<string> => {
  const L: string[] = ['KĀREI · DIAGNÓSTICO POS', new Date().toLocaleString('es-CO'), ''];

  L.push('— RUTAS REALES DEL BACKEND —');
  const rutas = await listarRutas();
  if (rutas.length) rutas.forEach((x) => L.push(x));
  else L.push('(openapi no disponible: docs deshabilitado o CORS cerrado)');
  L.push('');

  L.push('— PRUEBAS PUNTUALES —');
  L.push(await probar('get', '/pos/tables'));
  L.push(await probar('get', '/recetas'));
  L.push(await probar('get', '/recipes'));
  return L.join('\n');
};