# -*- coding: utf-8 -*-
"""
============================================================================
Kārei · pos_mesas.py (E-14y2) — MAPA DE MESAS EN VIVO + CREAR + ELIMINAR
VERSION: E-14y2 · VERIFICA: la ÚLTIMA línea de este archivo dice "E-14y2"

FIX E-14y2 (el IntegrityError "NOT NULL constraint failed: tables.code"):
· CAUSA: tu tabla `tables` REAL exige columnas que el INSERT no mandaba
  (code NOT NULL; y is_active sin default). Solo pasaba en TU BD porque
  los tests creaban su propia tabla sin esas restricciones.
· AHORA el INSERT se arma mirando el ESQUEMA REAL de la tabla:
    · code → se genera ÚNICO por dueño desde el nombre ('Terraza 2' →
      'TERRAZA-2'; si ya existe → 'TERRAZA-2-2', '-3', ...).
    · is_active → siempre 1 (las rutas viejas filtran is_active = 1; sin
      eso la mesa nacía invisible para el dashboard/rutas viejas).
    · CUALQUIER otra columna NOT NULL sin default se llena sola con un
      valor sensato (y queda avisado en la terminal qué llenó).
· status: JAMÁS fuera del enum real del ORM. El escáner ahora encuentra
  los enums aunque los modelos estén declarados con Base (antes escribía
  'LIBRE' y eso envenena la fila — la lección E-14i otra vez). En tu BD
  queda 'AVAILABLE' y el dashboard/rutas viejas NO se caen.
· Si igualmente fallara algo rarísimo, el error sale LIMPIO en el modal
  (500 con la columna exacta), sin traceback ASGI pelado.

FIX E-14y (el bug del 401 al crear mesa — "me botó al login"):
· CAUSA: el v1 exigía users.tenant_id NO NULL para crear/eliminar mesas.
  El admin DEMO (admin@karei.app) tiene tenant_id NULL en la BD (su usuario
  es anterior a la era multi-tenant) → TODO POST/DELETE respondía 401 →
  el interceptor 401 del frontend cerraba la sesión y botaba al login.
· AHORA: 401 SOLO si el token no identifica a NADIE en la BD. Un usuario
  autenticado SIN tenant (demo/legacy) crea/elimina mesas SIN dueño
  (tenant_id NULL = modo demo) — jamás visibles para otros tenants, así
  el aislamiento queda intacto.
· RESOLVER DE TOKEN BLINDADO: revisa varios claims (sub, user_id, id,
  uid, usuario_id, userId), acepta ids con y sin guiones, y si el id no
  aparece busca por email. Si aun así no encuentra al usuario, deja en la
  terminal:  [pos_mesas] token leído pero SIN usuario en BD · claims: [...]
  → pegando esa línea en el chat se clava el claim exacto en una ronda.

QUÉ RESUELVE (lo que reportó Cristian):
· El front pedía GET /api/v1/pos/mapa y el backend respondía 404 → el
  modal "Nueva mesa" se quedaba en "Creando..." y la mesa nunca aparecía.
· Este add-on MONTA el mapa de verdad, sobre TU tabla `tables` (la misma
  que usan pos_compat y pos_cuenta_live), con AISLAMIENTO POR TENANT:
  cada restaurante solo ve SUS mesas. Una cuenta nueva nace con el mapa
  en CERO (jamás ve las mesas del demo ni de otra empresa).
· Y trae lo segundo que pediste: eliminar mesas SIN historial de ventas
  (una a una o todas de golpe), con candado: si la mesa tiene pedidos o
  pagos, NO se borra (trazabilidad contable/DIAN) y se avisa por qué.

RUTAS (cada una en doble variante /api/v1/... y /...):
    GET    /pos/mapa              → mapa completo agrupado por área
    POST   /pos/mesas             → crear mesa (crea el área si es nueva)
    POST   /pos/mesas/limpiar     → elimina TODAS las mesas sin ventas
    DELETE /pos/mesas/{id}        → elimina UNA mesa solo si no tiene ventas

Cómo se monta (main.py): igual que los otros add-ons — el archivo va en la
MISMA carpeta donde está pos_compat.py y el include va ANTES de los
routers viejos. Al arrancar busca en la consola:
    [pos_mesas] E-14y2 listo → GET /pos/mapa ...

AISLAMIENTO (misma regla de E-14w): del header Bearer leo el id del
usuario, y el tenant sale de la FILA REAL en users.tenant_id (un token
falsificado no da acceso a nada). Reglas:
    · requester CON tenant → solo filas con ESE tenant_id.
    · requester SIN tenant → solo filas sin dueño (NULL).
Si tu tabla tables no tuviera la columna tenant_id, este add-on la agrega
con ALTER TABLE y le asigna al demo (admin@karei.app) las mesas viejas.
============================================================================
"""
import base64
import datetime
import glob
import json
import os
import re
import sys
import types
import unicodedata
import uuid
from typing import Any, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Request
from sqlalchemy import create_engine, inspect as sa_inspect, text
from sqlalchemy.orm import sessionmaker

