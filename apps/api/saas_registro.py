"""
═══════════════════════════════════════════════════════════════════════════════
 Kārei · saas_registro.py  ·  E-14z-i + FIX E-14y3b  (Fase SaaS — registro
                    + verificación + CORREO configurable DESDE LA APP)
═══════════════════════════════════════════════════════════════════════════════
QUÉ ES
------
Add-on INDEPENDIENTE (misma filosofía de pos_cuenta_live / pos_facturacion:
no toca tus modelos, tus routers ni tu identity.py — los USA). Cierra el flujo
de registro SaaS y además deja el SMTP administrable sin tocar la terminal:

  1. POST /saas/registro
     Crea de una vez: Tenant (TRIAL, 30 días) + Branch principal
     + User ADMIN (status "pending") + equipo (meseros/cocina con PIN)
     + Roles garantizados + UserRole + VerificationToken del correo.
     Los users del equipo nacen con password_hash = "PIN-ONLY" (el MISMO
     literal que tu /auth/login ya rechaza) y su pin_hash en bcrypt.

  2. GET /saas/verificar?token=...
     El link que llega al correo del admin. Valida el token (sha256 en
     VerificationToken), ACTIVA al admin (status "active" +
     email_verified_at) y TAMBIÉN a todo el equipo pendiente del mismo
     tenant — así el PIN funciona desde el primer día. Responde una
     página HTML con la marca (el link del correo se abre directo).

  3. ★ NUEVO E-14z-i — SMTP SIN VARIABLES DE ENTORNO (desde la app)
     GET  /saas/correo/config   → lee la configuración guardada (solo ADMIN)
     PUT  /saas/correo/config   → la guarda en la BD (tabla saas_correo_config)
     POST /saas/correo/probar   → envía un correo de prueba a la dirección
                                  que digas y responde ok/error con el motivo.

     PRIORIDAD de la config activa:  BD (lo guardado en la app)
                                     → variables de entorno KAREI_SMTP_*
                                     → nada → MODO DEV (link por consola).
     La contraseña NUNCA se devuelve por la API (solo máscara "••••abcd" y
     el flag tiene_password). En el PUT, si el campo contraseña llega vacío
     se conserva la ya guardada. Para volver a MODO DEV basta con guardar
     con el servidor vacío.

     Los endpoints de correo piden sesión con rol ADMIN (el token se lee del
     header Authorization, el usuario y sus roles se verifican CONTRA LA BD —
     un token falsificado no da nada, mismo criterio de pos_cuenta_live).

GMAIL en 3 pasos (también quedan dentro de la página Correo de la app):
  (1) activa Verificación en 2 pasos en la cuenta de Google,
  (2) entra a https://myaccount.google.com/apppasswords y crea una
      "Contraseña de aplicación" (16 letras),
  (3) pégala en la página Correo de Kārei (¡NO tu contraseña normal!).
  Servidor: smtp.gmail.com · Puerto: 587 (STARTTLS) — 465 si prefieres SSL.

Comportamiento del registro (igual que E-14z-g, ahora con la BD primero):
  · SMTP activo (BD o entorno) → envía el correo de verdad (HTML con la
    marca) y NO devuelve el link en la respuesta (seguro).
  · Sin SMTP → modo dev: link en consola + en pantalla.
  · SMTP activo pero envío fallido → el registro SÍ se crea, se devuelve
    el link con un "aviso" (el registro jamás falla por el correo).

VARIABLES DE ENTORNO (opcional, siguen funcionando por compatibilidad):
    KAREI_SMTP_HOST / KAREI_SMTP_PORT / KAREI_SMTP_USER
    KAREI_SMTP_PASSWORD / KAREI_SMTP_FROM

CÓMO MONTARLO (2 líneas en tu main.py, junto a los otros add-ons):
    from saas_registro import router as saas_registro_router
    app.include_router(saas_registro_router)

Decisiones ya tomadas (decir si alguna se quiere distinta):
  · La config de correo es GLOBAL de la plataforma (una sola fila, id=1):
    es el buzón con el que Kārei envía las verificaciones de TODOS los
    restaurantes. Cuando exista rol de super-admin separado del ADMIN de
    cada tenant, estos endpoints se le reservan a él.
  · Trial: 30 días desde el registro (Tenant.trial_ends_at).
  · Correo del admin: único GLOBAL (409 si existe) — tu /auth/login busca
    por email sin tenant, así que permitir duplicados entre tenants rompería
    el login hoy. Cuando el login sea multi-tenant, esto se afloja.
  · NIT único global (tu modelo lo exige: Tenant.nit unique=True).
  · Roles WAITER/KITCHEN: se buscan case-insensitive para el tenant y si
    no existen se crean (is_system=True, scope TENANT, permissions []).
  · PINs: 4 dígitos, no repetidos entre el equipo (se valida en memoria,
    jamás se guarda el PIN plano).
  · Máx 20 personas de equipo por registro (los demás se agregan luego).
═══════════════════════════════════════════════════════════════════════════════
"""

