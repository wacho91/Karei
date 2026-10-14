"""Servicio de ingredientes: CRUD, compras y costo por unidad de uso."""
from decimal import Decimal
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inventory import Ingredient, RecipeItem
from app.schemas.inventory import IngredientCreate, PurchaseCreate


def _costo_por_unidad(precio: float, contenido: float) -> Decimal:
    """Ej: $9000 / 1000g = $9 por gramo."""
    return Decimal(str(round(precio / contenido, 4)))


async def list_ingredients(db: AsyncSession, tenant_id: UUID) -> list[Ingredient]:
    result = await db.execute(
        select(Ingredient).where(Ingredient.tenant_id == tenant_id).order_by(Ingredient.name)
    )
    return list(result.scalars())


async def create_ingredient(
    db: AsyncSession, tenant_id: UUID, datos: IngredientCreate
) -> Ingredient:
    await _validar_nombre_unico(db, tenant_id, datos.name)
    ingrediente = Ingredient(
        tenant_id=tenant_id,
        name=datos.name,
        purchase_unit=datos.purchase_unit,
        purchase_price=Decimal(str(datos.purchase_price)),
        content_qty=Decimal(str(datos.content_qty)),
        usage_unit=datos.usage_unit,
        stock=Decimal(str(datos.stock)),
        min_stock=Decimal(str(datos.min_stock)),
        cost_per_unit=_costo_por_unidad(datos.purchase_price, datos.content_qty),
    )
    db.add(ingrediente)
    await db.commit()
    await db.refresh(ingrediente)
    return ingrediente


async def update_ingredient(
    db: AsyncSession, tenant_id: UUID, ingredient_id: UUID, datos: IngredientCreate
) -> Ingredient:
    ingrediente = await _obtener(db, tenant_id, ingredient_id)
    await _proteger_unidades(db, ingrediente, datos)
    ingrediente.name = datos.name
    ingrediente.purchase_unit = datos.purchase_unit
    ingrediente.purchase_price = Decimal(str(datos.purchase_price))
    ingrediente.content_qty = Decimal(str(datos.content_qty))
    ingrediente.usage_unit = datos.usage_unit
    ingrediente.stock = Decimal(str(datos.stock))
    ingrediente.min_stock = Decimal(str(datos.min_stock))
    ingrediente.cost_per_unit = _costo_por_unidad(datos.purchase_price, datos.content_qty)
    await db.commit()
    await db.refresh(ingrediente)
    return ingrediente


async def register_purchase(
    db: AsyncSession, tenant_id: UUID, ingredient_id: UUID, datos: PurchaseCreate
) -> Ingredient:
    """Llega mercancía: suma stock. Si el precio del mercado cambió, amortigua
    el costo por unidad y TODAS las recetas se recalculan al consultarse."""
    ingrediente = await _obtener(db, tenant_id, ingredient_id)
    ingrediente.stock += Decimal(str(datos.quantity))
    if datos.purchase_price is not None:
        ingrediente.purchase_price = Decimal(str(datos.purchase_price))
        ingrediente.cost_per_unit = _costo_por_unidad(
            datos.purchase_price, float(ingrediente.content_qty)
        )
    await db.commit()
    await db.refresh(ingrediente)
    return ingrediente


async def delete_ingredient(db: AsyncSession, tenant_id: UUID, ingredient_id: UUID) -> None:
    en_uso = await db.execute(
        select(RecipeItem).where(RecipeItem.ingredient_id == ingredient_id).limit(1)
    )
    if en_uso.scalar_one_or_none():
        raise HTTPException(409, "No se puede eliminar: está en uso por recetas")
    ingrediente = await _obtener(db, tenant_id, ingredient_id)
    await db.delete(ingrediente)
    await db.commit()


async def _obtener(db: AsyncSession, tenant_id: UUID, ingredient_id: UUID) -> Ingredient:
    result = await db.execute(
        select(Ingredient).where(
            Ingredient.id == ingredient_id, Ingredient.tenant_id == tenant_id
        )
    )
    ingrediente = result.scalar_one_or_none()
    if not ingrediente:
        raise HTTPException(404, "Ingrediente no encontrado")
    return ingrediente


async def _proteger_unidades(
    db: AsyncSession, ingrediente: Ingredient, datos: IngredientCreate
) -> None:
    """Si el ingrediente ya vive en recetas, su unidad de uso es intocable:
    cambiarla corrompería las cantidades guardadas (ej: 250 pensados en G)."""
    if datos.usage_unit == ingrediente.usage_unit:
        return
    en_uso = await db.execute(
        select(RecipeItem).where(RecipeItem.ingredient_id == ingrediente.id).limit(1)
    )
    if en_uso.scalar_one_or_none():
        raise HTTPException(
            409,
            f"Hay recetas usando este ingrediente en {ingrediente.usage_unit}. "
            "No puedes cambiar su unidad de uso.",
        )


async def _validar_nombre_unico(db: AsyncSession, tenant_id: UUID, name: str) -> None:
    result = await db.execute(
        select(Ingredient).where(
            Ingredient.tenant_id == tenant_id, Ingredient.name == name
        ).limit(1)
    )
    if result.scalar_one_or_none():
        raise HTTPException(400, "Ya existe un ingrediente con ese nombre")