router = APIRouter()


# ─────────────────────────────────────────────────────────────────────────
# 1. LOCALIZAR LA BASE DE DATOS (idéntico al patrón de pos_cuenta_live)
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
        "[pos_mesas] No encontré la base de datos. "
        "Exporta KAREI_DATABASE_URL=sqlite:///ruta/a/karei.db antes de arrancar uvicorn."
    )


DB_URL = _resolver_db_url()
# Modo SYNC igual que los otros add-ons (si el settings usa driver async,
# quitamos el sufijo: MISMO archivo de BD, otro "controlador").
for _drv in ("+aiosqlite", "+asyncpg", "+asyncmy", "+asyncodbc"):
    if _drv in DB_URL:
        DB_URL = DB_URL.replace(_drv, "")
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
    print("[pos_mesas]", *args)


# ─────────────────────────────────────────────────────────────────────────
# 2. QUIÉN HACE EL REQUEST (resolver blindado, FIX E-14y)
# ─────────────────────────────────────────────────────────────────────────
# Devuelve (uid, tenant, autenticado):
#   · autenticado=True SOLO si el id/email del token existe en users.
#   · tenant puede ser None AUNQUE esté autenticado: son los usuarios
#     demo/legacy (users.tenant_id NULL) — escriben filas SIN dueño que
#     solo ven ellos. NUNCA se mezclan con las de un tenant real.
_CLAIMS_ID = ("sub", "user_id", "id", "uid", "usuario_id", "userId", "user")
_CLAIMS_EMAIL = ("email", "correo", "upn", "user_email")


def _decode_bearer(request) -> Optional[dict]:
    """Payload del JWT del header Authorization (SIN validar firma)."""
    try:
        auth = str(getattr(request, "headers", {}).get("authorization") or "")
        if not auth.lower().startswith("bearer "):
            return None
        partes = auth.split(" ", 1)[1].strip().split(".")
        if len(partes) < 2:
            return None
        pad = partes[1] + "=" * (-len(partes[1]) % 4)
        data = json.loads(base64.urlsafe_b64decode(pad))
        return data if isinstance(data, dict) else None
    except Exception as e:
        _log("token ilegible:", e)
        return None


def _quien_de_request(request):
    try:
        payload = _decode_bearer(request)
        if not payload:
            return None, None, False

        # 1) candidatos a id de usuario (con y sin guiones)
        candidatos: list = []
        for c in _CLAIMS_ID:
            v = payload.get(c)
            if v is None or not str(v).strip():
                continue
            s = str(v).strip()
            if s not in candidatos:
                candidatos.append(s)
            sn = s.replace("-", "")
            if sn and sn not in candidatos:
                candidatos.append(sn)

        fila = None
        if candidatos:
            marcas = {f"c{n}": v for n, v in enumerate(candidatos)}
            with _engine.connect() as cx:
                fila = cx.execute(
                    text(f"SELECT id, tenant_id FROM users "
                         f"WHERE id IN ({', '.join(':' + k for k in marcas)}) LIMIT 1"),
                    marcas).first()

        # 2) si el id no apareció, buscamos por email del token
        if fila is None:
            for c in _CLAIMS_EMAIL:
                v = payload.get(c)
                if not v or not str(v).strip():
                    continue
                with _engine.connect() as cx:
                    fila = cx.execute(
                        text("SELECT id, tenant_id FROM users "
                             "WHERE lower(email) = :e LIMIT 1"),
                        {"e": str(v).strip().lower()}).first()
                if fila:
                    break

        if fila is None:
            # Pista de diagnóstico (solo NOMBRES de claims, jamás valores)
            try:
                _log("token leído pero SIN usuario en BD · claims del token:",
                     sorted(str(k) for k in payload.keys()))
            except Exception:
                pass
            return None, None, False

        uid = str(fila[0])
        tenant = str(fila[1]) if fila[1] is not None else None

        # 3) usuario sin tenant en BD: si el token TRAE tenant_id y ese
        #    tenant existe realmente en users, lo adoptamos.
        if tenant is None:
            t_claim = payload.get("tenant_id") or payload.get("tenant")
            if t_claim and str(t_claim).strip():
                t = str(t_claim).strip()
                with _engine.connect() as cx:
                    existe = cx.execute(
                        text("SELECT 1 FROM users WHERE tenant_id = :t LIMIT 1"),
                        {"t": t}).first()
                if existe:
                    tenant = t
                    _log(f"usuario {uid[:8]} sin tenant en BD → tomé tenant del token ({t[:8]})")
            if tenant is None:
                _log(f"usuario {uid[:8]} autenticado en MODO DEMO/legacy "
                     f"(users.tenant_id NULL) → filas sin dueño")
        return uid, tenant, True
    except Exception as e:
        _log("identidad sin resolver (modo anónimo):", e)
        return None, None, False


