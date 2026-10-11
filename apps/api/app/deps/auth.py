"""Dependencias de autenticación y autorización."""
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_token
from app.db.session import get_db
from app.models.identity import User
from app.models.enums import UserStatus

_bearer = HTTPBearer(auto_error=False)


class AuthContext:
    def __init__(
        self,
        user_id: UUID,
        tenant_id: UUID,
        roles: list[str],
        permissions: list[str],
    ) -> None:
        self.user_id = user_id
        self.tenant_id = tenant_id
        self.roles = roles
        self.permissions = permissions


async def get_auth_context(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> AuthContext:
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing credentials")
    try:
        payload = decode_token(creds.credentials)
    except ValueError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")
    if payload.get("type") != "access":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token type")
    return AuthContext(
        user_id=UUID(payload["sub"]),
        tenant_id=UUID(payload["tid"]),
        roles=payload.get("roles", []),
        permissions=payload.get("perms", []),
    )


async def get_current_user(
    ctx: AuthContext = Depends(get_auth_context),
    db: AsyncSession = Depends(get_db),
) -> User:
    result = await db.execute(select(User).where(User.id == ctx.user_id))
    user = result.scalar_one_or_none()
    if user is None or user.status == UserStatus.DELETED:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")
    if user.status == UserStatus.SUSPENDED:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "User suspended")
    return user


def require_permission(permission: str):
    async def _checker(ctx: AuthContext = Depends(get_auth_context)) -> AuthContext:
        if permission not in ctx.permissions and "platform:admin" not in ctx.permissions:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permissions")
        return ctx

    return _checker
