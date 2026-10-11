"""Schemas de Órdenes, Items y Pagos."""
from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import (
    OrderChannel, OrderItemStatus, OrderStatus, PaymentMethod, PaymentStatus,
)


class OrderItemCreate(BaseModel):
    product_id: UUID
    quantity: Decimal = Field(gt=0)
    modifiers: list[dict] = []
    notes: str | None = None
    kds_station: str | None = Field(default=None, max_length=64)


class OrderItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    order_id: UUID
    product_id: UUID
    product_name: str
    quantity: Decimal
    unit_price_cents: int
    tax_rate: Decimal
    discount_cents: int
    total_cents: int
    status: OrderItemStatus
    modifiers: list[dict]
    notes: str | None = None
    kds_station: str | None = None


class OrderCreate(BaseModel):
    branch_id: UUID
    session_id: UUID | None = None
    channel: OrderChannel = OrderChannel.POS
    customer_name: str | None = Field(default=None, max_length=255)
    notes: str | None = None
    items: list[OrderItemCreate] = Field(min_length=1)


class OrderUpdate(BaseModel):
    customer_name: str | None = None
    notes: str | None = None
    status: OrderStatus | None = None


class OrderRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    branch_id: UUID
    session_id: UUID | None = None
    order_number: str
    channel: OrderChannel
    status: OrderStatus
    created_by_id: UUID
    customer_name: str | None = None
    notes: str | None = None
    subtotal_cents: int
    discount_cents: int
    tax_cents: int
    tip_cents: int
    total_cents: int
    currency: str
    created_at: datetime
    items: list[OrderItemRead] = []


class PaymentCreate(BaseModel):
    order_id: UUID
    method: PaymentMethod
    amount_cents: int = Field(gt=0)
    reference: str | None = Field(default=None, max_length=128)


class PaymentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    order_id: UUID
    method: PaymentMethod
    status: PaymentStatus
    amount_cents: int
    reference: str | None = None
    created_at: datetime