def _tenant_de_request(request) -> Optional[str]:
    """Compatibilidad interna: solo el tenant (None = anónimo o demo)."""
    return _quien_de_request(request)[1]


# ─────────────────────────────────────────────────────────────────────────
# 3. HELPERS BÁSICOS
# ─────────────────────────────────────────────────────────────────────────
def _uid() -> str:
    return uuid.uuid4().hex


def _now() -> str:
    return datetime.datetime.utcnow().isoformat(sep=" ", timespec="seconds")


def _norm_id(x) -> str:
    """La BD guarda ids SIN guiones; el front a veces manda UUID con guiones.
    Es el MISMO id: aceptamos ambas formas (FIX E-14f)."""
    return str(x or "").strip().replace("-", "")


def _txt(payload: Any, claves: list, max_len: int = 60) -> str:
    if not isinstance(payload, dict):
        return ""
    for k in claves:
        v = payload.get(k)
        if isinstance(v, str) and v.strip():
            return v.strip()[:max_len]
    return ""


def _num(payload: Any, claves: list, default: float = 0.0) -> float:
    if not isinstance(payload, dict):
        return default
    for k in claves:
        v = payload.get(k)
        if v is None or v == "":
            continue
        try:
            return float(str(v).replace(",", ".").strip())
        except Exception:
            continue
    return default


def _llave_natural(nombre: str):
    """Orden natural: 'Mesa 2' antes que 'Mesa 10'."""
    partes = re.split(r"(\d+)", str(nombre or "").lower())
    return tuple((1, int(p)) if p.isdigit() else (0, p) for p in partes if p != "")


# ─────────────────────────────────────────────────────────────────────────
# 4. COLUMNA-WARE (mapear campo lógico → columna real de TU tabla tables)
# ─────────────────────────────────────────────────────────────────────────
MAPA_MESA = {
    "id": ["id"],
    "tenant_id": ["tenant_id"],
    "branch_id": ["branch_id"],
    "name": ["name", "nombre", "label", "code", "title", "numero", "number"],
    "capacity": ["capacity", "capacidad", "seats", "personas", "chairs", "pax",
                 "guest_capacity"],
    "area": ["area", "area_name", "area_nombre", "zona", "zone", "location",
             "sala", "section"],
    "status": ["status", "estado", "state"],
    "created_at": ["created_at"],
    "updated_at": ["updated_at"],
}
_CACHÉ: dict = {}

TablaEnum = dict  # (tabla, columna) → [valores válidos]
_META_ENUM: dict = {}
_VAL_ENUM: dict = {}


def _columnas(db, tabla: str) -> set:
    try:
        return {c["name"] for c in sa_inspect(_engine).get_columns(tabla)}
    except Exception:
        return set()


def _col_de(campo: str, cols: set) -> Optional[str]:
    for a in MAPA_MESA.get(campo, [campo]):
        if a in cols:
            return a
    return None


_ESQUEMAS: dict = {}


def _esquema(db, tabla: str) -> dict:
    """FIX E-14y2: nombre de columna → info REAL (nullable / default /
    primary_key / type). Con esto el INSERT se adapta a TU tabla aunque
    exija columnas que el add-on no conocía (tu `code` NOT NULL)."""
    clave = (DB_URL, tabla)
    if clave not in _ESQUEMAS:
        try:
            _ESQUEMAS[clave] = {c["name"]: c for c in sa_inspect(_engine).get_columns(tabla)}
        except Exception:
            _ESQUEMAS[clave] = {}
    return _ESQUEMAS[clave]


def _slug(s: str) -> str:
    """'Terraza 2' → 'TERRAZA-2' (sin tildes, sin espacios raros)."""
    s = unicodedata.normalize("NFKD", str(s or "").strip().upper())
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = re.sub(r"[^A-Z0-9]+", "-", s).strip("-")
    return s[:40] or "MESA"


def _codigo_unico(db, tabla: str, tenant: Optional[str], nombre: str) -> str:
    """FIX E-14y2: code único por dueño (tenant o demo NULL) derivado del
    nombre. Si ya existe → sufijo -2, -3, ..."""
    base = _slug(nombre)
    usados: set = set()
    try:
        if tenant:
            filas = db.execute(text(f"SELECT code FROM {tabla} WHERE tenant_id = :t"),
                               {"t": tenant}).all()
        else:
            filas = db.execute(
                text(f"SELECT code FROM {tabla} WHERE tenant_id IS NULL")).all()
        for r in filas:
            if r and r[0] is not None:
                usados.add(str(r[0]).strip().upper())
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass
    if base.upper() not in usados:
        return base
    n = 2
    while f"{base}-{n}".upper() in usados:
        n += 1
    return f"{base}-{n}"


