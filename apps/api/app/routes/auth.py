import hashlib
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_async_session
from app.dependencies import check_rate_limit, get_client_ip, get_current_user
from app.models import LoginAttempt, RefreshToken, User
from app.security import (
    generate_jwt,
    generate_totp_secret,
    get_totp_uri,
    hash_password,
    verify_password,
    verify_totp,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    totp_code: str | None = None


class LoginResponse(BaseModel):
    id: str
    email: str
    is_active: bool


class UserResponse(BaseModel):
    id: str
    email: str
    is_active: bool


class TOTPSetupResponse(BaseModel):
    uri: str


class TOTPVerifyRequest(BaseModel):
    code: str


@router.post("/login", response_model=LoginResponse)
async def login(
    request: Request,
    payload: LoginRequest,
    session: AsyncSession = Depends(get_async_session),
):
    """Login with email and password, optionally with TOTP code."""
    client_ip = get_client_ip(request)

    # Check rate limit
    if not check_rate_limit(client_ip):
        # Log failed attempt
        attempt = LoginAttempt(
            ip_address=client_ip,
            success=False,
        )
        session.add(attempt)
        await session.commit()

        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts",
        )

    # Find user
    result = await session.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()

    # Verify password
    if not user or not verify_password(payload.password, user.password_hash):
        attempt = LoginAttempt(
            ip_address=client_ip,
            success=False,
        )
        session.add(attempt)
        await session.commit()

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    # Verify TOTP if enabled
    if user.totp_secret:
        if not payload.totp_code:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="TOTP code required",
            )
        if not verify_totp(user.totp_secret, payload.totp_code):
            attempt = LoginAttempt(
                ip_address=client_ip,
                success=False,
            )
            session.add(attempt)
            await session.commit()

            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid TOTP code",
            )

    # Log successful attempt
    attempt = LoginAttempt(
        ip_address=client_ip,
        success=True,
    )
    session.add(attempt)

    # Generate tokens
    settings = get_settings()
    access_token = generate_jwt(
        user.id,
        "access",
        settings.jwt_access_token_expire_minutes,
    )
    refresh_token = generate_jwt(
        user.id,
        "refresh",
        int(settings.jwt_refresh_token_expire_days * 24 * 60),
    )

    # Store refresh token hash
    token_hash = hashlib.sha256(refresh_token.encode()).hexdigest()
    refresh_token_obj = RefreshToken(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.jwt_refresh_token_expire_days),
    )
    session.add(refresh_token_obj)
    await session.commit()

    # Return response with cookies
    from fastapi.responses import JSONResponse

    response = JSONResponse(
        content={
            "id": user.id,
            "email": user.email,
            "is_active": user.is_active,
        },
        status_code=status.HTTP_200_OK,
    )
    response.set_cookie(
        "access_token",
        access_token,
        httponly=True,
        secure=True,
        samesite="strict",
        max_age=settings.jwt_access_token_expire_minutes * 60,
    )
    response.set_cookie(
        "refresh_token",
        refresh_token,
        httponly=True,
        secure=True,
        samesite="strict",
        max_age=int(settings.jwt_refresh_token_expire_days * 24 * 60 * 60),
    )
    return response


@router.post("/refresh")
async def refresh(
    request: Request,
    session: AsyncSession = Depends(get_async_session),
):
    """Refresh access token using refresh token."""
    refresh_token = request.cookies.get("refresh_token")

    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token not found",
        )

    # Verify refresh token
    from app.security import decode_jwt

    payload = decode_jwt(refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    user_id = payload.get("user_id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    # Check that token exists and is not revoked
    token_hash = hashlib.sha256(refresh_token.encode()).hexdigest()
    result = await session.execute(
        select(RefreshToken).where(
            RefreshToken.token_hash == token_hash,
            RefreshToken.revoked_at.is_(None),
            RefreshToken.expires_at > datetime.now(timezone.utc),
        )
    )
    old_token = result.scalar_one_or_none()

    if not old_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    # Get user
    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    # Revoke old token
    old_token.revoked_at = datetime.now(timezone.utc)

    # Generate new tokens
    settings = get_settings()
    access_token = generate_jwt(
        user.id,
        "access",
        settings.jwt_access_token_expire_minutes,
    )
    new_refresh_token = generate_jwt(
        user.id,
        "refresh",
        int(settings.jwt_refresh_token_expire_days * 24 * 60),
    )

    # Store new refresh token
    new_token_hash = hashlib.sha256(new_refresh_token.encode()).hexdigest()
    refresh_token_obj = RefreshToken(
        user_id=user.id,
        token_hash=new_token_hash,
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.jwt_refresh_token_expire_days),
    )
    session.add(refresh_token_obj)
    await session.commit()

    # Return response with new cookies
    from fastapi.responses import JSONResponse

    response = JSONResponse(
        content={
            "id": user.id,
            "email": user.email,
            "is_active": user.is_active,
        },
        status_code=status.HTTP_200_OK,
    )
    response.set_cookie(
        "access_token",
        access_token,
        httponly=True,
        secure=True,
        samesite="strict",
        max_age=settings.jwt_access_token_expire_minutes * 60,
    )
    response.set_cookie(
        "refresh_token",
        new_refresh_token,
        httponly=True,
        secure=True,
        samesite="strict",
        max_age=int(settings.jwt_refresh_token_expire_days * 24 * 60 * 60),
    )
    return response


@router.post("/logout")
async def logout(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    """Logout by revoking refresh token."""
    # Find and revoke all active refresh tokens for this user
    result = await session.execute(
        select(RefreshToken).where(
            RefreshToken.user_id == user.id,
            RefreshToken.revoked_at.is_(None),
        )
    )
    tokens = result.scalars().all()

    for token in tokens:
        token.revoked_at = datetime.now(timezone.utc)

    await session.commit()

    # Clear cookies
    from fastapi.responses import JSONResponse

    response = JSONResponse(
        content={"message": "Logged out"},
        status_code=status.HTTP_200_OK,
    )
    response.delete_cookie("access_token")
    response.delete_cookie("refresh_token")
    return response


@router.get("/me", response_model=UserResponse)
async def get_me(user: User = Depends(get_current_user)):
    """Get current user info."""
    return UserResponse(
        id=user.id,
        email=user.email,
        is_active=user.is_active,
    )


@router.post("/totp/setup", response_model=TOTPSetupResponse)
async def setup_totp(user: User = Depends(get_current_user)):
    """Get TOTP setup URI for 2FA."""
    secret = generate_totp_secret()
    uri = get_totp_uri(user.email, secret)
    return TOTPSetupResponse(uri=uri)


@router.post("/totp/verify")
async def verify_totp_code(
    payload: TOTPVerifyRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    """Verify TOTP code and enable 2FA."""
    # For MVP, we don't store the secret yet
    # This would be Phase 2 when we add encryption
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="TOTP verification coming in Phase 2",
    )


@router.post("/totp/disable")
async def disable_totp(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    """Disable 2FA."""
    # For MVP, we don't support this yet
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="TOTP disable coming in Phase 2",
    )
