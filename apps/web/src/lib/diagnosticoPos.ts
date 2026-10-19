// diagnosticoPos.ts v3.1 — sondea el backend Y muestra su mapa real de rutas
// Fix: el export principal se llama diagnosticoPos (así lo importa TablesPage)
import { api } from './http';
import { cargarMapaRutas, hayMapa, rutasDe, origenMapa } from './rutas';

async function probar(metodo: string, ruta: string, cuerpo?: any): Promise<string> {
  try {
    const r = await api.request({ method: metodo, url: ruta, data: cuerpo });
    const muestra = JSON.stringify(r?.data ?? '').slice(0, 110);
    return `OK   ${metodo} ${ruta} → ${r?.status} · ${muestra}`;
  } catch (e: any) {
    const st = e?.response?.status ?? '—';
    const muestra = JSON.stringify(e?.response?.data ?? '').slice(0, 110);
    return `ERR  ${metodo} ${ruta} → ${st} · ${muestra}`;
  }
}

function enGrupos(rutas: string[], n: number): string {
  return rutas.slice(0, n).join(', ') + (rutas.length > n ? ` …(+${rutas.length - n})` : '');
}

export async function diagnosticoPos(): Promise<string[]> {
  const lineas: string[] = [];
  // ── MAPA REAL DEL BACKEND ──────────────────────────────────────────
  await cargarMapaRutas();
  if (hayMapa()) {
    const gets = rutasDe('get'), posts = rutasDe('post'), dels = rutasDe('delete');
    lineas.push(`MAPA openapi (${origenMapa()}): ${gets.length + posts.length + dels.length} rutas`);
    lineas.push(`GET: ${enGrupos(gets, 14) || '—'}`);
    lineas.push(`POST: ${enGrupos(posts, 12) || '—'}`);
    lineas.push(`DELETE: ${enGrupos(dels, 8) || '—'}`);
  } else {
    lineas.push('MAPA openapi: NO alcanzable (no se pudo leer el mapa del backend)');
  }
  // ── MESAS ──────────────────────────────────────────────────────────
  lineas.push('── MESAS ──');
  lineas.push(await probar('get', '/pos/tables'));
  lineas.push(await probar('post', '/pos/tables', {}));
  // ── PEDIDOS ────────────────────────────────────────────────────────
  lineas.push('── PEDIDOS ──');
  lineas.push(await probar('get', '/pos/orders'));
  lineas.push(await probar('post', '/pos/tables/99999999/orders', {}));
  lineas.push(await probar('post', '/pos/orders', { table_id: 99999999 }));
  // ── MENÚ ───────────────────────────────────────────────────────────
  lineas.push('── MENÚ ──');
  for (const r of ['/recetas', '/recipes', '/pos/menu', '/menu', '/products', '/carta']) {
    lineas.push(await probar('get', r));
  }
  return lineas;
}

export const ejecutarDiagnostico = diagnosticoPos;   // alias por compatibilidad
export const diagnosticarPos = diagnosticoPos;      // alias por compatibilidad