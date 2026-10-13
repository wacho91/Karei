"""Bounded Context: Inventory — Ingredientes, Recetas y Mermas."""
from decimal import Decimal
from uuid import UUID

from sqlalchemy import Boolean, ForeignKey, Numeric, String
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class Ingredient(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Materia prima. Se COMPRA en una unidad y se USA en otra.

    Ej: Compro 1 KG de carne a $9.000 -> trae 1000 G -> costo real $9/G.
    """
    __tablename__ = "ingredients"

    tenant_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)

    # --- Compra (lo que llega del proveedor) ---
    purchase_unit: Mapped[str] = mapped_column(String(20), nullable=False, default="KG")
    purchase_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0"))
    content_qty: Mapped[Decimal] = mapped_column(Numeric(10, 3), nullable=False, default=Decimal("1"))

    # --- Uso (cómo se consume en las recetas) ---
    usage_unit: Mapped[str] = mapped_column(String(20), nullable=False, default="G")
    cost_per_unit: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False, default=Decimal("0"))

    # --- Inventario (siempre en usage_unit) ---
    stock: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False, default=Decimal("0"))
    min_stock: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False, default=Decimal("0"))

    recipe_items: Mapped[list["RecipeItem"]] = relationship(back_populates="ingredient")


class Recipe(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Plato del menú. Su costo se calcula dinámicamente desde sus items."""
    __tablename__ = "recipes"

    tenant_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(String(500))
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    items: Mapped[list["RecipeItem"]] = relationship(
        back_populates="recipe", cascade="all, delete-orphan"
    )


class RecipeItem(Base, UUIDPrimaryKeyMixin):
    """Cantidad de un ingrediente en la receta (en su usage_unit. Ej: 250 G)."""
    __tablename__ = "recipe_items"

    recipe_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("recipes.id", ondelete="CASCADE"), nullable=False
    )
    ingredient_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("ingredients.id", ondelete="RESTRICT"), nullable=False
    )
    quantity: Mapped[Decimal] = mapped_column(Numeric(10, 3), nullable=False)

    recipe: Mapped["Recipe"] = relationship(back_populates="items")
    ingredient: Mapped["Ingredient"] = relationship(back_populates="recipe_items")


class Waste(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Merma: comida que se pudrió, se tiró o se quemó."""
    __tablename__ = "wastes"

    tenant_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    ingredient_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("ingredients.id", ondelete="CASCADE"), nullable=False
    )
    quantity: Mapped[Decimal] = mapped_column(Numeric(10, 3), nullable=False)
    reason: Mapped[str | None] = mapped_column(String(255))