# -*- coding: utf-8 -*-
"""
============================================================================
Kārei · pos_cuenta_live.py (E-14t2) — CUENTA DE MESA EN VIVO (ADD-ON)
VERSION: E-14t2-v1 · VERIFICA: la ÚLTIMA línea de este archivo dice "E-14t2"
============================================================================
QUÉ ES
------
Un archivo NUEVO y PEQUEÑO que SOLO AGREGA la ruta que faltaba para el
último tramo del ciclo (cocina → mesa):

    GET /api/v1/pos/tables/{table_id}/cuenta   (+ 5 variantes de ruta)

Es la ruta que consulta el PanelCuenta.tsx (panel derecho de la página de
Mesas) CADA 8 SEGUNDOS. Devuelve TODOS los pedidos NO pagados de la mesa
con el estado de cocina de cada comanda:

    sin_enviar → en_cocina → preparando → listo → entregado

Cuando el cocinero pulsa "Entregar" en el kanban, la mesa LO VE SOLA con
el total real. Se acabó el "Cuenta abierta · Total $0".

POR QUÉ UN ARCHIVO NUEVO Y NO REEMPLAZAR pos_compat.py
------------------------------------------------------
· Tu pos_compat.py actual FUNCIONA (abrir mesa, comanda, kanban, entregar
  ya te sirven) → NO SE TOCA. Cero riesgo de romper lo que anda.
· Este add-on es 100% independiente: no importa nada de pos_compat ni del
  backend viejo. Solo LEE las mismas tablas (tables, table_sessions,
  orders, order_items, recipes).
· Sin auth (como todo pos_compat) → se acabó el 401 en la cuenta.
· Tolerante: acepta ids con o sin guiones (E-14f), completa nombre/precio
  desde recipes si la tabla de items no los guarda (E-14g), y lee los
  enums REALES del proyecto (E-14i/E-14t) para clasificar estados ES o EN.

INSTALACIÓN (2 líneas en main.py, JUNTO a las de pos_compat)
------------------------------------------------------------
    import pos_cuenta_live
    app.include_router(pos_cuenta_live.router)

⚠ Colócalas ARRIBA de los include_router de los routers viejos (ideal:
justo después de crear `app`), para que esta ruta gane si el backend
viejo tuviera otra con el mismo camino.

VERIFICA
--------
· Al arrancar uvicorn aparece en el log:
    [pos_cuenta_live] E-14t2 activo — DB: ...
· Si algún día instalas el pos_compat.py E-14t COMPLETO (que ya trae esta
  ruta), BORRA estas 2 líneas para no registrar la ruta dos veces.
============================================================================
"""
import datetime
import glob
import os
import re
import sys
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import create_engine, inspect as sa_inspect, text
from sqlalchemy.orm import sessionmaker

router = APIRouter()

# ─────────────────────────────────────────────────────────────────────────
# 1. LOCALIZAR LA BASE DE DATOS (mismo método probado de pos_compat)
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
        "[pos_cuenta_live] No encontré la base de datos. "
        "Exporta KAREI_DATABASE_URL=sqlite:///ruta/a/karei.db antes de arrancar uvicorn."
    )


DB_URL = _resolver_db_url()
# FIX E-14e (MissingGreenlet): este módulo trabaja en modo SYNC. Si el
# settings usa driver async (sqlite+aiosqlite), quitamos el sufijo async:
# MISMO archivo de DB, solo cambia el "controlador".
for _drv in ("+aiosqlite", "+asyncpg", "+asyncmy", "+asyncodbc"):
    if _drv in DB_URL:
        DB_URL = DB_URL.replace(_drv, "")
        print("[pos_cuenta_live] URL con driver async detectada → usando driver sync:", DB_URL)
        break
_engine = create_engine(
    DB_URL,
    connect_args={"check_same_thread": False, "timeout": 15}
    if DB_URL.startswith("sqlite") else {},
)
_SessionLocal = sessionmaker(bind=_engine, autoflush=False, autocommit=False)


def _db():
    db = _SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _log(*args):
    print("[pos_cuenta_live]", *args)


_log("E-14t2 activo — DB:", DB_URL)


def _uid() -> str:
    return uuid.uuid4().hex


def _norm_id(x) -> str:
    """FIX E-14f: la DB guarda ids SIN guiones pero el front a veces manda
    UUID CON guiones. Es el MISMO id: aceptamos ambas formas."""
    return str(x or "").strip().replace("-", "")


# ─────────────────────────────────────────────────────────────────────────
# 2. TABLA DE ÍTEMS (lee la REAL del proyecto; este add-on es SOLO LECTURA)
# ─────────────────────────────────────────────────────────────────────────
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
_CACHÉ: dict = {}


def _columnas(db, tabla: str) -> set:
    try:
        return {c["name"] for c in sa_inspect(_engine).get_columns(tabla)}
    except Exception:
        return set()


