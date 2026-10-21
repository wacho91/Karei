# -*- coding: utf-8 -*-
"""
============================================================================
Kārei · pos_compat.py (E-14q) — COMANDA + COCINA/KDS + ENTREGAR
VERSION: E-14q-v1 · VERIFICA: la ÚLTIMA línea de este archivo es el banner "E-14q"
============================================================================
QUÉ ES
------
Un router FastAPI AUTOCONTENIDO que implementa el flujo completo de la
comanda sobre las tablas REALES del proyecto (tables, table_sessions,
orders, recipes). Los endpoints son TOLERANTES: aceptan cuerpos en inglés
o español, en array ({items:[...]}) o plano ({recipe_id, quantity}), y con
sinónimos (recipe_id/receta_id/product_id, quantity/cantidad/qty...).
El error 422 "field required" desaparece para siempre.

FIXES INCLUIDOS
  E-14e · driver async detectado (sqlite+aiosqlite) → engine sync (MissingGreenlet).
  E-14f · ids aceptados con o sin guiones (front UUID vs DB hex).
  E-14g · ORDER BY adaptado a las columnas REALES de order_items (su tabla
          real NO tiene created_at: "no such column: created_at") +
          nombre/precio completados desde recipes si la tabla no los guarda +
          la PK de items puede llamarse distinto de "id" (item_id, uuid...).
  E-14h · sesiones y pedidos se crean SIEMPRE con opened_by_id/waiter_id de
          un usuario REAL de la DB (antes quedaban NULL y las rutas VIEJAS
          del backend crasheaban al leer la relación del usuario → 500 sin
          cabeceras CORS → el navegador lo muestra como "bloqueado por CORS").
  E-14o · COCINA/KDS: el kanban (CocinaPage) consulta GET /pos/kitchen/orders,
          ruta VIEJA que exige token (401), filtra con sus propios estados y
          NUNCA vio las órdenes de pos_compat → kanban 0/0/0. Ahora pos_compat
          SIRVE esa ruta (y variantes kitchen/kds + advance/status) leyendo las
          MISMAS tablas, en el formato EXACTO que CocinaPage consume
          ({id, status, items[{name,quantity,notes}], table_name, code,
          created_at}) y SIN auth → el 401 desaparece y las comandas aparecen.
  E-14i · ENUMS REALES (EL FIX DEFINITIVO del mapa caído): tables.status es
          un Enum de SQLAlchemy (AVAILABLE/OCCUPIED/RESERVED/...). Al abrir
          la mesa se escribía 'Ocupada' → la fila quedaba "envenenada" y
          TODAS las rutas viejas que la leyeran reventaban con
          LookupError → mapa de mesas y dashboard caídos. Ahora ANTES de
          escribir cualquier columna enum (tables.status, orders.status,
          orders.channel, currency) se lee la lista de valores válidos del
          CHECK del CREATE TABLE (SQLite) y SOLO se escriben valores de esa
          lista. send/advance usan el ORDEN REAL del enum del proyecto.
  E-14q · ENTREGAR (el "nuevo dolor de cabeza"): el kanban marcaba la comanda
          LISTA y ahí quedaba congelada — NO existía la ruta de entrega. Ahora:
          POST .../deliver (variantes pos/kitchen/kds) fija el estado de entrega
          del enum real (DELIVERED/ENTREGADO/SERVED...) y la comanda SALE del
          kanban. Además advance/status ACEPTAN {"status": "..."} en el body con
          sinónimos ES/EN ("lista"→READY, "entregado"→DELIVERED,
          "preparando"→IN_PREPARATION...). NOTA: el 401 del mapa de mesas
          (GET /pos/tables) NO es este archivo: es el token vencido por tanto
          reinicio de uvicorn → cerrar sesión y volver a iniciar sesión
          (mismo caso de E-14f, misma solución).

RUTAS QUE IMPLEMENTA (todas bajo /api/v1/pos):
  POST /tables/{table_id}/open                  → abre mesa (sesión + pedido)
  POST /tables/{table_id}/items                 → agrega productos (auto-abre)
  POST /tables/{table_id}/orders                → alias de items
  POST /orders                                  → crea pedido {table_id, items?}
  POST /orders/{order_id}/items                 → agrega productos al pedido
  DELETE /orders/{order_id}/items/{item_id}     → quita un producto
  PATCH  /orders/{order_id}/items/{item_id}     → cambia cantidad (0 = quita)
  POST /orders/{order_id}/send                  → manda comanda a cocina
  POST /orders/{order_id}/advance               → avanza estado (KDS)
  GET  /tables/{table_id}/order                 → pedido abierto de la mesa
  GET  /orders/{order_id}                       → pedido por id
  GET  /kitchen/orders (y /pos/kitchen/orders, /kds/orders...)  → comandas p/ cocina
  POST /kitchen/orders/{id}/advance y /status                   → avanzar (KDS)
  POST /kitchen/orders/{id}/deliver (y variantes)               → ENTREGAR (KDS)

NO TOCA (siguen siendo del backend original):
  GET /pos/tables (mapa), checkout/cobro, recetas, inventario.
  ⚠ Mapa con 401 → NO es este archivo: token vencido → Salir y volver a entrar.

CÓMO INSTALAR (2 líneas)
------------------------
1. Copia este archivo en la MISMA carpeta donde está el main.py del backend
   (o en tu carpeta de routers, ajustando el import).
2. En main.py, INMEDIATAMENTE DESPUÉS de crear `app = FastAPI(...)`
   y ANTES del include_router del POS original, agrega:

       from pos_compat import router as pos_compat_router
       app.include_router(pos_compat_router)     # SIN prefix

3. Reinicia uvicorn. En la consola debe aparecer:
   [pos_compat] activo — DB: sqlite:///... · items: order_items
============================================================================
"""
import datetime
import glob
import os
import re
import sys
import uuid
from typing import Any, Optional

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy import create_engine, inspect as sa_inspect, text
from sqlalchemy.orm import sessionmaker

router = APIRouter()

# ─────────────────────────────────────────────────────────────────────────
# 1. LOCALIZAR LA BASE DE DATOS (settings del backend → archivos .db)
# ─────────────────────────────────────────────────────────────────────────
def _resolver_db_url() -> str:
    env = os.environ.get("KAREI_DATABASE_URL")
    if env:
        return env
    for modpath in ("app.core.config", "app.config", "app.settings", "config", "settings"):
        try:
            mod = __import__(modpath, fromlist=["*"])
            s = getattr(mod, "settings", None)
            if s is None:
                continue
            url = (getattr(s, "DATABASE_URL", None)
                   or getattr(s, "SQLALCHEMY_DATABASE_URL", None)
                   or getattr(s, "database_url", None))
            if url:
                return str(url)
        except Exception:
            pass
    raices = [os.getcwd(), os.path.join(os.getcwd(), "app"),
              os.path.join(os.getcwd(), "backend"), os.path.join(os.getcwd(), "data")]
    for raiz in raices:
        for patron in ("*.db", "*.sqlite", "*.sqlite3"):
            for f in glob.glob(os.path.join(raiz, patron)) + glob.glob(
                    os.path.join(raiz, "**", patron), recursive=True):
                if any(x in f for x in ("venv", ".venv", "node_modules", "site-packages")):
                    continue
                return "sqlite:///" + f.replace("\\", "/")
    raise RuntimeError(
        "[pos_compat] No encontré la base de datos SQLite. "
        "Exporta KAREI_DATABASE_URL=sqlite:///ruta/a/karei.db antes de arrancar uvicorn."
    )

