from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_async_session
from app.dependencies import get_current_user
from app.models import User
from app.security import hash_password

router = APIRouter(prefix="/api/admin", tags=["admin"])


# ── Schemas ─────────────────────────────────────────────────────────────


class AdminUserResponse(BaseModel):
    id: str
    username: str
    email: str
    is_active: bool
    role: str
    is_test_account: bool
    totp_enabled: bool
    created_at: datetime


class AdminCreateUserRequest(BaseModel):
    username: str = Field(min_length=3, max_length=50, pattern=r"^[a-zA-Z0-9_.-]+$")
    email: EmailStr
    password: str = Field(min_length=10)
    role: str = "user"
    is_test_account: bool = False


class AdminUpdateUserRequest(BaseModel):
    username: str | None = Field(
        default=None, min_length=3, max_length=50, pattern=r"^[a-zA-Z0-9_.-]+$"
    )
    email: EmailStr | None = None
    is_active: bool | None = None
    role: str | None = None
    is_test_account: bool | None = None


class AdminChangePasswordRequest(BaseModel):
    new_password: str = Field(min_length=10)


# ── Helpers ─────────────────────────────────────────────────────────────


async def _require_admin(current_user: User = Depends(get_current_user)) -> User:
    """Verify the current user has the admin role."""
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user


async def _get_user_or_404(user_id: str, session: AsyncSession) -> User:
    """Fetch a user by id or raise 404."""
    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    return user


def _user_to_response(user: User) -> AdminUserResponse:
    return AdminUserResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        is_active=user.is_active,
        role=user.role,
        is_test_account=user.is_test_account,
        totp_enabled=user.totp_secret is not None,
        created_at=user.created_at,
    )


# ── Routes ──────────────────────────────────────────────────────────────


@router.get("/users", response_model=list[AdminUserResponse])
async def list_users(
    admin: User = Depends(_require_admin),
    session: AsyncSession = Depends(get_async_session),
) -> list[AdminUserResponse]:
    """List all users."""
    result = await session.execute(select(User).order_by(User.created_at))
    users = result.scalars().all()
    return [_user_to_response(u) for u in users]


@router.post("/users", response_model=AdminUserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: AdminCreateUserRequest,
    admin: User = Depends(_require_admin),
    session: AsyncSession = Depends(get_async_session),
) -> AdminUserResponse:
    """Create a new user (admin only)."""
    # Check uniqueness
    existing_email = await session.execute(select(User).where(User.email == payload.email))
    if existing_email.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already taken",
        )

    existing_username = await session.execute(select(User).where(User.username == payload.username))
    if existing_username.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username already taken",
        )

    user = User(
        username=payload.username,
        email=payload.email,
        password_hash=hash_password(payload.password),
        role=payload.role,
        is_test_account=payload.is_test_account,
        is_active=True,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)

    return _user_to_response(user)


@router.patch("/users/{user_id}/password", status_code=status.HTTP_204_NO_CONTENT)
async def change_user_password(
    user_id: str,
    payload: AdminChangePasswordRequest,
    admin: User = Depends(_require_admin),
    session: AsyncSession = Depends(get_async_session),
) -> None:
    """Change any user's password (admin only)."""
    user = await _get_user_or_404(user_id, session)
    user.password_hash = hash_password(payload.new_password)
    await session.commit()


@router.patch("/users/{user_id}", response_model=AdminUserResponse)
async def update_user(
    user_id: str,
    payload: AdminUpdateUserRequest,
    admin: User = Depends(_require_admin),
    session: AsyncSession = Depends(get_async_session),
) -> AdminUserResponse:
    """Update user fields (admin only)."""
    user = await _get_user_or_404(user_id, session)

    update_data = payload.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update",
        )

    # Check uniqueness for username/email if they are being changed
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

    return _user_to_response(user)


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: str,
    admin: User = Depends(_require_admin),
    session: AsyncSession = Depends(get_async_session),
) -> None:
    """Delete a user (admin only). Cannot delete yourself or the original admin."""
    user = await _get_user_or_404(user_id, session)
    if user.id == admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete your own account",
        )
    # Protect the first created user (original admin account)
    first = await session.execute(select(User).order_by(User.created_at).limit(1))
    first_user = first.scalar_one_or_none()
    if first_user and user.id == first_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete the original account",
        )

    # Delete related data manually (no cascade on FKs)
    from sqlalchemy import delete as sa_delete

    from app.models import Calendar, CalendarEvent, Link, RefreshToken, UserSettings

    await session.execute(sa_delete(UserSettings).where(UserSettings.user_id == user.id))
    await session.execute(sa_delete(RefreshToken).where(RefreshToken.user_id == user.id))

    cal_result = await session.execute(select(Calendar.id).where(Calendar.user_id == user.id))
    cal_ids = [row[0] for row in cal_result.all()]
    if cal_ids:
        from sqlalchemy import or_

        await session.execute(
            sa_delete(Link).where(or_(Link.source_id.in_(cal_ids), Link.target_id.in_(cal_ids)))
        )
        await session.execute(
            sa_delete(CalendarEvent).where(CalendarEvent.calendar_id.in_(cal_ids))
        )
        await session.execute(sa_delete(Calendar).where(Calendar.user_id == user.id))

    await session.delete(user)
    await session.commit()
