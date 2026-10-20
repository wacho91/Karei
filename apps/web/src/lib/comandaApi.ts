/* ============================================================================
 * Kārei · lib/comandaApi.ts — v5 "FLUJO MESA-CÉNTRICO REAL" (E-13)
 * ----------------------------------------------------------------------------
 * MAPA CONFIRMADO del backend (openapi.json + logs del 20-oct):
 *   POST /api/v1/pos/tables/{table_id}/open     → ABRE la mesa (sesión)
 *   POST /api/v1/pos/tables/{table_id}/items    → agrega ítems (422 = schema)
 *   POST /api/v1/pos/orders/{order_id}/send     → manda comanda a cocina
 *   POST /api/v1/pos/orders/{order_id}/advance  → avanza estado (KDS)
 *   POST /api/v1/pos/tables/{table_id}/checkout → cierra/cobra la mesa
 *   GET  /api/v1/pos/tables/{table_id}/order    → pedido actual (200 OK ✓)
 *   GET  /api/v1/pos/kitchen/orders             → comandas para cocina
 *   ⚠ NO existen POST /pos/orders ni POST /pos/tables/{id}/orders (404 real).
 *
 * Qué cambia en v5:
 *   1. El body de cada POST se CONSTRUYE con el schema real del openapi
 *      (components.schemas) → ya no se adivina EN/ES a ciegas (adiós 422).
 *   2. ABRE la mesa con POST /tables/{id}/open antes de agregar ítems.
 *   3. MANDA a cocina con POST /orders/{oid}/send tras tener orderId real.
 *   4. Si un 422 persiste, el error muestra el DETALLE exacto del backend
 *      (campo faltante) → pegar el modal y clavarlo en la siguiente ronda.
 *   5. Anti-duplicados: reenvíos tras fallo parcial no repiten ítems ya en
 *      el pedido (compara cantidades contra GET /tables/{id}/order).
 *   6. Exports blindados multi-nombre (default + named) anti-E-7b.
 * ========================================================================= */

/* ───────────────────────── 1. BASE HTTP ───────────────────────── */

const norm = (s: any) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

function basesPosibles(): string[] {
  const out: string[] = [];
  try {
    const ls = typeof localStorage !== 'undefined' ? localStorage.getItem('karei_api_base') : null;
    if (ls) out.push(ls);
    const env = (import.meta as any)?.env?.VITE_API_URL;
    if (env) out.push(String(env));
  } catch { /* noop */ }
  out.push('http://localhost:8000', 'http://127.0.0.1:8000');
  return Array.from(new Set(out.map((b) => b.replace(/\/+$/, ''))));
}

let BASE_CACHE: string | null = null;

async function apiBase(): Promise<string> {
  if (BASE_CACHE) return BASE_CACHE;
  const candidatos = basesPosibles();
  for (const b of candidatos) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 2500);
      const r = await fetch(`${b}/api/v1/pos/tables`, { signal: ctrl.signal });
      clearTimeout(t);
      if (r.status < 500) { BASE_CACHE = b; return b; }
    } catch { /* siguiente candidato */ }
  }
  BASE_CACHE = candidatos[0];
  return BASE_CACHE;
}

type Res = { status: number; json: any; text: string };