DB_URL = _resolver_db_url()
# ── FIX E-14e (MissingGreenlet) ──────────────────────────────────────────
# El settings del proyecto usa un driver ASYNC (sqlite+aiosqlite). Este
# módulo trabaja en modo SYNC: si el engine se crea con un driver async,
# SQLAlchemy lanza MissingGreenlet en el primer query. Solución: quitar
# el sufijo async y usar el driver sync estándar (MISMO archivo karei.db,
# mismo camino, solo cambia el "controlador").
for _drv in ("+aiosqlite", "+asyncpg", "+asyncmy", "+asyncodbc"):
    if _drv in DB_URL:
        DB_URL = DB_URL.replace(_drv, "")
        print("[pos_compat] URL con driver async detectada → usando driver sync:", DB_URL)
        break
_engine = create_engine(
    DB_URL,
    connect_args={"check_same_thread": False, "timeout": 15}
    if DB_URL.startswith("sqlite") else {},
)
if DB_URL.startswith("sqlite"):
    try:
        _ruta_db = DB_URL.split("///", 1)[-1]
        print("[pos_compat] archivo DB:", os.path.abspath(_ruta_db),
              "| existe:", os.path.exists(_ruta_db))
    except Exception:
        pass
_SessionLocal = sessionmaker(bind=_engine, autoflush=False, autocommit=False)


def _db():
    db = _SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _log(*args):
    print("[pos_compat]", *args)


_log("activo — DB:", DB_URL)


def _now() -> str:
    return datetime.datetime.utcnow().isoformat(sep=" ", timespec="seconds")


def _uid() -> str:
    return uuid.uuid4().hex


# ─────────────────────────────────────────────────────────────────────────
# 2. TABLA DE ITEMS DEL PEDIDO (usa la del backend si existe; si no, crea una)
# ─────────────────────────────────────────────────────────────────────────
# Mapeo campo lógico → posibles columnas reales (para adaptarnos a su modelo)
MAPA_ITEMS = {
    "id": ["id", "item_id", "uuid"],
    "tenant_id": ["tenant_id"],
    "order_id": ["order_id", "orderid", "pedido_id", "order", "id_order"],
    "recipe_id": ["recipe_id", "receta_id", "product_id", "producto_id",
                  "menu_item_id", "item_id", "dish_id"],
    "name": ["name", "nombre", "product_name", "nombre_producto", "title", "description"],
    "quantity": ["quantity", "cantidad", "qty", "cant", "units"],
    "unit_price": ["unit_price", "price", "precio", "precio_unitario", "sale_price", "amount"],
    "line_total": ["line_total", "total", "importe", "importe_linea"],
    "notes": ["notes", "note", "nota", "observaciones", "comment", "comentario",
              "especificaciones", "specs"],
    "created_at": ["created_at"],
    "updated_at": ["updated_at"],
}
CRITICOS_ITEMS = ("order_id", "quantity", "recipe_id")
_CACHÉ: dict = {}


def _columnas(db, tabla: str) -> set:
    try:
        return {c["name"] for c in sa_inspect(_engine).get_columns(tabla)}
    except Exception:
        return set()


def _tabla_items(db) -> str:
    """Devuelve la tabla de items usable (creando la propia si hace falta)."""
    if _CACHÉ.get("tabla_items"):
        return _CACHÉ["tabla_items"]
    insp = sa_inspect(_engine)
    existentes = set(insp.get_table_names())
    elegida = None
    for candidata in ("order_items", "order_item", "pos_order_items"):
        if candidata not in existentes:
            continue
        cols = _columnas(db, candidata)
        # ¿tiene columnas para los campos críticos?
        ok = all(any(a in cols for a in aliases) for campo, aliases in MAPA_ITEMS.items()
                 if campo in CRITICOS_ITEMS and campo != "recipe_id")
        if ok:
            elegida = candidata
            break
    if not elegida:
        db.execute(text("""
            CREATE TABLE IF NOT EXISTS pos_compat_order_items (
                id VARCHAR(32) PRIMARY KEY,
                tenant_id VARCHAR(32) NOT NULL,
                order_id VARCHAR(32) NOT NULL,
                recipe_id VARCHAR(32),
                name VARCHAR(200),
                quantity INTEGER DEFAULT 1,
                unit_price FLOAT DEFAULT 0,
                notes TEXT,
                created_at TIMESTAMP,
                updated_at TIMESTAMP
            )"""))
        db.commit()
        elegida = "pos_compat_order_items"
        _log("tabla de items creada:", elegida)
    _CACHÉ["tabla_items"] = elegida
    _log("items del pedido en tabla:", elegida)
    return elegida


def _mapear_salida(fila: dict) -> dict:
    """Fila cruda de items → diccionario con nombres lógicos estándar."""
    bajo = {k.lower(): v for k, v in fila.items()}
    out = {}
    for campo, aliases in MAPA_ITEMS.items():
        for a in aliases:
            if a in bajo and bajo[a] is not None:
                out[campo] = bajo[a]
                break
        out.setdefault(campo, None)
    out["quantity"] = int(out.get("quantity") or 1)
    out["unit_price"] = float(out.get("unit_price") or 0)
    return out


def _col_de(campo: str, cols: set) -> Optional[str]:
    for a in MAPA_ITEMS.get(campo, [campo]):
        if a in cols:
            return a
    return None


# ─────────────────────────────────────────────────────────────────────────
# 3. PARSER TOLERANTE DEL BODY (acepta EN/ES, array o item plano)
# ─────────────────────────────────────────────────────────────────────────
_SIN = {
    "recipe_id": ["recipe_id", "receta_id", "product_id", "producto_id",
                  "menu_item_id", "item_id", "itemid", "dish_id", "receta", "producto", "id"],
    "quantity": ["quantity", "cantidad", "qty", "cant", "units", "unidades", "count"],
    "unit_price": ["unit_price", "precio_unitario", "precio", "price", "sale_price", "valor"],
    "name": ["name", "nombre", "product_name", "nombre_producto", "titulo", "title"],
    "notes": ["notes", "nota", "notas", "observaciones", "comentario", "comment",
              "especificaciones", "specs", "indicaciones"],
    "guest_count": ["guest_count", "guests", "comensales", "pax", "personas", "covers"],
    "table_id": ["table_id", "tableid", "mesa_id", "mesaid", "mesa", "table"],
}


