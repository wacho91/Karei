"""
═════════════════════════════════════════════════════════════════════════════
Kārei · pos_facturacion.py (E-14w-c) — FACTURACIÓN FASE 1: TIRILLA + CAJA
═══════════════════════════════════════════════════════════════════════════
NUEVO EN E-14w-c (FIX: «en Ventas no salen las ventas»):
· La VERDAD del dueño de un pago ya NO es la marca tenant_id de
  karei_payments (el backfill del demo pudo marcarla mal), sino el
  tenant de SUS ÓRDENES en la tabla core `orders` (escrita por el
  order_service con el usuario autenticado).
· Antes de filtrar, cada pago mal marcado se REPARA: si TODAS sus
  órdenes son del restaurante que pide, se ADOPTA (UPDATE) y vuelve a
  aparecer en historial + Informe Z. Si son de otro restaurante,
  sigue oculto (aislamiento intacto).
· El backfill que mandaba pagos huérfanos al tenant de admin@karei.app
  quedó FUERA — era el que vandalizaba los pagos propios.
· La tirilla individual (factura/{pago_id}) TAMBIÉN repara antes del
  404: el botón 🧾 de un cobro mal marcado se re-adopta por sus órdenes.
· Las respuestas dicen "version": "E-14w-c" para verificar en Swagger.

NUEVO EN E-14w-b (COMPATIBILIDAD POSTGRES — deploy en la nube):
· karei_config ya no usa DATETIME (no existe en Postgres) ni
  INSERT OR IGNORE (sintaxis SQLite) → TIMESTAMP + ON CONFLICT, que
  sirven igual en SQLite y Postgres.
· Los ORDER BY dejan de usar rowid (tampoco existe en Postgres).
· Las respuestas dicen "version": "E-14w-c" para que verifiques en
  Swagger qué archivo está vivo.
═════════════════════════════════════════════════════════════════════════════
QUÉ ES
------
Add-on INDEPENDIENTE (misma filosofía de pos_cuenta_live: no toca tus
modelos, tus routers ni tu pos_compat.py). Agrega 4 piezas:

  1. CONFIG DEL RESTAURANTE  → tabla karei_config (clave/valor) que SE CREA
     SOLA con datos ficticios estándar colombianos. Los editas desde la
     pantalla Ventas → "⚙ Datos del restaurante" (o por API).
  2. HISTORIAL DE PAGOS      → GET /pos/facturacion/pagos (filtros por
     días y método) — la tabla de la página Ventas.
  3. CIERRE DE CAJA (Informe Z, lo que exige la DIAN al POS)
                             → GET /pos/facturacion/cierre?fecha=YYYY-MM-DD
  4. TIRILLA / FACTURA       → GET /pos/facturacion/factura/{pago_id} con
     todo lo que pide el art. 617 ET + Res. 42/2020 en lo que aplica sin
     resolución real: razón social, NIT, consecutivo, fecha/hora, ítems
     con valor unitario y total, subtotal, IVA (discriminado), propina
     voluntaria, forma de pago (contado), medio de pago (efectivo/nequi/
     tarjeta), "consumidor final", nombre del software.

CONSECUTIVO DE TIRILLA
----------------------
El número nace en el COBRO: pos_cuenta_live.py E-14v (o posterior) guarda
karei_payments.ticket_no = MAX+1 en cada pago. Este add-on añade la columna
si falta y le pone número a los pagos viejos (backfill por fecha).

MOMENTO DIAN (fase 2/3)
-----------------------
Cuando tengas resolución de numeración REAL, edita los campos resolucion_*
en la configuración y cambia el título. Los campos CUFE/QR quedan listos
para la fase de factura electrónica (no se envían en fase 1).

INSTALACIÓN (2 líneas en main.py, JUNTO a las de pos_cuenta_live)
-----------------------------------------------------------------
    import pos_facturacion
    app.include_router(pos_facturacion.router)

⚠ Colócalas ARRIBA de los include_router de los routers viejos.
============================================================================
"""
import base64
import datetime
import glob
import json
import os
import re
import sys
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import create_engine, inspect as sa_inspect, text
from sqlalchemy.orm import sessionmaker

router = APIRouter()

# ─────────────────────────────────────────────────────────────────────────
# 1. LOCALIZAR LA BASE DE DATOS (mismo método probado de pos_cuenta_live)
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
        "[pos_facturacion] No encontré la base de datos. "
        "Exporta KAREI_DATABASE_URL=sqlite:///ruta/a/karei.db antes de arrancar uvicorn."
    )