async function req(metodo: string, ruta: string, body?: any, timeoutMs = 9000): Promise<Res> {
  const b = await apiBase();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${b}${ruta}`, {
      method: metodo,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const text = await r.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    return { status: r.status, json, text };
  } finally {
    clearTimeout(t);
  }
}

/** Extrae el detalle de validación de FastAPI: {"detail":[{"loc":[...],"msg":...}]} */
function detalleError(r: Res): string {
  const d = r.json?.detail;
  if (Array.isArray(d)) {
    return d
      .map((x: any) => `${(x.loc || []).filter((p: any) => p !== 'body').join('.')}: ${x.msg ?? x.type ?? 'inválido'}`)
      .join(' | ');
  }
  if (typeof d === 'string') return d;
  if (r.json && typeof r.json === 'object') {
    try {
      const s = JSON.stringify(r.json);
      return s.length > 200 ? `${s.slice(0, 200)}…` : s;
    } catch { return ''; }
  }
  return r.text ? r.text.slice(0, 150) : '';
}

/* ───────────────────────── 2. OPENAPI / RUTAS ───────────────────────── */

let OAS: any = null;
let OAS_T = 0;

async function openapi(force = false): Promise<any> {
  if (OAS && !force && Date.now() - OAS_T < 60_000) return OAS;
  try {
    const b = await apiBase();
    const r = await fetch(`${b}/openapi.json`);
    if (r.ok) { OAS = await r.json(); OAS_T = Date.now(); }
  } catch { /* sin openapi → fallbacks manuales */ }
  return OAS;
}

/** El openapi puede traer paths con o sin el prefijo /api/v1 → se detecta 1 vez. */
let PREFIJO: string | null = null;
function prefijoDe(oas: any): string {
  if (PREFIJO !== null) return PREFIJO;
  const claves = Object.keys(oas?.paths ?? {});
  PREFIJO = claves.some((p) => p.startsWith('/api/')) ? '' : '/api/v1';
  return PREFIJO;
}

function rutasPost(oas: any, filtro: (p: string) => boolean): string[] {
  if (!oas?.paths) return [];
  return Object.keys(oas.paths).filter((p) => oas.paths[p]?.post && filtro(norm(p)));
}

function rutasDelete(oas: any, filtro: (p: string) => boolean): string[] {
  if (!oas?.paths) return [];
  return Object.keys(oas.paths).filter((p) => oas.paths[p]?.delete && filtro(norm(p)));
}

function conParams(ruta: string, params: { tableid?: string; orderid?: string; itemid?: string }): string {
  return String(ruta).replace(/\{([^}]+)\}/g, (_m, nombre) => {
    const n = norm(nombre);
    if (params.tableid && /table|mesa/.test(n)) return params.tableid;
    if (params.orderid && /order|pedido|comanda/.test(n)) return params.orderid;
    if (params.itemid && /item|linea|producto/.test(n)) return params.itemid;
    return params.tableid || params.orderid || params.itemid || '';
  });
}

/* ───────────────────────── 3. SCHEMA-GUIDED BODY ───────────────────────── */

function resolver(oas: any, sch: any, d = 0): any {
  if (!sch || !oas || d > 6) return sch;
  if (sch.$ref) {
    const nombre = String(sch.$ref).replace('#/components/schemas/', '');
    return resolver(oas, oas?.components?.schemas?.[nombre], d + 1);
  }
  return sch;
}

function bodySchemaDe(oas: any, ruta: string): any {
  const rb = oas?.paths?.[ruta]?.post?.requestBody?.content?.['application/json']?.schema;
  return rb ? resolver(oas, rb) : null;
}

const SINONIMOS: Record<string, string[]> = {
  receta: ['recipeid', 'recetaid', 'productid', 'productoid', 'menuitemid', 'itemid', 'menuitem', 'receta', 'producto', 'platilloid', 'dishid', 'recipe', 'id'],
  cantidad: ['quantity', 'cantidad', 'qty', 'cant', 'units', 'unidades', 'count'],
  precio: ['price', 'unitprice', 'precio', 'preciounitario', 'saleprice', 'valor', 'amount', 'preciounit'],
  notas: ['notes', 'note', 'nota', 'notas', 'observaciones', 'comment', 'comentario', 'especificaciones', 'specs', 'indicaciones'],
  nombre: ['name', 'nombre', 'productname', 'nombreproducto', 'itemname', 'nombreitem', 'title', 'titulo'],
  comensales: ['guestcount', 'guests', 'comensales', 'pax', 'personas', 'covers'],
  cliente: ['customername', 'cliente', 'clientname', 'nombrecliente', 'customer'],
  canal: ['channel', 'canal', 'origen', 'source'],
  mesa: ['tableid', 'mesaid', 'table', 'mesa', 'idmesa'],
  metodo: ['method', 'metodo', 'paymentmethod', 'metodopago', 'pago'],
  propina: ['tip', 'propina', 'tipamount'],
};

function fuenteDe(prop: string, fuentes: any[]): any {
  const p = norm(prop);
  for (const f of fuentes) {
    if (!f || typeof f !== 'object') continue;
    for (const k of Object.keys(f)) {
      if (norm(k) === p) {
        const v = f[k];
        if (v !== undefined && v !== null && v !== '') return v;
      }
    }
  }
  for (const lista of Object.values(SINONIMOS)) {
    if (!lista.includes(p)) continue;
    for (const alt of lista) {
      for (const f of fuentes) {
        if (!f || typeof f !== 'object') continue;
        for (const k of Object.keys(f)) {
          if (norm(k) === alt) {
            const v = f[k];
            if (v !== undefined && v !== null && v !== '') return v;
          }
        }
      }
    }
    break;
  }
  return undefined;
}

function defaultPorTipo(tipo: any, prop: string): any {
  const p = norm(prop);
  if (tipo === 'integer') return /guest|comensal|pax|persona|cantidad|quantity|qty/.test(p) ? 1 : 0;
  if (tipo === 'number') return 0;
  if (tipo === 'boolean') return false;
  if (tipo === 'array') return [];
  if (tipo === 'object') return {};
  return '';
}

function coercer(v: any, sp: any): any {
  if (sp?.type === 'integer') { const n = Math.round(Number(v)); return Number.isFinite(n) && n > 0 ? n : 1; }
  if (sp?.type === 'number') { const n = Number(v); return Number.isFinite(n) ? n : 0; }
  if (sp?.type === 'string') return String(v ?? '');
  if (sp?.type === 'boolean') return Boolean(v);
  return v;
}

/** Body de UN item según su schema (sin arrays anidados). */
function construirPlano(oas: any, schema: any, fuente: any): any {
  const s = resolver(oas, schema);
  if (!s?.properties) return null;
  const reqArr: string[] = s.required || [];
  const out: any = {};
  for (const [prop, pSch] of Object.entries<any>(s.properties)) {
    const sp = resolver(oas, pSch);
    if (sp?.type === 'array' || sp?.items) continue;
    let v = fuenteDe(prop, [fuente]);
    if (v === undefined) {
      if (!reqArr.includes(prop)) continue;
      v = defaultPorTipo(sp?.type, prop);
    }
    out[prop] = coercer(v, sp);
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Construye el body de una ruta POST usando el schema del openapi.
 * - Si el schema envuelve items en un array ({items:[...]}) mapea todos.
 * - Si el schema es un item plano → devuelve {plano:true} (1 llamada por item).
 */
function construirBody(oas: any, ruta: string, items: any[], extras: any): { body: any; plano: boolean } | null {
  const s = resolver(oas, bodySchemaDe(oas, ruta));
  if (!s?.properties) return null;
  const reqArr: string[] = s.required || [];
  const props = s.properties as Record<string, any>;

  const propArr = Object.keys(props).find((p) => {
    const sp = resolver(oas, props[p]);
    return (sp?.type === 'array' || !!sp?.items) && !/note|comment|observ|especif/.test(norm(p));
  });

  const out: any = {};
  if (propArr) {
    const itemSchema = resolver(oas, resolver(oas, props[propArr]).items);
    out[propArr] = (items || [])
      .map((it) => construirPlano(oas, itemSchema, it))
      .filter(Boolean);
  }

  for (const [prop, pSch] of Object.entries<any>(props)) {
    if (prop === propArr) continue;
    const sp = resolver(oas, pSch);
    if (sp?.type === 'array' || sp?.items) continue;
    let v = fuenteDe(prop, [extras, items?.[0]]);
    if (v === undefined) {
      if (!reqArr.includes(prop)) continue;
      v = defaultPorTipo(sp?.type, prop);
    }
    out[prop] = coercer(v, sp);
  }

  const itemish = ['recipeid', 'productid', 'itemid', 'quantity', 'cantidad', 'qty', 'price', 'precio', 'name', 'nombre'];
  const plano = !propArr && Object.keys(props).some((p) => itemish.includes(norm(p)));
  return { body: out, plano };
}

/* ───────────────────────── 4. PEDIDO ACTUAL / IDS ───────────────────────── */

function extraerId(json: any, depth = 0): string | null {
  if (json == null || depth > 3) return null;
  if (typeof json === 'string') return json.length >= 8 ? json : null;
  if (typeof json === 'number') return String(json);
  if (Array.isArray(json)) return json.length ? extraerId(json[0], depth + 1) : null;
  if (typeof json === 'object') {
    for (const k of ['order_id', 'orderId', 'id_pedido', 'pedido_id', 'id']) {
      const v = json[k];
      if (typeof v === 'string' && v) return v;
      if (typeof v === 'number') return String(v);
    }
    for (const k of ['order', 'pedido', 'data', 'session', 'result']) {
      const sub = extraerId(json[k], depth + 1);
      if (sub) return sub;
    }
  }
  return null;
}

/** GET /pos/tables/{id}/order — ruta CONFIRMADA (200) que devuelve el pedido abierto. */
async function buscarOrderId(mesa: string, intentos: string[]): Promise<string | null> {
  try {
    const r = await req('GET', `/api/v1/pos/tables/${mesa}/order`);
    if (r.status >= 200 && r.status < 300) {
      const id = extraerId(r.json);
      if (id) { intentos.push(`GET /tables/{id}/order → pedido ${id.slice(0, 8)} ✓`); return id; }
      intentos.push('GET /tables/{id}/order → 200 sin pedido (mesa sin comanda)');
    } else {
      intentos.push(`GET /tables/{id}/order → ${r.status}`);
    }
  } catch (e: any) {
    intentos.push(`GET /tables/{id}/order ✗ ${e?.message ?? e}`);
  }
  return null;
}

/** Evita duplicados en reenvíos: compara cantidades del borrador vs pedido abierto. */
async function filtrarDuplicados(mesa: string, orderId: string | null, items: any[]): Promise<any[]> {
  if (!orderId || !items.length) return items;
  try {
    const r = await req('GET', `/api/v1/pos/tables/${mesa}/order`);
    const pedido = Array.isArray(r.json) ? r.json[0] : r.json;
    const lineas = pedido?.items ?? pedido?.lines ?? pedido?.lineas ?? pedido?.order_items ?? [];
    if (!Array.isArray(lineas) || !lineas.length) return items;
    const cantidades = new Map<string, number>();
    for (const l of lineas) {
      const clave = norm(l?.recipe_id ?? l?.receta_id ?? l?.product_id ?? l?.name ?? l?.nombre);
      const cant = Number(l?.quantity ?? l?.cantidad ?? l?.qty ?? 1) || 1;
      cantidades.set(clave, (cantidades.get(clave) ?? 0) + cant);
    }
    const faltantes: any[] = [];
    for (const i of items) {
      const clave = norm(i.recipe_id) || norm(i.name);
      const ya = cantidades.get(clave) ?? 0;
      if (i.cantidad > ya) faltantes.push({ ...i, cantidad: i.cantidad - ya });
      cantidades.set(clave, ya);
    }
    return faltantes;
  } catch { return items; }
}

/* ───────────────────────── 5. NORMALIZACIÓN DE ARGUMENTOS ───────────────────────── */

function esUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
    || /^[0-9a-f]{16,32}$/i.test(v);
}

function normItem(i: any): any {
  if (!i || typeof i !== 'object') return null;
  const num = (v: any, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
  const recipeId = i.recipe_id ?? i.receta_id ?? i.product_id ?? i.producto_id ?? i.menu_item_id ?? i.item_id ?? i.id;
  return {
    recipe_id: recipeId != null ? String(recipeId) : '',
    name: String(i.name ?? i.nombre ?? i.producto ?? i.product_name ?? ''),
    price: num(i.price ?? i.precio ?? i.unit_price ?? i.precio_unitario),
    cantidad: Math.max(1, num(i.cantidad ?? i.quantity ?? i.qty, 1)),
    notes: String(i.notes ?? i.nota ?? i.especificaciones ?? i.observaciones ?? ''),
    // id de la LÍNEA dentro del pedido (para restar) — distinto del recipe_id
    _linea_id: i.item_id ?? i.linea_id ?? i.line_id ?? (i.recipe_id ? undefined : i.id),
  };
}

/** Acepta (mesa, items) | (mesa, orderId, items) | ({table_id, items}) | ({order_id}) … */
function desglosarArgs(args: any[]): { mesa: string | null; orderId: string | null; items: any[] } {
  let mesa: string | null = null;
  let orderId: string | null = null;
  let items: any[] = [];
  const pushItem = (o: any) => { const n = normItem(o); if (n && n.recipe_id) items.push(n); };
  for (const a of args) {
    if (a == null) continue;
    if (Array.isArray(a)) { a.forEach((x) => (Array.isArray(x) ? x.forEach(pushItem) : pushItem(x))); continue; }
    if (typeof a === 'string' || typeof a === 'number') {
      const s = String(a);
      if (esUuid(s)) { if (!mesa) mesa = s; else if (!orderId) orderId = s; }
      else if (!mesa) mesa = s;
      continue;
    }
    if (typeof a === 'object') {
      const oid = a.order_id ?? a.orderId ?? a.id_pedido ?? a.pedido_id;
      const mid = a.table_id ?? a.mesa_id ?? a.mesaId ?? a.idMesa;
      if (mid) {
        if (!mesa) mesa = String(mid);
        if (oid && !orderId) orderId = String(oid);
        if (a.items) { (Array.isArray(a.items) ? a.items : [a.items]).forEach(pushItem); continue; }
        continue;
      }
      if (oid && !orderId) { orderId = String(oid); continue; }
      const pareceMesa = a.capacity != null || a.zone != null || a.status != null || a.qr_code != null || a.code != null;
      const pareceItem = a.recipe_id != null || a.receta_id != null || a.price != null || a.precio != null
        || a.cantidad != null || a.quantity != null || a.name != null || a.nombre != null;
      if (pareceItem && !pareceMesa) { pushItem(a); continue; }
      if (pareceMesa) { if (!mesa && (a.id ?? a.table_id)) mesa = String(a.id ?? a.table_id); continue; }
      if (a.id && !mesa) { mesa = String(a.id); continue; }
      pushItem(a);
    }
  }
  return { mesa, orderId, items };
}

/* ───────────────────────── 6. PASOS DEL FLUJO ───────────────────────── */

const AVANZAR = [400, 401, 403, 404, 405, 409, 422];

/** PASO ABRIR: POST /pos/tables/{id}/open (o variantes session/abrir/ocupar). */
async function abrirMesaInterna(oas: any, mesa: string, intentos: string[]): Promise<Res | null> {
  const rutas = rutasPost(oas, (p) => /table|mesa/.test(p) && /open|abrir|session|sesion|ocupar/.test(p));
  if (!rutas.length) { intentos.push('open: backend sin ruta de apertura'); return null; }
  const extras = { table_id: mesa, guest_count: 1 };
  for (const ruta of rutas) {
    const real = prefijoDe(oas) + conParams(ruta, { tableid: mesa });
    const variantes: any[] = [];
    const bs = construirBody(oas, ruta, [], extras);
    if (bs?.body) variantes.push(bs.body);
    variantes.push({}, { guest_count: 1 }, { guests: 1 }, { comensales: 1 });
    const vistas = new Set<string>();
    for (const body of variantes) {
      const k = JSON.stringify(body);
      if (vistas.has(k)) continue;
      vistas.add(k);
      try {
        const r = await req('POST', real, body);
        if (r.status < 300 || r.status === 204 || r.status === 409) {
          intentos.push(`POST ${ruta} → ${r.status} ✓ (mesa abierta)`);
          return r;
        }
        if (AVANZAR.includes(r.status)) {
          const d = detalleError(r);
          intentos.push(`POST ${ruta} ${k.slice(0, 60)} → ${r.status}${d ? `: ${d}` : ''}`);
          continue;
        }
        return null; // 5xx: backend caído
      } catch (e: any) {
        intentos.push(`POST ${ruta} ✗ ${e?.message ?? e}`);
      }
    }
  }
  return null;
}

/** PASO ITEMS: prueba la ruta con body schema-guided y fallbacks manuales. */
async function probarBodies(
  oas: any,
  ruta: string,
  real: string,
  items: any[],
  extras: any,
  intentos: string[],
): Promise<Res | null> {
  const intento = async (etiqueta: string, body: any): Promise<Res | null> => {
    try {
      const r = await req('POST', real, body);
      if (r.status < 300 || r.status === 204) {
        intentos.push(`POST ${ruta} [${etiqueta}] → ${r.status} ✓`);
        return r;
      }
      const d = detalleError(r);
      intentos.push(`POST ${ruta} [${etiqueta}] → ${r.status}${d ? `: ${d}` : ''}`);
      if (!AVANZAR.includes(r.status)) throw new Error(`POST ${ruta} falló con ${r.status} (backend caído)`);
    } catch (e: any) {
      if (String(e?.message || '').startsWith('POST')) throw e;
      intentos.push(`POST ${ruta} [${etiqueta}] ✗ ${e?.message ?? e}`);
    }
    return null;
  };

  // 1) guiado por el schema real del openapi
  if (oas) {
    const bs = construirBody(oas, ruta, items, extras);
    if (bs?.body && !bs.plano) {
      const r = await intento('schema', bs.body);
      if (r) return r;
    } else if (bs?.plano) {
      const s = resolver(oas, bodySchemaDe(oas, ruta));
      let algunoOk: Res | null = null;
      for (const it of items) {
        const bodyIt = construirPlano(oas, s, { ...it, ...(extras || {}) });
        if (!bodyIt) break;
        const ok = await intento(`schema#${String(it.recipe_id).slice(0, 6)}`, bodyIt);
        if (!ok) break;
        algunoOk = ok;
      }
      if (algunoOk) return algunoOk;
    }
  }

  // 2) manuales de red de seguridad (si openapi no existiera o fallara)
  if (!oas) {
    const manualEN = { items: items.map((i) => ({ recipe_id: i.recipe_id, name: i.name, quantity: i.cantidad, unit_price: i.price, ...(i.notes ? { notes: i.notes } : {}) })) };
    let r = await intento('manual-EN', manualEN);
    if (r) return r;
    const manualES = { items: items.map((i) => ({ receta_id: i.recipe_id, nombre: i.name, cantidad: i.cantidad, precio: i.price })) };
    r = await intento('manual-ES', manualES);
    if (r) return r;
    for (const i of items) {
      r = await intento(`manual-1x#${String(i.recipe_id).slice(0, 6)}`, { recipe_id: i.recipe_id, quantity: i.cantidad, name: i.name, unit_price: i.price });
      if (r) return r;
    }
  }
  return null;
}

