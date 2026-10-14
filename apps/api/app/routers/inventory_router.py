"""Router de inventario: ingredientes, compras y recetas (sin lógica de negocio)."""
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.schemas.inventory import (
    IngredientCreate, IngredientOut, PurchaseCreate, RecipeCreate, RecipeOut,
)
from app.services import ingredient_service, recipe_service

router = APIRouter(prefix="/inventory", tags=["Inventory"])


# TEMPORAL: mientras conectamos el JWT real, usamos un tenant de desarrollo.
async def get_tenant_id() -> UUID:
    return UUID("00000000-0000-0000-0000-000000000001")


@router.get("/ingredients", response_model=list[IngredientOut])
async def listar_ingredientes(
    db: AsyncSession = Depends(get_db),
    tenant_id: UUID = Depends(get_tenant_id),
):
    return await ingredient_service.list_ingredients(db, tenant_id)


@router.post("/ingredients", response_model=IngredientOut, status_code=status.HTTP_201_CREATED)
async def crear_ingrediente(
    datos: IngredientCreate,
    db: AsyncSession = Depends(get_db),
    tenant_id: UUID = Depends(get_tenant_id),
):
    return await ingredient_service.create_ingredient(db, tenant_id, datos)


@router.put("/ingredients/{ingredient_id}", response_model=IngredientOut)
async def actualizar_ingrediente(
    ingredient_id: UUID,
    datos: IngredientCreate,
    db: AsyncSession = Depends(get_db),
    tenant_id: UUID = Depends(get_tenant_id),
):
    return await ingredient_service.update_ingredient(db, tenant_id, ingredient_id, datos)


@router.post("/ingredients/{ingredient_id}/purchases", response_model=IngredientOut)
async def registrar_compra(
    ingredient_id: UUID,
    datos: PurchaseCreate,
    db: AsyncSession = Depends(get_db),
    tenant_id: UUID = Depends(get_tenant_id),
):
    """Llega mercancía: suma stock y amortigua el precio si el mercado cambió."""
    return await ingredient_service.register_purchase(db, tenant_id, ingredient_id, datos)


@router.delete("/ingredients/{ingredient_id}", status_code=status.HTTP_204_NO_CONTENT)
async def eliminar_ingrediente(
    ingredient_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: UUID = Depends(get_tenant_id),
):
    await ingredient_service.delete_ingredient(db, tenant_id, ingredient_id)


@router.get("/recipes", response_model=list[RecipeOut])
async def listar_recetas(
    db: AsyncSession = Depends(get_db),
    tenant_id: UUID = Depends(get_tenant_id),
):
    return await recipe_service.list_recipes(db, tenant_id)


@router.post("/recipes", response_model=RecipeOut, status_code=status.HTTP_201_CREATED)
async def crear_receta(
    datos: RecipeCreate,
    db: AsyncSession = Depends(get_db),
    tenant_id: UUID = Depends(get_tenant_id),
):
    return await recipe_service.create_recipe(db, tenant_id, datos)


@router.put("/recipes/{recipe_id}", response_model=RecipeOut)
async def actualizar_receta(
    recipe_id: UUID,
    datos: RecipeCreate,
    db: AsyncSession = Depends(get_db),
    tenant_id: UUID = Depends(get_tenant_id),
):
    return await recipe_service.update_recipe(db, tenant_id, recipe_id, datos)