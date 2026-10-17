"""Servicio del Dashboard: KPIs financieros y operativos del tenant."""
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inventory import Ingredient, Recipe, RecipeItem
from app.models.orders import Order, OrderItem
from app.models.tables import Table

HORAS_COLOMBIA = 5  # GMT-5


def _texto(valor) -> str:
    """Enums -> texto plano. Ej: TableStatus.AVAILABLE -> 'AVAILABLE'."""
    return valor.value if hasattr(valor, "value") else str(valor)


def _inicio_hoy_utc() -> datetime:
    """Medianoche de hoy en Colombia, expresada en UTC (así guarda SQLite)."""
    ahora = datetime.now(timezone.utc)
    local = ahora - timedelta(hours=HORAS_COLOMBIA)
    inicio_local = local.replace(hour=0, minute=0, second=0, microsecond=0)
    return inicio_local + timedelta(hours=HORAS_COLOMBIA)


async def summary(db: AsyncSession, tenant_id: UUID) -> dict:
    """Resumen completo: KPIs del día, tendencia semanal, top platos y alertas."""
    inicio = _inicio_hoy_utc()

    ingresos, pedidos = await _ventas_periodo(db, tenant_id, desde=inicio)
    costo_hoy = await _costo_ventas(db, tenant_id, desde=inicio)

    return {
        "kpis": {
            "ingresos_hoy": ingresos,
            "pedidos_hoy": pedidos,
            "ticket_promedio": round(ingresos / pedidos, 2) if pedidos else 0,
            "costo_ventas_hoy": round(costo_hoy, 2),
            "food_cost_pct": round(costo_hoy / ingresos * 100, 1) if ingresos else 0,
            "utilidad_bruta": round(ingresos - costo_hoy, 2),
        },
        "ventas_7_dias": await _ventas_7_dias(db, tenant_id),
        "top_platos": await _top_platos(db, tenant_id),
        "alertas_stock": await _stock_bajo(db, tenant_id),
        "mesas": await _estado_mesas(db, tenant_id),
    }


async def _ventas_periodo(db: AsyncSession, tenant_id: UUID, desde: datetime) -> tuple[float, int]:
    result = await db.execute(
        select(func.sum(Order.total), func.count(Order.id)).where(
            Order.tenant_id == tenant_id,
            Order.status == "PAID",
            Order.created_at >= desde,
        )
    )
    fila = result.one()
    return float(fila[0] or 0), int(fila[1] or 0)


async def _costo_ventas(db: AsyncSession, tenant_id: UUID, desde: datetime) -> float:
    """Food Cost REAL: costo de ingredientes de todo lo vendido en el periodo."""
    result = await db.execute(
        select(func.sum(OrderItem.quantity * RecipeItem.quantity * Ingredient.cost_per_unit))
        .join(Order, OrderItem.order_id == Order.id)
        .join(RecipeItem, RecipeItem.recipe_id == OrderItem.recipe_id)
        .join(Ingredient, Ingredient.id == RecipeItem.ingredient_id)
        .where(
            Order.tenant_id == tenant_id,
            Order.status == "PAID",
            Order.created_at >= desde,
        )
    )
    return float(result.scalar() or 0)


async def _ventas_7_dias(db: AsyncSession, tenant_id: UUID) -> list[dict]:
    desde = datetime.now(timezone.utc) - timedelta(days=7)
    filas = (await db.execute(
        select(func.date(Order.created_at), func.sum(Order.total), func.count(Order.id))
        .where(
            Order.tenant_id == tenant_id,
            Order.status == "PAID",
            Order.created_at >= desde,
        )
        .group_by(func.date(Order.created_at))
        .order_by(func.date(Order.created_at))
    )).all()
    return [
        {"fecha": str(fila[0]), "ingresos": float(fila[1] or 0), "pedidos": int(fila[2] or 0)}
        for fila in filas
    ]


async def _top_platos(db: AsyncSession, tenant_id: UUID) -> list[dict]:
    filas = (await db.execute(
        select(
            Recipe.name,
            func.sum(OrderItem.quantity),
            func.sum(OrderItem.quantity * OrderItem.unit_price),
        )
        .join(Order, OrderItem.order_id == Order.id)
        .join(Recipe, Recipe.id == OrderItem.recipe_id)
        .where(Order.tenant_id == tenant_id, Order.status == "PAID")
        .group_by(Recipe.name)
        .order_by(func.sum(OrderItem.quantity).desc())
        .limit(5)
    )).all()
    return [
        {"nombre": fila[0], "cantidad": float(fila[1]), "ingresos": float(fila[2] or 0)}
        for fila in filas
    ]


async def _stock_bajo(db: AsyncSession, tenant_id: UUID) -> list[dict]:
    filas = (await db.execute(
        select(Ingredient.name, Ingredient.stock, Ingredient.min_stock, Ingredient.usage_unit)
        .where(
            Ingredient.tenant_id == tenant_id,
            Ingredient.stock <= Ingredient.min_stock,
        )
        .order_by(Ingredient.stock)
    )).all()
    return [
        {"nombre": fila[0], "stock": float(fila[1]), "minimo": float(fila[2]), "unidad": fila[3]}
        for fila in filas
    ]


async def _estado_mesas(db: AsyncSession, tenant_id: UUID) -> dict:
    """Conteo de mesas por estado. FIX: los enums se convierten a texto
    antes de comparar (SQLite los devuelve como TableStatus.X al agrupar)."""
    filas = (await db.execute(
        select(Table.status, func.count(Table.id))
        .where(Table.tenant_id == tenant_id, Table.is_active == True)
        .group_by(Table.status)
    )).all()
    conteo = {_texto(fila[0]): int(fila[1]) for fila in filas}
    return {"libres": conteo.get("AVAILABLE", 0), "ocupadas": conteo.get("OCCUPIED", 0)}