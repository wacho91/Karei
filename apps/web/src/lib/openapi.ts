// Lee /openapi.json (FastAPI lo genera solo) y descubre las rutas REALES del backend.
// Así el frontend se adapta solo y nunca más adivinamos rutas ni campos.
import axiosLib from 'axios';
import * as apiModule from './api';

const api: any =
  (apiModule as any).default ?? (apiModule as any).api ?? (apiModule as any).axios ?? axiosLib.create({ baseURL: '/api/v1' });

export interface EspecBackend {
  cargada: boolean;
  doc: any;
  rutas: { metodo: string; ruta: string }[];
  esquemas: Record<string, any>;
}

let espec: EspecBackend | null = null;

function sinPrefijo(ruta: string): string {
  return ruta.replace(/^\/api\/v1/, '').replace(/^\/api/, '') || '/';
}

export function escaparRegex(t: string): string {
  return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function pedirDoc(): Promise<any | null> {
  const intentos = [
    () => axiosLib.get('/openapi.json'),
    () => api.get('/openapi.json'),
    () => axiosLib.get('/api/openapi.json'),
    () => axiosLib.get('/api/v1/openapi.json'),
  ];
  for (const pedir of intentos) {
    try {
      const r = await pedir();
      if (r?.data?.paths) return r.data;
    } catch { /* siguiente intento */ }
  }
  return null;
}

export async function cargarEspec(): Promise<EspecBackend> {
  if (espec) return espec;
  const doc = await pedirDoc();
  if (!doc) return { cargada: false, doc: null, rutas: [], esquemas: {} }; // sin cachear: reintenta luego

  const rutas: { metodo: string; ruta: string }[] = [];
  for (const [ruta, metodos] of Object.entries<any>(doc.paths ?? {})) {
    for (const metodo of Object.keys(metodos)) {
      if (['get', 'post', 'put', 'patch', 'delete'].includes(metodo)) {
        rutas.push({ metodo: metodo.toUpperCase(), ruta: sinPrefijo(ruta) });
      }
    }
  }
  espec = { cargada: true, doc, rutas, esquemas: doc.components?.schemas ?? {} };
  return espec;
}

/** Primera ruta del backend que coincida con método + regex. */
export async function buscarRuta(metodo: string, patron: RegExp): Promise<string | null> {
  const e = await cargarEspec();
  if (!e.cargada) return null;
  return e.rutas.find(r => r.metodo === metodo && patron.test(r.ruta))?.ruta ?? null;
}

/** Reemplaza {cualquierParametro} de una plantilla por el valor. */
export function armar(ruta: string, valor: number | string): string {
  return ruta.replace(/\{[^}]+\}/g, encodeURIComponent(String(valor)));
}

/** Esquema del body JSON que espera una ruta (resuelve $ref). */
export async function esquemaDeCuerpo(metodo: string, patron: RegExp): Promise<any | null> {
  const e = await cargarEspec();
  if (!e.cargada || !e.doc) return null;
  for (const [ruta, ops] of Object.entries<any>(e.doc.paths ?? {})) {
    if (!patron.test(sinPrefijo(ruta))) continue;
    const op = ops?.[metodo.toLowerCase()];
    if (!op) continue;
    const s = op?.requestBody?.content?.['application/json']?.schema;
    if (s?.$ref) return e.esquemas[s.$ref.split('/').pop()] ?? s;
    return s ?? null;
  }
  return null;
}

/** Lista de rutas del backend para el diagnóstico (una línea por ruta). */
export async function resumenEspec(): Promise<string[]> {
  const e = await cargarEspec();
  if (!e.cargada) return ['openapi.json NO accesible — revisa que http://localhost:8000/docs abra bien'];
  const lineas = [`openapi cargado: ${e.rutas.length} rutas en total`];
  const interes = /(pos|order|pedido|comanda|table|mesa|kitchen|cocina|recipe|receta|product|menu|pay|cobr|cuenta|account|item)/i;
  for (const r of e.rutas) {
    if (interes.test(r.ruta)) lineas.push(`${r.metodo.padEnd(6)} ${r.ruta}`);
  }
  return lineas;
}