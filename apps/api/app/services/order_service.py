"""Servicio de pedidos: comanda, envío a cocina (descuenta inventario) y cierre."""
from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.enums import TableSessionStatus, TableStatus
from app.models.inventory import Recipe, RecipeItem
from app.models.orders import Order, OrderItem, Payment
from app.models.tables import Table
from app.services.table_service import DEMO_USER_ID, sesion_abierta

_LOADER = selectinload(Order.items)


async def get_active_order(db: AsyncSession, tenant_id: UUID, table_id: UUID) -> Order | None:
    result = await db.execute(
        select(Order).where(
            Order.tenant_id == tenant_id, Order.table_id == table_id,
            Order.status.notin_(["PAID", "CANCELLED"]),
        ).options(_LOADER)
    )
    return result.scalar_one_or_none()


async def add_items(db: AsyncSession, tenant_id: UUID, table_id: UUID, datos) -> dict:
    sesion = await sesion_abierta(db, table_id)
    if not sesion:
        raise HTTPException(409, "La mesa no está abierta. Ábrela antes de tomar el pedido.")

    order = await get_active_order(db, tenant_id, table_id)
    if order and order.status != "CONFIRMED":
        raise HTTPException(409, "El pedido ya fue enviado a cocina. No se pueden agregar items.")

    ids = {i.recipe_id for i in datos.items}
    recetas = {r.id: r for r in (await db.execute(
        select(Recipe).where(Recipe.tenant_id == tenant_id, Recipe.id.in_(ids))
    )).scalars()}
    if len(recetas) != len(ids):
        raise HTTPException(400, "Una o más recetas no existen en tu menú")

    if not order:
        mesa = (await db.execute(
            select(Table).where(Table.id == table_id, Table.tenant_id == tenant_id)
        )).scalar_one()
        order = Order(
            tenant_id=tenant_id, branch_id=mesa.branch_id, session_id=sesion.id,
            table_id=table_id, waiter_id=DEMO_USER_ID,
            order_number=await _siguiente_numero(db, tenant_id),
        )
        db.add(order)

    for item in datos.items:
        order.items.append(OrderItem(
            recipe_id=item.recipe_id,
            quantity=Decimal(str(item.quantity)),
            unit_price=recetas[item.recipe_id].price,
            notes=item.notes,
        ))
    _recalcular(order)
    await db.commit()
    return await order_a_out(db, order)


async def quitar_item(db: AsyncSession, tenant_id: UUID, table_id: UUID, item_id: UUID) -> dict:
    order = await _activo_obligatorio(db, tenant_id, table_id)
    if order.status != "CONFIRMED":
        raise HTTPException(409, "El pedido ya fue enviado a cocina")
    item = next((i for i in order.items if i.id == item_id), None)
    if not item:
        raise HTTPException(404, "Item no encontrado en el pedido")
    order.items.remove(item)  # sale de la cuenta YA (delete-orphan lo borra al commit)
    _recalcular(order)
    await db.commit()
    return await order_a_out(db, order)


async def send_to_kitchen(db: AsyncSession, tenant_id: UUID, order_id: UUID) -> tuple[dict, list[str]]:
    result = await db.execute(
        select(Order).where(Order.id == order_id, Order.tenant_id == tenant_id).options(_LOADER)
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(404, "Pedido no encontrado")
    if order.status != "CONFIRMED":
        raise HTTPException(409, "El pedido ya fue enviado a cocina")

    ids = {i.recipe_id for i in order.items}
    recetas = {r.id: r for r in (await db.execute(
        select(Recipe).where(Recipe.id.in_(ids))
        .options(selectinload(Recipe.items).selectinload(RecipeItem.ingredient))
    )).scalars()}

    warnings: list[str] = []
    for item in order.items:
        for ri in recetas[item.recipe_id].items:
            ing = ri.ingredient
            ing.stock -= ri.quantity * item.quantity
            if ing.stock < 0:
                warnings.append(
                    f"⚠️ {ing.name}: stock negativo ({float(ing.stock)} {ing.usage_unit})"
                )
    order.status = "SENT_TO_KITCHEN"
    await db.commit()
    return await order_a_out(db, order), warnings


async def checkout(db: AsyncSession, tenant_id: UUID, table_id: UUID, datos) -> dict:
    sesion = await sesion_abierta(db, table_id)
    if not sesion:
        raise HTTPException(409, "La mesa no tiene una cuenta abierta")
    order = await get_active_order(db, tenant_id, table_id)
    if not order:
        raise HTTPException(409, "La mesa no tiene pedidos para cobrar")

    order.tip = Decimal(str(datos.tip))
    order.total = order.subtotal + order.tip
    db.add(Payment(order_id=order.id, amount=order.total, method=datos.method))
    order.status = "PAID"

    sesion.status = TableSessionStatus.CLOSED
    sesion.closed_at = datetime.now(timezone.utc)
    sesion.subtotal_cents = int(float(order.subtotal) * 100)
    sesion.tip_cents = int(float(order.tip) * 100)
    sesion.total_cents = int(float(order.total) * 100)

    mesa = (await db.execute(
        select(Table).where(Table.id == table_id, Table.tenant_id == tenant_id)
    )).scalar_one()
    mesa.status = TableStatus.AVAILABLE

    # Capturamos la respuesta ANTES del commit (defensa: los datos ya están en memoria)
    resultado = {
        "order_number": order.order_number,
        "subtotal": float(order.subtotal), "tip": float(order.tip),
        "total": float(order.total), "method": datos.method,
    }
    await db.commit()
    return resultado


async def order_a_out(db: AsyncSession, order: Order) -> dict:
    ids = {i.recipe_id for i in order.items}
    nombres = {}
    if ids:
        filas = (await db.execute(
            select(Recipe.id, Recipe.name).where(Recipe.id.in_(ids))
        )).all()
        nombres = {fila.id: fila.name for fila in filas}
    return {
        "id": order.id, "order_number": order.order_number, "status": order.status,
        "table_id": order.table_id, "session_id": order.session_id,
        "subtotal": float(order.subtotal), "tip": float(order.tip),
        "total": float(order.total),
        "items": [{
            "id": i.id, "recipe_id": i.recipe_id,
            "recipe_name": nombres.get(i.recipe_id, ""),
            "quantity": float(i.quantity), "unit_price": float(i.unit_price),
            "notes": i.notes,
        } for i in order.items],
    }


def _recalcular(order: Order) -> None:
    order.subtotal = sum(
        (i.quantity * i.unit_price for i in order.items), Decimal("0")
    )
    order.total = order.subtotal + order.tip


async def _siguiente_numero(db: AsyncSession, tenant_id: UUID) -> str:
    total = len((await db.execute(
        select(Order.id).where(Order.tenant_id == tenant_id)
    )).all())
    return f"POS-{total + 1:06d}"


async def _activo_obligatorio(db: AsyncSession, tenant_id: UUID, table_id: UUID) -> Order:
    order = await get_active_order(db, tenant_id, table_id)
    if not order:
        raise HTTPException(404, "La mesa no tiene un pedido activo")
    return order