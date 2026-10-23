"""
═════════════════════════════════════════════════════════════════════════════
Kārei · pos_facturacion.py (E-14w) — FACTURACIÓN: TIRILLA + CAJA + CUADRE
═════════════════════════════════════════════════════════════════════════════
QUÉ ES
------
Add-on INDEPENDIENTE (misma filosofía de pos_cuenta_live: no toca tus
modelos, tus routers ni tu pos_compat.py). Agrega 5 piezas:

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
  5. CUADRE DEL DÍA IMPRIMIBLE → GET /pos/facturacion/cuadre — el Informe
     Z listo para imprimir y firmar: LO QUE SE VENDIÓ (plato a plato con
     cantidades), el TOTAL de la venta con base e IVA discriminados, y el
     RECAUDO por método de pago (cuánto quedó en efectivo en caja, cuánto
     entró por Nequi y cuánto por tarjeta — las "consignaciones" del día),
     con las propinas aparte. Lo imprime el botón "🖨️ Cuadre del día" de
     la página Ventas (componente CuadreDia.tsx).

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


_log("E-14w activo — DB:", DB_URL)


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
                "clave VARCHAR(60) PRIMARY KEY, valor TEXT, updated_at DATETIME)"))
            for k, v in _CONFIG_DEFECTO.items():
                cx.execute(text(
                    f"INSERT OR IGNORE INTO {_TABLA_CFG} (clave, valor, updated_at) "
                    "VALUES (:k, :v, :u)"), {"k": k, "v": v, "u": _now()})
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
                "ORDER BY COALESCE(paid_at, created_at), rowid")).all()
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
        return [c["name"] for c in sa_inspect(cx.get_bind()).get_columns(tabla)]
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
    return {"version": "E-14w", "config": _config_dict()}


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
    return {"version": "E-14w", "ok": True, "guardados": guardados,
            "config": _config_dict()}


# 5.b HISTORIAL DE PAGOS — tabla de la página Ventas
@router.get("/api/v1/pos/facturacion/pagos")
@router.get("/api/v1/pos/facturacion/ventas")
def historial_pagos(dias: int = 7, metodo: Optional[str] = None,
                    limit: int = 100, offset: int = 0):
    pagos = []
    try:
        with _engine.connect() as cx:
            filas = cx.execute(text(
                f"SELECT * FROM {_TABLA_PAGOS} "
                "ORDER BY COALESCE(paid_at, created_at) DESC, rowid DESC")).mappings().all()
            pagos = [dict(f) for f in filas]
    except Exception as e:
        _log("historial: no pude leer pagos:", e)
        return {"version": "E-14w", "pagos": [], "n": 0, "total": 0,
                "currency": "COP"}
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
    return {"version": "E-14w", "n": len(pagos), "total": total_all,
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
def cierre_de_caja(fecha: Optional[str] = None):
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
                "ORDER BY COALESCE(paid_at, created_at), rowid")).mappings().all()
            pagos = [dict(x) for x in filas]
    except Exception as e:
        _log("cierre: no pude leer pagos:", e)
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
    return {"version": "E-14w", "tipo": "CIERRE DE CAJA (Informe Z)",
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
def factura_por_pago(pago_id: str, db=Depends(_db)):
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

    # Consecutivo perezoso: pagos viejos sin número lo reciben al verlos
    if pago.get("ticket_no") is None and _asegurar_ticket_no():
        try:
            with _engine.begin() as cx:
                nx = cx.execute(text(
                    f"SELECT COALESCE(MAX(ticket_no),0)+1 FROM {_TABLA_PAGOS}")).scalar()
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
    return {"version": "E-14w", "currency": "COP",
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


# 5.e CUADRE DEL DÍA — el Informe Z imprimible: qué se vendió + recaudo
# Lo imprime el botón "🖨️ Cuadre del día" de la página Ventas (CuadreDia.tsx)
@router.get("/api/v1/pos/facturacion/cuadre")
@router.get("/api/v1/pos/facturacion/cuadre-del-dia")
def cuadre_del_dia(fecha: Optional[str] = None, db=Depends(_db)):
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
                "ORDER BY COALESCE(paid_at, created_at), rowid")).mappings().all()
            pagos = [dict(x) for x in filas]
    except Exception as e:
        _log("cuadre: no pude leer pagos:", e)
    del_dia = []
    for p in pagos:
        fp = _fecha_de(p)
        if fp is not None and f <= fp < d1:
            del_dia.append(p)

    # ── LO QUE SE VENDIÓ: agrego los items de las órdenes de cada cobro ──
    prod: dict = {}
    for p in del_dia:
        ids = [x for x in str(p.get("order_ids") or "").split(",") if x.strip()]
        items = _items_de_ordenes(db, ids)
        if not items:
            # sin items legibles → una línea "Consumo en mesa" con el subtotal
            st = float(p.get("subtotal") or 0)
            if st <= 0:
                continue
            d0 = prod.get("Consumo en mesa") or {
                "nombre": "Consumo en mesa", "cantidad": 0, "total": 0.0}
            d0["cantidad"] += 1
            d0["total"] += st
            prod["Consumo en mesa"] = d0
            continue
        for it in items:
            clave = str(it.get("nombre") or "Producto")
            d0 = prod.get(clave) or {"nombre": clave, "cantidad": 0, "total": 0.0}
            d0["cantidad"] += int(it.get("cantidad") or 1)
            d0["total"] += float(it.get("total") or 0)
            prod[clave] = d0
    por_producto = sorted(
        [{"nombre": v["nombre"], "cantidad": v["cantidad"],
          "total": round(v["total"], 2)} for v in prod.values()],
        key=lambda x: -x["total"])

    # ── RECAUDO por método (los 3 canónicos SIEMPRE presentes + otros) ──
    canon = ("efectivo", "tarjeta", "nequi")
    por_metodo = []
    for m in canon:
        sel = [p for p in del_dia if str(p.get("method") or "") == m]
        por_metodo.append({
            "metodo": m, "n": len(sel),
            "subtotal": round(sum(float(p.get("subtotal") or 0) for p in sel), 2),
            "propina": round(sum(float(p.get("tip") or 0) for p in sel), 2),
            "total": round(sum(float(p.get("total") or 0) for p in sel), 2)})
    otros = [p for p in del_dia if str(p.get("method") or "") not in canon]
    if otros:
        por_metodo.append({
            "metodo": "otros", "n": len(otros),
            "subtotal": round(sum(float(p.get("subtotal") or 0) for p in otros), 2),
            "propina": round(sum(float(p.get("tip") or 0) for p in otros), 2),
            "total": round(sum(float(p.get("total") or 0) for p in otros), 2)})

    # ── TOTALES del día + IVA discriminado (misma matemática de la tirilla) ──
    cfg = _config_dict()
    try:
        pct = float(cfg.get("iva_pct") or 0)
    except (TypeError, ValueError):
        pct = 0.0
    incluido = str(cfg.get("iva_incluido") or "si").strip().lower() in (
        "si", "sí", "true", "1", "yes")
    venta = round(sum(float(p.get("subtotal") or 0) for p in del_dia), 2)
    propinas = round(sum(float(p.get("tip") or 0) for p in del_dia), 2)
    if pct > 0 and incluido:
        base = round(venta / (1 + pct / 100.0), 2)
        iva = round(venta - base, 2)
    elif pct > 0:
        base = venta
        iva = round(venta * pct / 100.0, 2)
    else:
        base, iva = venta, 0.0

    tickets = [int(p.get("ticket_no")) for p in del_dia
               if p.get("ticket_no") is not None]
    horas = sorted([_fecha_de(p) for p in del_dia if _fecha_de(p) is not None])
    return {"version": "E-14w", "tipo": "CUADRE DEL DÍA (Informe Z)",
            "fecha": f.strftime("%Y-%m-%d"),
            "generado_en": _now(),
            "currency": "COP",
            "config": cfg,
            "resumen": {"n_pagos": len(del_dia),
                        "venta_total": venta,
                        "propinas": propinas,
                        "gran_total": round(venta + propinas, 2),
                        "base": base, "iva": iva,
                        "iva_pct": pct, "iva_incluido": incluido,
                        "leyenda_iva": ("IVA incluido en los precios"
                                        if incluido else "IVA por agregar")},
            "por_producto": por_producto,
            "por_metodo": por_metodo,
            "primer_pago": (horas[0].strftime("%H:%M") if horas else None),
            "ultimo_pago": (horas[-1].strftime("%H:%M") if horas else None),
            "tickets": {"desde": _tirilla_no(min(tickets)) if tickets else None,
                        "hasta": _tirilla_no(max(tickets)) if tickets else None}}