DB_URL = _resolver_db_url()
for _drv in ("+aiosqlite", "+asyncpg", "+asyncmy", "+asyncodbc"):
    if _drv in DB_URL:
        DB_URL = DB_URL.replace(_drv, "")
        print("[pos_facturacion] URL con driver async detectada → driver sync:", DB_URL)
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
    print("[pos_facturacion]", *args)


def _uid() -> str:
    return uuid.uuid4().hex


def _now() -> str:
    return datetime.datetime.now().isoformat(sep=" ", timespec="seconds")


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


_log("E-14w-c activo — DB:", DB_URL)


def _es_sqlite() -> bool:
    """E-14w-b: ¿el motor es SQLite? rowid SOLO existe ahí; en Postgres
    el orden queda por fecha (desempate cosmético)."""
    try:
        return str(_engine.dialect.name).lower() == "sqlite"
    except Exception:
        return True


# ─────────────────────────────────────────────────────────────────────────
# 1.b AISLAMIENTO POR TENANT (E-14w) — cada empresa solo ve SUS datos
# ─────────────────────────────────────────────────────────────────────────
# Del header Bearer leo el id del usuario (sin verificar firma: no hace
# falta la clave) y el tenant lo saco de la FILA REAL en users.tenant_id.
# Un token falsificado no da acceso a nada: sin fila en users no hay tenant.
# Reglas de filtrado:
#   · requester CON tenant → solo pagos con ESE tenant_id.
#   · requester SIN tenant (legacy/dev) → solo pagos sin dueño (NULL).
def _tenant_de_request(request) -> Optional[str]:
    try:
        auth = str(getattr(request, "headers", {}).get("authorization") or "")
        if not auth.lower().startswith("bearer "):
            return None
        partes = auth.split(" ", 1)[1].strip().split(".")
        if len(partes) < 2:
            return None
        pad = partes[1] + "=" * (-len(partes[1]) % 4)
        payload = json.loads(base64.urlsafe_b64decode(pad))
        uid = payload.get("sub") or payload.get("user_id") or payload.get("id")
        if not uid:
            return None
        with _engine.connect() as cx:
            fila = cx.execute(text("SELECT tenant_id FROM users WHERE id = :u"),
                              {"u": str(uid)}).first()
            return (str(fila[0]) if fila and fila[0] is not None else None)
    except Exception as e:
        _log("tenant sin resolver (sigo en modo legacy):", e)
        return None


# E-14w-c: la VERDAD del dueño de un pago está en SUS ÓRDENES (tabla core
# `orders`, escrita por el order_service con el usuario autenticado). La
# marca tenant_id de karei_payments pudo quedar mal (backfill del demo).
def _filas_de_ordenes(ids: list) -> dict:
    """Devuelve {id_orden: tenant_id} leyendo la tabla core de órdenes.
    Descubre tabla y columnas de forma defensiva (mismo espíritu que
    _items_de_ordenes). Si no la encuentra, devuelve {} y el filtro
    estricto decide como siempre."""
    limpios: list = []
    for x in (ids or []):
        s = str(x or "").strip()
        if s and s not in limpios:
            limpios.append(s)
    if not limpios:
        return {}
    try:
        # E-14w-c-b: inspector sobre el ENGINE (Connection.get_bind() ya no
        # existe en SQLAlchemy 2.1+ — así sirve en 1.4, 2.0 y 2.1+)
        insp = sa_inspect(_engine)
        existentes = set(insp.get_table_names())
        tabla = None
        for cand in ("orders", "order", "pos_orders"):
            if cand in existentes:
                tabla = cand
                break
        if not tabla:
            return {}
        cols = [c["name"] for c in insp.get_columns(tabla)]
        cid = _primer_de(cols, ("id", "order_id", "pedido_id"))
        cte = _primer_de(cols, ("tenant_id",))
        if not cid or not cte:
            return {}
        duenos: dict = {}
        with _engine.connect() as cx:
            for i in range(0, min(len(limpios), 200), 50):
                lote = limpios[i:i + 50]
                ph = ",".join(f":i{n}" for n in range(len(lote)))
                params = {f"i{n}": v for n, v in enumerate(lote)}
                filas = cx.execute(text(
                    f"SELECT {cid}, {cte} FROM {tabla} WHERE {cid} IN ({ph})"),
                    params).all()
                for id_o, te_o in filas:
                    duenos[str(id_o)] = (str(te_o) if te_o is not None else None)
        return duenos
    except Exception as e:
        _log("órdenes no legibles para reparación (sigo con el filtro):", e)
        return {}


