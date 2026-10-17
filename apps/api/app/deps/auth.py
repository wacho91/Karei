"""Dependencias de autenticación: JWT, contexto y roles requeridos."""
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.identity import Role, UserRole

_bearer = HTTPBearer(auto_error=False)


class AuthContext:
    def __init__(self, user_id: UUID, tenant_id: UUID, roles: list[str]) -> None:
        self.user_id = user_id
        self.tenant_id = tenant_id
        self.roles = roles

    def es_admin(self) -> bool:
        return "ADMIN" in self.roles


def crear_token(user_id: UUID, tenant_id: UUID, roles: list[str], dias: int = 1) -> str:
    payload = {
        "sub": str(user_id),
        "tid": str(tenant_id),
        "type": "access",
        "roles": roles,
        "exp": datetime.now(timezone.utc) + timedelta(days=dias),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


async def get_auth_context(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> AuthContext:
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "No autenticado")
    try:
        payload = jwt.decode(
            creds.credentials, settings.jwt_secret, algorithms=[settings.jwt_algorithm]
        )
    except JWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token inválido o expirado")
    if payload.get("type") != "access":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Tipo de token inválido")
    return AuthContext(
        user_id=UUID(payload["sub"]),
        tenant_id=UUID(payload["tid"]),
        roles=payload.get("roles", []),
    )


def require_roles(*roles_validos: str):
    """Fábrica de dependencias: exige ALGUNO de los roles (ADMIN siempre pasa)."""
    async def dep(ctx: AuthContext = Depends(get_auth_context)) -> AuthContext:
        if ctx.es_admin() or any(r in ctx.roles for r in roles_validos):
            return ctx
        raise HTTPException(403, "Tu rol no tiene permisos para esta acción")
    return dep


async def roles_de_usuario(db: AsyncSession, user_id: UUID) -> list[str]:
    """Roles REALES desde user_roles -> roles (adiós roles hardcodeados)."""
    filas = (await db.execute(
        select(Role.code)
        .join(UserRole, UserRole.role_id == Role.id)
        .where(UserRole.user_id == user_id)
    )).scalars().all()
    return list(filas)