def _col_de(campo: str, cols: set) -> Optional[str]:
    for a in MAPA_ITEMS.get(campo, [campo]):
        if a in cols:
            return a
    return None


def _tabla_items(db) -> str:
    """Tabla de items del pedido. SOLO LECTURA: si no existe ninguna, la
    cuenta sale con items vacíos (no creamos nada aquí)."""
    if _CACHÉ.get("tabla_items") is not None:
        return _CACHÉ["tabla_items"]
    try:
        existentes = set(sa_inspect(_engine).get_table_names())
    except Exception:
        existentes = set()
    elegida = ""
    for candidata in ("order_items", "order_item", "pos_order_items",
                      "pos_compat_order_items"):
        if candidata not in existentes:
            continue
        cols = _columnas(db, candidata)
        if any(a in cols for a in MAPA_ITEMS["order_id"]):
            elegida = candidata
            break
    _CACHÉ["tabla_items"] = elegida
    if elegida:
        _log("items del pedido en tabla:", elegida)
    else:
        _log("sin tabla de items conocida → la cuenta saldrá sin líneas")
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
    try:
        out["quantity"] = int(out.get("quantity") or 1)
    except (TypeError, ValueError):
        out["quantity"] = 1
    try:
        out["unit_price"] = float(out.get("unit_price") or 0)
    except (TypeError, ValueError):
        out["unit_price"] = 0.0
    return out


# ─────────────────────────────────────────────────────────────────────────
# 3. ENUMS REALES (misma técnica E-14i/E-14t: nunca adivinar estados)
# ─────────────────────────────────────────────────────────────────────────
_VAL_ENUM: dict = {}
_META_ENUM: dict = {}
_META_ESCANEADO = {"hecho": False}
_TERMINALES = ("PAID", "PAGADO", "PAGADA", "COBRADO", "COBRADA", "CANCELLED",
               "CANCELED", "CANCELADO", "CANCELADA", "ANULADO", "ANULADA",
               "VOID", "VOIDED", "OUT_OF_SERVICE", "OUTOFSERVICE",
               "CLOSED", "CLOSE", "CERRADO", "CERRADA",
               "FACTURADA", "FACTURADO", "INVOICED")


def _escanear_metadata():
    """UNA vez por proceso: guarda los valores válidos de TODAS las columnas
    Enum de los modelos SQLAlchemy ya importados (sys.modules)."""
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
            _log("enums leídos de los modelos del proyecto:", sorted(_META_ENUM.keys()))
    except Exception as _e:
        _log("escaneo de modelos sin resultado:", _e)


def _valores_enum(db, tabla: str, columna: str) -> list:
    """Valores válidos de una columna enum. Fuentes: modelos SQLAlchemy →
    CHECK del DDL (sqlite) → [] (columna libre)."""
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


def _estado_inicial_orden(db) -> Optional[str]:
    """Estado con el que las órdenes NACEN (mesa abierta, sin enviar).
    Con enums femeninos/españoles (ABIERTA, PENDIENTE...) usa el mismo
    fallback del E-14t: primer valor no-terminal del enum real."""
    vals = _valores_enum(db, "orders", "status")
    if not vals:
        return None
    for p in ("OPEN", "PENDING", "CREATED", "NUEVO", "ABIERTA", "ABIERTO",
              "PENDIENTE", "NUEVA"):
        for v in vals:
            if str(v).upper() == p:
                return v
    no_terminal = [v for v in vals if str(v).upper() not in _TERMINALES]
    return no_terminal[0] if no_terminal else None


# ─────────────────────────────────────────────────────────────────────────
# 4. HELPERS DE DOMINIO (mesa, sesión, items, fechas)
# ─────────────────────────────────────────────────────────────────────────
def _mesa(db, table_id: str):
    limpio = _norm_id(table_id)
    m = db.execute(text("SELECT * FROM tables WHERE id IN (:a, :b)"),
                   {"a": str(table_id), "b": limpio}).mappings().first()
    if not m:
        _log("mesa no hallada (busqué id =", table_id, "| sin guiones =", limpio, ")")
    return m


def _sesion_abierta(db, table_id: str):
    try:
        return db.execute(text("SELECT * FROM table_sessions WHERE table_id IN (:a, :b) "
                               "AND status IN ('OPEN','ABIERTA','ABIERTO') "
                               "ORDER BY opened_at DESC LIMIT 1"),
                          {"a": str(table_id), "b": _norm_id(table_id)}).mappings().first()
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass
        return None