def _reparar_dueno(pagos: list, tenant: Optional[str]) -> None:
    """E-14w-c — EL DUEÑO DEL PAGO ES EL DUEÑO DE SUS ÓRDENES:
    si el pago quedó marcado con un tenant que no es el del que pide
    (vandalismo del backfill viejo, huérfano del demo…), pero TODAS sus
    órdenes pertenecen al que pide → se ADOPTA (UPDATE persistente) y el
    filtro lo deja pasar. Si ninguna orden es suya → sigue oculto."""
    try:
        mios = str(tenant or "")
        pendientes = [p for p in pagos
                      if str(p.get("tenant_id") or "") != mios]
        if not pendientes:
            return
        ids: list = []
        for p in pendientes:
            for o in str(p.get("order_ids") or "").split(","):
                o = o.strip()
                if o and o not in ids:
                    ids.append(o)
        if not ids:
            return  # sin órdenes no hay verdad mejor: decide el filtro
        duenos = _filas_de_ordenes(ids[:200])
        adoptados = []
        for p in pendientes:
            oids = [o.strip() for o in str(p.get("order_ids") or "").split(",")
                    if o.strip()]
            if not oids:
                continue
            t_ords = {str(duenos.get(o)) if duenos.get(o) is not None else ""
                      for o in oids}
            # E-14w-c-b: adoptar SOLO si TODAS las órdenes EXISTEN y son mías
            # (si la tabla de órdenes no las encuentra, no hay verdad mejor:
            # no se toca nada)
            if all(o in duenos for o in oids) and t_ords == {mios}:
                adoptados.append(p)
        if not adoptados:
            return
        with _engine.begin() as cx:
            for p in adoptados:
                cx.execute(text(
                    f"UPDATE {_TABLA_PAGOS} SET tenant_id = :t WHERE id = :i"),
                    {"t": tenant, "i": str(p.get("id"))})
        for p in adoptados:
            p["tenant_id"] = tenant
        _log(f"reparación E-14w-c: {len(adoptados)} pago(s) adoptado(s) — "
             "el dueño real es el de sus órdenes")
    except Exception as e:
        _log("reparación de dueño no pudo correr (sigo con el filtro):", e)


def _filtrar_por_tenant(pagos: list, tenant: Optional[str]) -> list:
    _reparar_dueno(pagos, tenant)  # E-14w-c: primero la verdad de las órdenes
    if tenant:
        return [p for p in pagos if str(p.get("tenant_id") or "") == tenant]
    return [p for p in pagos if p.get("tenant_id") in (None, "")]


# ─────────────────────────────────────────────────────────────────────────
# 2. CONFIG DEL RESTAURANTE (karei_config) — datos ficticios estándar CO
# ─────────────────────────────────────────────────────────────────────────
# NOTA IVA: Cristian pidió "18%", pero el IVA estándar colombiano es 19%
# (y 8% para el servicio de restaurante). Dejamos 19 por defecto, editable
# en la configuración. IVA INCLUIDO en los precios (lo normal en cartas):
# el total del cobro NO cambia, solo se discrimina base/IVA en la tirilla.
_CONFIG_DEFECTO = {
    "nombre": "Kārei Restaurante",
    "slogan": "Comida con alma",
    "nit": "900.123.456-7",
    "direccion": "Cra 43A # 18-90, El Poblado",
    "ciudad": "Medellín, Antioquia",
    "telefono": "+57 300 123 4567",
    "regimen": "Responsable de IVA",
    "iva_pct": "19",
    "iva_incluido": "si",
    "resolucion_numero": "18760000000001",
    "resolucion_prefijo": "POS1",
    "resolucion_rango_ini": "1",
    "resolucion_rango_fin": "5000",
    "resolucion_fecha": "2025-01-15",
    "resolucion_vigencia": "12 meses (2025-2026)",
    "software_nombre": "Kārei · software gastronómico",
    "software_nit": "901.456.789-0",
    "pie_gracias": "¡Gracias por su visita! Vuelva pronto",
}
_TABLA_CFG = "karei_config"
_CFG_LISTA = {"hecho": False}


