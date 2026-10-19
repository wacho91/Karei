// Kārei · menú de recetas: rutas candidatas + caché solo con datos
import { api, primerArray, textoError } from './http';
import { campo, num } from './tipos';
import type { Receta } from './tipos';

const RUTAS = [
  '/recetas', '/recipes', '/pos/recetas', '/pos/recipes',
  '/pos/menu', '/menu', '/products', '/productos',
  '/pos/products', '/dishes', '/platos', '/pos/dishes',
  '/carta', '/catalogo',
];

const normalizar = (r: any): Receta => ({
  id: Number(campo(r, 'id', 'recipe_id', 'receta_id', 'product_id', 'producto_id') ?? 0),
  nombre: String(campo(r, 'nombre', 'name', 'titulo', 'title', 'description') ?? 'Ítem'),
  precio: num(campo(r, 'precio', 'price', 'precio_venta', 'sale_price', 'amount')),
});

let cache: Receta[] | null = null;

export const traerRecetas = async (forzar = false): Promise<Receta[]> => {
  if (cache && !forzar) return cache;
  let ultimo = '';
  for (const ruta of RUTAS) {
    try {
      const r = await api.get(ruta);
      const d = r?.data;
      // Ruta viva: respuesta definitiva (aunque venga vacía).
      const esLista = Array.isArray(d) || Array.isArray(d?.items) || primerArray(d).length > 0;
      if (esLista) {
        const lista = primerArray(d).map(normalizar);
        cache = lista.length ? lista : null; // no cacheamos vacíos
        return lista;
      }
      ultimo = `${ruta}: formato raro ${JSON.stringify(d)?.slice(0, 60)}`;
    } catch (e: any) {
      ultimo = `${ruta}: ${textoError(e)}`;
      if (e?.response?.status !== 404) break; // 404 = siguiente candidata
    }
  }
  throw new Error(ultimo || 'No se pudo cargar el menú');
};