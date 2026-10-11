"""Servicio de tokens: creación, hashing y consumo."""
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.identity import PasswordReset, RefreshToken, VerificationToken


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def generate_token() -> str:
    return secrets.token_urlsafe(48)


async def create_verification_token(
    db: AsyncSession, user_id: UUID, tenant_id: UUID, purpose: str = "email_verify"
) -> str:
    raw = generate_token()
    token = VerificationToken(
        user_id=user_id,
        tenant_id=tenant_id,
        token_hash=_hash(raw),
        purpose=purpose,
        expires_at=datetime.now(timezone.utc)
        + timedelta(hours=settings.verification_token_hours),
    )
    db.add(token)
    await db.flush()
    return raw


async def consume_verification_token(
    db: AsyncSession, raw: str, purpose: str = "email_verify"
) -> VerificationToken | None:
    result = await db.execute(
        select(VerificationToken).where(
            VerificationToken.token_hash == _hash(raw),
            VerificationToken.purpose == purpose,
            VerificationToken.consumed_at.is_(None),
        )
    )
    token = result.scalar_one_or_none()
    if token is None or token.expires_at < datetime.now(timezone.utc):
        return None
    token.consumed_at = datetime.now(timezone.utc)
    return token


async def create_password_reset(db: AsyncSession, user_id: UUID, tenant_id: UUID) -> str:
    raw = generate_token()
    reset = PasswordReset(
        user_id=user_id,
        tenant_id=tenant_id,
        token_hash=_hash(raw),
        expires_at=datetime.now(timezone.utc)
        + timedelta(hours=settings.password_reset_hours),
    )
    db.add(reset)
    await db.flush()
    return raw


async def consume_password_reset(db: AsyncSession, raw: str) -> PasswordReset | None:
    result = await db.execute(
        select(PasswordReset).where(
            PasswordReset.token_hash == _hash(raw),
            PasswordReset.used_at.is_(None),
        )
    )
    reset = result.scalar_one_or_none()
    if reset is None or reset.expires_at < datetime.now(timezone.utc):
        return None
    reset.used_at = datetime.now(timezone.utc)
    return reset


async def store_refresh_token(
    db: AsyncSession,
    user_id: UUID,
    tenant_id: UUID,
    raw: str,
    user_agent: str | None,
    ip: str | None,
) -> RefreshToken:
    token = RefreshToken(
        user_id=user_id,
        tenant_id=tenant_id,
        token_hash=_hash(raw),
        user_agent=user_agent,
        ip_address=ip,
        expires_at=datetime.now(timezone.utc)
        + timedelta(days=settings.refresh_token_days),
    )
    db.add(token)
    await db.flush()
    return token


async def revoke_refresh_token(db: AsyncSession, raw: str) -> bool:
    result = await db.execute(
        select(RefreshToken).where(RefreshToken.token_hash == _hash(raw))
    )
    token = result.scalar_one_or_none()
    if token is None or token.revoked_at is not None:
        return False
    token.revoked_at = datetime.now(timezone.utc)
    return True