import asyncio
import base64
import bcrypt
import hashlib
import json
import os
import re
import secrets
import smtplib
import ssl
import unicodedata
import uuid
from datetime import datetime, timedelta, timezone
from email.header import Header
from email.mime.text import MIMEText
from email.utils import formataddr
from typing import List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.enums import RoleScope, TenantPlan, TenantStatus, UserStatus
from app.models.identity import Branch, Role, Tenant, User, UserRole, VerificationToken

router = APIRouter(tags=["SaaS · Registro"])

# Dónde manda el botón "Iniciar sesión" de la página de verificación
FRONT_URL = "http://localhost:3000/login"

DIAS_TRIAL = 30
HORAS_TOKEN = 48
MAX_EQUIPO = 20

ROLES_EQUIPO = ("WAITER", "KITCHEN")  # el ADMIN ya viene con la cuenta

_log = lambda *a: print("[saas_registro]", *a)


# ─────────────────────────────────────────────────────────────────────────
# 0a. SMTP — fallback por variables de entorno (sigue funcionando)
# ─────────────────────────────────────────────────────────────────────────
SMTP_HOST = os.getenv("KAREI_SMTP_HOST", "").strip()
SMTP_PORT = int(os.getenv("KAREI_SMTP_PORT", "587").strip() or "587")
SMTP_USER = os.getenv("KAREI_SMTP_USER", "").strip()
SMTP_PASSWORD = os.getenv("KAREI_SMTP_PASSWORD", "").strip()
SMTP_FROM = os.getenv("KAREI_SMTP_FROM", "").strip() or SMTP_USER


def _env_configurado() -> bool:
    """¿Hay SMTP completo por variables de entorno? (fallback)"""
    return bool(SMTP_HOST and SMTP_USER and SMTP_PASSWORD)


# ─────────────────────────────────────────────────────────────────────────
# 0b. SMTP — ★ E-14z-i: configuración guardada EN LA BASE DE DATOS
# ─────────────────────────────────────────────────────────────────────────
_TABLA_CORREO = """
CREATE TABLE IF NOT EXISTS saas_correo_config (
    id             INTEGER PRIMARY KEY,
    smtp_host      VARCHAR(255) DEFAULT '',
    smtp_port      INTEGER      DEFAULT 587,
    smtp_user      VARCHAR(255) DEFAULT '',
    smtp_password  VARCHAR(255) DEFAULT '',
    smtp_from      VARCHAR(255) DEFAULT '',
    actualizado_en VARCHAR(40)  DEFAULT ''
)
"""

_tabla_correo_lista = False


async def _asegurar_tabla_correo(db: AsyncSession) -> None:
    """Crea la tabla de config una sola vez por proceso (idempotente)."""
    global _tabla_correo_lista
    if _tabla_correo_lista:
        return
    await db.execute(text(_TABLA_CORREO))
    await db.commit()
    _tabla_correo_lista = True


async def _fila_correo(db: AsyncSession) -> dict:
    """La fila id=1 como dict, o {} si no hay nada guardado aún."""
    fila = (await db.execute(text(
        "SELECT smtp_host, smtp_port, smtp_user, smtp_password, smtp_from "
        "FROM saas_correo_config WHERE id = 1"
    ))).first()
    if not fila:
        return {}
    try:
        puerto = int(fila[1] or 587)
    except Exception:
        puerto = 587
    return {
        "host": (fila[0] or "").strip(),
        "port": puerto,
        "user": (fila[2] or "").strip(),
        "password": (fila[3] or "").strip(),
        "from": (fila[4] or "").strip(),
    }


async def _config_correo(db: AsyncSession) -> Optional[dict]:
    """Config ACTIVA: BD completa → variables de entorno → None (modo dev)."""
    f = await _fila_correo(db)
    if f.get("host") and f.get("user") and f.get("password"):
        return f
    if _env_configurado():
        return {"host": SMTP_HOST, "port": SMTP_PORT, "user": SMTP_USER,
                "password": SMTP_PASSWORD, "from": SMTP_FROM or SMTP_USER}
    return None


def _enviar_correo_smtp(cfg: dict, destino: str, asunto: str, html: str) -> Tuple[bool, str]:
    """Envía el correo con la config dada. Devuelve (ok, error). NUNCA lanza."""
    try:
        puerto = int(cfg.get("port") or 587)
        usuario = str(cfg.get("user") or "")
        contrasena = str(cfg.get("password") or "")
        remitente = str(cfg.get("from") or usuario)

        msg = MIMEText(html, "html", "utf-8")
        msg["Subject"] = Header(asunto, "utf-8")
        msg["From"] = formataddr(("Kārei", remitente))
        msg["To"] = destino

        if puerto == 465:  # SSL directo (algunos proveedores)
            with smtplib.SMTP_SSL(cfg["host"], puerto, timeout=20) as s:
                s.login(usuario, contrasena)
                s.sendmail(remitente, [destino], msg.as_string())
        else:  # 587 y demás: STARTTLS (Gmail y la mayoría)
            with smtplib.SMTP(cfg["host"], puerto, timeout=20) as s:
                s.ehlo()
                s.starttls(context=ssl.create_default_context())
                s.ehlo()
                s.login(usuario, contrasena)
                s.sendmail(remitente, [destino], msg.as_string())
        return True, ""
    except Exception as exc:
        return False, f"{type(exc).__name__}: {exc}"


