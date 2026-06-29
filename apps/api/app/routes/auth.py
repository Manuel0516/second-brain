import hashlib
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr, Field
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
    username: str
    email: str
    is_active: bool
    totp_enabled: bool


class UserResponse(BaseModel):
    id: str
    username: str
    email: str
    is_active: bool
    totp_enabled: bool


class ProfileUpdate(BaseModel):
    username: str | None = Field(
        default=None, min_length=3, max_length=50, pattern=r"^[a-zA-Z0-9_.-]+$"
    )
    email: EmailStr | None = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=10)


class TOTPSetupResponse(BaseModel):
    uri: str


class TOTPVerifyRequest(BaseModel):
    code: str


@router.post("/login", response_model=LoginResponse)
async def login(
    request: Request,
    payload: LoginRequest,
    session: AsyncSession = Depends(get_async_session),
) -> JSONResponse:
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
        expires_at=datetime.now(UTC) + timedelta(days=settings.jwt_refresh_token_expire_days),
    )
    session.add(refresh_token_obj)
    await session.commit()

    # Return response with cookies
    response = JSONResponse(
        content={
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "is_active": user.is_active,
            "totp_enabled": user.totp_secret is not None,
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
) -> JSONResponse:
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
    token_result = await session.execute(
        select(RefreshToken).where(
            RefreshToken.token_hash == token_hash,
            RefreshToken.revoked_at.is_(None),
            RefreshToken.expires_at > datetime.now(UTC),
        )
    )
    old_token = token_result.scalar_one_or_none()

    if not old_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    # Get user
    user_result = await session.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()

    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    # Revoke old token
    old_token.revoked_at = datetime.now(UTC)

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
        expires_at=datetime.now(UTC) + timedelta(days=settings.jwt_refresh_token_expire_days),
    )
    session.add(refresh_token_obj)
    await session.commit()

    # Return response with new cookies
    response = JSONResponse(
        content={
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "is_active": user.is_active,
            "totp_enabled": user.totp_secret is not None,
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
) -> JSONResponse:
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
        token.revoked_at = datetime.now(UTC)

    await session.commit()

    # Clear cookies
    response = JSONResponse(
        content={"message": "Logged out"},
        status_code=status.HTTP_200_OK,
    )
    response.delete_cookie("access_token")
    response.delete_cookie("refresh_token")
    return response


@router.get("/me", response_model=UserResponse)
async def get_me(user: User = Depends(get_current_user)) -> UserResponse:
    """Get current user info."""
    return UserResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        is_active=user.is_active,
        totp_enabled=user.totp_secret is not None,
    )


@router.patch("/profile", response_model=UserResponse)
async def update_profile(
    payload: ProfileUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> UserResponse:
    """Update username and/or email."""
    update_data = payload.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update",
        )

    # Check uniqueness
    if "username" in update_data:
        existing = await session.execute(
            select(User).where(User.username == update_data["username"], User.id != user.id)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Username already taken",
            )

    if "email" in update_data:
        existing = await session.execute(
            select(User).where(User.email == update_data["email"], User.id != user.id)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email already taken",
            )

    for field_name, value in update_data.items():
        setattr(user, field_name, value)

    await session.commit()
    await session.refresh(user)

    return UserResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        is_active=user.is_active,
        totp_enabled=user.totp_secret is not None,
    )


@router.patch("/password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(
    payload: PasswordChange,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> None:
    """Change password. Revokes all other sessions."""
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect",
        )

    user.password_hash = hash_password(payload.new_password)

    # Revoke all other refresh tokens
    result = await session.execute(
        select(RefreshToken).where(
            RefreshToken.user_id == user.id,
            RefreshToken.revoked_at.is_(None),
        )
    )
    for token in result.scalars().all():
        token.revoked_at = datetime.now(UTC)

    await session.commit()


@router.post("/totp/setup", response_model=TOTPSetupResponse)
async def setup_totp(user: User = Depends(get_current_user)) -> TOTPSetupResponse:
    """Get TOTP setup URI for 2FA."""
    secret = generate_totp_secret()
    uri = get_totp_uri(user.email, secret)
    return TOTPSetupResponse(uri=uri)


@router.post("/totp/verify")
async def verify_totp_code(
    payload: TOTPVerifyRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> None:
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
) -> None:
    """Disable 2FA."""
    # For MVP, we don't support this yet
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="TOTP disable coming in Phase 2",
    )