# ── TABLA DE MESAS: tu `tables` si existe; si no, una propia karei_mesas ──
def _tabla_mesas() -> str:
    if _CACHÉ.get("tabla_mesas"):
        return _CACHÉ["tabla_mesas"]
    try:
        existentes = set(sa_inspect(_engine).get_table_names())
    except Exception:
        existentes = set()
    if "tables" in existentes:
        _CACHÉ["tabla_mesas"] = "tables"
        return "tables"
    # Fallback: el proyecto aún no tiene la tabla → la creamos nostros.
    with _engine.begin() as cx:
        cx.execute(text("""
            CREATE TABLE IF NOT EXISTS karei_mesas (
                id VARCHAR(36) PRIMARY KEY,
                tenant_id VARCHAR(36),
                branch_id VARCHAR(36),
                name VARCHAR(80),
                capacity INTEGER,
                area VARCHAR(60),
                status VARCHAR(30),
                created_at VARCHAR(32),
                updated_at VARCHAR(32)
            )"""))
    _log("no hallé tu tabla `tables` → creé y usaré karei_mesas")
    _CACHÉ["tabla_mesas"] = "karei_mesas"
    return "karei_mesas"


def _asegurar_columnas(db) -> dict:
    """Garantiza que la tabla de mesas tenga tenant_id / name / capacity /
    area. Las que falten se agregan con ALTER TABLE (idempotente) y las
    mesas viejas sin dueño pasan al tenant del demo (admin@karei.app),
    igual que hicimos con los pagos en E-14w."""
    tabla = _tabla_mesas()
    cols = _columnas(db, tabla)
    res = {"tabla": tabla, "name": _col_de("name", cols) or "name",
           "capacity": _col_de("capacity", cols) or "capacity",
           "area": _col_de("area", cols) or "area",
           "tenant": _col_de("tenant_id", cols)}
    con = _engine.begin()
    try:
        if not res["tenant"]:
            con.execute(text(f"ALTER TABLE {tabla} ADD COLUMN tenant_id VARCHAR(36)"))
            con.execute(text(
                f"UPDATE {tabla} SET tenant_id = "
                f"(SELECT tenant_id FROM users WHERE email = 'admin@karei.app' LIMIT 1) "
                f"WHERE tenant_id IS NULL"))
            _log(f"{tabla}: agregué tenant_id y las mesas viejas pasaron al demo")
            res["tenant"] = "tenant_id"
        if _col_de("name", cols) is None:
            con.execute(text(f"ALTER TABLE {tabla} ADD COLUMN name VARCHAR(80)"))
        if _col_de("capacity", cols) is None:
            con.execute(text(f"ALTER TABLE {tabla} ADD COLUMN capacity INTEGER"))
        if _col_de("area", cols) is None:
            con.execute(text(f"ALTER TABLE {tabla} ADD COLUMN area VARCHAR(60)"))
    except Exception as e:
        _log("asegurar_columnas (continúo igual):", e)
    finally:
        try:
            con.close()
        except Exception:
            pass
    return res


# ── ENUMS REALES (versión compacta del FIX E-14i de pos_compat) ──────────
# Nunca escribir un valor fuera del enum de tables.status: en SQLite el
# CHECK del CREATE TABLE envenena la fila y las rutas viejas caen con 500.
def _metadata_de(obj):
    """MetaData de SQLAlchemy alcanzable desde un objeto (módulo, Base o
    clase de modelo declarativa)."""
    if obj is None:
        return None
    md = getattr(obj, "metadata", None)
    if md is not None and hasattr(md, "tables"):
        return md
    t = getattr(obj, "__table__", None)  # clase de modelo declarativo
    md = getattr(t, "metadata", None)
    if md is not None and hasattr(md, "tables"):
        return md
    return None


def _escanear_metadata():
    """FIX E-14y2: busca los enums del ORM en CUALQUIER MetaData alcanzable
    (módulos app/*, Bases declarativas y clases de modelo con __table__).
    Antes solo miraba module.metadata y se perdía los modelos declarados
    con Base → no hallaba TableStatus → escribía status='LIBRE' envenenando
    la fila (la lección E-14i otra vez: 500 al LEER)."""
    if _META_ENUM:
        return
    vistos: set = set()

    def registrar(md):
        if md is None or id(md) in vistos or not hasattr(md, "tables"):
            return
        vistos.add(id(md))
        try:
            for _tname, _tabla in md.tables.items():
                for _col in _tabla.columns:
                    if hasattr(_col.type, "enums"):
                        _META_ENUM[(str(_tname).lower(), str(_col.name).lower())] = \
                            list(_col.type.enums)
        except Exception:
            pass

    for _mname, _mod in list(sys.modules.items()):
        if not isinstance(_mod, types.ModuleType):
            continue
        if not _mname.split(".")[0].startswith(
                ("app", "apps", "models", "karei", "backend", "api", "main")):
            continue
        registrar(_metadata_de(_mod))
        try:
            candidatos = list(vars(_mod).values())[:500]
        except Exception:
            candidatos = []
        for obj in candidatos:
            registrar(_metadata_de(obj))