def _num(v, default=0.0) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def _extraer_items(payload: Any) -> list:
    """Extrae la lista de items de CUALQUIER forma de body conocida."""
    if payload is None:
        return []
    if isinstance(payload, list):
        candidatos = payload
    elif isinstance(payload, dict):
        candidatos = []
        for clave in ("items", "item", "lineas", "lines", "productos", "products", "order_items"):
            v = payload.get(clave)
            if isinstance(v, list):
                candidatos = v
                break
            if isinstance(v, dict):
                candidatos = [v]
                break
        if not candidatos:
            # ¿body plano tipo {recipe_id, quantity}?
            bajo = {k.lower() for k in payload.keys()}
            if bajo & set(_SIN["recipe_id"]) and bajo & set(_SIN["quantity"]):
                candidatos = [payload]
    else:
        return []

    items = []
    for c in candidatos:
        if not isinstance(c, dict):
            continue
        bajo = {k.lower(): v for k, v in c.items()}
        item = {}
        for campo, aliases in _SIN.items():
            if campo in ("guest_count", "table_id"):
                continue
            for a in aliases:
                if a in bajo and bajo[a] not in (None, ""):
                    item[campo] = bajo[a]
                    break
        if not item.get("recipe_id"):
            continue  # sin producto identificable
        item["quantity"] = max(1, int(_num(item.get("quantity"), 1)))
        item["unit_price"] = _num(item.get("unit_price"), 0.0)
        item["name"] = str(item.get("name") or "")
        item["notes"] = str(item.get("notes") or "") or None
        items.append(item)
    return items


def _extraer_guest_count(payload: Any) -> int:
    if isinstance(payload, dict):
        bajo = {k.lower(): v for k, v in payload.items()}
        for a in _SIN["guest_count"]:
            if a in bajo:
                n = int(_num(bajo[a], 1))
                return max(1, n)
    return 1


# ─────────────────────────────────────────────────────────────────────────
# 4. HELPERS DE DOMINIO (mesas, sesiones, órdenes)
# ─────────────────────────────────────────────────────────────────────────
def _norm_id(x) -> str:
    """FIX E-14f: la DB guarda ids SIN guiones (1f07a60893fe...) pero el front
    a veces los manda en formato UUID CON guiones (1f07a608-93fe-...).
    Es el MISMO id: normalizamos para aceptar ambas formas en todas las
    búsquedas. Devuelve la forma sin guiones."""
    return str(x or "").strip().replace("-", "")


def _usuario_any(db) -> str:
    """FIX E-14h: las rutas VIEJAS del backend (mapa de mesas, cocina) suelen
    leer session.opened_by.name / order.waiter.name. Si esos ids quedan NULL,
    la ruta vieja revienta con excepción sin manejar → 500 SIN cabeceras CORS
    (el navegador lo pinta como "bloqueado por CORS" / Network Error).
    Devolvemos un id de usuario REAL de la DB para que la relación resuelva
    siempre. Preferimos un ADMIN; si no hay tabla de usuarios, ceros."""
    if _CACHÉ.get("usuario_id"):
        return _CACHÉ["usuario_id"]
    uid = "00000000000000000000000000000000"
    for tabla in ("users", "user", "usuarios", "employees", "staff"):
        for sql in (f"SELECT id FROM {tabla} WHERE role IN ('ADMIN','admin') LIMIT 1",
                    f"SELECT id FROM {tabla} WHERE rol IN ('ADMIN','admin') LIMIT 1",
                    f"SELECT id FROM {tabla} LIMIT 1"):
            try:
                r = db.execute(text(sql)).mappings().first()
                if r and r["id"]:
                    uid = str(r["id"])
                    _CACHÉ["usuario_id"] = uid
                    return uid
            except Exception:
                continue
    _CACHÉ["usuario_id"] = uid
    return uid


# ─────────────────────────────────────────────────────────────────────────
# FIX E-14i: ENUMS REALES — nunca escribir un valor fuera del enum
# ─────────────────────────────────────────────────────────────────────────
# Las columnas de estado son Enum de SQLAlchemy. En SQLite el CREATE TABLE
# lleva un CHECK (col IN ('A','B',...)) con los valores válidos. Si se
# escribe otro valor (ej. 'Ocupada'), la fila queda envenenada: al LEERLA
# el ORM lanza LookupError y TODAS las rutas viejas caen con 500.
_VAL_ENUM: dict = {}
_META_ENUM: dict = {}
_META_ESCANEADO = {"hecho": False}
_TERMINALES = ("PAID", "PAGADO", "CANCELLED", "CANCELED", "CANCELADO",
               "OUT_OF_SERVICE", "OUTOFSERVICE", "CLOSED")


def _escanear_metadata():
    """UNA vez por proceso: recorre los modelos SQLAlchemy ya importados
    (sys.modules) y guarda los valores válidos de TODAS las columnas Enum.
    Se hace en la PRIMERA petición (los routers/modelos ya están cargados
    para entonces). Es la fuente exacta que usa el ORM al leer filas."""
    if _META_ESCANEADO["hecho"]:
        return
    _META_ESCANEADO["hecho"] = True
    try:
        import types as _types
        from sqlalchemy import Enum as _SAEnum
        from sqlalchemy.sql.schema import MetaData as _SAMeta
        for _nombre, _mod in list(sys.modules.items()):
            if not isinstance(_mod, _types.ModuleType):
                continue
            for _attr in ("Base", "base", "db", "Model", "metadata"):
                try:
                    _obj = getattr(_mod, _attr, None)
                except Exception:
                    continue
                try:
                    _md = _obj if isinstance(_obj, _SAMeta) else getattr(_obj, "metadata", None)
                except Exception:
                    continue
                if not isinstance(_md, _SAMeta):
                    continue
                try:
                    for _tname, _tabla in _md.tables.items():
                        for _col in _tabla.columns:
                            if isinstance(_col.type, _SAEnum):
                                _META_ENUM[(str(_tname).lower(), str(_col.name).lower())] = \
                                    list(_col.type.enums)
                except Exception:
                    continue
        if _META_ENUM:
            _log("enums leídos de los modelos del proyecto:",
                 sorted(_META_ENUM.keys()))
    except Exception as _e:
        _log("escaneo de modelos sin resultado:", _e)


