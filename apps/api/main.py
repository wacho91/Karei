"""Punto de entrada FastAPI — Restaurant SaaS API."""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.core.config import settings
from app.db.session import AsyncSessionLocal, engine
from app.models.base import Base
from app.routers import auth_router, dashboard_router, inventory_router, pos_router
from app.services.bootstrap_service import bootstrap_demo


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Mini-migración dev: agrega pin_hash si falta (idempotente)
        try:
            await conn.execute(text("ALTER TABLE users ADD COLUMN pin_hash TEXT"))
        except Exception:
            pass  # la columna ya existe

    async with AsyncSessionLocal() as db:
        await bootstrap_demo(db)
    print("✅ BD lista. Demo → admin@karei.app / admin123 · PIN mesero 1234 · PIN cocina 1111")

    yield
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

app.include_router(auth_router.router, prefix="/api/v1")
app.include_router(inventory_router.router, prefix="/api/v1")
app.include_router(pos_router.router, prefix="/api/v1")
app.include_router(dashboard_router.router, prefix="/api/v1")


@app.get("/health", tags=["system"])
async def health() -> dict[str, str]:
    return {"status": "ok", "environment": settings.environment}