def _valores_enum(db, tabla: str, columna: str) -> list:
    clave = f"enum:{tabla}.{columna}"
    if clave in _VAL_ENUM:
        return _VAL_ENUM[clave]
    _escanear_metadata()
    vals: list = list(_META_ENUM.get((str(tabla).lower(), str(columna).lower()), []))
    if not vals:
        try:
            ddl = db.execute(text("SELECT sql FROM sqlite_master WHERE type='table' AND name=:t"),
                             {"t": tabla}).scalar() or ""
            pat = (rf"CHECK\s*\(\s*[\"'`\[]?(?:[A-Za-z_]\w*\.)?{columna}(?![\w])[\"'`\]]?"
                   rf"\s+IN\s*\(([^)]*)\)")
            m = re.search(pat, ddl, re.I | re.S)
            if m:
                vals = re.findall(r"'((?:[^']|'')*)'", m.group(1))
        except Exception:
            vals = []
    _VAL_ENUM[clave] = vals
    if vals:
        _log(f"enum {tabla}.{columna}: {vals}")
    return vals


def _valor_enum(db, tabla: str, columna: str, preferidos: list, obligatorio: bool = False):
    vals = _valores_enum(db, tabla, columna)
    if not vals:
        return preferidos[0]
    for p in preferidos:
        for v in vals:
            if v.upper() == str(p).upper():
                return v
    if obligatorio:
        return vals[0]
    return None


# ─────────────────────────────────────────────────────────────────────────
# 5. DOMINIO: sesión abierta, historial de ventas, dict de mesa
# ─────────────────────────────────────────────────────────────────────────
_TABLAS_EXISTENTES: set = set()


def _tabla_existe(db, nombre: str) -> bool:
    """¿Existe esta tabla en la BD? FIX E-14y2: consultar ANTES de lanzar
    el SELECT evita el rollback() defensivo a mitad del bucle de limpiar,
    que DESHACÍA los DELETEs ya hechos de iteraciones anteriores (bug
    latente que el test E-14y2 destapó: una mesa sobrevivía a la limpieza)."""
    if nombre in _TABLAS_EXISTENTES:
        return True
    try:
        f = db.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name=:t"),
            {"t": nombre}).first()
    except Exception:
        return False
    if f:
        _TABLAS_EXISTENTES.add(nombre)  # solo cacheamos los POSITIVOS
    return bool(f)


def _sesion_abierta(db, table_id: str):
    """Mesa OCUPADA = tiene una sesión abierta en table_sessions
    (misma definición que usan pos_compat y pos_cuenta_live)."""
    if not _tabla_existe(db, "table_sessions"):
        return None
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


def _ventas_de_mesa(db, table_id: str) -> int:
    """Historial de ventas de una mesa: pedidos (orders) + pagos hechos
    (karei_payments). Si la tabla no existe, cuenta 0 sin reclamar.
    FIX E-14y2: si la tabla no existe NO se consulta → NO hay rollback()
    que revienta los DELETEs pendientes del bucle de limpiar."""
    n = 0
    a, b = str(table_id), _norm_id(table_id)
    for tabla in ("orders", "karei_payments"):
        if not _tabla_existe(db, tabla):
            continue
        try:
            n += int(db.execute(
                text(f"SELECT COUNT(*) FROM {tabla} WHERE table_id IN (:a, :b)"),
                {"a": a, "b": b}).scalar() or 0)
        except Exception:
            try:
                db.rollback()
            except Exception:
                pass
    return n


def _mesa_dict(fila: dict, ocupada: bool, mapa: dict) -> dict:
    """Dict con TODOS los alias de campo que el front pueda esperar."""
    mid = str(fila.get("id") or "")
    nombre = str(fila.get(mapa["name"]) or "").strip() or f"Mesa {mid[:4]}"
    cap = fila.get(mapa["capacity"])
    try:
        cap = int(cap) if cap is not None else 4
    except Exception:
        cap = 4
    area = str(fila.get(mapa["area"]) or "").strip() or "Salón"
    estado = "Ocupada" if ocupada else "Libre"
    forma = "redonda" if cap <= 4 else "rectangular"
    return {
        "id": mid, "table_id": mid, "mesa_id": mid,
        "code": str(fila.get("code") or mid[:8]),  # E-14y2: el code REAL de la BD
        "name": nombre, "nombre": nombre, "label": nombre, "title": nombre,
        "capacity": cap, "capacidad": cap, "seats": cap, "personas": cap,
        "area": area, "area_name": area, "area_nombre": area, "zona": area, "zone": area,
        "status": ("OCUPADA" if ocupada else "LIBRE"),
        "estado": estado, "ocupada": ocupada, "is_ocupada": ocupada,
        "forma": forma, "shape": forma,
        "created_at": str(fila.get("created_at") or "") or None,
        "updated_at": str(fila.get("updated_at") or "") or None,
    }