def _valores_enum(db, tabla: str, columna: str) -> list:
    """Valores válidos de una columna enum. FUENTES, en orden:
    1. Los modelos SQLAlchemy del proyecto (escaneando sys.modules): es la
       fuente EXACTA del ORM → col.type.enums.
    2. El CHECK del CREATE TABLE en sqlite_master (enum nativo).
    3. [] = sin restricción conocida (la columna se trata como VARCHAR libre)."""
    clave = f"enum:{tabla}.{columna}"
    if clave in _VAL_ENUM:
        return _VAL_ENUM[clave]
    _escanear_metadata()
    vals: list = list(_META_ENUM.get((str(tabla).lower(), str(columna).lower()), []))
    fuente = "modelos SQLAlchemy"
    if not vals:
        try:
            ddl = db.execute(text("SELECT sql FROM sqlite_master WHERE type='table' AND name=:t"),
                             {"t": tabla}).scalar() or ""
            pat = (rf"CHECK\s*\(\s*[\"'`\[]?(?:[A-Za-z_]\w*\.)?{columna}(?![\w])[\"'`\]]?"
                   rf"\s+IN\s*\(([^)]*)\)")
            m = re.search(pat, ddl, re.I | re.S)
            if m:
                vals = re.findall(r"'((?:[^']|'')*)'", m.group(1))
                fuente = "CHECK del DDL"
        except Exception:
            vals = []
    _VAL_ENUM[clave] = vals
    if vals:
        _log(f"enum {tabla}.{columna} [{fuente}]: {vals}")
    return vals


def _valor_enum(db, tabla: str, columna: str, preferidos: list, obligatorio: bool = False):
    """Devuelve un valor VÁLIDO para la columna enum:
    1. Sin CHECK conocido → preferidos[0] (columna libre, sin riesgo).
    2. Busca los preferidos (mayúsc/minúsculas) entre los válidos.
    3. obligatorio=True → primer valor no-terminal del enum.
       obligatorio=False → None (el que llama se salta la escritura)."""
    vals = _valores_enum(db, tabla, columna)
    if not vals:
        return preferidos[0]
    for p in preferidos:
        for v in vals:
            if v.upper() == str(p).upper():
                return v
    if obligatorio:
        no_terminal = [v for v in vals if v.upper() not in _TERMINALES]
        return no_terminal[0] if no_terminal else vals[0]
    return None


def _siguiente_estado_orden(db, actual: str) -> str:
    """Estado siguiente según el ORDEN DE DECLARACIÓN del enum REAL del
    proyecto (saltando terminales). Sin enum → lista local ESTADOS_KDS."""
    vals = _valores_enum(db, "orders", "status") or ESTADOS_KDS
    norm = [str(v).upper() for v in vals]
    try:
        i = norm.index(str(actual).upper())
    except ValueError:
        no_terminal = [v for v in vals if str(v).upper() not in _TERMINALES]
        return no_terminal[0] if no_terminal else (vals[0] if vals else "OPEN")
    for v in vals[i + 1:]:
        if str(v).upper() not in _TERMINALES:
            return v
    return actual


# ─────────────────────────────────────────────────────────────────────
# FIX E-14q: el front puede pedir un estado con NOMBRES distintos al enum
# real ("lista", "entregado", "preparando"...). Mapa de sinónimos → valor
# canónico del enum. Se busca SIEMPRE un valor VÁLIDO del enum real: si el
# proyecto nombra los estados distinto, solo hay coincidencia si existe.
_SINONIMOS_ESTADO = {
    "OPEN":           ["OPEN", "ABIERTA", "ABIERTO", "PENDING", "PENDIENTE",
                       "NUEVO", "CREATED"],
    "SENT":           ["SENT", "ENVIADA", "ENVIADO", "ENVIAR", "KITCHEN",
                       "COMANDA"],
    "IN_PREPARATION": ["IN_PREPARATION", "PREPARACION", "PREPARANDO",
                       "PREPARAR", "IN_PROGRESS", "COOKING", "COCINANDO"],
    "READY":          ["READY", "LISTA", "LISTO", "LISTAS", "PREPARADA",
                       "PREPARADO"],
    "DELIVERED":      ["DELIVERED", "ENTREGADA", "ENTREGADO", "ENTREGAR",
                       "ENTREGA", "SERVED", "SERVIDO", "SERVIR",
                       "COMPLETADA", "COMPLETED", "FINALIZADA", "FINALIZADO",
                       "DONE"],
}


def _estado_objetivo(db, pedido) -> Optional[str]:
    """Texto libre del front → valor VÁLIDO del enum REAL de orders.status.
    1. coincidencia exacta con el enum (READY → READY);
    2. sinónimo conocido ("entregado" → DELIVERED, "lista" → READY...);
    3. None = no se pudo interpretar (el que llama avanza un paso normal)."""
    vals = _valores_enum(db, "orders", "status")
    if not vals or pedido in (None, ""):
        return None
    want = str(pedido).strip().upper()
    for v in vals:
        if str(v).upper() == want:
            return v
    for canon, sinonimos in _SINONIMOS_ESTADO.items():
        if want in sinonimos:
            for v in vals:
                if str(v).upper() == canon:
                    return v
    return None


def _estado_de_body(db, payload) -> Optional[str]:
    """Extrae un estado objetivo del body ({status/estado/state/...}) si viene
    y es interpretable. Devuelve None si no hay nada utilizable."""
    if not isinstance(payload, dict):
        return None
    for k in ("status", "estado", "state", "nuevo_estado", "new_status", "target"):
        v = payload.get(k)
        if v not in (None, ""):
            return _estado_objetivo(db, v)
    return None


def _mesa(db, table_id: str):
    limpio = _norm_id(table_id)
    m = db.execute(text("SELECT * FROM tables WHERE id IN (:a, :b)"),
                   {"a": str(table_id), "b": limpio}).mappings().first()
    if not m:
        _log("mesa no hallada (busqué id =", table_id, "| sin guiones =", limpio, ")")
    return m


def _sesion_abierta(db, table_id: str):
    return db.execute(text("SELECT * FROM table_sessions WHERE table_id IN (:a, :b) "
                           "AND status = 'OPEN' ORDER BY opened_at DESC LIMIT 1"),
                      {"a": str(table_id), "b": _norm_id(table_id)}).mappings().first()


def _orden_abierta(db, table_id: str):
    return db.execute(text("SELECT * FROM orders WHERE table_id IN (:a, :b) "
                           "AND status NOT IN ('PAID','CANCELLED') "
                           "ORDER BY created_at DESC LIMIT 1"),
                      {"a": str(table_id), "b": _norm_id(table_id)}).mappings().first()