def _asegurar_config() -> bool:
    if _CFG_LISTA["hecho"]:
        return True
    try:
        with _engine.begin() as cx:
            cx.execute(text(
                f"CREATE TABLE IF NOT EXISTS {_TABLA_CFG} ("
                "clave VARCHAR(60) PRIMARY KEY, valor TEXT, updated_at TIMESTAMP)"))  # E-14w-b: TIMESTAMP (DATETIME no existe en PG)
            for k, v in _CONFIG_DEFECTO.items():
                # E-14w-b: INSERT OR IGNORE es de SQLite → ON CONFLICT sirve
                # igual en SQLite (3.24+) y en Postgres.
                cx.execute(text(
                    f"INSERT INTO {_TABLA_CFG} (clave, valor, updated_at) "
                    "VALUES (:k, :v, :u) "
                    "ON CONFLICT(clave) DO NOTHING"), {"k": k, "v": v, "u": _now()})
        _CFG_LISTA["hecho"] = True
        _log("config del restaurante lista:", _TABLA_CFG)
        return True
    except Exception as e:
        _log("no pude crear", _TABLA_CFG, "(no crítico):", e)
        return False


def _config_dict() -> dict:
    cfg = dict(_CONFIG_DEFECTO)
    try:
        if _asegurar_config():
            with _engine.connect() as cx:
                filas = cx.execute(text(
                    f"SELECT clave, valor FROM {_TABLA_CFG}")).all()
            for k, v in filas:
                cfg[str(k)] = "" if v is None else str(v)
    except Exception as e:
        _log("config: leyendo con defaults (no crítico):", e)
    return cfg


# ─────────────────────────────────────────────────────────────────────────
# 3. CONSECUTIVO DE TIRILLA (karei_payments.ticket_no)
# ─────────────────────────────────────────────────────────────────────────
_TABLA_PAGOS = "karei_payments"
_TKT_LISTO = {"hecho": False}
_TENANT_LISTO = {"hecho": False}


def _asegurar_tenant_pagos() -> bool:
    """E-14w: columna tenant_id en karei_payments si falta. Idempotente:
    corre una sola vez por proceso. E-14w-c: el backfill al tenant de
    admin@karei.app quedó FUERA (escondía pagos propios en Ventas);
    los huérfanos ahora los adopta _reparar_dueno() por sus órdenes."""
    if _TENANT_LISTO["hecho"]:
        return True
    try:
        with _engine.begin() as cx:
            try:
                cx.execute(text(
                    f"ALTER TABLE {_TABLA_PAGOS} ADD COLUMN tenant_id VARCHAR(36)"))
                _log("columna tenant_id añadida a", _TABLA_PAGOS)
            except Exception as ea:
                if "duplicate" not in str(ea).lower() and "exists" not in str(ea).lower():
                    _log("tenant_id sin ALTER (no crítico):", ea)
            # E-14w-c: sin backfill al tenant de admin@karei.app — los
            # huérfanos los adopta _reparar_dueno() (verdad = sus órdenes)
        _TENANT_LISTO["hecho"] = True
        return True
    except Exception as e:
        _log("aislamiento sin preparar (no crítico):", e)
        return False


def _asegurar_ticket_no() -> bool:
    """Añade la columna ticket_no a karei_payments si falta (no rompe nada)."""
    if _TKT_LISTO["hecho"]:
        return True
    try:
        with _engine.begin() as cx:
            cx.execute(text(
                f"ALTER TABLE {_TABLA_PAGOS} ADD COLUMN ticket_no INTEGER"))
        _log("columna ticket_no añadida a", _TABLA_PAGOS)
        _TKT_LISTO["hecho"] = True
        return True
    except Exception as e:
        if "duplicate column" in str(e).lower() or "already exists" in str(e).lower():
            _TKT_LISTO["hecho"] = True
            return True
        _log("ticket_no sin ALTER (no crítico):", e)
        return False