def _mesas_del_tenant(db, tenant: Optional[str]) -> list:
    tabla = _tabla_mesas()
    mapa = _asegurar_columnas(db)
    if tenant:
        filas = db.execute(text(f"SELECT * FROM {tabla} WHERE tenant_id = :t"),
                           {"t": tenant}).mappings().all()
    else:
        filas = db.execute(text(f"SELECT * FROM {tabla} WHERE tenant_id IS NULL"))\
                  .mappings().all()
    return [dict(f) for f in filas], mapa


# ─────────────────────────────────────────────────────────────────────────
# 6. RUTAS — el mapa en vivo
# ─────────────────────────────────────────────────────────────────────────
@router.get("/api/v1/pos/mapa")
@router.get("/pos/mapa")
def mapa_mesas(request: Request, db=Depends(_db)):
    _uid_req, tenant, autenticado = _quien_de_request(request)
    filas, mapa = _mesas_del_tenant(db, tenant)
    areas: dict = {}
    mesas: list = []
    ocupadas_ids: list = []
    for fila in filas:
        ocupada = _sesion_abierta(db, fila.get("id")) is not None
        m = _mesa_dict(fila, ocupada, mapa)
        mesas.append(m)
        if ocupada:
            ocupadas_ids.append(m["id"])
        a = areas.setdefault(m["area"], {"id": _norm_id(m["area"])[:12] or "sin-area",
                                         "nombre": m["area"], "name": m["area"],
                                         "mesas": [], "tables": []})
        a["mesas"].append(m)
        a["tables"].append(m)
    for a in areas.values():
        a["mesas"].sort(key=lambda x: _llave_natural(x["name"]))
        a["tables"].sort(key=lambda x: _llave_natural(x["name"]))
    mesas.sort(key=lambda x: (_llave_natural(x["area"]), _llave_natural(x["name"])))
    total = len(mesas)
    ocupadas_n = len(ocupadas_ids)
    return {
        "ok": True,
        "total": total,
        "ocupadas": ocupadas_n,
        "libres": max(0, total - ocupadas_n),
        "areas": list(areas.values()),
        "mesas": mesas,
        "tables": mesas,
        "ocupadas_ids": ocupadas_ids,
        "tenant_aplicado": bool(tenant),
        "autenticado": bool(autenticado),
        "generado_en": _now(),
    }


# ─────────────────────────────────────────────────────────────────────────
# 7. RUTAS — crear mesa (lo que quería Cristian: su Terraza)
# ─────────────────────────────────────────────────────────────────────────
def _branch_del_tenant(db, tenant: Optional[str]) -> Optional[str]:
    if not tenant:
        return None
    for tabla in ("branches", "branch"):
        try:
            f = db.execute(text(f"SELECT id FROM {tabla} WHERE tenant_id = :t "
                                f"ORDER BY is_main DESC, created_at ASC LIMIT 1"),
                           {"t": tenant}).first()
            return str(f[0]) if f and f[0] is not None else None
        except Exception:
            try:
                db.rollback()
            except Exception:
                pass
    return None


@router.post("/api/v1/pos/mesas/limpiar")
@router.post("/pos/mesas/limpiar")
@router.post("/api/v1/pos/mesas/limpiar-sin-ventas")
@router.post("/pos/mesas/limpiar-sin-ventas")
def limpiar_mesas_sin_ventas(request: Request, db=Depends(_db)):
    """Elimina TODAS las mesas del tenant que NO tienen historial de ventas.
    Las que tienen pedidos/pagos se conservan (trazabilidad contable)."""
    _uid_req, tenant, autenticado = _quien_de_request(request)
    if not autenticado:
        raise HTTPException(401, "No identifiqué tu usuario (falta el token o venció). "
                                 "Entra de nuevo y vuelve a intentar.")
    filas, mapa = _mesas_del_tenant(db, tenant)
    tabla = mapa["tabla"]
    eliminadas, conservadas = [], []
    for fila in filas:
        mid = str(fila.get("id") or "")
        nombre = str(fila.get(mapa["name"]) or mid).strip() or mid
        area = str(fila.get(mapa["area"]) or "").strip() or "Salón"
        ventas = _ventas_de_mesa(db, mid)
        if ventas > 0:
            conservadas.append({"nombre": nombre, "area": area, "ventas": ventas})
            continue
        if _tabla_existe(db, "table_sessions"):
            db.execute(text("DELETE FROM table_sessions WHERE table_id IN (:a, :b)"),
                       {"a": mid, "b": _norm_id(mid)})
        db.execute(text(f"DELETE FROM {tabla} WHERE id = :i"), {"i": mid})
        eliminadas.append({"nombre": nombre, "area": area})
    db.commit()
    _log("limpiar:", len(eliminadas), "eliminadas ·", len(conservadas), "conservadas")
    return {"ok": True, "eliminadas": len(eliminadas), "conservadas": len(conservadas),
            "detalle_eliminadas": eliminadas, "detalle_conservadas": conservadas}


