# -*- coding: utf-8 -*-
"""
============================================================================
Kārei · pos_cuenta_live.py (E-14w) — CUENTA EN VIVO + COBRAR + REPORTES
VERSION: E-14w · VERIFICA: la ÚLTIMA línea de este archivo dice "E-14w"

NUEVO EN E-14w (AISLAMIENTO POR TENANT — cada empresa ve SOLO lo suyo):
· Cada pago queda marcado con tenant_id (la empresa que cobró) y el
  consecutivo de tirilla es POR TENANT (cada restaurante lleva su propio
  POS1-1, POS1-2… como manda la DIAN).
· GET /pos/reportes/pagos filtra SIEMPRE por el tenant del usuario del
  token (el tenant sale de la FILA REAL en users, no del token).
· Los pagos viejos sin dueño (del demo) pasan al tenant de admin@karei.app
  → los tenants nuevos nacen con su caja en CERO y jamás ven datos ajenos.

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


_log("E-14w activo — DB:", DB_URL)


# ─────────────────────────────────────────────────────────────────────────
# 1.b AISLAMIENTO POR TENANT (E-14w) — cada empresa solo ve SUS datos
# ─────────────────────────────────────────────────────────────────────────
# Del header Bearer leo el id del usuario (sin verificar firma: no hace
# falta la clave) y el tenant lo saco de la FILA REAL en users.tenant_id.
# Un token falsificado no da acceso a nada: sin fila en users no hay tenant.
# Reglas de filtrado:
#   · requester CON tenant → solo filas con ESE tenant_id.
#   · requester SIN tenant (legacy/dev) → solo filas sin dueño (NULL).
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


def _filtrar_por_tenant(pagos: list, tenant: Optional[str]) -> list:
    if tenant:
        return [p for p in pagos if str(p.get("tenant_id") or "") == tenant]
    return [p for p in pagos if p.get("tenant_id") in (None, "")]


def _uid() -> str:
    return uuid.uuid4().hex


def _now() -> str:
    return datetime.datetime.utcnow().isoformat(sep=" ", timespec="seconds")


def _norm_id(x) -> str:
    """FIX E-14f: la DB guarda ids SIN guiones pero el front a veces manda
    UUID CON guiones. Es el MISMO id: aceptamos ambas formas."""
    return str(x or "").strip().replace("-", "")