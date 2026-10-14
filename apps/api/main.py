"""Punto de entrada FastAPI — Restaurant SaaS API."""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.db.session import engine
from app.models.base import Base
from app.deps import auth
from app.routers import inventory_router, pos_router  # ← NUEVO


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Crear todas las tablas en la base de datos al arrancar
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("✅ Base de datos SQLite y tablas verificadas/creadas.")

    yield

    # Apagar
    await engine.dispose()


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    debug=settings.debug,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/v1")
app.include_router(inventory_router.router, prefix="/api/v1")  # ← NUEVO


@app.get("/health", tags=["system"])
async def health() -> dict[str, str]:
    return {"status": "ok", "environment": settings.environment}