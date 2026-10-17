"""Rutas de autenticación: login email (admin) y login PIN (personal)."""
import bcrypt
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.deps.auth import AuthContext, crear_token, get_auth_context, roles_de_usuario
from app.models.enums import UserStatus
from app.models.identity import User

router = APIRouter(tags=["Auth"])


class PinLoginIn(BaseModel):
    pin: str = Field(min_length=4, max_length=4, pattern="^[0-9]{4}$")


def _sesion(usuario: User, roles: list[str]) -> dict:
    return {
        "access_token": crear_token(usuario.id, usuario.tenant_id, roles),
        "token_type": "bearer",
        "user": {
            "id": str(usuario.id),
            "tenant_id": str(usuario.tenant_id),
            "email": usuario.email,
            "full_name": usuario.full_name,
            "roles": roles,
        },
    }


@router.post("/auth/login")
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
):
    """Login del ADMIN: correo + contraseña."""
    result = await db.execute(select(User).where(User.email == form_data.username))
    usuario = result.scalar_one_or_none()
    if not usuario or usuario.password_hash == "PIN-ONLY":
        raise HTTPException(401, "Credenciales incorrectas")
    if not bcrypt.checkpw(form_data.password.encode(), usuario.password_hash.encode()):
        raise HTTPException(401, "Credenciales incorrectas")
    if usuario.status != UserStatus.ACTIVE:
        raise HTTPException(403, "Debes verificar tu correo antes de iniciar sesión")
    roles = await roles_de_usuario(db, usuario.id)
    return _sesion(usuario, roles)


@router.post("/auth/login-pin")
async def login_pin(datos: PinLoginIn, db: AsyncSession = Depends(get_db)):
    """Login rápido del personal (meseros y cocina) con PIN de 4 dígitos."""
    usuarios = (await db.execute(
        select(User).where(User.pin_hash.isnot(None), User.status == UserStatus.ACTIVE)
    )).scalars().all()
    for usuario in usuarios:
        if bcrypt.checkpw(datos.pin.encode(), usuario.pin_hash.encode()):
            roles = await roles_de_usuario(db, usuario.id)
            return _sesion(usuario, roles)
    raise HTTPException(401, "PIN incorrecto")


@router.get("/auth/me", tags=["Auth"])
async def get_me(ctx: AuthContext = Depends(get_auth_context)):
    return {"user_id": str(ctx.user_id), "roles": ctx.roles}