/** PASO AGREGAR: order-céntrica (si hay orderId) o mesa-céntrica (la confirmada). */
async function postItems(
  oas: any,
  mesa: string,
  orderId: string | null,
  items: any[],
  intentos: string[],
): Promise<Res | null> {
  if (orderId) {
    const rutas = rutasPost(oas, (p) => /order|pedido/.test(p) && /item|linea|producto/.test(p));
    for (const ruta of rutas) {
      const real = prefijoDe(oas) + conParams(ruta, { orderid: orderId, tableid: mesa });
      const r = await probarBodies(oas, ruta, real, items, { order_id: orderId, table_id: mesa }, intentos);
      if (r) return r;
    }
  }
  const rutasM = rutasPost(oas, (p) => /table|mesa/.test(p) && /item|linea|producto|order|pedido/.test(p));
  for (const ruta of rutasM) {
    const real = prefijoDe(oas) + conParams(ruta, { tableid: mesa });
    const r = await probarBodies(oas, ruta, real, items, { table_id: mesa }, intentos);
    if (r) return r;
  }
  return null;
}

/** PASO ENVIAR: POST /pos/orders/{oid}/send (o send/enviar/comanda/cocina). */
async function enviarACocina(oas: any, orderId: string, mesa: string, intentos: string[]): Promise<boolean> {
  const rutas = rutasPost(oas, (p) => /send|enviar|comanda|cocina|emit/.test(p));
  for (const ruta of rutas) {
    const real = prefijoDe(oas) + conParams(ruta, { orderid: orderId, tableid: mesa });
    const variantes: any[] = [];
    if (oas) {
      const bs = construirBody(oas, ruta, [], { order_id: orderId });
      if (bs?.body && !bs.plano) variantes.push(bs.body);
    }
    variantes.push({}, { notes: '' });
    const vistas = new Set<string>();
    for (const body of variantes) {
      const k = JSON.stringify(body);
      if (vistas.has(k)) continue;
      vistas.add(k);
      try {
        const r = await req('POST', real, body);
        if (r.status < 300 || r.status === 204) {
          intentos.push(`POST ${ruta} → ✓ (comanda en cocina)`);
          return true;
        }
        if (AVANZAR.includes(r.status)) {
          intentos.push(`POST ${ruta} → ${r.status}: ${detalleError(r)}`);
          continue;
        }
        return false;
      } catch (e: any) {
        intentos.push(`POST ${ruta} ✗ ${e?.message ?? e}`);
      }
    }
  }
  return false;
}

