"""OAuth-style device authorization for machine clients (e.g. the Telegram bot).

Flow:
1. Client POSTs /api/auth/device -> gets a `user_code`, `verification_url` and a
   secret `device_code` it polls with.
2. The user opens the verification URL (web app), logs in, and approves the code.
3. Client polls GET /api/auth/device/status?device_code=... -> `approved` plus a
   one-time long-lived bearer `token` it uses for all further API calls.
"""

import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_async_session
from app.dependencies import get_current_user
from app.models import DeviceGrant, User

router = APIRouter(prefix="/api/auth/device", tags=["auth"])

DEVICE_TTL_MINUTES = 10
USER_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no ambiguous 0/O/1/I


def _expired(grant: DeviceGrant) -> bool:
    """TTL check that tolerates naive datetimes (SQLite test sessions return them)."""
    expires = grant.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=UTC)
    return datetime.now(UTC) > expires


class DeviceCreateResponse(BaseModel):
    user_code: str
    verification_url: str
    device_code: str
    expires_at: datetime


class DeviceStatusResponse(BaseModel):
    status: str
    token: str | None = None


class DeviceApproveRequest(BaseModel):
    user_code: str


@router.post("", response_model=DeviceCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_device_grant(
    session: AsyncSession = Depends(get_async_session),
) -> DeviceCreateResponse:
    user_code = "".join(secrets.choice(USER_CODE_ALPHABET) for _ in range(8))
    device_code = secrets.token_urlsafe(32)
    grant = DeviceGrant(
        id=str(uuid4()),
        user_code=user_code,
        device_code_hash=hashlib.sha256(device_code.encode()).hexdigest(),
        status="pending",
        expires_at=datetime.now(UTC) + timedelta(minutes=DEVICE_TTL_MINUTES),
    )
    session.add(grant)
    await session.commit()
    return DeviceCreateResponse(
        user_code=user_code,
        verification_url=f"/device?code={user_code}",
        device_code=device_code,
        expires_at=grant.expires_at,
    )


@router.get("/status", response_model=DeviceStatusResponse)
async def device_status(
    device_code: str,
    session: AsyncSession = Depends(get_async_session),
) -> DeviceStatusResponse:
    token_hash = hashlib.sha256(device_code.encode()).hexdigest()
    result = await session.execute(
        select(DeviceGrant).where(DeviceGrant.device_code_hash == token_hash)
    )
    grant = result.scalar_one_or_none()
    if not grant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown device code")

    if grant.status == "pending" and _expired(grant):
        grant.status = "expired"
        await session.commit()

    if grant.status == "expired":
        return DeviceStatusResponse(status="expired")

    if grant.status == "approved":
        if not grant.token_delivered and grant.bot_token_pending:
            token = grant.bot_token_pending
            grant.token_delivered = True
            grant.bot_token_pending = None
            await session.commit()
            return DeviceStatusResponse(status="approved", token=token)
        return DeviceStatusResponse(status="approved")

    return DeviceStatusResponse(status="pending")


@router.post("/approve")
async def approve_device_grant(
    payload: DeviceApproveRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> dict[str, str]:
    result = await session.execute(
        select(DeviceGrant).where(DeviceGrant.user_code == payload.user_code.strip().upper())
    )
    grant = result.scalar_one_or_none()
    if not grant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown code")
    if grant.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Code already used or expired"
        )
    if _expired(grant):
        grant.status = "expired"
        await session.commit()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Code expired")

    raw_token = secrets.token_urlsafe(48)
    grant.user_id = user.id
    grant.status = "approved"
    grant.bot_token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    grant.bot_token_pending = raw_token
    grant.approved_at = datetime.now(UTC)
    await session.commit()
    return {"status": "approved"}