# Correo de verificación en HTML — maquetado con TABLAS (los clientes de
# correo como Gmail Outlook eliminan <svg>, flex y grid; tablas siempre sirven)
_PLANTILLA_CORREO = """\
<!doctype html><html lang="es"><body style="margin:0;padding:24px;background:#0f172a;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
 <tr><td style="background:#1e293b;border-radius:16px 16px 0 0;padding:28px 32px;border-bottom:3px solid #f59e0b;">
   <span style="font-size:26px;font-weight:800;color:#f59e0b;letter-spacing:1px;">K&#257;rei</span>
   <span style="display:block;color:#94a3b8;font-size:12px;margin-top:4px;">El ERP gastron&oacute;mico colombiano</span>
 </td></tr>
 <tr><td style="background:#ffffff;padding:32px;">
   <h1 style="margin:0 0 12px;font-size:20px;color:#0f172a;">Verifica tu correo, {nombre}</h1>
   <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#334155;">
     Tu restaurante <b style="color:#0f172a;">{restaurante}</b> ya tiene cuenta K&#257;rei con 30 d&iacute;as de prueba.
     Solo falta un clic para activarla, a ti y a tu equipo:
   </p>
   <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr><td align="center" bgcolor="#f59e0b" style="border-radius:12px;">
     <a href="{url}" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:700;color:#0f172a;text-decoration:none;">Verificar mi correo &#8594;</a>
   </td></tr></table>
   <p style="margin:26px 0 6px;font-size:12px;color:#64748b;">&iquest;El bot&oacute;n no funciona? Copia este enlace en tu navegador:</p>
   <p style="margin:0;word-break:break-all;font-size:12px;color:#2563eb;">{url}</p>
   <p style="margin:22px 0 0;font-size:12px;line-height:1.6;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:14px;">
     El enlace vence en 48 horas. Al verificarlo, t&uacute; entras con tu correo y contrase&ntilde;a,
     y tu equipo entra con su PIN de 4 d&iacute;gitos, desde el primer d&iacute;a.
   </p>
 </td></tr>
 <tr><td style="background:#0f172a;border-radius:0 0 16px 16px;padding:16px 32px;text-align:center;">
   <span style="font-size:11px;color:#475569;">Este correo hace parte del registro de tu restaurante en K&#257;rei. Si no fuiste t&uacute;, ign&oacute;ralo.</span>
 </td></tr>
</table>
</td></tr></table></body></html>"""


def _html_correo(nombre: str, restaurante: str, url: str) -> str:
    return _PLANTILLA_CORREO.format(
        nombre=nombre.split(" ")[0] or nombre,
        restaurante=restaurante,
        url=url,
    )


# Correo de PRUEBA (botón de la página Correo) — también con tablas
_PLANTILLA_PRUEBA = """\
<!doctype html><html lang="es"><body style="margin:0;padding:24px;background:#0f172a;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
 <tr><td style="background:#1e293b;border-radius:16px 16px 0 0;padding:28px 32px;border-bottom:3px solid #f59e0b;">
   <span style="font-size:26px;font-weight:800;color:#f59e0b;letter-spacing:1px;">K&#257;rei</span>
   <span style="display:block;color:#94a3b8;font-size:12px;margin-top:4px;">Prueba de configuraci&oacute;n de correo</span>
 </td></tr>
 <tr><td style="background:#ffffff;padding:32px;">
   <h1 style="margin:0 0 12px;font-size:20px;color:#0f172a;">&iexcl;Funciona, socio!</h1>
   <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#334155;">
     Este correo sali&oacute; del servidor SMTP que acabas de configurar en K&#257;rei
     (<b style="color:#0f172a;">{host}</b>, puerto <b style="color:#0f172a;">{puerto}</b>).
     Desde ahora las verificaciones de registro llegan de verdad a tus clientes.
   </p>
 </td></tr>
 <tr><td style="background:#0f172a;border-radius:0 0 16px 16px;padding:16px 32px;text-align:center;">
   <span style="font-size:11px;color:#475569;">Correo de prueba generado en K&#257;rei &middot; el ERP gastron&oacute;mico colombiano</span>
 </td></tr>
</table>
</td></tr></table></body></html>"""


def _html_prueba(host: str, puerto: int) -> str:
    return _PLANTILLA_PRUEBA.format(host=host or "?", puerto=puerto or 587)


if _env_configurado():
    print(f"[saas_registro] E-14y3b listo · SMTP por variables de entorno → {SMTP_HOST}:{SMTP_PORT}"
          f" (en la app también puedes guardarlo: menú Correo, y esa config tiene prioridad)")
