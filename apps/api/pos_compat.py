# -*- coding: utf-8 -*-
"""
============================================================================
Kārei · pos_compat.py (E-14) — RUTAS DE COMANDA DEL POS, ROBUSTAS
============================================================================
QUÉ ES
------
Un router FastAPI AUTOCONTENIDO que implementa el flujo completo de la
comanda sobre las tablas REALES del proyecto (tables, table_sessions,
orders, recipes). Los endpoints son TOLERANTES: aceptan cuerpos en inglés
o español, en array ({items:[...]}) o plano ({recipe_id, quantity}), y con
sinónimos (recipe_id/receta_id/product_id, quantity/cantidad/qty...).
El error 422 "field required" desaparece para siempre.

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

NO TOCA (siguen siendo del backend original):
  GET /pos/tables (mapa), GET /pos/kitchen/orders (cocina), checkout/cobro,
  recetas, inventario.

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
_engine = create_engine(
    DB_URL,
    connect_args={"check_same_thread": False} if DB_URL.startswith("sqlite") else {},
)
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
def _mesa(db, table_id: str):
    return db.execute(text("SELECT * FROM tables WHERE id = :i"),
                      {"i": table_id}).mappings().first()


def _sesion_abierta(db, table_id: str):
    return db.execute(text("SELECT * FROM table_sessions WHERE table_id = :t AND status = 'OPEN' "
                           "ORDER BY opened_at DESC LIMIT 1"), {"t": table_id}).mappings().first()


def _orden_abierta(db, table_id: str):
    return db.execute(text("SELECT * FROM orders WHERE table_id = :t "
                           "AND status NOT IN ('PAID','CANCELLED') "
                           "ORDER BY created_at DESC LIMIT 1"), {"t": table_id}).mappings().first()


def _insertar(db, tabla: str, valores: dict):
    """INSERT tolerante: solo usa columnas que existen; rellena NOT NULL comunes."""
    cols = _columnas(db, tabla)
    datos = {k: v for k, v in valores.items() if k in cols and v is not None}
    if "id" in cols and "id" not in datos:
        datos["id"] = _uid()
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
        "status": "OPEN",
        "guest_count": guest_count,
        "opened_at": _now(),
        "currency": "COP",
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
        "order_number": datetime.datetime.utcnow().strftime("ORD-%H%M%S"),
        "channel": "POS",
        "status": "OPEN",
        "subtotal": 0.0, "tip": 0.0, "total": 0.0,
    })
    db.commit()
    # mesa Ocupada (por si el mapa lee el campo directo)
    try:
        db.execute(text("UPDATE tables SET status = 'Ocupada', updated_at = :u WHERE id = :i"),
                   {"u": _now(), "i": mesa["id"]})
        db.commit()
    except Exception:
        db.rollback()
    return dict(_orden_abierta(db, mesa["id"]) or {"id": oid})


def _items_de_orden(db, order_id: str) -> list:
    tabla = _tabla_items(db)
    filas = db.execute(text(f"SELECT * FROM {tabla} WHERE order_id = :o ORDER BY created_at"),
                       {"o": order_id}).mappings().all()
    return [_mapear_salida(dict(f)) for f in filas]


def _recalcular(db, order_id: str):
    items = _items_de_orden(db, order_id)
    subtotal = sum(i["quantity"] * i["unit_price"] for i in items)
    try:
        db.execute(text("UPDATE orders SET subtotal = :s, total = :t, updated_at = :u WHERE id = :i"),
                   {"s": subtotal, "t": subtotal, "u": _now(), "i": order_id})
        db.execute(text("""
            UPDATE table_sessions
               SET subtotal_cents = :sc, total_cents = :tc, updated_at = :u
             WHERE id = (SELECT session_id FROM orders WHERE id = :i)
        """), {"sc": int(round(subtotal * 100)), "tc": int(round(subtotal * 100)),
               "u": _now(), "i": order_id})
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
        recipe_id = str(it.get("recipe_id") or "")
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
    orden = db.execute(text("SELECT * FROM orders WHERE id = :i"), {"i": order_id}).mappings().first()
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
    r = db.execute(text(f"DELETE FROM {tabla} WHERE {col_id} = :x AND order_id = :o"),
                   {"x": item_id, "o": order_id})
    db.commit()
    if r.rowcount == 0:
        # quizá vino el recipe_id en vez del id de línea → borra UNA línea de ese producto
        col_rec = _col_de("recipe_id", cols)
        if col_rec:
            r = db.execute(text(f"DELETE FROM {tabla} WHERE {col_rec} = :x AND order_id = :o "
                                f"AND rowid = (SELECT rowid FROM {tabla} WHERE {col_rec} = :x "
                                f"AND order_id = :o LIMIT 1)"), {"x": item_id, "o": order_id})
            db.commit()
    _recalcular(db, order_id)
    orden = db.execute(text("SELECT * FROM orders WHERE id = :i"), {"i": order_id}).mappings().first()
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
    db.execute(text(f"UPDATE {tabla} SET {col_qty} = :q WHERE {col_id} = :x AND order_id = :o"),
               {"q": nueva, "x": item_id, "o": order_id})
    db.commit()
    _recalcular(db, order_id)
    orden = db.execute(text("SELECT * FROM orders WHERE id = :i"), {"i": order_id}).mappings().first()
    return _order_dict(db, orden)


@router.post("/api/v1/pos/orders/{order_id}/send")
def enviar_comanda(order_id: str, payload: Any = Body(None), db=Depends(_db)):
    orden = db.execute(text("SELECT * FROM orders WHERE id = :i"), {"i": order_id}).mappings().first()
    if not orden:
        raise HTTPException(404, f"Pedido {order_id} no encontrado")
    db.execute(text("UPDATE orders SET status = 'SENT', updated_at = :u WHERE id = :i"),
               {"u": _now(), "i": order_id})
    db.commit()
    _log("send: pedido", order_id, "→ cocina ✓")
    return _order_dict(db, _orden_por_id(db, order_id))


@router.post("/api/v1/pos/orders/{order_id}/advance")
def avanzar_pedido(order_id: str, payload: Any = Body(None), db=Depends(_db)):
    orden = db.execute(text("SELECT * FROM orders WHERE id = :i"), {"i": order_id}).mappings().first()
    if not orden:
        raise HTTPException(404, f"Pedido {order_id} no encontrado")
    actual = orden["status"]
    try:
        siguiente = ESTADOS_KDS[ESTADOS_KDS.index(actual) + 1]
    except (ValueError, IndexError):
        siguiente = "DELIVERED" if actual != "PAID" else "PAID"
    db.execute(text("UPDATE orders SET status = :s, updated_at = :u WHERE id = :i"),
               {"s": siguiente, "u": _now(), "i": order_id})
    db.commit()
    _log("advance:", order_id, actual, "→", siguiente)
    return _order_dict(db, _orden_por_id(db, order_id))


def _orden_por_id(db, order_id: str):
    return db.execute(text("SELECT * FROM orders WHERE id = :i"), {"i": order_id}).mappings().first()


@router.get("/api/v1/pos/tables/{table_id}/order")
def pedido_de_mesa(table_id: str, db=Depends(_db)):
    orden = _orden_abierta(db, table_id)
    return _order_dict(db, orden)


@router.get("/api/v1/pos/orders/{order_id}")
def pedido_por_id(order_id: str, db=Depends(_db)):
    return _order_dict(db, _orden_por_id(db, order_id))


_log("rutas de comanda registradas bajo /api/v1/pos ✓")