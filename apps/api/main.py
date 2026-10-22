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
        # Columna notes en order_items (especificaciones de la comanda)
        # ★ FIX E-14t2: falta el `await` — un engine async no acepta `with`
        #   síncrono, la excepción se tragaba y la migración nunca corría.
        try:
            await conn.execute(
                text("ALTER TABLE order_items ADD COLUMN notes VARCHAR(255)"))
        except Exception:
            pass

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

# ── pos_compat (comanda + cocina/kanban + entregar) ──────────────────────
try:
    from app.pos_compat import router as pos_compat_router
except ImportError:
    try:
        from pos_compat import router as pos_compat_router
    except ImportError:
        from apps.api.pos_compat import router as pos_compat_router
app.include_router(pos_compat_router)

# ── ★ NUEVO E-14t2: pos_cuenta_live (CUENTA DE MESA EN VIVO) ─────────────
# Es la ruta que consulta PanelCuenta.tsx cada 8 s:
#     GET /api/v1/pos/tables/{id}/cuenta  (+ variantes bill/cuenta)
# Va ANTES de los routers viejos para ganar cualquier choque de rutas.
# El archivo pos_cuenta_live.py va en la MISMA carpeta donde está tu
# pos_compat.py (el try/except cubre app/, raíz y apps/api/).
try:
    from app.pos_cuenta_live import router as pos_cuenta_live_router
except ImportError:
    try:
        from pos_cuenta_live import router as pos_cuenta_live_router
    except ImportError:
        from apps.api.pos_cuenta_live import router as pos_cuenta_live_router
app.include_router(pos_cuenta_live_router)

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