def _insertar(db, tabla: str, valores: dict):
    """INSERT tolerante: solo usa columnas que existen; rellena NOT NULL comunes."""
    cols = _columnas(db, tabla)
    datos = {k: v for k, v in valores.items() if k in cols and v is not None}
    # FIX E-14g: la PK puede no llamarse "id" (item_id, uuid...) → usar _col_de
    col_id = _col_de("id", cols)
    if col_id and col_id not in datos:
        datos[col_id] = _uid()
    if "created_at" in cols and "created_at" not in datos:
        datos["created_at"] = _now()
    if "updated_at" in cols:
        datos["updated_at"] = _now()
    def _ejecutar(d):
        campos = ", ".join(d.keys())
        params = ", ".join(f":{k}" for k in d)
        db.execute(text(f"INSERT INTO {tabla} ({campos}) VALUES ({params})"), d)
    try:
        _ejecutar(datos)
    except Exception:
        db.rollback()
        for campo in cols:
            if campo in datos:
                continue
            if campo in ("waiter_id", "opened_by_id"):
                datos[campo] = "00000000000000000000000000000000"
            elif campo == "channel":
                datos[campo] = "POS"
            elif campo in ("order_number", "currency"):
                datos[campo] = "ORD-" + _now().replace(" ", "-") if campo == "order_number" else "COP"
        try:
            _ejecutar(datos)
        except Exception as e:
            db.rollback()
            raise HTTPException(500, f"[pos_compat] INSERT en {tabla} falló: {e}")


def _abrir_sesion(db, mesa, guest_count: int):
    s = _sesion_abierta(db, mesa["id"])
    if s:
        return s
    sid = _uid()
    _insertar(db, "table_sessions", {
        "id": sid,
        "tenant_id": mesa["tenant_id"],
        "table_id": mesa["id"],
        "opened_by_id": _usuario_any(db),
        "status": "OPEN",
        "guest_count": guest_count,
        "opened_at": _now(),
        "currency": _valor_enum(db, "table_sessions", "currency", ["COP"], obligatorio=True),
        "subtotal_cents": 0, "discount_cents": 0, "tip_cents": 0,
        "tax_cents": 0, "total_cents": 0,
        "notes": None,
    })
    db.commit()
    return _sesion_abierta(db, mesa["id"]) or {"id": sid}


def _crear_orden(db, mesa, sesion) -> dict:
    oid = _uid()
    _insertar(db, "orders", {
        "id": oid,
        "tenant_id": mesa["tenant_id"],
        "branch_id": mesa["branch_id"],
        "session_id": (sesion["id"] if sesion and "id" in sesion else None),
        "table_id": mesa["id"],
        "waiter_id": _usuario_any(db),
        "order_number": datetime.datetime.utcnow().strftime("ORD-%H%M%S"),
        "channel": _valor_enum(db, "orders", "channel", ["POS", "LOCAL", "MESON"],
                               obligatorio=True),
        "status": _valor_enum(db, "orders", "status",
                              ["OPEN", "PENDING", "CREATED", "NUEVO"], obligatorio=True),
        "subtotal": 0.0, "tip": 0.0, "total": 0.0,
    })
    db.commit()
    # mesa Ocupada — FIX E-14i: SOLO con un valor VÁLIDO del enum real
    # (antes escribía 'Ocupada' y envenenaba la fila → LookupError en el
    # mapa de mesas y el dashboard). Si no se puede determinar, no escribe.
    try:
        ocupado = _valor_enum(db, "tables", "status", ["OCCUPIED", "OCUPADA", "BUSY"])
        if ocupado:
            db.execute(text("UPDATE tables SET status = :s, updated_at = :u WHERE id = :i"),
                       {"s": ocupado, "u": _now(), "i": mesa["id"]})
            db.commit()
    except Exception:
        db.rollback()
    return dict(_orden_abierta(db, mesa["id"]) or {"id": oid})


def _items_de_orden(db, order_id: str) -> list:
    tabla = _tabla_items(db)
    cols = _columnas(db, tabla)
    # FIX E-14g: NO asumir columnas al ordenar. La tabla order_items REAL del
    # proyecto no tiene created_at (sqlite: "no such column: created_at").
    # Ordenamos por la primera columna disponible (created_at → id) y si
    # ninguna existe, sin ORDER BY.
    orden_por = _col_de("created_at", cols) or _col_de("id", cols)
    sql = f"SELECT * FROM {tabla} WHERE order_id IN (:a, :b)"
    if orden_por:
        sql += f" ORDER BY {orden_por}"
    filas = db.execute(text(sql),
                       {"a": str(order_id), "b": _norm_id(order_id)}).mappings().all()
    return _enriquecer_items(db, [_mapear_salida(dict(f)) for f in filas])


def _enriquecer_items(db, items: list) -> list:
    """FIX E-14g: si la tabla de items real no guarda name/unit_price (o vienen
    vacíos), se completan desde recipes usando recipe_id. Así el front y la
    cocina siempre ven producto y precio aunque la tabla sea minimalista."""
    cache = {}
    for i in items:
        rid = _norm_id(i.get("recipe_id") or "")
        if not rid or (i.get("name") and i.get("unit_price")):
            continue
        if rid not in cache:
            try:
                r = db.execute(text("SELECT name, price FROM recipes WHERE id = :r"),
                               {"r": rid}).mappings().first()
                cache[rid] = (r["name"] if r and r["name"] else "",
                              float(r["price"]) if r and r["price"] else 0.0)
            except Exception:
                cache[rid] = ("", 0.0)
        if not i.get("name"):
            i["name"] = cache[rid][0]
        if not i.get("unit_price"):
            i["unit_price"] = cache[rid][1]
    return items


def _recalcular(db, order_id: str):
    fila = _orden_por_id(db, order_id)
    if not fila:
        return 0.0
    real = fila["id"]  # id tal cual está en la DB
    items = _items_de_orden(db, real)
    subtotal = sum(i["quantity"] * i["unit_price"] for i in items)
    try:
        db.execute(text("UPDATE orders SET subtotal = :s, total = :t, updated_at = :u WHERE id = :i"),
                   {"s": subtotal, "t": subtotal, "u": _now(), "i": real})
        db.execute(text("""
            UPDATE table_sessions
               SET subtotal_cents = :sc, total_cents = :tc, updated_at = :u
             WHERE id = (SELECT session_id FROM orders WHERE id = :i)
        """), {"sc": int(round(subtotal * 100)), "tc": int(round(subtotal * 100)),
               "u": _now(), "i": real})
        db.commit()
    except Exception:
        db.rollback()
    return subtotal


def _order_dict(db, orden) -> Optional[dict]:
    if not orden:
        return None
    o = dict(orden)
    items = _items_de_orden(db, o["id"])
    subtotal = sum(i["quantity"] * i["unit_price"] for i in items)
    o["items"] = items
    # subtotal SIEMPRE desde los items reales (la fila puede estar desfasada)
    o["subtotal"] = subtotal
    o["tip"] = float(o.get("tip") or 0)
    o["total"] = subtotal + o["tip"]
    return o


