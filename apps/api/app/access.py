"""Small shared permission helpers for account-to-account resource sharing."""

from typing import Literal, cast

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ResourceShare

ResourceType = Literal["calendar", "page"]
ResourceRole = Literal["owner", "editor", "viewer"]


async def effective_role(
    resource_type: ResourceType,
    resource_id: str,
    owner_id: str,
    user_id: str,
    session: AsyncSession,
) -> ResourceRole | None:
    if owner_id == user_id:
        return "owner"
    share = await session.scalar(
        select(ResourceShare.role).where(
            ResourceShare.resource_type == resource_type,
            ResourceShare.resource_id == resource_id,
            ResourceShare.recipient_user_id == user_id,
        )
    )
    return cast(ResourceRole, share) if share in {"viewer", "editor"} else None


async def shared_ids(resource_type: ResourceType, user_id: str, session: AsyncSession) -> list[str]:
    return list(
        await session.scalars(
            select(ResourceShare.resource_id).where(
                ResourceShare.resource_type == resource_type,
                ResourceShare.recipient_user_id == user_id,
            )
        )
    )
