"""Siembra una sola vez el tenant demo con roles y usuarios de prueba."""
import bcrypt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import RoleScope, TenantPlan, TenantStatus, UserStatus
from app.models.identity import Branch, Role, Tenant, User, UserRole
from app.services.table_service import DEMO_BRANCH_ID, DEMO_TENANT_ID

USUARIOS_DEMO = [
    {"email": "admin@karei.app", "password": "admin123", "pin": None,
     "nombre": "Administrador Kārei", "rol": "ADMIN"},
    {"email": "mesero@karei.app", "password": None, "pin": "1234",
     "nombre": "Carlos Mesero", "rol": "WAITER"},
    {"email": "cocina@karei.app", "password": None, "pin": "1111",
     "nombre": "Chef de Cocina", "rol": "KITCHEN"},
]


def _hash(texto: str) -> str:
    return bcrypt.hashpw(texto.encode(), bcrypt.gensalt()).decode()


async def bootstrap_demo(db: AsyncSession) -> None:
    """Idempotente: crea lo que falte (tenant, sucursal, roles, usuarios)."""
    if not await db.get(Tenant, DEMO_TENANT_ID):
        db.add(Tenant(
            id=DEMO_TENANT_ID, slug="karei-demo",
            legal_name="Karei Demo Restaurant SAS", commercial_name="Karei Demo",
            nit="900000001", plan=TenantPlan.STARTER, status=TenantStatus.ACTIVE,
        ))
    if not await db.get(Branch, DEMO_BRANCH_ID):
        db.add(Branch(
            id=DEMO_BRANCH_ID, tenant_id=DEMO_TENANT_ID,
            code="SUC-1", name="Sede Principal", is_main=True,
        ))

    roles = {}
    for code in ("ADMIN", "WAITER", "KITCHEN"):
        existente = (await db.execute(
            select(Role).where(Role.tenant_id == DEMO_TENANT_ID, Role.code == code)
        )).scalar_one_or_none()
        if not existente:
            existente = Role(tenant_id=DEMO_TENANT_ID, code=code,
                             name=code.capitalize(), scope=RoleScope.TENANT)
            db.add(existente)
            await db.flush()
        roles[code] = existente

    for datos in USUARIOS_DEMO:
        usuario = (await db.execute(
            select(User).where(User.email == datos["email"])
        )).scalar_one_or_none()
        if usuario:
            continue
        nuevo = User(
            tenant_id=DEMO_TENANT_ID, branch_id=DEMO_BRANCH_ID,
            email=datos["email"], full_name=datos["nombre"],
            password_hash=_hash(datos["password"]) if datos["password"] else "PIN-ONLY",
            pin_hash=_hash(datos["pin"]) if datos["pin"] else None,
            status=UserStatus.ACTIVE,
        )
        db.add(nuevo)
        await db.flush()
        db.add(UserRole(user_id=nuevo.id, role_id=roles[datos["rol"]].id,
                        tenant_id=DEMO_TENANT_ID))

    await db.commit()