def _items_de_orden(db, order_id: str) -> list:
    tabla = _tabla_items(db)
    if not tabla:
        return []
    cols = _columnas(db, tabla)
    # FIX E-14g: NO asumir columnas al ordenar (su tabla real no tiene
    # created_at). created_at → id → sin ORDER BY.
    orden_por = _col_de("created_at", cols) or _col_de("id", cols)
    sql = f"SELECT * FROM {tabla} WHERE order_id IN (:a, :b)"
    if orden_por:
        sql += f" ORDER BY {orden_por}"
    filas = db.execute(text(sql),
                       {"a": str(order_id), "b": _norm_id(order_id)}).mappings().all()
    return _enriquecer_items(db, [_mapear_salida(dict(f)) for f in filas])


def _enriquecer_items(db, items: list) -> list:
    """FIX E-14g: si la tabla de items real no guarda name/unit_price (o
    vienen vacíos), se completan desde recipes usando recipe_id."""
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


def _iso_de(v) -> Optional[str]:
    """created_at → ISO con 'T' para que new Date() del front lo parsee."""
    if not v:
        return None
    s = str(v)
    return s.replace(" ", "T") if (" " in s and "T" not in s) else s


# ─────────────────────────────────────────────────────────────────────────
# 5. CUENTA DE MESA EN VIVO (la sección 6.bis del E-14t, autónoma)
# ─────────────────────────────────────────────────────────────────────────
# Devuelve: items con ALIASES ES/EN + estado_cocina por ítem, pedidos[]
# (detalle por comanda), orderId principal, subtotal/total recalculados
# desde los ítems reales, banderas hay_listos/hay_entregados/puede_cobrar.
_SIN_PAGADO = ("PAID", "PAGADO", "PAGADA", "COBRADO", "COBRADA", "CLOSED",
               "CERRADA", "CERRADO", "FACTURADA", "FACTURADO", "INVOICED")
_SIN_CANCELADO = ("CANCELLED", "CANCELED", "CANCELADO", "CANCELADA",
                  "ANULADA", "ANULADO", "VOID", "VOIDED")
_SIN_PREPARANDO = ("IN_PREPARATION", "PREPARACION", "EN_PREPARACION",
                   "PREPARANDO", "COOKING", "COCINANDO", "IN_PROGRESS",
                   "EN_PROCESO", "PROCESSING", "PROGRESS")
_SIN_LISTO = ("READY", "LISTA", "LISTO", "PREPARADA", "PREPARADO", "DONE",
              "TERMINADA", "TERMINADO", "FINISHED")
_SIN_ENTREGADO = ("DELIVERED", "ENTREGADA", "ENTREGADO", "SERVED", "SERVIDO",
                  "COMPLETADA", "COMPLETED", "FINALIZADA", "FINALIZADO")


def _estado_cocina_de(db, status) -> str:
    """Estado NORMALIZADO para el front desde orders.status (enum real ES o
    EN). El orden del chequeo importa:
    terminal → entregado → listo → preparando → inicial(sin enviar) → cocina."""
    s = str(status or "").strip().upper()
    if not s:
        return "sin_enviar"
    if any(x in s for x in _SIN_PAGADO):
        return "pagado"
    if any(x in s for x in _SIN_CANCELADO):
        return "cancelado"
    if any(x in s for x in _SIN_ENTREGADO):
        return "entregado"
    if any(x in s for x in _SIN_LISTO):
        return "listo"
    if any(x in s for x in _SIN_PREPARANDO):
        return "preparando"
    inicial = _estado_inicial_orden(db)
    if inicial and s == str(inicial).upper():
        return "sin_enviar"
    return "en_cocina"  # enviado/ENVIADA/SENT/... o estado desconocido en curso


def _item_cuenta(it: dict, estado: str, comanda: str) -> dict:
    """Ítem con ALIASES ES/EN para que el front encuentre SIEMPRE el campo
    que busca, venga como venga."""
    qty = int(it.get("quantity") or 1)
    precio = float(it.get("unit_price") or 0)
    nombre = it.get("name") or "Ítem"
    out = dict(it)
    out.update({
        "item_id": it.get("id"),
        "recipeId": it.get("recipe_id"),
        "nombre": nombre, "name": nombre,
        "precio": precio, "price": precio, "unit_price": precio,
        "cantidad": qty, "quantity": qty, "qty": qty,
        "line_total": qty * precio, "importe": qty * precio,
        "estado_cocina": estado, "estadoCocina": estado,
        "comanda": comanda, "order_number": comanda,
    })
    return out


