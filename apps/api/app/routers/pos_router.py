"""Router del POS: mesas, comanda y cierre (sin lógica de negocio)."""
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.schemas.pos import (
    CheckoutIn, CheckoutOut, ItemsIn, OrderOut, SendOut,
    TableCreate, TableOut, TableUpdate,
)
from app.services import order_service, table_service

router = APIRouter(prefix="/pos", tags=["POS"])


async def get_tenant_branch(db: AsyncSession = Depends(get_db)) -> tuple[UUID, UUID]:
    """Temporal: contexto demo hasta conectar el JWT real."""
    return await table_service.ensure_demo_context(db)


@router.get("/tables", response_model=list[TableOut])
async def listar_mesas(
    ctx: tuple = Depends(get_tenant_branch), db: AsyncSession = Depends(get_db),
):
    return await table_service.list_tables(db, ctx[0])


@router.post("/tables", response_model=TableOut, status_code=status.HTTP_201_CREATED)
async def crear_mesa(
    datos: TableCreate, ctx: tuple = Depends(get_tenant_branch),
    db: AsyncSession = Depends(get_db),
):
    return await table_service.create_table(db, ctx[0], ctx[1], datos)


@router.put("/tables/{table_id}", response_model=TableOut)
async def editar_mesa(
    table_id: UUID, datos: TableUpdate,
    ctx: tuple = Depends(get_tenant_branch), db: AsyncSession = Depends(get_db),
):
    return await table_service.update_table(db, ctx[0], table_id, datos)


@router.delete("/tables/{table_id}", status_code=status.HTTP_204_NO_CONTENT)
async def eliminar_mesa(
    table_id: UUID, ctx: tuple = Depends(get_tenant_branch),
    db: AsyncSession = Depends(get_db),
):
    await table_service.delete_table(db, ctx[0], table_id)


@router.post("/tables/{table_id}/open", response_model=TableOut)
async def abrir_mesa(
    table_id: UUID, ctx: tuple = Depends(get_tenant_branch),
    db: AsyncSession = Depends(get_db),
):
    return await table_service.abrir_mesa(db, ctx[0], table_id)


@router.get("/tables/{table_id}/order", response_model=OrderOut | None)
async def pedido_activo(
    table_id: UUID, ctx: tuple = Depends(get_tenant_branch),
    db: AsyncSession = Depends(get_db),
):
    order = await order_service.get_active_order(db, ctx[0], table_id)
    return await order_service.order_a_out(db, order) if order else None


@router.post("/tables/{table_id}/items", response_model=OrderOut)
async def agregar_items(
    table_id: UUID, datos: ItemsIn,
    ctx: tuple = Depends(get_tenant_branch), db: AsyncSession = Depends(get_db),
):
    return await order_service.add_items(db, ctx[0], table_id, datos)


@router.delete("/tables/{table_id}/items/{item_id}", response_model=OrderOut)
async def quitar_item(
    table_id: UUID, item_id: UUID,
    ctx: tuple = Depends(get_tenant_branch), db: AsyncSession = Depends(get_db),
):
    return await order_service.quitar_item(db, ctx[0], table_id, item_id)


@router.post("/orders/{order_id}/send", response_model=SendOut)
async def enviar_a_cocina(
    order_id: UUID, ctx: tuple = Depends(get_tenant_branch),
    db: AsyncSession = Depends(get_db),
):
    order, warnings = await order_service.send_to_kitchen(db, ctx[0], order_id)
    return {"order": order, "warnings": warnings}


@router.post("/tables/{table_id}/checkout", response_model=CheckoutOut)
async def cobrar_mesa(
    table_id: UUID, datos: CheckoutIn,
    ctx: tuple = Depends(get_tenant_branch), db: AsyncSession = Depends(get_db),
):
    return await order_service.checkout(db, ctx[0], table_id, datos)