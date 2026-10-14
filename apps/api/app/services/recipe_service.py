"""Servicio de recetas: creación, edición y motor de Food Cost dinámico."""
from decimal import Decimal
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.inventory import Ingredient, Recipe, RecipeItem
from app.schemas.inventory import RecipeCreate, RecipeOut

_LOADER = (
    selectinload(Recipe.items).selectinload(RecipeItem.ingredient)
)


async def list_recipes(db: AsyncSession, tenant_id: UUID) -> list[RecipeOut]:
    result = await db.execute(
        select(Recipe)
        .where(Recipe.tenant_id == tenant_id)
        .options(_LOADER)
        .order_by(Recipe.name)
    )
    return [_a_response(receta) for receta in result.scalars()]


async def create_recipe(
    db: AsyncSession, tenant_id: UUID, datos: RecipeCreate
) -> RecipeOut:
    await _validar_ingredientes(db, tenant_id, datos)
    receta = Recipe(
        tenant_id=tenant_id,
        name=datos.name,
        description=datos.description,
        price=Decimal(str(datos.price)),
    )
    receta.items = [
        RecipeItem(ingredient_id=i.ingredient_id, quantity=Decimal(str(i.quantity)))
        for i in datos.items
    ]
    db.add(receta)
    await db.commit()
    return await _obtener_response(db, tenant_id, receta.id)


async def update_recipe(
    db: AsyncSession, tenant_id: UUID, recipe_id: UUID, datos: RecipeCreate
) -> RecipeOut:
    result = await db.execute(
        select(Recipe)
        .where(Recipe.id == recipe_id, Recipe.tenant_id == tenant_id)
        .options(_LOADER)
    )
    receta = result.scalar_one_or_none()
    if not receta:
        raise HTTPException(404, "Receta no encontrada")

    await _validar_ingredientes(db, tenant_id, datos)
    receta.name = datos.name
    receta.description = datos.description
    receta.price = Decimal(str(datos.price))
    receta.items.clear()
    for item in datos.items:
        receta.items.append(
            RecipeItem(ingredient_id=item.ingredient_id, quantity=Decimal(str(item.quantity)))
        )
    await db.commit()
    return await _obtener_response(db, tenant_id, recipe_id)


def _a_response(receta: Recipe) -> RecipeOut:
    response = RecipeOut.model_validate(receta)
    costo = calculate_cost(receta)
    response.cost = round(float(costo), 2)
    response.margin = round(float((receta.price - costo) / receta.price * 100), 1)
    return response


async def _obtener_response(
    db: AsyncSession, tenant_id: UUID, recipe_id: UUID
) -> RecipeOut:
    result = await db.execute(
        select(Recipe)
        .where(Recipe.id == recipe_id, Recipe.tenant_id == tenant_id)
        .options(_LOADER)
    )
    receta = result.scalar_one_or_none()
    if not receta:
        raise HTTPException(404, "Receta no encontrada")
    return _a_response(receta)


async def _validar_ingredientes(
    db: AsyncSession, tenant_id: UUID, datos: RecipeCreate
) -> None:
    ids = {item.ingredient_id for item in datos.items}
    result = await db.execute(
        select(Ingredient).where(
            Ingredient.tenant_id == tenant_id, Ingredient.id.in_(ids)
        )
    )
    if len({ing.id for ing in result.scalars()}) != len(ids):
        raise HTTPException(400, "Uno o más ingredientes no existen en tu inventario")


def _a_response(receta: Recipe) -> RecipeOut:
    response = RecipeOut.model_validate(receta)
    costo = calculate_cost(receta)
    response.cost = float(costo)
    response.margin = round(float((receta.price - costo) / receta.price * 100), 1)
    return response