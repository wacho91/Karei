// Kārei · diagnóstico de rutas del backend (pruebas seguras)
import { api, textoError } from './http';

const etiqueta = (r: any): string => `${r?.status ?? '?'} ${r?.statusText ?? ''}`.trim();

const probar = async (metodo: 'get' | 'post', ruta: string, cuerpo?: any): Promise<string> => {
  try {
    const r = await api[metodo](ruta, cuerpo);
    const d = r?.data;
    const muestra = typeof d === 'string'
      ? d.slice(0, 110)
      : JSON.stringify(d)?.slice(0, 110) ?? '(vacío)';
    return `OK  ${metodo.toUpperCase().padEnd(4)} ${ruta} → ${etiqueta(r)} · ${muestra}`;
  } catch (e: any) {
    return `ERR ${metodo.toUpperCase().padEnd(4)} ${ruta} → ${textoError(e).slice(0, 150)}`;
  }
};

export const diagnosticoPos = async (): Promise<string> => {
  const L: string[] = ['KĀREI · DIAGNÓSTICO POS', new Date().toLocaleString('es-CO'), ''];

  L.push('— MESAS —');
  L.push(await probar('get', '/pos/tables'));
  L.push(await probar('post', '/pos/tables', {})); // el 422 revela los campos exigidos
  L.push('');

  L.push('— PEDIDOS (mesa falsa 99999999, no crea nada) —');
  L.push(await probar('post', '/pos/orders', { table_id: 99999999, items: [] }));
  L.push(await probar('post', '/pos/tables/99999999/orders', { items: [] }));
  L.push('');

  L.push('— CUENTA —');
  L.push(await probar('get', '/pos/tables/99999999/account'));
  L.push(await probar('get', '/pos/orders?table_id=99999999'));
  L.push('');

  L.push('— MENÚ —');
  for (const ruta of ['/recetas', '/recipes', '/pos/menu']) L.push(await probar('get', ruta));

  return L.join('\n');
};