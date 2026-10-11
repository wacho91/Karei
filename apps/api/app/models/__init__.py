"""Modelos SQLAlchemy — exporta todos los modelos para Alembic y la app."""
from app.models.base import Base, TimestampMixin, SoftDeleteMixin, TenantMixin
from app.models.enums import (
    TenantPlan, TenantStatus, UserStatus, RoleScope, TableStatus,
    TableSessionStatus, OrderStatus, OrderChannel, OrderItemStatus,
    PaymentMethod, PaymentStatus, InvoiceStatus, InvoiceType,
    DianEnvironment, CustomerDocType, RecipeStatus, WasteReason,
    NotificationChannel, NotificationStatus, OutboxStatus,
)
from app.models.identity import (
    Tenant, Branch, User, Role, UserRole,
    RefreshToken, VerificationToken, PasswordReset,
)
from app.models.catalog import Category, Product, Modifier, ProductModifierGroup
from app.models.tables import Table, TableSession, TableSessionSplit
from app.models.orders import Order, OrderItem, Payment
from app.models.billing import Customer, DianResolution, Invoice
from app.models.inventory import Ingredient, Recipe, RecipeItem, Waste
from app.models.system import Notification, AuditLog, OutboxEvent

__all__ = [
    "Base", "TimestampMixin", "SoftDeleteMixin", "TenantMixin",
    "TenantPlan", "TenantStatus", "UserStatus", "RoleScope", "TableStatus",
    "TableSessionStatus", "OrderStatus", "OrderChannel", "OrderItemStatus",
    "PaymentMethod", "PaymentStatus", "InvoiceStatus", "InvoiceType",
    "DianEnvironment", "CustomerDocType", "RecipeStatus", "WasteReason",
    "NotificationChannel", "NotificationStatus", "OutboxStatus",
    "Tenant", "Branch", "User", "Role", "UserRole",
    "RefreshToken", "VerificationToken", "PasswordReset",
    "Category", "Product", "Modifier", "ProductModifierGroup",
    "Table", "TableSession", "TableSessionSplit",
    "Order", "OrderItem", "Payment",
    "Customer", "DianResolution", "Invoice",
    "Ingredient", "Recipe", "RecipeItem", "Waste",
    "Notification", "AuditLog", "OutboxEvent",
]