else:
    print("[saas_registro] E-14y3b listo · correo se configura desde la APP (menú Correo)"
          " · sin config → modo dev (link por consola/pantalla)")


# ─────────────────────────────────────────────────────────────────────────
# 0c. Auth de los endpoints de correo — ADMIN verificado CONTRA LA BD
#     FIX E-14y3: el resolver viejo hacía int(sub) y Kārei usa IDs UUID
#     (string con guiones) → int() explotaba → 401 fantasma que botaba al
#     admin al login al abrir el menú Correo. Ahora usa el mecanismo
#     probado de pos_mesas E-14y: candidatos de id STRING (con/sin
#     guiones) + búsqueda por email de respaldo.
#     FIX E-14y3b: los claims del JWT llegan como STRINGS, pero users.id
#     es una columna UUID REAL — pasarle strings a User.id.in_(...) hace
#     que SQLAlchemy lance "'str' object has no attribute 'hex'" (500 en
#     /saas/correo/config). Ahora los candidatos se convierten a
#     uuid.UUID y se consulta con el tipo correcto (con respaldo en crudo
#     tolerado, por si otra instalación tuviera la columna como String).
# ─────────────────────────────────────────────────────────────────────────
_CLAIMS_ID = ("sub", "user_id", "id", "uid", "usuario_id", "userId", "user")
_CLAIMS_EMAIL = ("email", "correo", "upn", "user_email")


def _payload_bearer(request: Request) -> Optional[dict]:
    """Payload del JWT del header Authorization (SIN validar firma). Solo
    para BUSCAR al usuario en la BD: un token inventado no encuentra a
    nadie y da 401, igual que en pos_mesas."""
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
    except Exception:
        return None


def _candidatos_id(payload: dict) -> list:
    """IDs de usuario candidatos desde los claims: valor tal cual + versión
    sin guiones (cubre UUID '28c852c9-...' y '28c852c9...' y numéricos)."""
    candidatos: list = []
    for c in _CLAIMS_ID:
        v = (payload or {}).get(c)
        if v is None or not str(v).strip():
            continue
        s = str(v).strip()
        if s not in candidatos:
            candidatos.append(s)
        sn = s.replace("-", "")
        if sn and sn not in candidatos:
            candidatos.append(sn)
    return candidatos


def _candidatos_id_uuid(candidatos: list) -> list:
    """FIX E-14y3b — De los candidatos crudos (strings del token) deja SOLO
    los que son UUID válido, ya convertidos a uuid.UUID, que es el tipo
    real de la columna users.id. '28c852c9-…' y '28c852c9…' terminan siendo
    el MISMO UUID, así que no hay duplicados. Los que no son UUID (numéricos,
    texto) se quedan fuera de esta lista (van en el respaldo en crudo)."""
    out: list = []
    for s in candidatos or []:
        try:
            uu = uuid.UUID(str(s))
        except (ValueError, AttributeError, TypeError):
            continue
        if uu not in out:
            out.append(uu)
    return out


def _emails_de(payload: dict) -> list:
    """Emails candidatos desde los claims (respaldo si el id no aparece)."""
    out: list = []
    for c in _CLAIMS_EMAIL:
        v = (payload or {}).get(c)
        if v and str(v).strip():
            e = str(v).strip().lower()
            if e not in out:
                out.append(e)
    return out


async def _exigir_admin(request: Request, db: AsyncSession) -> User:
    payload = _payload_bearer(request)
    u: Optional[User] = None

    if payload:
        # 1) por id — FIX E-14y3b: users.id es columna UUID REAL; los claims
        #    del token llegan como str y pasarle strings a Uuid.in_() revienta
        #    ('str' object has no attribute 'hex'). Se consulta con uuid.UUID.
        cand = _candidatos_id(payload)
        ids_uuid = _candidatos_id_uuid(cand)
        if ids_uuid:
            try:
                u = (await db.execute(
                    select(User).where(User.id.in_(ids_uuid)).limit(1)
                )).scalar_one_or_none()
            except Exception:
                # p.ej. una instalación donde id sea String y rechace UUID
                await db.rollback()
                u = None

        # 1b) respaldo: mismos candidatos EN CRUDO, por si la columna id
        #     fuera String en otra instalación. Si es Uuid real, este query
        #     levanta y se tolera (rollback + seguimos al email).
        if u is None and cand:
            try:
                u = (await db.execute(
                    select(User).where(User.id.in_(cand)).limit(1)
                )).scalar_one_or_none()
            except Exception:
                await db.rollback()
                u = None

        # 2) si el id no apareció, por email del token
        if u is None:
            for e in _emails_de(payload):
                u = (await db.execute(
                    select(User)
                    .where(func.lower(User.email) == e).limit(1)
                )).scalar_one_or_none()
                if u is not None:
                    break

    if u is None:
        # Pista de diagnóstico (solo NOMBRES de claims, jamás valores)
        try:
            if payload:
                _log("token leído pero SIN usuario en BD · claims del token:",
                     sorted(str(k) for k in payload.keys()))
        except Exception:
            pass
        raise HTTPException(401, "Inicia sesión para administrar el correo.")

    codes = (await db.execute(
        select(Role.code).join(UserRole, UserRole.role_id == Role.id)
        .where(UserRole.user_id == u.id)
    )).scalars().all()
    if "ADMIN" not in {str(c).upper() for c in codes}:
        raise HTTPException(403, "Solo el ADMIN puede configurar el correo.")
    return u