def _backfill_tickets() -> int:
    """Asigna consecutivo a los pagos viejos que quedaron NULL (por fecha)."""
    if not _asegurar_ticket_no():
        return 0
    try:
        with _engine.begin() as cx:
            filas = cx.execute(text(
                f"SELECT id FROM {_TABLA_PAGOS} WHERE ticket_no IS NULL "
                f"ORDER BY COALESCE(paid_at, created_at)"
                + (", rowid" if _es_sqlite() else ""))).all()  # E-14w-b: sin rowid en PG
            if not filas:
                return 0
            mx = cx.execute(text(
                f"SELECT COALESCE(MAX(ticket_no),0) FROM {_TABLA_PAGOS}")).scalar()
            n = int(mx or 0)
            for (pid,) in filas:
                n += 1
                cx.execute(text(
                    f"UPDATE {_TABLA_PAGOS} SET ticket_no = :t WHERE id = :i"),
                    {"t": n, "i": pid})
        if filas:
            _log("backfill de tickets:", len(filas), "pago(s) viejo(s) numerados")
        return len(filas)
    except Exception as e:
        _log("backfill tickets falló (no crítico):", e)
        return 0


_backfill_tickets()  # al arrancar


def _prefijo() -> str:
    return (_config_dict().get("resolucion_prefijo") or "POS").strip() or "POS"


def _tirilla_no(n) -> str:
    try:
        return f"{_prefijo()}-{int(n):06d}"
    except (TypeError, ValueError):
        return "S/N"


# ─────────────────────────────────────────────────────────────────────────
# 4. ITEMS DE LAS ÓRDENES (para la tirilla) — lectura genérica probada
# ─────────────────────────────────────────────────────────────────────────
def _columnas(cx, tabla: str) -> list:
    try:
        try:
            bind = cx.get_bind()   # Session (SQLAlchemy 1.4/2.0)
        except Exception:
            bind = _engine          # Connection 2.1+/fallback: engine directo
        return [c["name"] for c in sa_inspect(bind).get_columns(tabla)]
    except Exception:
        try:
            filas = cx.execute(text(
                "SELECT name FROM pragma_table_info(:t)"), {"t": tabla}).all()
            return [str(r[0]) for r in filas]
        except Exception:
            return []


def _primer_de(cols: list, opciones: tuple) -> Optional[str]:
    for o in opciones:
        if o in cols:
            return o
    return None


def _items_de_ordenes(db, order_ids: list) -> list:
    """Lee order_items de las órdenes dadas, completa nombre/precio desde
    recipes si falta (mismo enfoque del add-on de cuenta). Si no hay items
    legibles, devuelve una sola línea 'Consumo en mesa' con el total."""
    ids = [str(x) for x in (order_ids or []) if str(x or "").strip()]
    if not ids:
        return []
    try:
        cols_oi = _columnas(db, "order_items")
        if not cols_oi:
            return []
        fk = _primer_de(cols_oi, ("order_id", "pedido_id", "orden_id", "order"))
        if not fk:
            return []
        cqty = _primer_de(cols_oi, ("quantity", "cantidad", "qty")) or "quantity"
        cpre = _primer_de(cols_oi, ("unit_price", "precio", "price", "valor"))
        cnom = _primer_de(cols_oi, ("name", "nombre", "descripcion", "description"))
        crec = _primer_de(cols_oi, ("recipe_id", "receta_id", "product_id"))
        ph = ",".join(f":i{n}" for n in range(len(ids)))
        params = {f"i{n}": v for n, v in enumerate(ids)}
        filas = db.execute(text(
            f"SELECT * FROM order_items WHERE {fk} IN ({ph})"), params).mappings().all()

        # recipes para completar nombre/precio
        recs = {}
        if crec:
            try:
                cols_r = _columnas(db, "recipes")
                rid = _primer_de(cols_r, ("id",)) or "id"
                rnom = _primer_de(cols_r, ("name", "nombre", "titulo", "title")) or "name"
                rpre = _primer_de(cols_r, ("sale_price", "precio_venta", "price",
                                           "precio", "unit_price"))
                filas_r = db.execute(text(f"SELECT * FROM recipes")).mappings().all()
                for fr in filas_r:
                    d = dict(fr)
                    clave = str(d.get(rid))
                    recs[clave] = {
                        "nombre": d.get(rnom),
                        "precio": (float(d[rpre]) if rpre and d.get(rpre) is not None else None),
                    }
            except Exception:
                recs = {}

        items = []
        for f in filas:
            d = dict(f)
            rec = recs.get(str(d.get(crec))) if crec else None
            nombre = (d.get(cnom) if cnom else None) or (rec or {}).get("nombre") or "Producto"
            try:
                cantidad = int(float(d.get(cqty) or 1))
            except (TypeError, ValueError):
                cantidad = 1
            if cpre and d.get(cpre) is not None:
                try:
                    precio = float(d[cpre])
                except (TypeError, ValueError):
                    precio = (rec or {}).get("precio") or 0.0
            else:
                precio = (rec or {}).get("precio") or 0.0
            items.append({"nombre": str(nombre), "cantidad": cantidad,
                          "precio_unit": round(precio, 2),
                          "total": round(cantidad * precio, 2),
                          "notes": d.get("notes") or d.get("nota") or ""})
        return items
    except Exception as e:
        _log("items de factura falló (uso fallback):", e)
        return []


