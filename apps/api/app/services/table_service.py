"""Servicio del POS: contexto demo, mesas y sesiones."""
import uuid
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import (
    TableSessionStatus, TableStatus, TenantPlan, TenantStatus, UserStatus,
)
from app.models.identity import Branch, Tenant, User
from app.models.orders import Order
from app.models.tables import Table, TableSession

DEMO_TENANT_ID = UUID("00000000-0000-0000-0000-000000000001")
DEMO_BRANCH_ID = UUID("00000000-0000-0000-0000-000000000002")
DEMO_USER_ID = UUID("00000000-0000-0000-0000-000000000003")


async def ensure_demo_context(db: AsyncSession) -> tuple[UUID, UUID]:
    """Crea una sola vez el tenant, sucursal y mesero demo (idempotente).
    Necesarios porque Table y Order exigen FKs reales. Temporal hasta JWT."""
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
    if not await db.get(User, DEMO_USER_ID):
        db.add(User(
            id=DEMO_USER_ID, tenant_id=DEMO_TENANT_ID, email="demo@karei.app",
            password_hash="demo-hash-local", full_name="Mesero Demo",
            status=UserStatus.ACTIVE,
        ))
    await db.commit()
    return DEMO_TENANT_ID, DEMO_BRANCH_ID


def _str(valor) -> str:
    return valor.value if hasattr(valor, "value") else str(valor)


def _mesa_dict(mesa: Table, sesion: TableSession | None = None, order: Order | None = None) -> dict:
    return {
        "id": mesa.id, "code": mesa.code, "name": mesa.name,
        "capacity": mesa.capacity, "zone": mesa.zone, "status": _str(mesa.status),
        "session_id": sesion.id if sesion else None,
        "order_id": order.id if order else None,
        "order_number": order.order_number if order else None,
        "open_total": float(order.total) if order else 0,
        "items_count": len(order.items) if order else 0,
    }


async def sesion_abierta(db: AsyncSession, table_id: UUID) -> TableSession | None:
    result = await db.execute(
        select(TableSession).where(
            TableSession.table_id == table_id,
            TableSession.status == TableSessionStatus.OPEN,
        )
    )
    return result.scalar_one_or_none()


async def list_tables(db: AsyncSession, tenant_id: UUID) -> list[dict]:
    mesas = (await db.execute(
        select(Table).where(
            Table.tenant_id == tenant_id,
            Table.is_active == True,  # ← FIX: las desactivadas no aparecen en el mapa
        ).order_by(Table.code)
    )).scalars().all()

    sesiones = (await db.execute(
        select(TableSession).where(
            TableSession.tenant_id == tenant_id,
            TableSession.status == TableSessionStatus.OPEN,
        )
    )).scalars().all()
    sesion_por_mesa = {s.table_id: s for s in sesiones}

    orders = (await db.execute(
        select(Order).where(
            Order.tenant_id == tenant_id, Order.status.notin_(["PAID", "CANCELLED"])
        )
    )).scalars().all()
    order_por_sesion = {o.session_id: o for o in orders if o.session_id}

    resultado = []
    for mesa in mesas:
        sesion = sesion_por_mesa.get(mesa.id)
        order = order_por_sesion.get(sesion.id) if sesion else None
        resultado.append(_mesa_dict(mesa, sesion, order))
    return resultado