# ─────────────────────────────────────────────────────────────────────────
# 1. Payloads
# ─────────────────────────────────────────────────────────────────────────
class RestauranteIn(BaseModel):
    commercial_name: str = Field(min_length=2, max_length=255)
    legal_name: str = Field(min_length=2, max_length=255)
    nit: str = Field(min_length=5, max_length=20)
    ciudad: Optional[str] = Field(default=None, max_length=120)
    telefono: Optional[str] = Field(default=None, max_length=32)


class AdminIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=255)
    email: str = Field(min_length=5, max_length=255)
    password: str = Field(min_length=8, max_length=72)  # bcrypt corta a 72 bytes


class EquipoIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=255)
    rol: str = Field(pattern="^(WAITER|KITCHEN)$")
    pin: str = Field(pattern="^[0-9]{4}$")


class RegistroIn(BaseModel):
    restaurante: RestauranteIn
    admin: AdminIn
    equipo: List[EquipoIn] = Field(default_factory=list)


class CorreoConfigIn(BaseModel):
    smtp_host: str = Field(default="", max_length=255)
    smtp_port: int = Field(default=587)
    smtp_user: str = Field(default="", max_length=255)
    smtp_password: str = Field(default="", max_length=255)  # vacío = conservar
    smtp_from: str = Field(default="", max_length=255)


class CorreoPruebaIn(BaseModel):
    destino: str = Field(min_length=5, max_length=255)


# ─────────────────────────────────────────────────────────────────────────
# 2. Helpers
# ─────────────────────────────────────────────────────────────────────────
def _hash(texto: str) -> str:
    return bcrypt.hashpw(texto.encode(), bcrypt.gensalt()).decode()


def _sha256(texto: str) -> str:
    return hashlib.sha256(texto.encode()).hexdigest()


def _slug(texto: str) -> str:
    limpio = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode()
    limpio = re.sub(r"[^a-zA-Z0-9]+", "-", limpio).strip("-").lower()
    return (limpio or "restaurante")[:48]


async def _slug_disponible(db: AsyncSession, base: str) -> str:
    for n in range(2, 30):
        candidato = base if n == 2 else f"{base}-{n}"
        existe = (await db.execute(
            select(Tenant.id).where(Tenant.slug == candidato)
        )).scalar_one_or_none()
        if not existe:
            return candidato
    return f"{base}-{secrets.token_hex(2)}"


async def _rol_garantizado(db: AsyncSession, tenant_id, code: str, nombre: str) -> Role:
    """Busca el rol para este tenant o global (NULL) — case-insensitive.
    Si no existe, lo crea is_system=True (igual que los del seed)."""
    r = (await db.execute(
        select(Role).where(
            func.upper(Role.code) == code.upper(),
            (Role.tenant_id == tenant_id) | (Role.tenant_id.is_(None)),
        ).limit(1)
    )).scalar_one_or_none()
    if r:
        return r
    r = Role(tenant_id=tenant_id, code=code, name=nombre, scope=RoleScope.TENANT,
             is_system=True, permissions=[])
    db.add(r)
    await db.flush()
    _log(f"rol '{code}' creado para el tenant")
    return r


PAGINA_OK = """<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Correo verificado · Kārei</title><style>
 body{{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
 background:#0f172a;font-family:system-ui,sans-serif;color:#e2e8f0;text-align:center;padding:24px}}
 .caja{{background:#1e293b;border:1px solid #334155;border-radius:24px;padding:40px 36px;max-width:420px}}
 h1{{font-size:1.25rem;margin:18px 0 6px;color:#fff}} p{{color:#94a3b8;font-size:.9rem;line-height:1.5}}
 a{{display:inline-block;margin-top:22px;background:#f59e0b;color:#0f172a;font-weight:700;
 text-decoration:none;padding:12px 26px;border-radius:12px}}
</style></head><body><div class="caja">
 {marca}
 <h1>¡Correo verificado, socio!</h1>
 <p><b style="color:#e2e8f0">{nombre}</b> ya puede iniciar sesión con su correo y contraseña.<br>
 Y el equipo del restaurante <b style="color:#e2e8f0">{equipo}</b> ya puede entrar con su PIN de 4 dígitos.</p>
 <a href="{front}">Iniciar sesión →</a>
</div></body></html>"""

PAGINA_MAL = """<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Enlace no válido · Kārei</title><style>
 body{{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
 background:#0f172a;font-family:system-ui,sans-serif;color:#e2e8f0;text-align:center;padding:24px}}
 .caja{{background:#1e293b;border:1px solid #334155;border-radius:24px;padding:40px 36px;max-width:420px}}
 h1{{font-size:1.25rem;margin:18px 0 6px;color:#fff}} p{{color:#94a3b8;font-size:.9rem;line-height:1.5}}
</style></head><body><div class="caja">
 {marca}
 <h1>Este enlace ya no sirve</h1>
 <p>El token no existe, ya se usó o venció. Pide un reenvío o escríbenos y lo resolvemos.</p>
</div></body></html>"""

