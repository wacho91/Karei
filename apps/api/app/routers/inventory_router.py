"""Router de inventario: ingredientes y recetas (sin lógica de negocio)."""
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.deps.auth import AuthContext, get_auth_context, require_roles
from app.schemas.inventory import (
    IngredientCreate, IngredientOut, PurchaseCreate, RecipeCreate, RecipeOut,
)
from app.services import ingredient_service, recipe_service

router = APIRouter(prefix="/inventory", tags=["Inventory"])


async def get_tenant_id(ctx: AuthContext = Depends(get_auth_context)) -> UUID:
    return ctx.tenant_id


# --- Ingredientes (lectura: todos · escritura: ADMIN) ---
@router.get("/ingredients", response_model=list[IngredientOut])
async def listar_ingredientes(
    db: AsyncSession = Depends(get_db),
    tenant_id: UUID = Depends(get_tenant_id),
):
    return await ingredient_service.list_ingredients(db, tenant_id)


@router.post("/ingredients", response_model=IngredientOut, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(require_roles("ADMIN"))])
async def crear_ingrediente(
    datos: IngredientCreate,
    db: AsyncSession = Depends(get_db),
    tenant_id: UUID = Depends(get_tenant_id),
):
    return await ingredient_service.create_ingredient(db, tenant_id, datos)


@router.put("/ingredients/{ingredient_id}", response_model=IngredientOut,
            dependencies=[Depends(require_roles("ADMIN"))])
async def actualizar_ingrediente(
    ingredient_id: UUID, datos: IngredientCreate,
    db: AsyncSession = Depends(get_db),
    tenant_id: UUID = Depends(get_tenant_id),
):
    return await ingredient_service.update_ingredient(db, tenant_id, ingredient_id, datos)


@router.post("/ingredients/{ingredient_id}/purchases", response_model=IngredientOut,
             dependencies=[Depends(require_roles("ADMIN"))])
async def registrar_compra(
    ingredient_id: UUID, datos: PurchaseCreate,
    db: AsyncSession = Depends(get_db),
    tenant_id: UUID = Depends(get_tenant_id),
):
    return await ingredient_service.register_purchase(db, tenant_id, ingredient_id, datos)


@router.delete("/ingredients/{ingredient_id}", status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[Depends(require_roles("ADMIN"))])
async def eliminar_ingrediente(
    ingredient_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: UUID = Depends(get_tenant_id),
):
    await ingredient_service.delete_ingredient(db, tenant_id, ingredient_id)


# --- Recetas (lectura: todos · escritura: ADMIN) ---
@router.get("/recipes", response_model=list[RecipeOut])
async def listar_recetas(
    db: AsyncSession = Depends(get_db),
    tenant_id: UUID = Depends(get_tenant_id),
):
    return await recipe_service.list_recipes(db, tenant_id)


@router.post("/recipes", response_model=RecipeOut, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(require_roles("ADMIN"))])
async def crear_receta(
    datos: RecipeCreate,
    db: AsyncSession = Depends(get_db),
    tenant_id: UUID = Depends(get_tenant_id),
):
    return await recipe_service.create_recipe(db, tenant_id, datos)


@router.put("/recipes/{recipe_id}", response_model=RecipeOut,
            dependencies=[Depends(require_roles("ADMIN"))])
async def actualizar_receta(
    recipe_id: UUID, datos: RecipeCreate,
    db: AsyncSession = Depends(get_db),
    tenant_id: UUID = Depends(get_tenant_id),
):
    return await recipe_service.update_recipe(db, tenant_id, recipe_id, datos)