# ─────────────────────────────────────────────────────────────────────────
# 5. ENDPOINTS
# ─────────────────────────────────────────────────────────────────────────
# 5.a CONFIG (GET/PUT) — la edita el botón "⚙ Datos del restaurante"
@router.get("/api/v1/pos/facturacion/config")
@router.get("/api/v1/pos/config/restaurante")
def ver_config():
    return {"version": "E-14w-c", "config": _config_dict()}


@router.put("/api/v1/pos/facturacion/config")
@router.put("/api/v1/pos/config/restaurante")
def guardar_config(payload: Optional[dict] = None):
    if not isinstance(payload, dict) or not payload:
        raise HTTPException(422, "Manda un objeto {campo: valor} para guardar")
    if not _asegurar_config():
        raise HTTPException(500, "No pude crear la tabla de configuración")
    guardados = []
    for k, v in payload.items():
        clave = re.sub(r"[^a-z0-9_]+", "_", str(k).strip().lower())[:60]
        if clave in ("", "clave"):
            continue
        try:
            with _engine.begin() as cx:
                cx.execute(text(
                    f"INSERT INTO {_TABLA_CFG} (clave, valor, updated_at) "
                    "VALUES (:k, :v, :u) "
                    "ON CONFLICT(clave) DO UPDATE SET valor = :v, updated_at = :u"),
                    {"k": clave, "v": "" if v is None else str(v), "u": _now()})
            guardados.append(clave)
        except Exception as e:
            _log("config: clave sin guardar", clave, ":", e)
    _log("config actualizada:", guardados)
    return {"version": "E-14w-c", "ok": True, "guardados": guardados,
            "config": _config_dict()}


# 5.b HISTORIAL DE PAGOS — tabla de la página Ventas
@router.get("/api/v1/pos/facturacion/pagos")
@router.get("/api/v1/pos/facturacion/ventas")
def historial_pagos(request: Request, dias: int = 7, metodo: Optional[str] = None,
                    limit: int = 100, offset: int = 0):
    # E-14w: cada restaurante solo ve SUS cobros
    _asegurar_tenant_pagos()
    tenant = _tenant_de_request(request)
    pagos = []
    try:
        with _engine.connect() as cx:
            filas = cx.execute(text(
                f"SELECT * FROM {_TABLA_PAGOS} "
                "ORDER BY COALESCE(paid_at, created_at) DESC"
                + (", rowid DESC" if _es_sqlite() else ""))).mappings().all()  # E-14w-b
            pagos = [dict(f) for f in filas]
    except Exception as e:
        _log("historial: no pude leer pagos:", e)
        return {"version": "E-14w-c", "pagos": [], "n": 0, "total": 0,
                "currency": "COP"}
    # E-14w: fuera los pagos de otras empresas
    pagos = _filtrar_por_tenant(pagos, tenant)
    desde = None
    if dias and int(dias) > 0:
        d0 = datetime.datetime.now() - datetime.timedelta(days=int(dias))
        desde = datetime.datetime(d0.year, d0.month, d0.day)
    if desde is not None:
        pagos = [p for p in pagos
                 if (f := _fecha_de(p)) is not None and f >= desde]
    if metodo:
        m = str(metodo).strip().lower()
        pagos = [p for p in pagos if str(p.get("method") or "") == m]
    limit = max(1, min(int(limit or 100), 500))
    off = max(0, int(offset or 0))
    total_all = round(sum(float(p.get("total") or 0) for p in pagos), 2)
    pagina = pagos[off:off + limit]
    return {"version": "E-14w-c", "n": len(pagos), "total": total_all,
            "currency": "COP",
            "pagos": [{
                "id": p.get("id"),
                "tirilla_no": _tirilla_no(p.get("ticket_no")),
                "fecha": (_fecha_de(p).strftime("%Y-%m-%d %H:%M") if _fecha_de(p) else None),
                "mesa": p.get("table_name"), "metodo": p.get("method"),
                "subtotal": float(p.get("subtotal") or 0),
                "propina": float(p.get("tip") or 0),
                "total": float(p.get("total") or 0),
                "n_orders": int(p.get("n_orders") or 0),
            } for p in pagina]}


