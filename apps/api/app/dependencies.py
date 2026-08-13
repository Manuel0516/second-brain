from datetime import UTC, datetime, timedelta

from fastapi import Cookie, Depends, Header, HTTPException, Request, WebSocket, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_async_session
from app.models import DeviceGrant, User
from app.security import decode_jwt

# In-memory rate limiter: {ip: [timestamp1, timestamp2, ...]}
_login_attempts: dict[str, list[datetime]] = {}


def check_rate_limit(ip_address: str) -> bool:
    """Check if an IP has exceeded login rate limit. Returns True if within limit."""
    settings = get_settings()
    now = datetime.now(UTC)
    window = timedelta(minutes=settings.login_rate_limit_window_minutes)

    if ip_address not in _login_attempts:
        _login_attempts[ip_address] = []

    # Clean old attempts outside the window
    _login_attempts[ip_address] = [
        attempt for attempt in _login_attempts[ip_address] if now - attempt < window
    ]

    # Check if we've exceeded the limit
    if len(_login_attempts[ip_address]) >= settings.login_rate_limit_attempts:
        return False

    # Record this attempt
    _login_attempts[ip_address].append(now)
    return True


def get_client_ip(request: Request) -> str:
    """Extract client IP from request, accounting for proxies."""
    if request.client:
        return request.client.host
    return "0.0.0.0"


async def get_current_user(
    access_token: str | None = Cookie(None),
    authorization: str | None = Header(None),
    session: AsyncSession = Depends(get_async_session),
) -> User:
    """Extract current user from an access-token cookie or a device bearer token."""

    # Machine clients (Telegram bot) authenticate with a device-grant bearer token.
    if authorization and authorization.lower().startswith("bearer "):
        from hashlib import sha256

        raw = authorization[7:].strip()
        token_hash = sha256(raw.encode()).hexdigest()
        grant_result = await session.execute(
            select(DeviceGrant).where(
                DeviceGrant.bot_token_hash == token_hash,
                DeviceGrant.status == "approved",
            )
        )
        grant = grant_result.scalar_one_or_none()
        if grant and grant.user_id:
            user = await session.get(User, grant.user_id)
            if user and user.is_active:
                return user
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )

    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )

    payload = decode_jwt(access_token)
    if not payload or payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )

    user_id = payload.get("user_id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )

    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    return user


async def get_websocket_user(websocket: WebSocket, session: AsyncSession) -> User | None:
    """WebSocket counterpart to get_current_user; the browser sends the same cookie."""
    token = websocket.cookies.get("access_token")
    payload = decode_jwt(token) if token else {}
    if not payload or payload.get("type") != "access" or not payload.get("user_id"):
        return None
    from sqlalchemy import select

    user = await session.scalar(select(User).where(User.id == payload["user_id"]))
    return user if user and user.is_active else None
