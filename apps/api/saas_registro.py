"""
═══════════════════════════════════════════════════════════════════════════════
 Kārei · saas_registro.py  ·  E-14z-f  (Fase SaaS — registro + verificación)
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

CÓMO MONTARLO (2 líneas en tu main.py, junto a los otros add-ons):
    from saas_registro import router as saas_registro_router
    app.include_router(saas_registro_router)

    (igual que hiciste con pos_facturacion — debajo de ese include)

EMAIL (importante): NO hay SMTP conectado todavía. En desarrollo el link
de verificación se imprime en la CONSOLA del backend y TAMBIÉN viene en
la respuesta del registro (campo "verificacion_url") para no frenar las
pruebas. Al conectar SMTP (Gmail app-password) se quita de la respuesta.

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

import bcrypt
import hashlib
import re
import secrets
import unicodedata
from datetime import datetime, timedelta, timezone
from typing import List, Optional

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

    _log("=" * 60)
    _log("REGISTRO NUEVO:", payload.restaurante.commercial_name, "·", tenant.slug)
    _log("  admin:", email, "· equipo:", equipo_creados, "persona(s)")
    _log("  EMAIL DE VERIFICACIÓN (dev, sin SMTP):")
    _log("  " + verificacion_url)
    _log("=" * 60)

    return {
        "version": "E-14z-f",
        "ok": True,
        "tenant": {"slug": tenant.slug, "commercial_name": tenant.commercial_name,
                   "trial_hasta": str(tenant.trial_ends_at)},
        "admin": {"email": email},
        "equipo_creados": equipo_creados,
        # ⚠️ Quitar este campo cuando se conecte SMTP (solo dev)
        "verificacion_url": verificacion_url,
    }


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