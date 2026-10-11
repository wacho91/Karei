"""Schemas Pydantic — exporta todos los schemas de la API."""
from app.schemas.common import (
    PaginationParams, PageMeta, Page, ErrorResponse, MessageResponse,
)
from app.schemas.auth import (
    RegisterRequest, LoginRequest, TokenPair, RefreshRequest,
    VerifyEmailRequest, ResendVerificationRequest,
    ForgotPasswordRequest, ResetPasswordRequest, CurrentUser,
)
from app.schemas.tenant import (
    TenantCreate, TenantUpdate, TenantRead,
    BranchCreate, BranchUpdate, BranchRead,
)
from app.schemas.user import (
    UserCreate, UserUpdate, UserRead, RoleRead, UserRoleAssign,
)
from app.schemas.catalog import (
    CategoryCreate, CategoryUpdate, CategoryRead,
    ProductCreate, ProductUpdate, ProductRead,
    ModifierCreate, ModifierUpdate, ModifierRead,
)
from app.schemas.tables import (
    TableCreate, TableUpdate, TableRead,
    TableSessionOpen, TableSessionRead, TableSessionClose,
)
from app.schemas.orders import (
    OrderCreate, OrderUpdate, OrderRead,
    OrderItemCreate, OrderItemRead,
    PaymentCreate, PaymentRead,
)

__all__ = [
    "PaginationParams", "PageMeta", "Page", "ErrorResponse", "MessageResponse",
    "RegisterRequest", "LoginRequest", "TokenPair", "RefreshRequest",
    "VerifyEmailRequest", "ResendVerificationRequest",
    "ForgotPasswordRequest", "ResetPasswordRequest", "CurrentUser",
    "TenantCreate", "TenantUpdate", "TenantRead",
    "BranchCreate", "BranchUpdate", "BranchRead",
    "UserCreate", "UserUpdate", "UserRead", "RoleRead", "UserRoleAssign",
    "CategoryCreate", "CategoryUpdate", "CategoryRead",
    "ProductCreate", "ProductUpdate", "ProductRead",
    "ModifierCreate", "ModifierUpdate", "ModifierRead",
    "TableCreate", "TableUpdate", "TableRead",
    "TableSessionOpen", "TableSessionRead", "TableSessionClose",
    "OrderCreate", "OrderUpdate", "OrderRead",
    "OrderItemCreate", "OrderItemRead",
    "PaymentCreate", "PaymentRead",
]