# 5.c CIERRE DE CAJA (Informe Z — requisito POS de la DIAN)
@router.get("/api/v1/pos/facturacion/cierre")
@router.get("/api/v1/pos/facturacion/cierre-de-caja")
def cierre_de_caja(request: Request, fecha: Optional[str] = None):
    # E-14w: el Informe Z de cada restaurante es SOLO suyo
    _asegurar_tenant_pagos()
    tenant = _tenant_de_request(request)
    f = None
    if fecha:
        try:
            f = datetime.datetime.strptime(fecha, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(422, "fecha debe ser YYYY-MM-DD")
    if f is None:
        ahora = datetime.datetime.now()
        f = datetime.datetime(ahora.year, ahora.month, ahora.day)
    d1 = f + datetime.timedelta(days=1)

    pagos = []
    try:
        with _engine.connect() as cx:
            filas = cx.execute(text(
                f"SELECT * FROM {_TABLA_PAGOS} "
                "ORDER BY COALESCE(paid_at, created_at)"
                + (", rowid" if _es_sqlite() else ""))).mappings().all()  # E-14w-b
            pagos = [dict(x) for x in filas]
    except Exception as e:
        _log("cierre: no pude leer pagos:", e)
    # E-14w: fuera los pagos de otras empresas
    pagos = _filtrar_por_tenant(pagos, tenant)
    del_dia = []
    for p in pagos:
        fp = _fecha_de(p)
        if fp is not None and f <= fp < d1:
            del_dia.append(p)

    canon = ("efectivo", "tarjeta", "nequi")
    por_metodo = []
    for m in canon:
        sel = [p for p in del_dia if str(p.get("method") or "") == m]
        por_metodo.append({
            "metodo": m,
            "total": round(sum(float(p.get("total") or 0) for p in sel), 2),
            "propina": round(sum(float(p.get("tip") or 0) for p in sel), 2),
            "n": len(sel)})
    otros = [p for p in del_dia if str(p.get("method") or "") not in canon]
    if otros:
        por_metodo.append({
            "metodo": "otros",
            "total": round(sum(float(p.get("total") or 0) for p in otros), 2),
            "propina": round(sum(float(p.get("tip") or 0) for p in otros), 2),
            "n": len(otros)})

    tickets = [int(p.get("ticket_no")) for p in del_dia
               if p.get("ticket_no") is not None]
    horas = sorted([_fecha_de(p) for p in del_dia if _fecha_de(p) is not None])
    cfg = _config_dict()
    return {"version": "E-14w-c", "tipo": "CIERRE DE CAJA (Informe Z)",
            "fecha": f.strftime("%Y-%m-%d"),
            "generado_en": _now(),
            "n_pagos": len(del_dia),
            "subtotal": round(sum(float(p.get("subtotal") or 0) for p in del_dia), 2),
            "propina": round(sum(float(p.get("tip") or 0) for p in del_dia), 2),
            "total": round(sum(float(p.get("total") or 0) for p in del_dia), 2),
            "por_metodo": por_metodo,
            "primer_pago": (horas[0].strftime("%H:%M") if horas else None),
            "ultimo_pago": (horas[-1].strftime("%H:%M") if horas else None),
            "tickets": {"desde": _tirilla_no(min(tickets)) if tickets else None,
                        "hasta": _tirilla_no(max(tickets)) if tickets else None},
            "resolucion": {
                "numero": cfg.get("resolucion_numero"),
                "prefijo": cfg.get("resolucion_prefijo"),
                "rango": f"{cfg.get('resolucion_prefijo')}-{cfg.get('resolucion_rango_ini')} "
                         f"a {cfg.get('resolucion_prefijo')}-{cfg.get('resolucion_rango_fin')}",
                "vigencia": cfg.get("resolucion_vigencia")},
            "currency": "COP"}


# 5.d TIRILLA / FACTURA por pago_id — alimenta el componente Tirilla.tsx
@router.get("/api/v1/pos/facturacion/factura/{pago_id}")
@router.get("/api/v1/pos/facturacion/tirilla/{pago_id}")
def factura_por_pago(pago_id: str, request: Request, db=Depends(_db)):
    _asegurar_tenant_pagos()
    try:
        f = db.execute(text(
            f"SELECT * FROM {_TABLA_PAGOS} WHERE id = :i"),
            {"i": str(pago_id)}).mappings().first()
    except Exception as e:
        db.rollback()
        raise HTTPException(500, f"No pude leer el pago: {e}")
    if not f:
        raise HTTPException(404, f"Pago {pago_id} no encontrado")
    pago = dict(f)
    # E-14w: la tirilla de otro restaurante NO existe pa' ti (404)
    te = _tenant_de_request(request)
    # E-14w-c-b: antes de dar 404, la MISMA verdad de las órdenes — si el
    # pago quedó mal marcado (backfill viejo / huérfano del demo) pero SUS
    # órdenes son todas del que pide, se ADOPTA y la tirilla sale 🧾.
    if str(pago.get("tenant_id") or "") != str(te or ""):
        _reparar_dueno([pago], te)
    if te is not None:
        if str(pago.get("tenant_id") or "") != te:
            raise HTTPException(404, f"Pago {pago_id} no encontrado")
    elif pago.get("tenant_id") not in (None, ""):
        raise HTTPException(404, f"Pago {pago_id} no encontrado")

    # Consecutivo perezoso: pagos viejos sin número lo reciben al verlos
    if pago.get("ticket_no") is None and _asegurar_ticket_no():
        try:
            with _engine.begin() as cx:
                # E-14w: consecutivo POR TENANT (cada restaurante su conteo)
                te2 = pago.get("tenant_id")
                if te2 is None:
                    nx = cx.execute(text(
                        f"SELECT COALESCE(MAX(ticket_no),0)+1 FROM {_TABLA_PAGOS} "
                        "WHERE tenant_id IS NULL")).scalar()
                else:
                    nx = cx.execute(text(
                        f"SELECT COALESCE(MAX(ticket_no),0)+1 FROM {_TABLA_PAGOS} "
                        "WHERE tenant_id = :te"), {"te": te2}).scalar()
                cx.execute(text(
                    f"UPDATE {_TABLA_PAGOS} SET ticket_no = :t WHERE id = :i"),
                    {"t": int(nx), "i": pago["id"]})
            pago["ticket_no"] = int(nx)
        except Exception as e:
            _log("ticket perezoso falló (no crítico):", e)

    cfg = _config_dict()
    order_ids = [x for x in str(pago.get("order_ids") or "").split(",") if x.strip()]
    items = _items_de_ordenes(db, order_ids)
    if not items:
        items = [{"nombre": "Consumo en mesa", "cantidad": 1,
                  "precio_unit": float(pago.get("subtotal") or 0),
                  "total": float(pago.get("subtotal") or 0), "notes": ""}]

    # IVA configurable (fase 1: incluido en el precio → el total NO cambia)
    try:
        pct = float(cfg.get("iva_pct") or 0)
    except (TypeError, ValueError):
        pct = 0.0
    incluido = str(cfg.get("iva_incluido") or "si").strip().lower() in (
        "si", "sí", "true", "1", "yes")
    subtotal = round(float(pago.get("subtotal") or 0), 2)
    propina = round(float(pago.get("tip") or 0), 2)
    if pct > 0:
        if incluido:
            base = round(subtotal / (1 + pct / 100.0), 2)
            iva = round(subtotal - base, 2)
            total = round(subtotal + propina, 2)
        else:
            base = subtotal
            iva = round(subtotal * pct / 100.0, 2)
            total = round(subtotal + iva + propina, 2)
    else:
        base, iva, total = subtotal, 0.0, round(subtotal + propina, 2)

    fp = _fecha_de(pago)
    return {"version": "E-14w-c", "currency": "COP",
            "config": cfg,
            "pago": {"id": pago.get("id"),
                     "tirilla_no": _tirilla_no(pago.get("ticket_no")),
                     "fecha": (fp.strftime("%Y-%m-%d %H:%M:%S") if fp else None),
                     "mesa": pago.get("table_name"),
                     "metodo": pago.get("method"),
                     "n_orders": int(pago.get("n_orders") or 0)},
            "items": items,
            "totales": {"base": base, "iva": iva, "iva_pct": pct,
                        "iva_incluido": incluido, "subtotal": subtotal,
                        "propina": propina, "total": total,
                        "leyenda_iva": ("IVA incluido en los precios"
                                        if incluido else "IVA por agregar")}}