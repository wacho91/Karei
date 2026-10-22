# -*- coding: utf-8 -*-
"""
============================================================================
Kārei · pos_cuenta_live.py (E-14u) — CUENTA EN VIVO + COBRAR + REPORTES
VERSION: E-14u · VERIFICA: la ÚLTIMA línea de este archivo dice "E-14u"

NUEVO EN E-14u (lo que pide el dashboard):
· El POST cobrar AHORA REGISTRA el método de pago (efectivo/tarjeta/nequi)
  y la propina en una tabla propia karei_payments (se crea sola).
· GET /api/v1/pos/reportes/pagos → desglose por método de HOY, últimos 7
  días, mes e histórico + últimos 12 cobros. Sin auth (como todo el add-on).
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


def _now() -> str:
    return datetime.datetime.utcnow().isoformat(sep=" ", timespec="seconds")


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
        "version": "E-14u",
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


# ─────────────────────────────────────────────────────────────────────────
# 7. COBRAR CUENTA (E-14t3) — primer ladrillo de FACTURACIÓN
# ─────────────────────────────────────────────────────────────────────────
# POST /pos/tables/{id}/cobrar: marca TODAS las órdenes no pagadas de la
# mesa con el valor TERMINAL 'pagado' del enum REAL (PAID/PAGADA/COBRADA...),
# actualiza el total real desde los ítems, cierra la sesión abierta y libera
# la mesa. Enum-safe (misma técnica E-14i): si el enum no tiene sinónimo de
# pagado, responde 409 con mensaje claro en vez de envenenar filas.
# E-14u: el body del cobro puede traer MÉTODO DE PAGO y PROPINA:
#   {"method": "nequi", "tip": 1600}  ·  {"metodo_pago": "tarjeta", "propina_pct": 10}
# Aliases aceptados (ES/EN): method/payment_method/metodo/medio/metodo_pago/
# medio_pago/tipo_pago/forma_pago · tip/propina/valor_propina (MONTO) o
# tip_pct/propina_pct (PORCENTAJE del subtotal).
_MAPA_METODO = {
    "efectivo": "efectivo", "cash": "efectivo",
    "tarjeta": "tarjeta", "card": "tarjeta", "credit_card": "tarjeta",
    "debit_card": "tarjeta", "credito": "tarjeta", "debito": "tarjeta",
    "transferencia": "tarjeta", "transfer": "tarjeta", "pse": "tarjeta",
    "bancolombia": "tarjeta", "bancolombia_qr": "tarjeta",
    "nequi": "nequi", "daviplata": "nequi",
}
_ETIQUETA_METODO = {"efectivo": "Efectivo", "tarjeta": "Tarjeta · Transferencia",
                    "nequi": "Nequi"}


def _normalizar_metodo(v) -> str:
    """'TARJETA' / 'Card' / 'transferencia' → 'tarjeta'; desconocido queda
    limpio en minúsculas (aparece como su propio método en el reporte)."""
    s = re.sub(r"[^a-z0-9_]+", "_", str(v or "").strip().lower())
    return _MAPA_METODO.get(s, s or "sin_dato")


def _metodo_de_payload(payload) -> str:
    if not isinstance(payload, dict):
        return "efectivo"  # el panel del POS trae Efectivo por defecto
    for a in ("method", "payment_method", "metodo", "medio", "metodo_pago",
              "medio_pago", "tipo_pago", "tipo", "forma_pago"):
        v = payload.get(a)
        if v not in (None, ""):
            return _normalizar_metodo(v)
    return "efectivo"


def _tip_de_payload(payload, subtotal: float) -> float:
    """Propina como MONTO (tip/propina) o PORCENTAJE (tip_pct/propina_pct)."""
    if not isinstance(payload, dict):
        return 0.0
    for a in ("tip", "propina", "valor_propina", "tip_amount"):
        v = payload.get(a)
        if v not in (None, ""):
            try:
                return max(0.0, float(v))
            except (TypeError, ValueError):
                pass
    for a in ("tip_pct", "propina_pct", "porcentaje_propina", "tip_percent"):
        v = payload.get(a)
        if v not in (None, ""):
            try:
                return max(0.0, round(subtotal * (float(v) / 100.0), 2))
            except (TypeError, ValueError):
                pass
    return 0.0


def _valor_pagado(db) -> Optional[str]:
    """Valor TERMINAL de 'pagado' dentro del enum REAL de orders.status."""
    vals = _valores_enum(db, "orders", "status")
    if not vals:
        return "PAID"  # columna libre: sin CHECK conocido
    for sin in _SIN_PAGADO:
        for v in vals:
            if str(v).upper() == sin:
                return v
    return None


@router.post("/api/v1/pos/tables/{table_id}/cobrar")
@router.post("/api/v1/tables/{table_id}/cobrar")
@router.post("/api/v1/pos/tables/{table_id}/pay")
@router.post("/api/v1/tables/{table_id}/pay")
def cobrar_cuenta(table_id: str, payload: Optional[dict] = None, db=Depends(_db)):
    # E-14u: el body opcional trae método de pago y propina. Sin body →
    # efectivo · propina 0 (mismo comportamiento de siempre).
    metodo = _metodo_de_payload(payload)
    mesa = _mesa(db, table_id)
    if not mesa:
        raise HTTPException(404, f"Mesa {table_id} no encontrada")
    mesa = dict(mesa)
    try:
        filas = db.execute(text("SELECT * FROM orders WHERE table_id IN (:a,:b)"),
                           {"a": str(mesa["id"]), "b": _norm_id(mesa["id"])}).mappings().all()
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass
        filas = []

    pagado = _valor_pagado(db)
    if not pagado:
        raise HTTPException(
            409, "El enum de orders.status no tiene ningún valor de 'pagado' "
                 "(PAID/PAGADA/COBRADA/...). Mándame la lista de estados del enum.")
    ahora = _now()
    cols_o = _columnas(db, "orders")
    n, total, cobradas_ids = 0, 0.0, []
    for f in filas:
        try:
            o = dict(f)
            st = str(o.get("status") or "").upper()
            if any(x in st for x in _SIN_PAGADO) or any(x in st for x in _SIN_CANCELADO):
                continue  # ya cobrada / anulada
            try:
                items = _items_de_orden(db, o.get("id"))
            except Exception:
                items = []
            t = sum(int(i.get("quantity") or 1) * float(i.get("unit_price") or 0)
                    for i in items)
            total += t
            datos = {"status": pagado, "updated_at": ahora}
            if "total" in cols_o:
                datos["total"] = t
            if "subtotal" in cols_o:
                datos["subtotal"] = t
            for c in ("paid_at", "payment_at"):
                if c in cols_o:
                    datos[c] = ahora
            sets = ", ".join(f"{k} = :{k}" for k in datos)
            db.execute(text(f"UPDATE orders SET {sets} WHERE id = :i"),
                       {**datos, "i": o["id"]})
            n += 1
            cobradas_ids.append(str(o.get("id")))
        except Exception as e:
            db.rollback()
            _log("cobrar: orden saltada:", e)

    if n == 0:
        db.rollback()
        raise HTTPException(422, "No hay pedidos abiertos para cobrar en esta mesa")
    db.commit()
    _log("cobrar:", n, "orden(es) →", pagado, "· total", total, "· mesa", mesa["id"])

    # E-14u: propina (monto o %) + REGISTRO DEL PAGO → reportes del dashboard
    propina = _tip_de_payload(payload, total)
    total_final = round(total + propina, 2)
    nombre_mesa = ""
    for campo in ("name", "nombre", "label", "etiqueta"):
        if mesa.get(campo) not in (None, ""):
            nombre_mesa = str(mesa.get(campo))
            break
    if not nombre_mesa and mesa.get("number") is not None:
        nombre_mesa = f"Mesa {mesa['number']}"
    mesa["_nombre"] = nombre_mesa
    pago_id = _registrar_pago(total, propina, metodo, mesa, cobradas_ids)

    # Cerrar sesión abierta (transacción INDEPENDIENTE: si falla, no toca el cobro)
    try:
        vals_s = _valores_enum(db, "table_sessions", "status")
        cerrado = "CLOSED"
        if vals_s:
            cerrado = None
            for sin in ("CLOSED", "CERRADA", "CERRADO", "FINISHED", "FINALIZADA"):
                for v in vals_s:
                    if str(v).upper() == sin:
                        cerrado = v
                        break
                if cerrado:
                    break
        if cerrado:
            cols_s = _columnas(db, "table_sessions")
            with _engine.begin() as cx:
                datos = {"s": cerrado, "a": str(mesa["id"]), "b": _norm_id(mesa["id"])}
                sets = "status = :s"
                if "closed_at" in cols_s:
                    sets += ", closed_at = :ca"
                    datos["ca"] = ahora
                if "total_cents" in cols_s:
                    sets += ", total_cents = :tc"
                    datos["tc"] = int(round(total * 100))
                cx.execute(text(f"UPDATE table_sessions SET {sets} "
                                "WHERE table_id IN (:a,:b) "
                                "AND status IN ('OPEN','ABIERTA','ABIERTO')"), datos)
    except Exception as e:
        _log("cobrar: sesión sin cerrar (no crítico):", e)

    # Liberar mesa (transacción INDEPENDIENTE)
    try:
        vals_t = _valores_enum(db, "tables", "status")
        libre = None
        for sin in ("AVAILABLE", "LIBRE", "FREE", "DISPONIBLE"):
            for v in vals_t:
                if str(v).upper() == sin:
                    libre = v
                    break
            if libre:
                break
        if libre:
            with _engine.begin() as cx:
                cx.execute(text("UPDATE tables SET status = :s, updated_at = :u "
                                "WHERE id = :i"),
                           {"s": libre, "u": ahora, "i": mesa["id"]})
    except Exception as e:
        _log("cobrar: mesa sin liberar (no crítico):", e)

    return {"version": "E-14u", "ok": True, "cobradas": n,
            "subtotal": total, "propina": propina, "total": total_final,
            "metodo": metodo,
            "metodo_etiqueta": _ETIQUETA_METODO.get(metodo, metodo.replace("_", " ").capitalize()),
            "pago_id": pago_id, "mesa_id": mesa["id"], "currency": "COP"}


# ─────────────────────────────────────────────────────────────────────────
# 8. PAGOS (E-14u) — cada cobro queda REGISTRADO en karei_payments
# ─────────────────────────────────────────────────────────────────────────
# Tabla PROPIA del add-on (no toca tus modelos ni tus migraciones). Aquí
# vive la fuente de verdad de "quién pagó con qué y cuánto" para el
# dashboard. Si algo falla aquí, el COBRO ya está hecho: solo se avisa en
# el log — nunca se rompe el cobro por el reporte.
_TABLA_PAGOS = "karei_payments"
_PAGOS_LISTA = {"hecho": False}


def _asegurar_tabla_pagos() -> bool:
    if _PAGOS_LISTA["hecho"]:
        return True
    try:
        with _engine.begin() as cx:
            cx.execute(text(
                f"CREATE TABLE IF NOT EXISTS {_TABLA_PAGOS} ("
                "id VARCHAR(32) PRIMARY KEY, created_at DATETIME, paid_at DATETIME, "
                "table_id VARCHAR(32), table_name VARCHAR(80), method VARCHAR(30), "
                "subtotal FLOAT, tip FLOAT, total FLOAT, n_orders INTEGER, "
                "order_ids TEXT, currency VARCHAR(8))"))
        _PAGOS_LISTA["hecho"] = True
        _log("tabla de pagos lista:", _TABLA_PAGOS)
        return True
    except Exception as e:
        _log("no pude crear", _TABLA_PAGOS, "(no crítico):", e)
        return False


def _registrar_pago(subtotal: float, propina: float, metodo: str,
                    mesa: dict, ordenes: list) -> Optional[str]:
    """Guarda el pago del cobro (hora LOCAL del servidor, para que 'hoy'
    del reporte cuadre con tu reloj). Devuelve el id del pago o None."""
    if not _asegurar_tabla_pagos():
        return None
    pid = _uid()
    ahora_local = datetime.datetime.now().isoformat(sep=" ", timespec="seconds")
    try:
        with _engine.begin() as cx:
            cx.execute(text(
                f"INSERT INTO {_TABLA_PAGOS} (id, created_at, paid_at, table_id, "
                "table_name, method, subtotal, tip, total, n_orders, order_ids, "
                "currency) VALUES (:i,:c,:p,:t,:tn,:m,:s,:ti,:to,:n,:oi,'COP')"),
                {"i": pid, "c": ahora_local, "p": ahora_local,
                 "t": str(mesa.get("id") or ""), "tn": str(mesa.get("_nombre") or ""),
                 "m": metodo, "s": round(float(subtotal or 0), 2),
                 "ti": round(float(propina or 0), 2),
                 "to": round(float(subtotal or 0) + float(propina or 0), 2),
                 "n": len(ordenes or []), "oi": (",".join(ordenes or []))[:500]})
        _log("pago registrado:", metodo, round(float(subtotal or 0) + float(propina or 0), 2),
             "· mesa", mesa.get("id"))
        return pid
    except Exception as e:
        _log("pago SIN registrar (no crítico):", e)
        return None


# ─────────────────────────────────────────────────────────────────────────
# 9. REPORTES DE PAGOS POR MÉTODO (E-14u) — lo que pide el dashboard
# ─────────────────────────────────────────────────────────────────────────
# GET /api/v1/pos/reportes/pagos (+ 4 variantes) →
#   resumen.{hoy,semana,mes,historico}.{efectivo,tarjeta,nequi,otros,total,n_pagos}
#   por_metodo[{metodo,etiqueta,hoy,semana,mes,historico,cobros_hoy,cobros}]
#   ultimos[≤12]  ·  sin auth (como todo el add-on). Los 3 canónicos SIEMPRE
#   aparecen, aunque vayan en 0, para que el dashboard los pinte fijo.
def _leer_pagos() -> list:
    if not _asegurar_tabla_pagos():
        return []
    try:
        with _engine.connect() as cx:
            # rowid DESC desempata pagos del MISMO segundo (último insertado
            # primero) → "últimos cobros" siempre en orden real.
            filas = cx.execute(text(
                f"SELECT * FROM {_TABLA_PAGOS} ORDER BY paid_at DESC, rowid DESC"
            )).mappings().all()
            return [dict(f) for f in filas]
    except Exception as e:
        _log("reporte: no pude leer pagos:", e)
        return []


def _fecha_de(p: dict) -> Optional[datetime.datetime]:
    for c in ("paid_at", "created_at"):
        v = p.get(c)
        if not v:
            continue
        try:
            return datetime.datetime.fromisoformat(str(v).replace("T", " "))
        except Exception:
            continue
    return None


def _en_ventana(f, desde) -> bool:
    if f is None:
        return False
    return desde is None or f >= desde


@router.get("/api/v1/pos/reportes/pagos")
@router.get("/api/v1/pos/reportes/pagos/resumen")
@router.get("/api/v1/pos/pagos")
@router.get("/api/v1/pos/pagos/reporte")
@router.get("/api/v1/pos/payments/summary")
@router.get("/api/v1/reportes/pagos")
def reporte_pagos():
    pagos = _leer_pagos()
    ahora = datetime.datetime.now()
    d0 = datetime.datetime(ahora.year, ahora.month, ahora.day)
    ventanas = {"hoy": d0, "semana": d0 - datetime.timedelta(days=6),
                "mes": d0 - datetime.timedelta(days=29), "historico": None}
    canon = ("efectivo", "tarjeta", "nequi")

    def suma(sel: list) -> float:
        return round(sum(float(p.get("total") or 0) for p in sel), 2)

    resumen = {}
    for nombre, desde in ventanas.items():
        sel = [p for p in pagos if _en_ventana(_fecha_de(p), desde)]
        cubo = {"total": suma(sel), "n_pagos": len(sel)}
        for m in canon:
            cubo[m] = round(sum(float(p.get("total") or 0) for p in sel
                                if str(p.get("method") or "") == m), 2)
        cubo["otros"] = round(sum(float(p.get("total") or 0) for p in sel
                                  if str(p.get("method") or "") not in canon), 2)
        resumen[nombre] = cubo

    vistos = list(canon) + sorted({str(p.get("method")) for p in pagos
                                   if str(p.get("method") or "") not in canon})
    por_metodo = []
    for m in vistos:
        sel = [p for p in pagos if str(p.get("method") or "") == m]
        fila = {"metodo": m,
                "etiqueta": _ETIQUETA_METODO.get(m, m.replace("_", " ").capitalize())}
        for nombre, desde in ventanas.items():
            fila[nombre] = suma([p for p in sel if _en_ventana(_fecha_de(p), desde)])
        fila["cobros_hoy"] = len([p for p in sel
                                  if _en_ventana(_fecha_de(p), ventanas["hoy"])])
        fila["cobros"] = len(sel)
        por_metodo.append(fila)

    ultimos = []
    for p in pagos[:12]:
        f = _fecha_de(p)
        met = str(p.get("method") or "sin_dato")
        ultimos.append({
            "id": p.get("id"), "metodo": met,
            "metodo_etiqueta": _ETIQUETA_METODO.get(met, met.replace("_", " ").capitalize()),
            "subtotal": float(p.get("subtotal") or 0),
            "propina": float(p.get("tip") or 0),
            "total": float(p.get("total") or 0),
            "mesa_id": p.get("table_id"), "mesa": p.get("table_name"),
            "paid_at": _iso_de(p.get("paid_at") or p.get("created_at")),
            "hora": (f.strftime("%H:%M") if f else None),
            "fecha": (f.strftime("%Y-%m-%d") if f else None),
        })

    return {"version": "E-14u",
            "generado_en": ahora.isoformat(sep=" ", timespec="seconds"),
            "resumen": resumen, "por_metodo": por_metodo,
            "metodos": [m["metodo"] for m in por_metodo],
            "total_hoy": resumen["hoy"]["total"],
            "n_pagos_hoy": resumen["hoy"]["n_pagos"],
            "ultimos": ultimos, "currency": "COP"}


_log("E-14t2: CUENTA DE MESA EN VIVO lista → GET /pos/tables/{id}/cuenta "
     "(y bill, con/sin /pos) · solo lectura · sin auth ✓")
_log("E-14t2+E-14t3: COBRAR CUENTA listo → POST /pos/tables/{id}/cobrar "
     "(y pay, con/sin /pos) · marca PAGADA + cierra sesión + libera mesa ✓")
_log("E-14u: COBRAR registra método+propina en karei_payments · REPORTES → "
     "GET /pos/reportes/pagos (efectivo/tarjeta/nequi · hoy/semana/mes) ✓")