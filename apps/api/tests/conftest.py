"""Fixtures compartidas para las pruebas unitarias."""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import AsyncGenerator
from uuid import UUID, uuid4

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

# Asegurar settings de test antes de importar la app
os.environ.setdefault("JWT_SECRET", "test-secret-key-for-unit-tests-only")
os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")

from app.models.base import Base  # noqa: E402
from app.models import (  # noqa: E402,F401
    Tenant, Branch, User, Role, UserRole, RefreshToken, VerificationToken,
    PasswordReset, Category, Product, Modifier, ProductModifierGroup,
    Table, TableSession, TableSessionSplit, Order, OrderItem, Payment,
    Customer, DianResolution, Invoice, Ingredient, Recipe, RecipeItem, Waste,
    Notification, AuditLog, OutboxEvent,
)
from app.models.enums import (  # noqa: E402
    TenantPlan, TenantStatus, UserStatus, RoleScope, TableStatus,
    TableSessionStatus, OrderStatus, OrderChannel, OrderItemStatus,
    PaymentMethod, PaymentStatus,
)


@pytest.fixture(scope="session")
def anyio_backend() -> str:
    return "asyncio"


@pytest_asyncio.fixture
async def db_engine():
    """Engine SQLite en memoria con todos los modelos creados."""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", future=True)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(db_engine) -> AsyncGenerator[AsyncSession, None]:
    """Sesión async con rollback al final de cada test."""
    maker = async_sessionmaker(db_engine, expire_on_commit=False, autoflush=False)
    async with maker() as session:
        yield session
        await session.rollback()


@pytest.fixture
def tenant_id() -> UUID:
    return uuid4()


@pytest.fixture
def branch_id() -> UUID:
    return uuid4()


@pytest.fixture
def user_id() -> UUID:
    return uuid4()


@pytest.fixture
def sample_tenant(tenant_id: UUID) -> Tenant:
    return Tenant(
        id=tenant_id,
        slug="acme",
        legal_name="Acme S.A.S.",
        commercial_name="Acme",
        nit="900123456-7",
        plan=TenantPlan.STARTER,
        status=TenantStatus.ACTIVE,
        currency="COP",
        timezone="America/Bogota",
        locale="es-CO",
    )


@pytest.fixture
def sample_branch(tenant_id: UUID, branch_id: UUID) -> Branch:
    return Branch(
        id=branch_id,
        tenant_id=tenant_id,
        code="MAIN",
        name="Sucursal Principal",
        is_main=True,
        is_active=True,
    )


@pytest.fixture
def sample_user(tenant_id: UUID, user_id: UUID) -> User:
    return User(
        id=user_id,
        tenant_id=tenant_id,
        email="owner@acme.test",
        password_hash="$2b$12$abcdefghijklmnopqrstuv",
        full_name="Owner Acme",
        status=UserStatus.ACTIVE,
    )


@pytest.fixture
def sample_role(tenant_id: UUID) -> Role:
    return Role(
        id=uuid4(),
        tenant_id=tenant_id,
        code="admin",
        name="Administrador",
        scope=RoleScope.TENANT,
        is_system=True,
        permissions=["*"],
    )


@pytest.fixture
def sample_category(tenant_id: UUID) -> Category:
    return Category(
        id=uuid4(),
        tenant_id=tenant_id,
        name="Bebidas",
        sort_order=0,
        is_active=True,
    )


@pytest.fixture
def sample_product(tenant_id: UUID, sample_category: Category) -> Product:
    return Product(
        id=uuid4(),
        tenant_id=tenant_id,
        category_id=sample_category.id,
        sku="SKU-001",
        name="Café Americano",
        price_cents=5000,
        cost_cents=1500,
        tax_rate=0.19,
        currency="COP",
        allergens=[],
        tags=["caliente"],
        is_active=True,
        is_available=True,
        is_featured=False,
        sort_order=0,
    )


@pytest.fixture
def sample_table(tenant_id: UUID, branch_id: UUID) -> Table:
    return Table(
        id=uuid4(),
        tenant_id=tenant_id,
        branch_id=branch_id,
        code="T01",
        name="Mesa 1",
        capacity=4,
        qr_code="qr-t01-abc",
        status=TableStatus.AVAILABLE,
        is_active=True,
    )


@pytest.fixture
def sample_session(tenant_id: UUID, sample_table: Table, user_id: UUID) -> TableSession:
    return TableSession(
        id=uuid4(),
        tenant_id=tenant_id,
        table_id=sample_table.id,
        opened_by_id=user_id,
        status=TableSessionStatus.OPEN,
        guest_count=2,
        subtotal_cents=0,
        discount_cents=0,
        tip_cents=0,
        tax_cents=0,
        total_cents=0,
        currency="COP",
    )


@pytest.fixture
def sample_order(tenant_id: UUID, branch_id: UUID, user_id: UUID) -> Order:
    return Order(
        id=uuid4(),
        tenant_id=tenant_id,
        branch_id=branch_id,
        order_number="ORD-0001",
        channel=OrderChannel.POS,
        status=OrderStatus.DRAFT,
        created_by_id=user_id,
        subtotal_cents=0,
        discount_cents=0,
        tax_cents=0,
        tip_cents=0,
        total_cents=0,
        currency="COP",
    )


@pytest.fixture
def sample_order_item(tenant_id: UUID, sample_order: Order, sample_product: Product) -> OrderItem:
    return OrderItem(
        id=uuid4(),
        tenant_id=tenant_id,
        order_id=sample_order.id,
        product_id=sample_product.id,
        product_name=sample_product.name,
        quantity=1,
        unit_price_cents=sample_product.price_cents,
        tax_rate=0.19,
        discount_cents=0,
        total_cents=sample_product.price_cents,
        status=OrderItemStatus.PENDING,
        modifiers=[],
    )


@pytest.fixture
def sample_payment(sample_order: Order) -> Payment:
    return Payment(
        id=uuid4(),
        order_id=sample_order.id,
        method=PaymentMethod.CASH,
        status=PaymentStatus.PENDING,
        amount_cents=5000,
    )


@pytest.fixture
def frozen_now() -> datetime:
    return datetime(2025, 1, 1, 12, 0, 0, tzinfo=timezone.utc)


@pytest.fixture
def future_dt(frozen_now: datetime) -> datetime:
    return frozen_now + timedelta(hours=1)


@pytest.fixture
def past_dt(frozen_now: datetime) -> datetime:
    return frozen_now - timedelta(hours=1)