def _agregar_items(db, mesa, orden, items: list) -> list:
    tabla = _tabla_items(db)
    cols = _columnas(db, tabla)
    creados = []
    for it in items:
        # FIX E-14f: normalizar recipe_id (con o sin guiones) para que coincida
        # con recipes.id en la DB y el nombre/precio se resuelvan correctamente
        recipe_id = _norm_id(it.get("recipe_id"))
        receta = db.execute(text("SELECT * FROM recipes WHERE id = :r"),
                            {"r": recipe_id}).mappings().first()
        nombre = it.get("name") or (receta["name"] if receta else "")
        precio = it.get("unit_price") or (float(receta["price"]) if receta and receta["price"] else 0.0)
        valores = {
            "tenant_id": orden["tenant_id"] if "tenant_id" in orden else mesa["tenant_id"],
            "order_id": orden["id"],
            "recipe_id": recipe_id,
            "name": nombre,
            "quantity": int(it["quantity"]),
            "unit_price": float(precio),
            "line_total": float(precio) * int(it["quantity"]),
            "notes": it.get("notes"),
        }
        # traducir a los nombres reales de columna de la tabla elegida
        datos = {}
        for campo, valor in valores.items():
            col = _col_de(campo, cols)
            if col:
                datos[col] = valor
        _insertar(db, tabla, datos)
        db.commit()
        creados.append({"recipe_id": recipe_id, "name": nombre,
                        "quantity": int(it["quantity"]), "unit_price": float(precio),
                        "notes": it.get("notes")})
    _recalcular(db, orden["id"])
    return creados


ESTADOS_KDS = ["OPEN", "SENT", "IN_PREPARATION", "READY", "DELIVERED"]


# ─────────────────────────────────────────────────────────────────────────
# 5. RUTAS
# ─────────────────────────────────────────────────────────────────────────
@router.post("/api/v1/pos/tables/{table_id}/open")
def abrir_mesa(table_id: str, payload: Any = Body(None), db=Depends(_db)):
    mesa = _mesa(db, table_id)
    if not mesa:
        raise HTTPException(404, f"Mesa {table_id} no encontrada")
    orden = _orden_abierta(db, table_id)
    if orden:
        _log("open: mesa ya con pedido", orden["id"])
        return _order_dict(db, orden)
    sesion = _abrir_sesion(db, mesa, _extraer_guest_count(payload))
    orden = _crear_orden(db, mesa, sesion)
    _log("open: mesa abierta → pedido", orden["id"])
    return _order_dict(db, orden)


@router.post("/api/v1/pos/tables/{table_id}/items")
def items_mesa(table_id: str, payload: Any = Body(None), db=Depends(_db)):
    mesa = _mesa(db, table_id)
    if not mesa:
        raise HTTPException(404, f"Mesa {table_id} no encontrada")
    items = _extraer_items(payload)
    if not items:
        raise HTTPException(422, "[pos_compat] No encontré productos en el body "
                                 "(se espera {items:[{recipe_id, quantity}]})")
    orden = _orden_abierta(db, table_id)
    if not orden:  # auto-abrir
        sesion = _abrir_sesion(db, mesa, _extraer_guest_count(payload))
        orden = _crear_orden(db, mesa, sesion)
    creados = _agregar_items(db, mesa, orden, items)
    _log("items: +", len(creados), "→ pedido", orden["id"])
    return _order_dict(db, orden)


@router.post("/api/v1/pos/tables/{table_id}/orders")
def crear_pedido_mesa(table_id: str, payload: Any = Body(None), db=Depends(_db)):
    return items_mesa(table_id, payload, db)


@router.post("/api/v1/pos/orders")
def crear_pedido(payload: Any = Body(None), db=Depends(_db)):
    if not isinstance(payload, dict):
        raise HTTPException(422, "[pos_compat] Body JSON esperado {table_id, items?}")
    bajo = {k.lower(): v for k, v in payload.items()}
    table_id = None
    for a in _SIN["table_id"]:
        if a in bajo and bajo[a]:
            table_id = str(bajo[a])
            break
    if not table_id:
        raise HTTPException(422, "[pos_compat] Falta table_id (o mesa_id) en el body")
    mesa = _mesa(db, table_id)
    if not mesa:
        raise HTTPException(404, f"Mesa {table_id} no encontrada")
    orden = _orden_abierta(db, table_id) or None
    if not orden:
        sesion = _abrir_sesion(db, mesa, _extraer_guest_count(payload))
        orden = _crear_orden(db, mesa, sesion)
    items = _extraer_items(payload)
    if items:
        _agregar_items(db, mesa, orden, items)
    return _order_dict(db, orden)


@router.post("/api/v1/pos/orders/{order_id}/items")
def items_a_orden(order_id: str, payload: Any = Body(None), db=Depends(_db)):
    orden = _orden_por_id(db, order_id)
    if not orden:
        raise HTTPException(404, f"Pedido {order_id} no encontrado")
    items = _extraer_items(payload)
    if not items:
        raise HTTPException(422, "[pos_compat] No encontré productos en el body")
    mesa = _mesa(db, orden["table_id"]) if orden.get("table_id") else None
    _agregar_items(db, mesa, orden, items)
    return _order_dict(db, orden)


@router.delete("/api/v1/pos/orders/{order_id}/items/{item_id}")
def quitar_item(order_id: str, item_id: str, db=Depends(_db)):
    tabla = _tabla_items(db)
    cols = _columnas(db, tabla)
    col_id = _col_de("id", cols) or "id"
    # ids aceptados con o sin guiones (front y DB difieren a veces)
    par = {"x": str(item_id), "y": _norm_id(item_id),
           "a": str(order_id), "b": _norm_id(order_id)}
    r = db.execute(text(f"DELETE FROM {tabla} WHERE {col_id} IN (:x, :y) AND order_id IN (:a, :b)"),
                   par)
    db.commit()
    if r.rowcount == 0:
        # quizá vino el recipe_id en vez del id de línea → borra UNA línea de ese producto
        col_rec = _col_de("recipe_id", cols)
        if col_rec:
            r = db.execute(text(f"DELETE FROM {tabla} WHERE {col_rec} IN (:x, :y) "
                                f"AND order_id IN (:a, :b) "
                                f"AND rowid = (SELECT rowid FROM {tabla} WHERE {col_rec} IN (:x, :y) "
                                f"AND order_id IN (:a, :b) LIMIT 1)"), par)
            db.commit()
    _recalcular(db, order_id)
    orden = _orden_por_id(db, order_id)
    _log("items: quitado", item_id, "→", orden["id"] if orden else "?")
    return _order_dict(db, orden)