async def create_table(
    db: AsyncSession, tenant_id: UUID, branch_id: UUID, datos
) -> dict:
    """Crea una mesa. Si existe una DESACTIVADA con el mismo código,
    se reactiva con los datos nuevos (reciclaje: el historial se conserva)."""
    activa = (await db.execute(
        select(Table).where(
            Table.tenant_id == tenant_id, Table.code == datos.code,
            Table.is_active == True,
        )
    )).scalar_one_or_none()
    if activa:
        raise HTTPException(400, f"Ya existe una mesa activa con el código {datos.code}")

    dormida = (await db.execute(
        select(Table).where(Table.tenant_id == tenant_id, Table.code == datos.code)
    )).scalar_one_or_none()
    if dormida:
        dormida.name = datos.name
        dormida.capacity = datos.capacity
        dormida.zone = datos.zone
        dormida.is_active = True
        dormida.status = TableStatus.AVAILABLE
        await db.commit()
        await db.refresh(dormida)
        return _mesa_dict(dormida)

    mesa = Table(
        tenant_id=tenant_id, branch_id=branch_id, code=datos.code,
        name=datos.name, capacity=datos.capacity, zone=datos.zone,
        qr_code=uuid.uuid4().hex,
    )
    db.add(mesa)
    await db.commit()
    await db.refresh(mesa)
    return _mesa_dict(mesa)


async def update_table(db: AsyncSession, tenant_id: UUID, table_id: UUID, datos) -> dict:
    mesa = await _obtener_mesa(db, tenant_id, table_id)
    if datos.code and datos.code != mesa.code:
        duplicada = (await db.execute(
            select(Table).where(
                Table.tenant_id == tenant_id,
                Table.code == datos.code,
                Table.id != mesa.id,
            )
        )).scalar_one_or_none()
        if duplicada:
            raise HTTPException(400, f"El código {datos.code} ya lo usa otra mesa")
        mesa.code = datos.code
    if datos.name is not None:
        mesa.name = datos.name
    if datos.capacity is not None:
        mesa.capacity = datos.capacity
    if datos.zone is not None:
        mesa.zone = datos.zone
    await db.commit()
    await db.refresh(mesa)
    return _mesa_dict(mesa)


async def delete_table(db: AsyncSession, tenant_id: UUID, table_id: UUID) -> dict:
    """Elimina una mesa. REGLA DE ERP: si tiene historial (sesiones o pedidos),
    nunca se borra — se desactiva (soft delete) para preservar las ventas."""
    mesa = await _obtener_mesa(db, tenant_id, table_id)
    if await sesion_abierta(db, table_id):
        raise HTTPException(409, "La mesa tiene una cuenta abierta. Cóbrela primero.")

    tiene_sesiones = (await db.execute(
        select(TableSession.id).where(TableSession.table_id == table_id).limit(1)
    )).scalar_one_or_none()
    tiene_pedidos = (await db.execute(
        select(Order.id).where(Order.table_id == table_id).limit(1)
    )).scalar_one_or_none()

    if tiene_sesiones or tiene_pedidos:
        mesa.is_active = False
        await db.commit()
        return {
            "mensaje": "La mesa tiene historial de ventas: fue DESACTIVADA (no aparece en el mapa). El historial se conserva.",
            "desactivada": True,
        }

    await db.delete(mesa)
    await db.commit()
    return {"mensaje": "Mesa eliminada", "desactivada": False}


async def abrir_mesa(db: AsyncSession, tenant_id: UUID, table_id: UUID) -> dict:
    """Abre una mesa (llegan clientes). Idempotente: si ya está abierta,
    devuelve su estado sin error (un doble clic no debe romper nada)."""
    mesa = await _obtener_mesa(db, tenant_id, table_id)
    sesion = await sesion_abierta(db, table_id)
    if sesion is None:
        sesion = TableSession(
            tenant_id=tenant_id, table_id=table_id,
            opened_by_id=DEMO_USER_ID, status=TableSessionStatus.OPEN, guest_count=1,
        )
        mesa.status = TableStatus.OCCUPIED
        db.add(sesion)
        await db.commit()
        await db.refresh(sesion)
        await db.refresh(mesa)
    return _mesa_dict(mesa, sesion)


async def _obtener_mesa(db: AsyncSession, tenant_id: UUID, table_id: UUID) -> Table:
    result = await db.execute(
        select(Table).where(Table.id == table_id, Table.tenant_id == tenant_id)
    )
    mesa = result.scalar_one_or_none()
    if not mesa:
        raise HTTPException(404, "Mesa no encontrada")
    return mesa