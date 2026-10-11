"""Schemas de Tenant y Branch."""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.enums import DianEnvironment, TenantPlan, TenantStatus


class TenantCreate(BaseModel):
    slug: str = Field(min_length=3, max_length=64)
    legal_name: str = Field(min_length=2, max_length=255)
    commercial_name: str = Field(min_length=2, max_length=255)
    nit: str = Field(min_length=5, max_length=20)
    plan: TenantPlan = TenantPlan.STARTER
    currency: str = Field(default="COP", max_length=3)
    timezone: str = Field(default="America/Bogota", max_length=64)
    locale: str = Field(default="es-CO", max_length=10)


class TenantUpdate(BaseModel):
    commercial_name: str | None = Field(default=None, max_length=255)
    logo_url: str | None = None
    primary_color: str | None = Field(default=None, max_length=9)
    dian_environment: DianEnvironment | None = None
    dian_software_id: str | None = None
    dian_software_pin: str | None = None


class TenantRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    slug: str
    legal_name: str
    commercial_name: str
    nit: str
    plan: TenantPlan
    status: TenantStatus
    currency: str
    timezone: str
    locale: str
    logo_url: str | None = None
    primary_color: str | None = None
    created_at: datetime


class BranchCreate(BaseModel):
    code: str = Field(min_length=1, max_length=32)
    name: str = Field(min_length=2, max_length=255)
    address: str | None = None
    city: str | None = Field(default=None, max_length=120)
    department: str | None = Field(default=None, max_length=120)
    phone: str | None = Field(default=None, max_length=32)
    email: EmailStr | None = None
    is_main: bool = False


class BranchUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=255)
    address: str | None = None
    city: str | None = None
    department: str | None = None
    phone: str | None = None
    email: EmailStr | None = None
    is_active: bool | None = None


class BranchRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    code: str
    name: str
    address: str | None = None
    city: str | None = None
    department: str | None = None
    phone: str | None = None
    email: EmailStr | None = None
    is_main: bool
    is_active: bool
    created_at: datetime
