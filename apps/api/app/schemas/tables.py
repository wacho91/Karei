"""Schemas de Mesas y Sesiones."""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import TableSessionStatus, TableStatus


class TableCreate(BaseModel):
    branch_id: UUID
    code: str = Field(min_length=1, max_length=32)
    name: str = Field(min_length=1, max_length=120)
    capacity: int = Field(default=4, ge=1)
    zone: str | None = Field(default=None, max_length=64)
    qr_code: str = Field(min_length=4, max_length=64)
    is_active: bool = True


class TableUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    capacity: int | None = Field(default=None, ge=1)
    zone: str | None = None
    status: TableStatus | None = None
    is_active: bool | None = None


class TableRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    branch_id: UUID
    code: str
    name: str
    capacity: int
    zone: str | None = None
    qr_code: str
    status: TableStatus
    is_active: bool
    created_at: datetime


class TableSessionOpen(BaseModel):
    table_id: UUID
    guest_count: int = Field(default=1, ge=1)
    notes: str | None = None


class TableSessionClose(BaseModel):
    tip_cents: int = Field(default=0, ge=0)
    discount_cents: int = Field(default=0, ge=0)
    notes: str | None = None


class TableSessionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    table_id: UUID
    opened_by_id: UUID
    status: TableSessionStatus
    guest_count: int
    subtotal_cents: int
    discount_cents: int
    tip_cents: int
    tax_cents: int
    total_cents: int
    currency: str
    notes: str | None = None
    opened_at: datetime
    closed_at: datetime | None = None