/* ───────────────────────── 7. API PÚBLICA ───────────────────────── */

/** Envía la comanda completa: abre mesa → agrega ítems → manda a cocina. */
export async function enviarComanda(...args: any[]): Promise<any> {
  const { mesa, orderId: oid, items: brutos } = desglosarArgs(args);
  if (!mesa) throw new Error('Kārei: no pude identificar la mesa para enviar la comanda.');
  const intentos: string[] = [];
  try {
    console.info('[Karei:comanda] enviarComanda → mesa', mesa, 'items', brutos.length);
    const oas = await openapi();
    // orderId CONFIRMADO: solo el que pasa el usuario o el que responde GET /order
    let orderId = oid || (await buscarOrderId(mesa, intentos));
    // hint de open (puede ser SESSION id, NO confiable para /orders/{id}/send)
    let hintOpen: string | null = null;

    // 1) abrir la mesa si aún no tiene pedido
    if (!orderId) {
      const rOpen = await abrirMesaInterna(oas, mesa, intentos);
      hintOpen = extraerId(rOpen?.json);
    }

    // 2) anti-duplicados solo con orderId CONFIRMADO
    let items = brutos;
    if (orderId && items.length) items = await filtrarDuplicados(mesa, orderId, items);

    // 3) agregar los ítems
    if (items.length) {
      const rItems = await postItems(oas, mesa, orderId, items, intentos);
      if (!rItems) {
        const ultimos = intentos.slice(-3).join(' || ');
        throw new Error(`No pude agregar los ${items.length} ítems al pedido. ${ultimos}`);
      }
      // la respuesta de items es la fuente MÁS confiable del orderId real
      const idNuevo = extraerId(rItems.json);
      orderId = idNuevo || orderId || (await buscarOrderId(mesa, intentos)) || hintOpen;
      if (!orderId) throw new Error('Los ítems entraron pero no pude confirmar el pedido de la mesa.');
    } else if (!orderId) {
      // comanda sin ítems nuevos: revalidar contra el backend
      orderId = (await buscarOrderId(mesa, intentos)) || hintOpen;
    }

    if (!orderId) throw new Error(`No se pudo abrir/crear el pedido de la mesa. ${intentos.join(' || ')}`);

    // 4) mandar a cocina
    const enviado = await enviarACocina(oas, orderId, mesa, intentos);
    if (!enviado) {
      const detalleSend = intentos.filter((s) => /send|cocina|comanda/.test(s)).join(' || ');
      throw new Error(`EL PEDIDO QUEDÓ CREADO (${String(orderId).slice(0, 8)}) pero faltó confirmar el envío a cocina. ${detalleSend}`);
    }
    console.info('[Karei:comanda] OK — pedido', orderId, 'mesa', mesa);
    return { ok: true, orderId, mesa };
  } catch (e: any) {
    const base = e?.message ?? String(e);
    const cola = intentos.length ? ` | Detalle: ${intentos.slice(-4).join(' || ')}` : '';
    console.error('[Karei:comanda] enviarComanda FALLÓ:', base, intentos);
    throw new Error(`No se pudo crear/enviar el pedido. ${base}${cola}`.slice(0, 950));
  }
}

