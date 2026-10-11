"""Schemas de Catálogo: Categorías, Productos, Modificadores."""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    image_url: str | None = None
    parent_id: UUID | None = None
    sort_order: int = 0
    is_active: bool = True


class CategoryUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=255)
    description: str | None = None
    image_url: str | None = None
    parent_id: UUID | None = None
    sort_order: int | None = None
    is_active: bool | None = None


class CategoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    parent_id: UUID | None = None
    name: str
    description: str | None = None
    image_url: str | None = None
    sort_order: int
    is_active: bool
    created_at: datetime


class ProductCreate(BaseModel):
    sku: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    image_url: str | None = None
    category_id: UUID | None = None
    price_cents: int = Field(ge=0)
    cost_cents: int = Field(default=0, ge=0)
    tax_rate: float = Field(default=0.19, ge=0, le=1)
    currency: str = Field(default="COP", max_length=3)
    allergens: list[str] = []
    tags: list[str] = []
    is_active: bool = True
    is_available: bool = True
    is_featured: bool = False
    prep_time_minutes: int | None = Field(default=None, ge=0)
    calories: int | None = Field(default=None, ge=0)
    sort_order: int = 0


class ProductUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=255)
    description: str | None = None
    image_url: str | None = None
    category_id: UUID | None = None
    price_cents: int | None = Field(default=None, ge=0)
    cost_cents: int | None = Field(default=None, ge=0)
    tax_rate: float | None = Field(default=None, ge=0, le=1)
    allergens: list[str] | None = None
    tags: list[str] | None = None
    is_active: bool | None = None
    is_available: bool | None = None
    is_featured: bool | None = None
    prep_time_minutes: int | None = None
    calories: int | None = None
    sort_order: int | None = None


class ProductRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    category_id: UUID | None = None
    sku: str
    name: str
    description: str | None = None
    image_url: str | None = None
    price_cents: int
    cost_cents: int
    tax_rate: float
    currency: str
    allergens: list[str]
    tags: list[str]
    is_active: bool
    is_available: bool
    is_featured: bool
    prep_time_minutes: int | None = None
    calories: int | None = None
    sort_order: int
    created_at: datetime


class ModifierCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    price_cents: int = Field(default=0, ge=0)
    is_active: bool = True


class ModifierUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=255)
    price_cents: int | None = Field(default=None, ge=0)
    is_active: bool | None = None


class ModifierRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    name: str
    price_cents: int
    is_active: bool
    created_at: datetime
