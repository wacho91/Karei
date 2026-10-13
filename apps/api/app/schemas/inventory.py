"""Schemas Pydantic del módulo de inventario."""
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

UNIDADES_COMPRA = {"KG", "G", "L", "ML", "UND", "PAQUETE"}
UNIDADES_USO = {"G", "ML", "UND"}


class IngredientCreate(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    purchase_unit: str
    purchase_price: float = Field(gt=0)
    content_qty: float = Field(gt=0, description="Cuántas usage_unit trae la compra")
    usage_unit: str
    stock: float = Field(default=0, ge=0)
    min_stock: float = Field(default=0, ge=0)

    @field_validator("purchase_unit")
    @classmethod
    def validar_compra(cls, v: str) -> str:
        v = v.upper()
        if v not in UNIDADES_COMPRA:
            raise ValueError(f"Unidad inválida. Usa: {sorted(UNIDADES_COMPRA)}")
        return v

    @field_validator("usage_unit")
    @classmethod
    def validar_uso(cls, v: str) -> str:
        v = v.upper()
        if v not in UNIDADES_USO:
            raise ValueError(f"Unidad inválida. Usa: {sorted(UNIDADES_USO)}")
        return v


class IngredientOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    purchase_unit: str
    purchase_price: float
    content_qty: float
    usage_unit: str
    cost_per_unit: float
    stock: float
    min_stock: float


class RecipeItemIn(BaseModel):
    ingredient_id: UUID
    quantity: float = Field(gt=0)


class RecipeCreate(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    description: str | None = None
    price: float = Field(gt=0)
    items: list[RecipeItemIn] = Field(min_length=1)


class RecipeItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    ingredient_id: UUID
    quantity: float


class RecipeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    description: str | None
    price: float
    is_active: bool
    items: list[RecipeItemOut]
    cost: float = 0
    margin: float = 0