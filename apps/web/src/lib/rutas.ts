// rutas.ts v1 — descubre las rutas REALES del backend leyendo su openapi.json
// FastAPI publica ahí el mapa completo de sus rutas: se acabó adivinar.
import { api } from './http';

let mapa: Record<string, any> = {};
let caminos: string[] = [];
let origen = '';

const ESQUEMAS: Array<[string, any?]> = [
  ['/openapi.json', undefined],                        // baseURL por defecto (…/api/v1/openapi.json)
  ['/openapi.json', { baseURL: 'http://localhost:8000' }],
  ['/openapi.json', { baseURL: 'http://127.0.0.1:8000' }],
  ['/openapi.json', { baseURL: 'http://localhost:5000' }],
  ['/openapi.json', { baseURL: 'http://localhost:8080' }],
  ['/openapi.json', { baseURL: '' }],                  // raíz del frontend (por si el proxy la pasa)
  ['/api/openapi.json', undefined],
];

function validar(d: any): boolean {
  return !!(d && typeof d === 'object' && d.paths && Object.keys(d.paths).length);
}

function adoptar(paths: Record<string, any>, de: string): string[] {
  mapa = {};
  for (const [p, nodo] of Object.entries(paths)) {
    // Quitamos /api o /api/v1 del inicio: axios ya lo agrega con su baseURL
    mapa[p.replace(/^\/api(\/v1)?(?=\/)/, '')] = nodo;
  }
  caminos = Object.keys(mapa).sort();
  origen = de;
  return caminos;
}

export async function cargarMapaRutas(): Promise<string[]> {
  if (caminos.length) return caminos;
  for (const [ruta, cfg] of ESQUEMAS) {
    try {
      const r = await api.get(ruta, cfg);
      if (validar(r?.data)) return adoptar(r.data.paths, `openapi@${ruta}`);
    } catch { /* probamos la siguiente ubicación */ }
  }
  return caminos;   // vacío: caemos a las candidatas manuales
}

export function hayMapa(): boolean { return caminos.length > 0; }

export function origenMapa(): string { return origen || '—'; }

// ¿El backend responde de verdad ese método en esa ruta?
function opera(patron: string, metodo: string): boolean {
  const nodo = mapa[patron];
  return !!(nodo && (nodo[metodo] || nodo[metodo.toLowerCase()] || nodo[metodo.toUpperCase()]));
}

// Primera ruta real que matchee algún regex (en orden) con ese método.
// maxParams: máximo de {params} permitidos en la ruta (0 = rutas fijas).
export function buscarRuta(metodo: string, regexes: RegExp[], maxParams = 0): string | null {
  if (!caminos.length) return null;
  for (const re of regexes) {
    for (const p of caminos) {
      const params = (p.match(/\{[^}]+\}/g) ?? []).length;
      if (params > maxParams) continue;
      if (!re.test(p.toLowerCase()) || !opera(p, metodo)) continue;
      return p;
    }
  }
  return null;
}

// Reemplaza los {params} de un patrón con valores en orden de aparición
export function conParams(patron: string, valores: (string | number)[]): string {
  let i = 0;
  return patron.replace(/\{[^}]+\}/g, () => encodeURIComponent(String(valores[i++] ?? '')));
}

// Todas las rutas reales de un método (para el diagnóstico)
export function rutasDe(metodo: string): string[] {
  return caminos.filter(p => opera(p, metodo));
}