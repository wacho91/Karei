"""Schemas Pydantic del módulo de inventario."""
from uuid import UUID

from pydantic import (
    BaseModel, ConfigDict, Field, field_validator, model_validator,
)

UNIDADES_COMPRA = {"KG", "G", "L", "ML", "UND", "PAQUETE"}
UNIDADES_USO = {"G", "ML", "UND"}

# Regla de oro de unidades: masa se usa en G, volumen en ML, conteo en UND.
# Esto hace imposible comprar KG y usar en UND (el error clásico de bodega).
USO_PERMITIDO = {
    "KG": "G",
    "G": "G",
    "L": "ML",
    "ML": "ML",
    "UND": "UND",
    "PAQUETE": "UND",
}


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

    @model_validator(mode="after")
    def validar_compatibilidad(self) -> "IngredientCreate":
        esperado = USO_PERMITIDO[self.purchase_unit]
        if self.usage_unit != esperado:
            raise ValueError(
                f"Compra en {self.purchase_unit} solo se usa en {esperado} (recibido: {self.usage_unit})"
            )
        return self


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


class PurchaseCreate(BaseModel):
    """Compra de mercancía: suma stock y amortigua el precio si el mercado cambió."""
    quantity: float = Field(gt=0, description="Cantidad comprada (en usage_unit)")
    purchase_price: float | None = Field(
        default=None, gt=0, description="Nuevo precio de compra si cambió en el mercado"
    )


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