def _cuenta_de_mesa(db, table_id: str) -> dict:
    mesa = _mesa(db, table_id)
    if not mesa:
        raise HTTPException(404, f"Mesa {table_id} no encontrada")
    mesa = dict(mesa)
    nombre_mesa = ""
    for campo in ("name", "nombre", "label", "etiqueta"):
        v = mesa.get(campo)
        if v not in (None, ""):
            nombre_mesa = str(v)
            break
    if not nombre_mesa and mesa.get("number") is not None:
        nombre_mesa = f"Mesa {mesa['number']}"

    # TODAS las órdenes de la mesa; pagadas/anuladas se filtran en Python
    # con sinónimos (el enum real puede ser PAID o PAGADA o COBRADA...)
    try:
        filas = db.execute(text("SELECT * FROM orders WHERE table_id IN (:a,:b) "
                                "ORDER BY created_at ASC"),
                           {"a": str(mesa["id"]), "b": _norm_id(mesa["id"])}).mappings().all()
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass
        try:
            filas = db.execute(text("SELECT * FROM orders WHERE table_id IN (:a,:b)"),
                               {"a": str(mesa["id"]), "b": _norm_id(mesa["id"])}).mappings().all()
        except Exception:
            try:
                db.rollback()
            except Exception:
                pass
            filas = []

    pedidos, items_flat = [], []
    subtotal, estados = 0.0, set()
    for f in filas:
        try:
            o = dict(f)
            st_raw = o.get("status")
            st = str(st_raw or "").upper()
            if any(x in st for x in _SIN_PAGADO) or any(x in st for x in _SIN_CANCELADO):
                continue  # ya cobrada / anulada: no es parte de la cuenta activa
            try:
                items = _items_de_orden(db, o.get("id"))
            except Exception as e:
                _log("cuenta: items de", o.get("id"), "falló:", e)
                try:
                    db.rollback()
                except Exception:
                    pass
                items = []
            estado = _estado_cocina_de(db, st_raw)
            estados.add(estado)
            code = str(o.get("order_number") or o.get("code") or "")
            sub_o = sum(int(i.get("quantity") or 1) * float(i.get("unit_price") or 0)
                        for i in items)
            subtotal += sub_o
            for i in items:
                items_flat.append(_item_cuenta(i, estado, code))
            pedidos.append({
                "id": o.get("id"), "order_id": o.get("id"), "orderId": o.get("id"),
                "order_number": code, "code": code,
                "status": st_raw, "estado": st_raw, "estado_cocina": estado,
                "table_id": o.get("table_id"), "mesa_id": o.get("table_id"),
                "created_at": _iso_de(o.get("created_at") or o.get("updated_at")),
                "subtotal": sub_o, "total": sub_o,
                "items": items, "n_items": len(items),
            })
        except Exception as e:
            _log("cuenta: fila de orden saltada:", e)
            try:
                db.rollback()
            except Exception:
                pass
            continue

    sesion = _sesion_abierta(db, mesa["id"])
    ultima = pedidos[-1] if pedidos else None
    hay_cocina = bool(estados & {"sin_enviar", "en_cocina", "preparando"})
    return {
        "version": "E-14t2",
        "mesa_id": mesa["id"], "mesaId": mesa["id"], "table_id": mesa["id"],
        "mesa_nombre": nombre_mesa, "mesa": nombre_mesa, "table_name": nombre_mesa,
        "mesa_status": mesa.get("status"),
        "session_id": (dict(sesion)["id"] if sesion and "id" in dict(sesion) else None),
        "estado": "abierta", "status": "OPEN", "estado_cuenta": "abierta",
        "order_id": (ultima["id"] if ultima else None),
        "orderId": (ultima["id"] if ultima else None),
        "order_number": (ultima["order_number"] if ultima else None),
        "items": items_flat, "lineas": items_flat, "detalle": items_flat,
        "pedidos": pedidos, "comandas": pedidos,
        "n_pedidos": len(pedidos), "n_items": len(items_flat),
        "subtotal": subtotal, "propina": 0.0, "tip": 0.0, "total": subtotal,
        "total_cents": int(round(subtotal * 100)),
        "currency": "COP",
        "hay_listos": "listo" in estados,
        "hay_entregados": "entregado" in estados,
        "hay_pendientes": hay_cocina,
        "puede_cobrar": bool(items_flat) and not hay_cocina,
    }


# ─────────────────────────────────────────────────────────────────────────
# 6. RUTAS (PanelCuenta llama a GET /pos/tables/{id}/cuenta)
# ─────────────────────────────────────────────────────────────────────────
@router.get("/api/v1/pos/tables/{table_id}/cuenta")
@router.get("/api/v1/tables/{table_id}/cuenta")
@router.get("/api/v1/pos/tables/{table_id}/bill")
@router.get("/api/v1/tables/{table_id}/bill")
@router.get("/api/v1/pos/cuenta/{table_id}")
@router.get("/api/v1/cuenta/{table_id}")
def cuenta_de_mesa(table_id: str, db=Depends(_db)):
    return _cuenta_de_mesa(db, table_id)


_log("E-14t2: CUENTA DE MESA EN VIVO lista → GET /pos/tables/{id}/cuenta "
     "(y bill, con/sin /pos) · solo lectura · sin auth ✓")