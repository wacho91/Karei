"""Router del Dashboard: resumen financiero y operativo (sin lógica)."""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.services import dashboard_service
from app.services.table_service import DEMO_TENANT_ID

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


# TEMPORAL: contexto demo hasta conectar el JWT real (módulo de roles).
@router.get("/summary")
async def resumen(db: AsyncSession = Depends(get_db)):
    return await dashboard_service.summary(db, DEMO_TENANT_ID)