# Marca inline (misma geometría del LogoKarei — variante dark)
MARCA_SVG = """<svg viewBox="0 0 120 120" width="64" height="64" style="margin:0 auto;display:block">
<g fill="none" stroke="#F59E0B" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round">
<path d="M33 16 V31 M42 16 V31 M51 16 V31"/><path d="M33 31 H51"/><path d="M42 31 V104"/>
<g transform="rotate(-45 42 62)"><path d="M42 62 H61"/>
<path fill="#F59E0B" stroke="none" d="M60 56.5 H84 Q91 56.5 94 61 Q93 65.5 87.5 66.8 Q79 67.7 69 67.5 L60 67.5 Z"/></g>
<path d="M42 62 L69 89"/><circle cx="78" cy="95" r="9" fill="#F59E0B" stroke="none"/></g></svg>"""


# ─────────────────────────────────────────────────────────────────────────
# 3. POST /saas/registro — alta completa del restaurante
# ─────────────────────────────────────────────────────────────────────────
@router.post("/api/v1/saas/registro")
@router.post("/saas/registro")
async def registrar(payload: RegistroIn, request: Request, db: AsyncSession = Depends(get_db)):
    email = payload.admin.email.strip().lower()
    nit = payload.restaurante.nit.strip()

    # ── Validaciones duras (409 = ya existe, 422 = dato malo)
    if len(payload.equipo) > MAX_EQUIPO:
        raise HTTPException(422, f"Máximo {MAX_EQUIPO} personas por registro. El resto se agrega luego.")
    pins = [e.pin for e in payload.equipo]
    if len(pins) != len(set(pins)):
        raise HTTPException(422, "Hay PINs repetidos en el equipo: cada persona debe tener uno distinto.")

    correo_dueno = (await db.execute(
        select(User.id).where(User.email == email).limit(1)
    )).scalar_one_or_none()
    if correo_dueno:
        raise HTTPException(409, f"El correo {email} ya está registrado. Inicia sesión o usa otro.")

    nit_dueno = (await db.execute(
        select(Tenant.id).where(Tenant.nit == nit).limit(1)
    )).scalar_one_or_none()
    if nit_dueno:
        raise HTTPException(409, f"El NIT {nit} ya tiene una cuenta Kārei.")

    # ── Tenant + Branch principal
    ahora = datetime.now(timezone.utc)
    tenant = Tenant(
        slug=await _slug_disponible(db, _slug(payload.restaurante.commercial_name)),
        legal_name=payload.restaurante.legal_name.strip(),
        commercial_name=payload.restaurante.commercial_name.strip(),
        nit=nit,
        plan=TenantPlan.STARTER,
        status=TenantStatus.TRIAL,
        trial_ends_at=ahora + timedelta(days=DIAS_TRIAL),
    )
    db.add(tenant)
    await db.flush()  # tenant.id real

    branch = Branch(
        tenant_id=tenant.id, code="S1",
        name=payload.restaurante.commercial_name.strip(),
        city=payload.restaurante.ciudad, phone=payload.restaurante.telefono,
        is_main=True, is_active=True,
    )
    db.add(branch)
    await db.flush()  # branch.id real

    # ── ADMIN: bcrypt + pending (tu /auth/login lo bloquea hasta verificar)
    admin = User(
        tenant_id=tenant.id, branch_id=branch.id,
        email=email, password_hash=_hash(payload.admin.password),
        full_name=payload.admin.full_name.strip(),
        status=UserStatus.PENDING_VERIFICATION,
    )
    db.add(admin)
    await db.flush()

    rol_admin = await _rol_garantizado(db, tenant.id, "ADMIN", "Administrador")
    db.add(UserRole(user_id=admin.id, role_id=rol_admin.id, tenant_id=tenant.id, branch_id=branch.id))

    # ── Equipo: password_hash "PIN-ONLY" (tu login lo rechaza explícito) + pin_hash
    equipo_creados = 0
    for persona in payload.equipo:
        u = User(
            tenant_id=tenant.id, branch_id=branch.id,
            email=f"equipo.{secrets.token_hex(6)}@{tenant.slug}.karei.local",  # no usan email
            password_hash="PIN-ONLY",
            full_name=persona.full_name.strip(),
            pin_hash=_hash(persona.pin),
            status=UserStatus.PENDING_VERIFICATION,
        )
        db.add(u)
        await db.flush()
        rol = await _rol_garantizado(
            db, tenant.id, persona.rol,
            "Mesero" if persona.rol == "WAITER" else "Cocina",
        )
        db.add(UserRole(user_id=u.id, role_id=rol.id, tenant_id=tenant.id, branch_id=branch.id))
        equipo_creados += 1

    # ── Token de verificación del correo del admin (48 h, sha256 en DB)
    token_crudo = secrets.token_urlsafe(32)
    db.add(VerificationToken(
        user_id=admin.id, tenant_id=tenant.id,
        token_hash=_sha256(token_crudo),
        purpose="email_verification",
        expires_at=ahora + timedelta(hours=HORAS_TOKEN),
    ))

    await db.commit()

    base = str(request.base_url).rstrip("/")  # http://localhost:8000
    verificacion_url = f"{base}/api/v1/saas/verificar?token={token_crudo}"

    # ── ★ E-14z-i: correo de verdad con la config ACTIVA (BD → entorno);
    #     sin config → modo dev. El registro JAMÁS falla por el correo.
    asunto = f"Verifica tu correo · {payload.restaurante.commercial_name} en Kārei"
    cfg_correo = None
    try:
        await _asegurar_tabla_correo(db)
        cfg_correo = await _config_correo(db)
    except Exception as exc:
        _log("config de correo no se pudo leer (sigo en modo dev):", exc)

    if cfg_correo:
        email_enviado, error_envio = await asyncio.to_thread(
            _enviar_correo_smtp, cfg_correo, email, asunto,
            _html_correo(payload.admin.full_name, payload.restaurante.commercial_name, verificacion_url),
        )
    else:
        email_enviado, error_envio = False, ""

    if email_enviado:
        _log("=" * 60)
        _log("REGISTRO NUEVO:", payload.restaurante.commercial_name, "·", tenant.slug)
        _log("  admin:", email, "· equipo:", equipo_creados, "persona(s)")
        _log("  correo de verificación ENVIADO via SMTP →", email)
        _log("=" * 60)
    else:
        _log("=" * 60)
        _log("REGISTRO NUEVO:", payload.restaurante.commercial_name, "·", tenant.slug)
        _log("  admin:", email, "· equipo:", equipo_creados, "persona(s)")
        if cfg_correo:
            _log("  ⚠️ SMTP configurado PERO el envío FALLÓ →", error_envio)
        _log("  EMAIL DE VERIFICACIÓN (modo dev):")
        _log("  " + verificacion_url)
        _log("=" * 60)

    resp = {
        "version": "E-14z-i",
        "ok": True,
        "tenant": {"slug": tenant.slug, "commercial_name": tenant.commercial_name,
                   "trial_hasta": str(tenant.trial_ends_at)},
        "admin": {"email": email},
        "equipo_creados": equipo_creados,
        "email_enviado": email_enviado,
    }
    if not email_enviado:
        # ⚠️ Solo en dev (o si el envío falló): el link se comparte en pantalla.
        # Cuando el SMTP funcione estable, este campo deja de salir del backend.
        resp["verificacion_url"] = verificacion_url
        resp["aviso"] = (
            f"No pude enviar el correo ({error_envio}). Mientras lo arreglamos, usa este link."
            if cfg_correo else
            "Servidor sin SMTP configurado: usa este link (o configúralo en Kārei → menú Correo)."
        )
    return resp


