"""Bounded Context: Tables — Mesas, Sesiones y Splits."""
from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    Boolean, DateTime, ForeignKey, Integer, String, Text,
    UniqueConstraint, Uuid as PGUUID, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import TableSessionStatus, TableStatus


class Table(Base, UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "tables"
    __table_args__ = (
        UniqueConstraint("tenant_id", "branch_id", "code", name="uq_table_tenant_branch_code"),
    )

    tenant_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    branch_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("branches.id", ondelete="CASCADE"), nullable=False
    )
    code: Mapped[str] = mapped_column(String(32), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    capacity: Mapped[int] = mapped_column(Integer, default=4, nullable=False)
    zone: Mapped[str | None] = mapped_column(String(64))
    qr_code: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    status: Mapped[TableStatus] = mapped_column(default=TableStatus.AVAILABLE, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    sessions: Mapped[list["TableSession"]] = relationship(back_populates="table")


class TableSession(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "table_sessions"

    tenant_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    table_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("tables.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    opened_by_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    status: Mapped[TableSessionStatus] = mapped_column(
        default=TableSessionStatus.OPEN, nullable=False
    )
    guest_count: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    subtotal_cents: Mapped[int] = mapped_column(default=0, nullable=False)
    discount_cents: Mapped[int] = mapped_column(default=0, nullable=False)
    tip_cents: Mapped[int] = mapped_column(default=0, nullable=False)
    tax_cents: Mapped[int] = mapped_column(default=0, nullable=False)
    total_cents: Mapped[int] = mapped_column(default=0, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="COP", nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    opened_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    table: Mapped["Table"] = relationship(back_populates="sessions")
    splits: Mapped[list["TableSessionSplit"]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )


class TableSessionSplit(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "table_session_splits"
    __table_args__ = (
        UniqueConstraint("session_id", "split_number", name="uq_session_split_number"),
    )

    tenant_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    session_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("table_sessions.id", ondelete="CASCADE"), nullable=False
    )
    split_number: Mapped[int] = mapped_column(Integer, nullable=False)
    amount_cents: Mapped[int] = mapped_column(nullable=False)
    paid_cents: Mapped[int] = mapped_column(default=0, nullable=False)
    is_paid: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    session: Mapped["TableSession"] = relationship(back_populates="splits")