/** Crea el pedido de la mesa (abre sesión si hace falta) y devuelve el orderId. */
export async function crearPedido(...args: any[]): Promise<any> {
  const { mesa, orderId: oid } = desglosarArgs(args);
  if (!mesa) throw new Error('Kārei: crearPedido necesita la mesa.');
  const intentos: string[] = [];
  const oas = await openapi();
  let orderId = oid || (await buscarOrderId(mesa, intentos));
  if (!orderId) {
    await abrirMesaInterna(oas, mesa, intentos);
    orderId = await buscarOrderId(mesa, intentos);
  }
  if (!orderId) throw new Error(`No pude crear el pedido de la mesa. ${intentos.join(' || ')}`);
  return orderId;
}

/** Abre la mesa (sesión) — la UI puede llamarla antes de agregar ítems. */
export async function abrirMesa(...args: any[]): Promise<any> {
  const { mesa } = desglosarArgs(args);
  if (!mesa) throw new Error('Kārei: abrirMesa necesita la mesa.');
  const intentos: string[] = [];
  const oas = await openapi();
  const r = await abrirMesaInterna(oas, mesa, intentos);
  if (!r) throw new Error(`No pude abrir la mesa. ${intentos.join(' || ')}`);
  return extraerId(r.json) ?? true;
}

