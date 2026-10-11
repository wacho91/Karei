"""Schemas de Usuario y Roles."""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.enums import RoleScope, UserStatus


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=2, max_length=255)
    phone: str | None = Field(default=None, max_length=32)
    branch_id: UUID | None = None
    role_codes: list[str] = []


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=32)
    branch_id: UUID | None = None
    status: UserStatus | None = None


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    branch_id: UUID | None = None
    email: EmailStr
    full_name: str
    phone: str | None = None
    status: UserStatus
    email_verified_at: datetime | None = None
    last_login_at: datetime | None = None
    created_at: datetime


class RoleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID | None = None
    code: str
    name: str
    description: str | None = None
    scope: RoleScope
    is_system: bool
    permissions: list[str] = []


class UserRoleAssign(BaseModel):
    role_id: UUID
    branch_id: UUID | None = None
