"""Schemas del POS: mesas, comanda y cierre de cuenta."""
from uuid import UUID

from pydantic import BaseModel, Field
from datetime import datetime


class TableCreate(BaseModel):
    code: str = Field(min_length=1, max_length=32)
    name: str = Field(min_length=1, max_length=120)
    capacity: int = Field(default=4, ge=1, le=50)
    zone: str | None = Field(default=None, max_length=64)


class TableUpdate(BaseModel):
    code: str | None = Field(default=None, min_length=1, max_length=32)
    name: str | None = Field(default=None, min_length=1, max_length=120)
    capacity: int | None = Field(default=None, ge=1, le=50)
    zone: str | None = None


class TableOut(BaseModel):
    id: UUID
    code: str
    name: str
    capacity: int
    zone: str | None
    status: str
    session_id: UUID | None = None
    order_id: UUID | None = None
    order_number: str | None = None
    open_total: float = 0
    items_count: int = 0


class OrderItemIn(BaseModel):
    recipe_id: UUID
    quantity: float = Field(gt=0)
    notes: str | None = Field(default=None, max_length=255)


class ItemsIn(BaseModel):
    items: list[OrderItemIn] = Field(min_length=1)


class OrderItemOut(BaseModel):
    id: UUID
    recipe_id: UUID
    recipe_name: str = ""
    quantity: float
    unit_price: float
    notes: str | None = None


class OrderOut(BaseModel):
    id: UUID
    order_number: str
    status: str
    table_id: UUID
    session_id: UUID | None = None
    subtotal: float
    tip: float
    total: float
    items: list[OrderItemOut] = []


class SendOut(BaseModel):
    order: OrderOut
    warnings: list[str] = []


class CheckoutIn(BaseModel):
    tip: float = Field(default=0, ge=0)
    method: str = Field(default="CASH", pattern="^(CASH|CARD|TRANSFER|NEQUI|DAVIPLATA)$")


class CheckoutOut(BaseModel):
    order_number: str
    subtotal: float
    tip: float
    total: float
    method: str

class KdsItemOut(BaseModel):
    id: UUID
    recipe_name: str = ""
    quantity: float
    notes: str | None = None


class KdsOrderOut(BaseModel):
    id: UUID
    order_number: str
    status: str
    table_name: str = ""
    created_at: datetime | None = None
    items: list[KdsItemOut] = []