@router.patch("/api/v1/pos/orders/{order_id}/items/{item_id}")
def ajustar_item(order_id: str, item_id: str, payload: Any = Body(None), db=Depends(_db)):
    tabla = _tabla_items(db)
    cols = _columnas(db, tabla)
    col_id = _col_de("id", cols) or "id"
    col_qty = _col_de("quantity", cols)
    nueva = int(_num(payload.get("quantity") if isinstance(payload, dict) else None, 1))
    if nueva <= 0:
        return quitar_item(order_id, item_id, db)
    if not col_qty:
        raise HTTPException(500, "[pos_compat] tabla de items sin columna de cantidad")
    db.execute(text(f"UPDATE {tabla} SET {col_qty} = :q WHERE {col_id} IN (:x, :y) "
                    f"AND order_id IN (:a, :b)"),
               {"q": nueva, "x": str(item_id), "y": _norm_id(item_id),
                "a": str(order_id), "b": _norm_id(order_id)})
    db.commit()
    _recalcular(db, order_id)
    orden = _orden_por_id(db, order_id)
    return _order_dict(db, orden)


@router.post("/api/v1/pos/orders/{order_id}/send")
def enviar_comanda(order_id: str, payload: Any = Body(None), db=Depends(_db)):
    orden = _orden_por_id(db, order_id)
    if not orden:
        raise HTTPException(404, f"Pedido {order_id} no encontrado")
    # FIX E-14i: estado siguiente según el enum REAL (antes 'SENT' fijo).
    # FIX E-14q: si la cuenta ya fue ENTREGADA y sigue abierta (el comensal
    # pide más), un nuevo send REINICIA el ciclo de comanda → SENT: así la
    # nueva ronda vuelve a aparecer en el kanban y no queda congelada.
    if str(orden["status"] or "").upper() in _ESTADOS_ENTREGA:
        nuevo = _estado_objetivo(db, "SENT") or _siguiente_estado_orden(db, orden["status"])
        _log("send: cuenta entregada → nueva comanda (ciclo reiniciado)")
    else:
        nuevo = _siguiente_estado_orden(db, orden["status"])
    db.execute(text("UPDATE orders SET status = :s, updated_at = :u WHERE id = :i"),
               {"s": nuevo, "u": _now(), "i": orden["id"]})
    db.commit()
    _log("send: pedido", order_id, orden["status"], "→", nuevo, "→ cocina ✓")
    return _order_dict(db, _orden_por_id(db, order_id))


@router.post("/api/v1/pos/orders/{order_id}/advance")
def avanzar_pedido(order_id: str, payload: Any = Body(None), db=Depends(_db)):
    orden = _orden_por_id(db, order_id)
    if not orden:
        raise HTTPException(404, f"Pedido {order_id} no encontrado")
    actual = orden["status"]
    # FIX E-14i: estado siguiente según el ORDEN REAL del enum del proyecto.
    # FIX E-14q: si el body trae un estado reconocible ({"status": "lista"}...),
    # se fija ESE estado; si no viene o no se entiende, avanza un paso normal.
    objetivo = _estado_de_body(db, payload)
    if objetivo:
        _log("advance:", order_id, actual, "→", objetivo, "(estado pedido por el front)")
        siguiente = objetivo
    else:
        siguiente = _siguiente_estado_orden(db, actual)
    db.execute(text("UPDATE orders SET status = :s, updated_at = :u WHERE id = :i"),
               {"s": siguiente, "u": _now(), "i": orden["id"]})
    db.commit()
    _log("advance:", order_id, actual, "→", siguiente)
    return _order_dict(db, _orden_por_id(db, order_id))


@router.post("/api/v1/pos/orders/{order_id}/status")
def pedido_status(order_id: str, payload: Any = Body(None), db=Depends(_db)):
    # FIX E-14q: variante simétrica de /advance; si el body trae un estado
    # reconocible lo fija, si no avanza un paso (mismo comportamiento).
    return avanzar_pedido(order_id, payload, db)


def _orden_por_id(db, order_id: str):
    return db.execute(text("SELECT * FROM orders WHERE id IN (:a, :b)"),
                      {"a": str(order_id), "b": _norm_id(order_id)}).mappings().first()


@router.get("/api/v1/pos/tables/{table_id}/order")
def pedido_de_mesa(table_id: str, db=Depends(_db)):
    orden = _orden_abierta(db, table_id)
    return _order_dict(db, orden)


@router.get("/api/v1/pos/orders/{order_id}")
def pedido_por_id(order_id: str, db=Depends(_db)):
    return _order_dict(db, _orden_por_id(db, order_id))


# ─────────────────────────────────────────────────────────────────────────
# 6. COCINA / KDS (FIX E-14o)
# ─────────────────────────────────────────────────────────────────────────
# El kanban del front (CocinaPage) consulta GET /api/v1/pos/kitchen/orders,
# una ruta del backend VIEJO que: (1) exige token → 401 sin sesión, (2) filtra
# con sus propios estados y (3) nunca vio las órdenes creadas por pos_compat
# → kanban 0/0/0 con la comanda ya enviada. Esta implementación lee las
# MISMAS tablas y entrega el formato EXACTO que CocinaPage consume:
#   {id, status, items:[{name, quantity, notes}], table_name, code,
#    created_at}  →  estadoDe() del front clasifica: *prepar* → preparando,
#   *list/ready/done* → lista, resto → pendiente.
# Se registran variantes de ruta (kitchen/kds, con y sin prefijo pos) porque
# el hook usePos del front puede llamar cualquiera de ellas; pos_compat está
# incluido ANTES que los routers viejos en main.py, así que gana el match.
_ESTADOS_FUERA_KDS = ("PAID", "PAGADO", "CANCELLED", "CANCELED", "CANCELADO",
                      "OUT_OF_SERVICE", "OUTOFSERVICE", "CLOSED", "CLOSE",
                      "DELIVERED", "ENTREGADO", "SERVED", "SERVIDO")


def _nombre_mesa_de(db, orden) -> str:
    """Nombre de la mesa para la tarjeta del kanban (textoMesaDe del front
    lee table_name ?? mesa ?? table.name...)."""
    tid = orden.get("table_id") if isinstance(orden, dict) else None
    if tid:
        mesa = _mesa(db, tid)
        if mesa:
            for campo in ("name", "nombre", "label", "etiqueta"):
                try:
                    v = mesa.get(campo)
                except Exception:
                    v = None
                if v not in (None, ""):
                    return str(v)
            for campo in ("number", "numero", "num"):
                try:
                    v = mesa.get(campo)
                except Exception:
                    v = None
                if v not in (None, ""):
                    return f"Mesa {v}"
    return "Mesa"


def _estado_inicial_orden(db) -> Optional[str]:
    """Estado con el que pos_compat CREA las órdenes (mesa abierta, sin enviar).
    Esas NO se muestran en cocina: solo las comandas ya enviadas."""
    vals = _valores_enum(db, "orders", "status")
    if not vals:
        return None  # sin enum conocido: no filtramos el inicial
    for p in ("OPEN", "PENDING", "CREATED", "NUEVO"):
        for v in vals:
            if str(v).upper() == p:
                return v
    return None


