"""Router del POS: mesas, comanda, cocina y cierre (sin lógica de negocio)."""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.deps.auth import AuthContext, get_auth_context, require_roles
from app.models.identity import Branch
from app.schemas.pos import (
    CheckoutIn, CheckoutOut, ItemsIn, KdsOrderOut, OrderOut, SendOut,
    TableCreate, TableOut, TableUpdate,
)
from app.services import order_service, table_service

router = APIRouter(prefix="/pos", tags=["POS"])


async def get_ctx_pos(
    ctx: AuthContext = Depends(get_auth_context),
    db: AsyncSession = Depends(get_db),
) -> tuple[UUID, UUID, UUID]:
    """(tenant_id, branch_id, user_id) del usuario autenticado."""
    branch = (await db.execute(
        select(Branch).where(Branch.tenant_id == ctx.tenant_id).limit(1)
    )).scalar_one_or_none()
    if not branch:
        raise HTTPException(404, "Tu usuario no tiene sucursal asignada")
    return ctx.tenant_id, branch.id, ctx.user_id


# --- Mesas (gestión: ADMIN · operación: todos) ---
@router.get("/tables", response_model=list[TableOut])
async def listar_mesas(
    ctx: tuple = Depends(get_ctx_pos), db: AsyncSession = Depends(get_db),
):
    return await table_service.list_tables(db, ctx[0])


@router.post("/tables", response_model=TableOut, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(require_roles("ADMIN"))])
async def crear_mesa(
    datos: TableCreate, ctx: tuple = Depends(get_ctx_pos),
    db: AsyncSession = Depends(get_db),
):
    return await table_service.create_table(db, ctx[0], ctx[1], datos)


@router.put("/tables/{table_id}", response_model=TableOut,
            dependencies=[Depends(require_roles("ADMIN"))])
async def editar_mesa(
    table_id: UUID, datos: TableUpdate,
    ctx: tuple = Depends(get_ctx_pos), db: AsyncSession = Depends(get_db),
):
    return await table_service.update_table(db, ctx[0], table_id, datos)


@router.delete("/tables/{table_id}", dependencies=[Depends(require_roles("ADMIN"))])
async def eliminar_mesa(
    table_id: UUID, ctx: tuple = Depends(get_ctx_pos),
    db: AsyncSession = Depends(get_db),
):
    return await table_service.delete_table(db, ctx[0], table_id)


@router.post("/tables/{table_id}/open", response_model=TableOut)
async def abrir_mesa(
    table_id: UUID, ctx: tuple = Depends(get_ctx_pos),
    db: AsyncSession = Depends(get_db),
):
    return await table_service.abrir_mesa(db, ctx[0], table_id, ctx[2])


# --- Pedidos ---
@router.get("/tables/{table_id}/order", response_model=OrderOut | None)
async def pedido_activo(
    table_id: UUID, ctx: tuple = Depends(get_ctx_pos),
    db: AsyncSession = Depends(get_db),
):
    order = await order_service.get_active_order(db, ctx[0], table_id)
    return await order_service.order_a_out(db, order) if order else None


@router.post("/tables/{table_id}/items", response_model=OrderOut)
async def agregar_items(
    table_id: UUID, datos: ItemsIn,
    ctx: tuple = Depends(get_ctx_pos), db: AsyncSession = Depends(get_db),
):
    return await order_service.add_items(db, ctx[0], table_id, ctx[2], datos)


@router.delete("/tables/{table_id}/items/{item_id}", response_model=OrderOut)
async def quitar_item(
    table_id: UUID, item_id: UUID,
    ctx: tuple = Depends(get_ctx_pos), db: AsyncSession = Depends(get_db),
):
    return await order_service.quitar_item(db, ctx[0], table_id, item_id)


@router.post("/orders/{order_id}/send", response_model=SendOut,
             dependencies=[Depends(require_roles("WAITER"))])
async def enviar_a_cocina(
    order_id: UUID, ctx: tuple = Depends(get_ctx_pos),
    db: AsyncSession = Depends(get_db),
):
    order, warnings = await order_service.send_to_kitchen(db, ctx[0], order_id)
    return {"order": order, "warnings": warnings}


@router.post("/tables/{table_id}/checkout", response_model=CheckoutOut,
             dependencies=[Depends(require_roles("WAITER"))])
async def cobrar_mesa(
    table_id: UUID, datos: CheckoutIn,
    ctx: tuple = Depends(get_ctx_pos), db: AsyncSession = Depends(get_db),
):
    return await order_service.checkout(db, ctx[0], table_id, datos)


# --- Cocina (KDS) ---
@router.get("/kitchen/orders", response_model=list[KdsOrderOut],
            dependencies=[Depends(require_roles("KITCHEN"))])
async def comandas_cocina(
    ctx: tuple = Depends(get_ctx_pos), db: AsyncSession = Depends(get_db),
):
    return await order_service.listar_cocina(db, ctx[0])


@router.post("/orders/{order_id}/advance",
             dependencies=[Depends(require_roles("KITCHEN"))])
async def avanzar_comanda(
    order_id: UUID, ctx: tuple = Depends(get_ctx_pos),
    db: AsyncSession = Depends(get_db),
):
    return await order_service.avanzar_cocina(db, ctx[0], order_id)