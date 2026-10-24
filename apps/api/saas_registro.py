"""
═══════════════════════════════════════════════════════════════════════════════
 Kārei · saas_registro.py  ·  E-14z-g  (Fase SaaS — registro + verificación)
═══════════════════════════════════════════════════════════════════════════════
QUÉ ES
------
Add-on INDEPENDIENTE (misma filosofía de pos_cuenta_live / pos_facturacion:
no toca tus modelos, tu routers ni tu identity.py — los USA). Agrega 2
endpoints que cierran el flujo de registro SaaS:

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

TU ROUTER NO SE TOCA: tu /auth/login ya exige status ACTIVE ("Debes
verificar tu correo…") así que el flujo encaja sin cambiar una línea.

★ NUEVO E-14z-g — ENVÍO REAL DE CORREO (SMTP)
----------------------------------------------
Sin configurar nada: modo dev (link en consola + en pantalla), igual que antes.

Con SMTP configurado (variables de entorno, se leen al arrancar uvicorn):

    KAREI_SMTP_HOST      ej: smtp.gmail.com
    KAREI_SMTP_PORT      587 (STARTTLS, default) o 465 (SSL)
    KAREI_SMTP_USER      el correo que envía, ej: notificaciones@tumarca.com
    KAREI_SMTP_PASSWORD  la contraseña de APLICACIÓN (Gmail: 16 caracteres)
    KAREI_SMTP_FROM      (opcional) correo visible en De:, por defecto USER

Comportamiento:
  · SMTP bien configurado  → envía el correo de verdad (HTML con la marca)
                             y NO devuelve el link en la respuesta (seguro).
  · SMTP sin configurar    → modo dev: link en consola + en pantalla.
  · SMTP configurado pero falló el envío → el registro SÍ se crea, se
                             devuelve el link con un "aviso" (no bloquea).

GMAIL en 3 pasos: (1) activa Verificación en 2 pasos en la cuenta de Google,
(2) entra a https://myaccount.google.com/apppasswords y crea una "Contraseña
de aplicación" (16 letras), (3) usa esas 16 letras como KAREI_SMTP_PASSWORD
(¡NO tu contraseña normal!). En Windows, define las variables en la MISMA
terminal antes de uvicorn:
    CMD:        set KAREI_SMTP_HOST=smtp.gmail.com  (una por línea)
    PowerShell: $env:KAREI_SMTP_HOST="smtp.gmail.com"

CÓMO MONTARLO (2 líneas en tu main.py, junto a los otros add-ons):
    from saas_registro import router as saas_registro_router
    app.include_router(saas_registro_router)

    (igual que hiciste con pos_facturacion — debajo de ese include)

Decisiones ya tomadas (decir si alguna se quiere distinta):
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
import bcrypt
import hashlib
import os
import re
import secrets
import smtplib
import ssl
import unicodedata
from datetime import datetime, timedelta, timezone
from email.header import Header
from email.mime.text import MIMEText
from email.utils import formataddr
from typing import List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select
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
# 0. SMTP (correo real) — variables de entorno, cero dependencias nuevas
# ─────────────────────────────────────────────────────────────────────────
SMTP_HOST = os.getenv("KAREI_SMTP_HOST", "").strip()
SMTP_PORT = int(os.getenv("KAREI_SMTP_PORT", "587").strip() or "587")
SMTP_USER = os.getenv("KAREI_SMTP_USER", "").strip()
SMTP_PASSWORD = os.getenv("KAREI_SMTP_PASSWORD", "").strip()
SMTP_FROM = os.getenv("KAREI_SMTP_FROM", "").strip() or SMTP_USER


def _smtp_configurado() -> bool:
    return bool(SMTP_HOST and SMTP_USER and SMTP_PASSWORD)


def _enviar_correo_smtp(destino: str, asunto: str, html: str) -> Tuple[bool, str]:
    """Envía el correo. Devuelve (ok, mensaje_de_error). NUNCA lanza."""
    try:
        msg = MIMEText(html, "html", "utf-8")
        msg["Subject"] = Header(asunto, "utf-8")
        msg["From"] = formataddr(("Kārei", SMTP_FROM))
        msg["To"] = destino

        if SMTP_PORT == 465:  # SSL directo (ej: algunos proveedores)
            with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=20) as s:
                s.login(SMTP_USER, SMTP_PASSWORD)
                s.sendmail(SMTP_FROM, [destino], msg.as_string())
        else:  # 587: STARTTLS (Gmail y la mayoría)
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20) as s:
                s.ehlo()
                s.starttls(context=ssl.create_default_context())
                s.ehlo()
                s.login(SMTP_USER, SMTP_PASSWORD)
                s.sendmail(SMTP_FROM, [destino], msg.as_string())
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


if _smtp_configurado():
    print(f"[saas_registro] E-14z-g listo · SMTP activo → {SMTP_HOST}:{SMTP_PORT} (de {SMTP_FROM})")
else:
    print("[saas_registro] E-14z-g listo · SIN SMTP → link de verificación por consola/pantalla (dev)")


# ─────────────────────────────────────────────────────────────────────────
# 1. Payload
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

    # ── ★ E-14z-g: correo de verdad si hay SMTP; modo dev si no
    asunto = f"Verifica tu correo · {payload.restaurante.commercial_name} en Kārei"
    if _smtp_configurado():
        email_enviado, error_envio = await asyncio.to_thread(
            _enviar_correo_smtp, email, asunto,
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
        if _smtp_configurado():
            _log("  ⚠️ SMTP configurado PERO el envío FALLÓ →", error_envio)
        _log("  EMAIL DE VERIFICACIÓN (modo dev):")
        _log("  " + verificacion_url)
        _log("=" * 60)

    resp = {
        "version": "E-14z-g",
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
            if _smtp_configurado() else
            "Servidor sin SMTP configurado: usa este link (o configúralo con las variables KAREI_SMTP_*)."
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