# ─────────────────────────────────────────────────────────────────────────
# 4. GET /saas/verificar — el link del correo (activa admin + equipo)
# ─────────────────────────────────────────────────────────────────────────
@router.get("/api/v1/saas/verificar")
@router.get("/saas/verificar")
async def verificar(token: str = "", db: AsyncSession = Depends(get_db)):
    if not token.strip():
        raise HTTPException(422, "Falta el token")

    vt = (await db.execute(
        select(VerificationToken).where(
            VerificationToken.token_hash == _sha256(token.strip()),
            VerificationToken.purpose == "email_verification",
            VerificationToken.consumed_at.is_(None),
            VerificationToken.expires_at > datetime.now(timezone.utc),
        ).limit(1)
    )).scalar_one_or_none()
    if not vt:
        _log("verificar: token inválido/vencido/usado")
        return HTMLResponse(PAGINA_MAL.format(marca=MARCA_SVG), status_code=410)

    # Admin: ACTIVE + email_verified_at
    admin = (await db.execute(
        select(User).where(User.id == vt.user_id)
    )).scalar_one_or_none()
    if not admin:
        return HTMLResponse(PAGINA_MAL.format(marca=MARCA_SVG), status_code=410)
    admin.status = UserStatus.ACTIVE
    admin.email_verified_at = datetime.now(timezone.utc)

    # TODO el equipo pendiente del tenant queda operativo con el PIN
    equipo = (await db.execute(
        select(User).where(
            User.tenant_id == admin.tenant_id,
            User.id != admin.id,
            User.pin_hash.isnot(None),
            User.status == UserStatus.PENDING_VERIFICATION,
        )
    )).scalars().all()
    for u in equipo:
        u.status = UserStatus.ACTIVE

    vt.consumed_at = datetime.now(timezone.utc)
    await db.commit()

    _log("verificado:", admin.email, "· equipo activado:", len(equipo))
    return HTMLResponse(PAGINA_OK.format(
        marca=MARCA_SVG,
        nombre=admin.full_name,
        equipo=f"{len(equipo)} persona(s)" if equipo else "tu equipo",
        front=FRONT_URL,
    ))