/** Devuelve el pedido abierto de la mesa (o null). */
export async function traerPedidoMesa(...args: any[]): Promise<any> {
  const { mesa } = desglosarArgs(args);
  if (!mesa) return null;
  try {
    const r = await req('GET', `/api/v1/pos/tables/${mesa}/order`);
    if (r.status >= 200 && r.status < 300) return r.json ?? null;
  } catch { /* noop */ }
  return null;
}

/** Suma un ítem a la cuenta abierta (borra duplicados por seguridad). */
export async function sumarItemCuenta(...args: any[]): Promise<any> {
  const { mesa, orderId: oid, items } = desglosarArgs(args);
  if (!mesa && !oid) throw new Error('Kārei: sumarItemCuenta necesita mesa u orden.');
  const intentos: string[] = [];
  const oas = await openapi();
  let orderId = oid || (mesa ? await buscarOrderId(mesa, intentos) : null);
  if (!orderId && mesa) {
    await abrirMesaInterna(oas, mesa, intentos);
    orderId = await buscarOrderId(mesa, intentos);
  }
  if (!items.length) throw new Error(`Kārei: sumarItemCuenta no recibió un ítem válido. ${intentos.join(' | ')}`);
  const r = await postItems(oas, mesa ?? '', orderId, items, intentos);
  if (!r) throw new Error(`No pude agregar el producto a la cuenta. ${intentos.join(' || ')}`.slice(0, 900));
  return extraerId(r.json) ?? orderId ?? true;
}

