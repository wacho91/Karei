import uuid
from datetime import datetime
from decimal import Decimal
from sqlalchemy import String, Numeric, DateTime, Boolean, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

# Importamos Base igual que en los anteriores
try:
    from app.models.base import Base
except ImportError:
    from app.db.session import Base


class Ingredient(Base):
    """Insumos o materias primas en la bodega (ej. Carne, Tomate)."""
    __tablename__ = "ingredients"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    unit_measure: Mapped[str] = mapped_column(String(20), nullable=False, default="KG") # KG, GR, LT, UND
    stock: Mapped[Decimal] = mapped_column(Numeric(10, 3), default=Decimal("0"), nullable=False)
    cost: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0"), nullable=False)
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Recipe(Base):
    """Las recetas o platos del menú que se venden a los clientes."""
    __tablename__ = "recipes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False) # Si se muestra en el menú QR
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relación con los ingredientes que la componen
    ingredients: Mapped[list["RecipeItem"]] = relationship(back_populates="recipe", cascade="all, delete-orphan")


class RecipeItem(Base):
    """Cantidad exacta de un ingrediente que lleva una receta (Ej. 150g de Carne)."""
    __tablename__ = "recipe_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    recipe_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("recipes.id"), nullable=False)
    ingredient_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ingredients.id"), nullable=False)
    
    quantity: Mapped[Decimal] = mapped_column(Numeric(10, 3), nullable=False)
    
    recipe: Mapped["Recipe"] = relationship(back_populates="ingredients")


class Waste(Base):
    """Registro de mermas (comida que se pudrió, se tiró o se quemó)."""
    __tablename__ = "wastes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    ingredient_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ingredients.id"), nullable=False)
    
    quantity: Mapped[Decimal] = mapped_column(Numeric(10, 3), nullable=False)
    reason: Mapped[str | None] = mapped_column(String(255), nullable=True) # Ej. "Se pudrió"
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)