# ─────────────────────────────────────────────────────────────────────────
# 5. ★ E-14z-i — SMTP desde la app (solo ADMIN, config global id=1)
# ─────────────────────────────────────────────────────────────────────────
@router.get("/api/v1/saas/correo/config")
@router.get("/saas/correo/config")
async def ver_correo_config(request: Request, db: AsyncSession = Depends(get_db)):
    await _exigir_admin(request, db)
    await _asegurar_tabla_correo(db)
    f = await _fila_correo(db)
    cfg = await _config_correo(db)
    pw = f.get("password") or SMTP_PASSWORD
    completa_bd = bool(f.get("host") and f.get("user") and f.get("password"))
    return {
        "version": "E-14z-i",
        "activo": cfg is not None,
        "fuente": "bd" if completa_bd else ("entorno" if cfg else "dev"),
        "smtp_host": f.get("host", ""),
        "smtp_port": f.get("port") or 587,
        "smtp_user": f.get("user", ""),
        "smtp_from": f.get("from", ""),
        "tiene_password": bool(pw),
        "password_mascara": ("••••" + pw[-4:]) if pw else "",
        "hay_entorno": _env_configurado(),
    }


@router.put("/api/v1/saas/correo/config")
@router.put("/saas/correo/config")
async def guardar_correo_config(payload: CorreoConfigIn, request: Request,
                                db: AsyncSession = Depends(get_db)):
    await _exigir_admin(request, db)
    await _asegurar_tabla_correo(db)

    host = payload.smtp_host.strip()
    user = payload.smtp_user.strip()
    de = payload.smtp_from.strip() or user
    try:
        puerto = int(payload.smtp_port or 587)
    except Exception:
        raise HTTPException(422, "El puerto debe ser un número (587 STARTTLS o 465 SSL).")
    if puerto < 1 or puerto > 65535:
        raise HTTPException(422, "El puerto debe estar entre 1 y 65535.")

    f = await _fila_correo(db)
    password = payload.smtp_password.strip() or f.get("password", "")
    ahora = datetime.now(timezone.utc).isoformat(timespec="seconds")

    if f:
        await db.execute(text(
            "UPDATE saas_correo_config SET smtp_host = :h, smtp_port = :p, smtp_user = :u, "
            "smtp_password = :pw, smtp_from = :de, actualizado_en = :ts WHERE id = 1"
        ), {"h": host, "p": puerto, "u": user, "pw": password, "de": de, "ts": ahora})
    else:
        await db.execute(text(
            "INSERT INTO saas_correo_config "
            "(id, smtp_host, smtp_port, smtp_user, smtp_password, smtp_from, actualizado_en) "
            "VALUES (1, :h, :p, :u, :pw, :de, :ts)"
        ), {"h": host, "p": puerto, "u": user, "pw": password, "de": de, "ts": ahora})
    await db.commit()

    activo = bool(host and user and password)
    if activo:
        _log("correo GUARDADO desde la app →", host, ":", puerto, "(de", de or user + ")")
        aviso = "Guardado. Desde ahora el correo de verificación sale de verdad."
    else:
        faltan = [n for n, v in (("servidor", host), ("usuario", user), ("contraseña", password)) if not v]
        _log("correo guardado INCOMPLETO, falta:", ", ".join(faltan))
        aviso = ("Guardado, pero falta: " + ", ".join(faltan) +
                 ". Mientras tanto sigo en modo dev (link por consola/pantalla). "
                 "Para dejar el SMTP apagado por completo, guarda con el servidor vacío.")
    return {"version": "E-14z-i", "ok": True, "activo": activo, "aviso": aviso}


@router.post("/api/v1/saas/correo/probar")
@router.post("/saas/correo/probar")
async def probar_correo(payload: CorreoPruebaIn, request: Request,
                        db: AsyncSession = Depends(get_db)):
    await _exigir_admin(request, db)
    await _asegurar_tabla_correo(db)
    cfg = await _config_correo(db)
    if not cfg:
        raise HTTPException(422, "No hay SMTP activo todavía: guarda servidor, usuario y "
                                 "contraseña en esta página y vuelve a intentar.")
    destino = payload.destino.strip().lower()
    ok, error = await asyncio.to_thread(
        _enviar_correo_smtp, cfg, destino,
        "Correo de prueba · Kārei",
        _html_prueba(cfg.get("host", ""), int(cfg.get("port") or 587)),
    )
    if ok:
        _log("correo de PRUEBA enviado →", destino)
        return {"version": "E-14z-i", "ok": True,
                "mensaje": f"Correo enviado a {destino}. Revisa bandeja de entrada y spam."}
    _log("correo de PRUEBA falló →", error)
    return {"version": "E-14z-i", "ok": False,
            "mensaje": f"No se pudo enviar: {error} "
                       "(revisa servidor/puerto, usuario y contraseña de APLICACIÓN)."}