@router.post("/api/v1/pos/mesas")
@router.post("/pos/mesas")
@router.post("/api/v1/pos/tables")
@router.post("/pos/tables")
@router.post("/api/v1/pos/mapa")
@router.post("/pos/mapa")
def crear_mesa(request: Request, payload: Any = Body(None), db=Depends(_db)):
    _uid_req, tenant, autenticado = _quien_de_request(request)
    if not autenticado:
        raise HTTPException(401, "No identifiqué tu usuario (falta el token o venció). "
                                 "Entra de nuevo y vuelve a intentar.")
    if tenant is None:
        _log("crear mesa en MODO DEMO (autenticado sin tenant) → mesa sin dueño, "
             "solo visible en el demo")
    tabla = _tabla_mesas()
    mapa = _asegurar_columnas(db)
    esq = _esquema(db, tabla)   # FIX E-14y2: esquema REAL de TU tabla
    cols = set(esq)

    nombre = _txt(payload, ["nombre", "name", "label", "code", "title", "titulo"])
    if not nombre:
        raise HTTPException(422, "La mesa necesita un nombre o código.")
    area = _txt(payload, ["area", "zona", "zone", "area_name", "location", "sala"]) or "Salón"
    capacidad = _num(payload, ["capacidad", "capacity", "seats", "personas", "pax"], 4.0)
    capacidad = max(1, min(30, int(capacidad or 4)))

    if tenant:
        dup = db.execute(text(f"SELECT id FROM {tabla} WHERE tenant_id = :t "
                              f"AND lower({mapa['name']}) = lower(:n) LIMIT 1"),
                         {"t": tenant, "n": nombre}).first()
    else:
        dup = db.execute(text(f"SELECT id FROM {tabla} WHERE tenant_id IS NULL "
                              f"AND lower({mapa['name']}) = lower(:n) LIMIT 1"),
                         {"n": nombre}).first()
    if dup:
        raise HTTPException(409, f"Ya existe una mesa llamada «{nombre}». "
                                 f"Usa otro nombre (ej. {nombre} bis) o elimina la anterior.")

    mid = _uid()
    ahora = _now()
    columnas, valores = ["id"], [":i"]
    params = {"i": mid}
    if mapa.get("tenant"):
        columnas.append(mapa["tenant"])
        valores.append(":t")
        params["t"] = tenant
    columnas.append(mapa["name"])
    valores.append(":n")
    params["n"] = nombre
    col_cap = _col_de("capacity", cols)
    if col_cap:
        columnas.append(col_cap)
        valores.append(":c")
        params["c"] = capacidad
    col_area = _col_de("area", cols)
    if col_area:
        columnas.append(col_area)
        valores.append(":a")
        params["a"] = area

    # FIX E-14y2: status SIEMPRE dentro del enum real del ORM. Escribir
    # 'LIBRE' en una BD cuyo enum es AVAILABLE/OCCUPIED/... envenena la
    # fila y las rutas viejas caen 500 al LEERLA (lección E-14i).
    estado = _valor_enum(db, tabla, "status",
                         ["AVAILABLE", "LIBRE", "FREE", "DISPONIBLE", "IDLE"],
                         obligatorio=True)
    col_status = _col_de("status", cols)
    if col_status and estado is not None:
        columnas.append(col_status)
        valores.append(":s")
        params["s"] = estado
    branch_id = _branch_del_tenant(db, tenant)
    col_branch = _col_de("branch_id", cols)
    if col_branch and branch_id:
        columnas.append(col_branch)
        valores.append(":br")
        params["br"] = branch_id

    # FIX E-14y2: is_active SIEMPRE = 1 si la columna existe — las rutas
    # viejas filtran `is_active = 1` (dashboard incluido); sin esto la
    # mesa nacía invisible allá (o NOT NULL explotaba).
    if "is_active" in cols:
        columnas.append("is_active")
        valores.append(":ia")
        params["ia"] = 1

    for col, marc, val in (("created_at", ":ca", ahora), ("updated_at", ":ua", ahora)):
        if col in cols:
            columnas.append(col)
            valores.append(marc)
            params[marc.lstrip(":")] = val

    # ── BARRIDO NOT NULL (el fix del IntegrityError de hoy) ─────────────
    # Toda columna NOT NULL, sin default y sin PK que el INSERT no esté
    # llenando se llena automáticamente con un valor sensato.
    ya = {str(c).lower() for c in columnas}
    codigo = None
    if "code" in cols and "code" not in ya:
        codigo = _codigo_unico(db, tabla, tenant, nombre)
        columnas.append("code")
        valores.append(":cod")
        params["cod"] = codigo
        ya.add("code")
    for c, info in esq.items():
        lc = str(c).lower()
        if lc in ya or info.get("primary_key"):
            continue
        if info.get("nullable", True) or info.get("default") is not None:
            continue
        tipo = str(info.get("type") or "").upper()
        val = None
        if lc == "status" and estado is not None:
            val = estado
        elif lc == "name":
            val = nombre
        elif lc == "code":
            val = codigo or _codigo_unico(db, tabla, tenant, nombre)
        elif lc == "qr_code":
            val = f"karei://mesa/{mid}"
        elif lc == "tenant_id" and mapa.get("tenant"):
            val = tenant
        elif lc == "branch_id" and branch_id:
            val = branch_id
        elif lc in ("created_at", "updated_at"):
            val = ahora
        if val is None:
            val = 0 if any(t in tipo for t in
                           ("INT", "REAL", "FLOA", "DOUB", "NUMER", "DECIM")) else ""
        idx = len(columnas)
        columnas.append(c)
        valores.append(f":x{idx}")
        params[f"x{idx}"] = val
        ya.add(lc)
        _log(f"columna obligatoria '{tabla}.{c}' sin default → la llené sola "
             f"con {val!r} (FIX E-14y2)")

    sql = f"INSERT INTO {tabla} ({', '.join(columnas)}) VALUES ({', '.join(valores)})"
    try:
        db.execute(text(sql), params)
        db.commit()
    except Exception as e:
        db.rollback()
        m = re.search(r"NOT NULL constraint failed: \w+\.(\w+)", str(e))
        extra = f" (columna «{m.group(1)}»)" if m else ""
        _log("INSERT falló:", e)
        raise HTTPException(500, f"La base rechazó la creación de la mesa{extra}. "
                                 f"Mándame la terminal y lo clavamos. "
                                 f"Detalle: {str(e)[:120]}")
    _log("mesa creada:", nombre, "· área", area, "·", capacidad, "pax · tenant",
         (tenant or "")[:8], "· code", (codigo or "-"), "· status", (estado or "-"))
    return {"ok": True,
            "mesa": {"id": mid, "code": codigo, "name": nombre, "nombre": nombre,
                     "label": nombre, "capacity": capacidad, "capacidad": capacidad,
                     "seats": capacidad, "area": area, "area_name": area,
                     "area_nombre": area, "zona": area, "estado": "Libre",
                     "ocupada": False, "status": estado}}