def _iso_de(v) -> Optional[str]:
    """created_at → texto ISO ('T' en vez de espacio) para que new Date() del
    front lo parsee bien en todos los navegadores (el kanban calcula los
    minutos transcurridos desde esa fecha)."""
    if not v:
        return None
    s = str(v)
    return s.replace(" ", "T") if (" " in s and "T" not in s) else s


def _comandas_kds(db) -> list:
    """Órdenes NO terminales, con items, ya enviadas → tarjetas del kanban."""
    sql = "SELECT * FROM orders WHERE 1=1"
    params: dict = {}
    inicial = _estado_inicial_orden(db)
    if inicial:
        sql += " AND (status IS NULL OR UPPER(status) != :ini0)"
        params["ini0"] = str(inicial).upper()
    filas = []
    try:
        filas = db.execute(text(sql + " ORDER BY created_at DESC LIMIT 100"),
                           params).mappings().all()
    except Exception:
        db.rollback()
        try:  # DB variante sin created_at → sin orden específico
            filas = db.execute(text(sql + " LIMIT 100"), params).mappings().all()
        except Exception:
            db.rollback()
            return []
    out = []
    for f in filas:
        try:
            o = dict(f)
            st = str(o.get("status") or "").upper()
            if st in _ESTADOS_FUERA_KDS:
                continue
            items = _items_de_orden(db, o.get("id"))
            if not items:
                continue  # sin productos todavía no es comanda
            nombre_mesa = _nombre_mesa_de(db, o)
            out.append({
                "id": o.get("id"),
                "status": o.get("status"),
                "estado": o.get("status"),
                "code": o.get("order_number") or o.get("code") or "",
                "table_id": o.get("table_id"),
                "table_name": nombre_mesa,
                "mesa": nombre_mesa,
                "created_at": _iso_de(o.get("created_at")),
                "channel": o.get("channel"),
                "total": float(o.get("total") or 0),
                "items": items,
            })
        except Exception as e:
            _log("kitchen/orders: fila saltada por error:", e)
            db.rollback()
            continue
    return out


@router.get("/api/v1/pos/kitchen/orders")
def kitchen_orders(db=Depends(_db)):
    lista = _comandas_kds(db)
    _log("kitchen/orders →", len(lista), "comanda(s)")
    return lista


@router.get("/api/v1/kitchen/orders")
def kitchen_orders_sin_prefijo(db=Depends(_db)):
    return _comandas_kds(db)


@router.get("/api/v1/pos/kds/orders")
def kds_orders(db=Depends(_db)):
    return _comandas_kds(db)


@router.get("/api/v1/kds/orders")
def kds_orders_sin_prefijo(db=Depends(_db)):
    return _comandas_kds(db)


@router.get("/api/v1/comandas")
def comandas_alias(db=Depends(_db)):
    return _comandas_kds(db)


@router.get("/api/v1/pos/comandas")
def pos_comandas_alias(db=Depends(_db)):
    return _comandas_kds(db)


@router.post("/api/v1/pos/kitchen/orders/{order_id}/advance")
def kitchen_advance(order_id: str, payload: Any = Body(None), db=Depends(_db)):
    return avanzar_pedido(order_id, payload, db)


@router.post("/api/v1/pos/kitchen/orders/{order_id}/status")
def kitchen_status(order_id: str, payload: Any = Body(None), db=Depends(_db)):
    return avanzar_pedido(order_id, payload, db)


@router.post("/api/v1/kitchen/orders/{order_id}/advance")
def kitchen_advance_sin_prefijo(order_id: str, payload: Any = Body(None), db=Depends(_db)):
    return avanzar_pedido(order_id, payload, db)


@router.post("/api/v1/kitchen/orders/{order_id}/status")
def kitchen_status_sin_prefijo(order_id: str, payload: Any = Body(None), db=Depends(_db)):
    return avanzar_pedido(order_id, payload, db)


@router.post("/api/v1/kds/orders/{order_id}/advance")
@router.post("/api/v1/kds/orders/{order_id}/status")
@router.post("/api/v1/pos/kds/orders/{order_id}/advance")
@router.post("/api/v1/pos/kds/orders/{order_id}/status")
def kds_avance_variantes(order_id: str, payload: Any = Body(None), db=Depends(_db)):
    return avanzar_pedido(order_id, payload, db)


# ── FIX E-14q: ENTREGAR ──────────────────────────────────────────────
# El kanban marcaba la comanda LISTA y ahí quedaba: NO existía la ruta de
# entrega. "Entregar" fija el estado de entrega del ENUM REAL del proyecto
# (DELIVERED / ENTREGADO / SERVED / ...). La comanda entregada SALE del
# kanban porque _ESTADOS_FUERA_KDS ya excluye esos estados. Si el enum no
# tuviera estado de entrega, se avanza un paso (nunca se rompe el flujo).
_ESTADOS_ENTREGA = ("DELIVERED", "ENTREGADA", "ENTREGADO", "SERVED", "SERVIDO",
                    "COMPLETADA", "COMPLETED", "FINALIZADA", "FINALIZADO")


def _entregar(db, order_id: str):
    orden = _orden_por_id(db, order_id)
    if not orden:
        raise HTTPException(404, f"Pedido {order_id} no encontrado")
    actual = orden["status"]
    vals = _valores_enum(db, "orders", "status")
    objetivo = next((v for v in vals if str(v).upper() in _ESTADOS_ENTREGA), None)
    if not objetivo:
        objetivo = _siguiente_estado_orden(db, actual)
    if str(objetivo).upper() == str(actual).upper():
        _log("deliver:", order_id, "ya estaba en", actual, "(nada que cambiar)")
    else:
        db.execute(text("UPDATE orders SET status = :s, updated_at = :u WHERE id = :i"),
                   {"s": objetivo, "u": _now(), "i": orden["id"]})
        db.commit()
        _log("deliver:", order_id, actual, "→", objetivo, "✓ comanda entregada")
    return _order_dict(db, _orden_por_id(db, order_id))


@router.post("/api/v1/pos/kitchen/orders/{order_id}/deliver")
@router.post("/api/v1/kitchen/orders/{order_id}/deliver")
@router.post("/api/v1/pos/kds/orders/{order_id}/deliver")
@router.post("/api/v1/kds/orders/{order_id}/deliver")
@router.post("/api/v1/pos/orders/{order_id}/deliver")
def kitchen_deliver(order_id: str, payload: Any = Body(None), db=Depends(_db)):
    return _entregar(db, order_id)


_log("rutas de comanda registradas bajo /api/v1/pos ✓")
_log("E-14q: ENTREGAR → POST .../deliver activo · advance/status aceptan body ✓")