/** Resta/quita un ítem de la cuenta (DELETE o PATCH quantity:0). */
export async function restarItemCuenta(...args: any[]): Promise<any> {
  const { mesa, orderId: oid, items } = desglosarArgs(args);
  const item = items[0];
  if (!item) throw new Error('Kārei: restarItemCuenta no recibió el ítem a quitar.');
  const intentos: string[] = [];
  const oas = await openapi();
  const orderId = oid || (mesa ? await buscarOrderId(mesa, intentos) : null);
  const itemId = String(item._linea_id ?? item.item_id ?? item.linea_id ?? '');
  const params = { orderid: orderId ?? '', tableid: mesa ?? '', itemid: itemId };

  // 1) DELETE reales del openapi
  const deletes = rutasDelete(oas, (p) => /item|linea|producto/.test(p));
  for (const ruta of deletes) {
    const real = prefijoDe(oas) + conParams(ruta, params);
    try {
      const r = await req('DELETE', real);
      if (r.status < 300 || r.status === 204) return true;
      intentos.push(`DELETE ${ruta} → ${r.status}: ${detalleError(r)}`);
    } catch (e: any) { intentos.push(`DELETE ${ruta} ✗ ${e?.message ?? e}`); }
  }
  // 2) PATCH quantity:0
  if (itemId && orderId) {
    const patches = [
      `/api/v1/pos/orders/${orderId}/items/${itemId}`,
      ...(mesa ? [`/api/v1/pos/tables/${mesa}/items/${itemId}`] : []),
    ];
    for (const p of patches) {
      try {
        const r = await req('PATCH', p, { quantity: 0 });
        if (r.status < 300 || r.status === 204) return true;
        intentos.push(`PATCH ${p} → ${r.status}: ${detalleError(r)}`);
      } catch (e: any) { intentos.push(`PATCH ${p} ✗ ${e?.message ?? e}`); }
    }
  }
  // 3) POST con quantity:0 por si el backend decrementa así
  if (orderId) {
    const r = await postItems(oas, mesa ?? '', orderId, [{ ...item, cantidad: -1 }], intentos);
    if (r) return true;
  }
  console.error('[Karei:comanda] restarItemCuenta sin ruta de borrado:', intentos);
  throw new Error(`El backend no expone borrado de ítems. ${intentos.join(' || ')}`.slice(0, 900));
}

/* ───────────────────────── 8. EXPORTS BLINDADOS ───────────────────────── */

export const agregar = sumarItemCuenta;
export const agregarItem = sumarItemCuenta;
export const sumarItem = sumarItemCuenta;
export const restarItem = restarItemCuenta;
export const enviar = enviarComanda;
export const enviarAHCocina = enviarComanda;
export const enviarComandaACocina = enviarComanda;
export const crearComanda = crearPedido;
export const crearOrden = crearPedido;
export const abrirMesaPos = abrirMesa;

const comandaApi = {
  enviarComanda,
  crearPedido,
  crearComanda,
  abrirMesa,
  traerPedidoMesa,
  sumarItemCuenta,
  restarItemCuenta,
  agregar,
  agregarItem,
  sumarItem,
  restarItem,
  enviar,
  enviarAHCocina,
};
export default comandaApi;