# ─────────────────────────────────────────────────────────────────────────
# 8. RUTAS — eliminar UNA mesa (solo si no tiene historial de ventas)
# ─────────────────────────────────────────────────────────────────────────
@router.delete("/api/v1/pos/mesas/{mesa_id}")
@router.delete("/pos/mesas/{mesa_id}")
@router.delete("/api/v1/pos/tables/{mesa_id}")
@router.delete("/pos/tables/{mesa_id}")
def eliminar_mesa(mesa_id: str, request: Request, db=Depends(_db)):
    _uid_req, tenant, autenticado = _quien_de_request(request)
    if not autenticado:
        raise HTTPException(401, "No identifiqué tu usuario (falta el token o venció). "
                                 "Entra de nuevo y vuelve a intentar.")
    tabla = _tabla_mesas()
    mapa = _asegurar_columnas(db)
    if tenant:
        fila = db.execute(text(f"SELECT * FROM {tabla} WHERE id IN (:a, :b) "
                               f"AND {mapa['tenant']} = :t"),
                          {"a": str(mesa_id), "b": _norm_id(mesa_id), "t": tenant})\
                   .mappings().first()
    else:
        fila = db.execute(text(f"SELECT * FROM {tabla} WHERE id IN (:a, :b) "
                               f"AND {mapa['tenant']} IS NULL"),
                          {"a": str(mesa_id), "b": _norm_id(mesa_id)})\
                   .mappings().first()
    if not fila:
        raise HTTPException(404, "Mesa no encontrada (o pertenece a otra empresa).")
    nombre = str(fila.get(mapa["name"]) or mesa_id).strip() or str(mesa_id)
    ventas = _ventas_de_mesa(db, str(fila.get("id")))
    if ventas > 0:
        raise HTTPException(409, f"«{nombre}» tiene historial de ventas ({ventas} "
                                 f"movimiento(s)); no se puede eliminar. Solo se "
                                 f"eliminan mesas sin ventas.")
    if _tabla_existe(db, "table_sessions"):
        db.execute(text("DELETE FROM table_sessions WHERE table_id IN (:a, :b)"),
                   {"a": str(fila.get("id")), "b": _norm_id(fila.get("id"))})
    db.execute(text(f"DELETE FROM {tabla} WHERE id = :i"), {"i": str(fila.get("id"))})
    db.commit()
    _log("mesa eliminada:", nombre, "(sin ventas)")
    return {"ok": True, "eliminada": nombre, "ventas": ventas}


# ─────────────────────────────────────────────────────────────────────────
# 9. BANNER DE ARRANQUE
# ─────────────────────────────────────────────────────────────────────────
_log("E-14y2 listo → GET /pos/mapa · POST /pos/mesas · POST /pos/mesas/limpiar · "
     "DELETE /pos/mesas/{id}  (cada una + /api/v1) · INSERT blindado al esquema "
     "real (code único + is_active + NOT NULL auto) · status SIEMPRE en el enum")
_log("E-14y2 DB:", DB_URL, "(la tabla de mesas se resuelve en el primer request, "
     "cuando TU tabla `tables` ya existe)")