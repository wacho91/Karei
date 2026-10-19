// Kārei · menú de recetas con rutas candidatas y caché en memoria
import { api, primerArray, textoError } from './http';
import { campo, num } from './tipos';
import type { Receta } from './tipos';

const RUTAS = [
  '/recetas', '/recipes', '/pos/menu', '/menu', '/pos/recetas',
  '/products', '/productos', '/pos/products', '/dishes', '/platos',
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
      const lista = primerArray(r?.data).map(normalizar).filter((x: Receta) => x.id > 0);
      if (lista.length) {
        cache = lista;
        return cache;
      }
      ultimo = `${ruta}: sin ítems`;
    } catch (e: any) {
      ultimo = `${ruta}: ${textoError(e)}`;
    }
  }
  throw new Error(ultimo || 'No se pudo cargar el menú');
};