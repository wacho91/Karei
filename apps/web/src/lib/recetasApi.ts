// recetasApi.ts v3 — menú: primero rutas reales (mapa openapi), luego candidatas
import { api, textoError } from './http';
import { cargarMapaRutas, buscarRuta, conParams, hayMapa, origenMapa } from './rutas';
import type { Receta } from './tipos';

const RUTAS = ['/recetas', '/recipes', '/pos/recetas', '/pos/recipes', '/pos/menu', '/menu',
  '/products', '/productos', '/pos/products', '/dishes', '/platos', '/pos/dishes',
  '/carta', '/catalogo', '/menu-items', '/items', '/pos/items', '/catalog', '/menus', '/recipe'];

const PATRONES = [/recipe/, /receta/, /menu/, /carta/, /product/, /dish/, /plato/,
  /catalog/, /comida/, /platillo/, /item/];

function campo(o: any, ...ks: string[]) {
  for (const k of ks) { const v = o?.[k]; if (v !== undefined && v !== null && v !== '') return v; }
  return undefined;
}

export function normalizarReceta(r: any): Receta {
  return {
    id: campo(r, 'id', 'recipe_id', '_id', 'uuid') ?? 0,
    nombre: campo(r, 'nombre', 'name', 'title', 'titulo') ?? 'Ítem',
    precio: Number(campo(r, 'precio', 'price', 'sale_price', 'valor', 'amount') ?? 0) || 0,
    categoria: campo(r, 'categoria', 'category', 'cat') ?? 'General',
  } as unknown as Receta;
}

// Solo acepta arrays de objetos (descarta listas de texto o categorías)
function extraer(x: any, prof = 0): any[] | null {
  if (prof > 3 || x == null) return null;
  if (Array.isArray(x)) return (x.length && x.every(i => i && typeof i === 'object')) ? x : null;
  if (typeof x !== 'object') return null;
  for (const k of ['items', 'recipes', 'productos', 'products', 'dishes', 'platos', 'menu', 'carta', 'results', 'data']) {
    const v = (x as any)[k];
    if (Array.isArray(v) && v.length && typeof v[0] === 'object') return v;
  }
  for (const v of Object.values(x)) {
    const hallada = Array.isArray(v) && v.length ? extraer(v, prof + 1) : null;
    if (hallada) return hallada;
  }
  return null;
}

// Prueba las rutas reales del mapa. [] = menú verificado vacío (200 sin items)
async function probarMapa(): Promise<Receta[] | null> {
  await cargarMapaRutas();
  if (!hayMapa()) return null;
  let vacia = false;
  for (const re of PATRONES) {
    const patron = buscarRuta('get', [re], 0);
    if (!patron) continue;
    try {
      const r = await api.get(conParams(patron, []));
      const lista = extraer(r?.data);
      if (lista?.length) return lista.map(normalizarReceta);
      if (r?.status === 200) vacia = true;
    } catch { /* siguiente ruta */ }
  }
  return vacia ? [] : null;
}

// Plan B: candidatas manuales (200 = verdad definitiva aunque venga vacío)
async function probarRutas(): Promise<Receta[]> {
  let ultimo = '';
  for (const ruta of RUTAS) {
    try {
      const r = await api.get(ruta);
      if (r?.status === 200) {
        const lista = extraer(r?.data);
        return lista?.length ? lista.map(normalizarReceta) : [];
      }
    } catch (e: any) {
      ultimo = textoError(e);
      if (e?.response?.status !== 404) break;
    }
  }
  throw new Error(ultimo || 'No se halló ruta para el menú');
}

export async function traerRecetas(): Promise<Receta[]> {
  const delMapa = await probarMapa();
  if (delMapa) return delMapa;
  try { return await probarRutas(); }
  catch (e: any) {
    const mapaTxt = hayMapa() ? `mapa sí (${origenMapa()})` : 'mapa no alcanzable';
    throw new Error(`${e?.message ?? e} · ${mapaTxt}`);
  }
}

export const traerMenu = traerRecetas;   // alias por compatibilidad