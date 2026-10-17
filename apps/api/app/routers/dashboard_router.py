"""Router del Dashboard: resumen financiero (solo el dueño ve números)."""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.deps.auth import AuthContext, get_auth_context, require_roles
from app.services import dashboard_service

router = APIRouter(
    prefix="/dashboard", tags=["Dashboard"],
    dependencies=[Depends(require_roles("ADMIN"))],
)


@router.get("/summary")
async def resumen(
    ctx: AuthContext = Depends(get_auth_context),
    db: AsyncSession = Depends(get_db),
):
    return await dashboard_service.summary(db, ctx.tenant_id)