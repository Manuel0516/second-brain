"""Database pages: property/view schema CRUD and page duplication.

A "database" is a Page with type="database"; its records are child Pages whose
`properties` JSON is keyed by DatabaseProperty ids. Relation property values
reuse the generic Link table (written by the frontend via /api/links).
"""

import json
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_async_session
from app.dependencies import get_current_user
from app.models import DatabaseProperty, DatabaseView, Page, User
from app.routes.notes import (
    PageResponse,
    _descendant_ids,
    _editable_page,
    _owned_page,
    _readable_page,
    _sync_mentions,
)

router = APIRouter(prefix="/api", tags=["databases"])

PropertyType = Literal[
    "text", "number", "select", "multi_select", "date", "checkbox", "url", "relation"
]
ViewType = Literal["table", "board", "calendar", "gallery", "list"]


class PropertyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    type: PropertyType
    config: dict[str, object] = Field(default_factory=dict)

    @field_validator("name")
    @classmethod
    def valid_name(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("name must not be blank")
        return value.strip()


class PropertyPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    type: PropertyType | None = None
    config: dict[str, object] | None = None
    position: str | None = Field(default=None, min_length=1, max_length=255)


class PropertyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    page_id: str
    name: str
    type: str
    config: dict[str, object]
    position: str


class ViewCreate(BaseModel):
    name: str = Field(default="Table", min_length=1, max_length=255)
    type: ViewType = "table"
    config: dict[str, object] = Field(default_factory=dict)


class ViewPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    type: ViewType | None = None
    config: dict[str, object] | None = None
    position: str | None = Field(default=None, min_length=1, max_length=255)


class ViewResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    page_id: str
    name: str
    type: str
    config: dict[str, object]
    position: str


async def _owned_database(page_id: str, user: User, session: AsyncSession) -> Page:
    page = await _editable_page(page_id, user, session)
    if page.type != "database":
        raise HTTPException(status_code=422, detail="Page is not a database")
    return page


async def _owned_property(property_id: str, user: User, session: AsyncSession) -> DatabaseProperty:
    prop = await session.get(DatabaseProperty, property_id)
    if prop is None:
        raise HTTPException(status_code=404, detail="Property not found")
    await _editable_page(prop.page_id, user, session)
    return prop


async def _owned_view(view_id: str, user: User, session: AsyncSession) -> DatabaseView:
    view = await session.get(DatabaseView, view_id)
    if view is None:
        raise HTTPException(status_code=404, detail="View not found")
    await _editable_page(view.page_id, user, session)
    return view


def _apply_patch(target: object, values: dict[str, object]) -> None:
    for key, value in values.items():
        if value is None:
            raise HTTPException(status_code=422, detail=f"{key} cannot be null")
        setattr(target, key, value)


@router.get("/pages/{page_id}/properties", response_model=list[PropertyResponse])
async def list_properties(
    page_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> list[DatabaseProperty]:
    await _readable_page(page_id, user, session)
    return list(
        await session.scalars(
            select(DatabaseProperty)
            .where(DatabaseProperty.page_id == page_id)
            .order_by(DatabaseProperty.position)
        )
    )


@router.post("/pages/{page_id}/properties", response_model=PropertyResponse, status_code=201)
async def create_property(
    page_id: str,
    data: PropertyCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> DatabaseProperty:
    await _owned_database(page_id, user, session)
    count = await session.scalar(
        select(func.count(DatabaseProperty.id)).where(DatabaseProperty.page_id == page_id)
    )
    prop = DatabaseProperty(
        page_id=page_id,
        name=data.name,
        type=data.type,
        config=data.config,
        position=f"a{count or 0:08d}",
    )
    session.add(prop)
    await session.commit()
    await session.refresh(prop)
    return prop


@router.patch("/properties/{property_id}", response_model=PropertyResponse)
async def patch_property(
    property_id: str,
    data: PropertyPatch,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> DatabaseProperty:
    prop = await _owned_property(property_id, user, session)
    _apply_patch(prop, data.model_dump(exclude_unset=True))
    await session.commit()
    await session.refresh(prop)
    return prop


@router.delete("/properties/{property_id}", status_code=204)
async def delete_property(
    property_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> Response:
    prop = await _owned_property(property_id, user, session)
    # ponytail: stale value keys left in record JSON are simply ignored.
    await session.delete(prop)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/pages/{page_id}/views", response_model=list[ViewResponse])
async def list_views(
    page_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> list[DatabaseView]:
    await _readable_page(page_id, user, session)
    return list(
        await session.scalars(
            select(DatabaseView)
            .where(DatabaseView.page_id == page_id)
            .order_by(DatabaseView.position)
        )
    )


@router.post("/pages/{page_id}/views", response_model=ViewResponse, status_code=201)
async def create_view(
    page_id: str,
    data: ViewCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> DatabaseView:
    await _owned_database(page_id, user, session)
    count = await session.scalar(
        select(func.count(DatabaseView.id)).where(DatabaseView.page_id == page_id)
    )
    view = DatabaseView(
        page_id=page_id,
        name=data.name,
        type=data.type,
        config=data.config,
        position=f"a{count or 0:08d}",
    )
    session.add(view)
    await session.commit()
    await session.refresh(view)
    return view


@router.patch("/views/{view_id}", response_model=ViewResponse)
async def patch_view(
    view_id: str,
    data: ViewPatch,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> DatabaseView:
    view = await _owned_view(view_id, user, session)
    _apply_patch(view, data.model_dump(exclude_unset=True))
    await session.commit()
    await session.refresh(view)
    return view


@router.delete("/views/{view_id}", status_code=204)
async def delete_view(
    view_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> Response:
    view = await _owned_view(view_id, user, session)
    await session.delete(view)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _remap_ids(value: dict[str, object], mapping: dict[str, str]) -> dict[str, object]:
    """Rewrite every occurrence of an old id inside a JSON blob.

    Ids are UUID strings, so plain text replacement is unambiguous. This keeps
    cloned property keys, view configs, relation values, and inline mentions
    pointing at the cloned entities instead of the originals.
    """
    text = json.dumps(value)
    for old, new in mapping.items():
        text = text.replace(old, new)
    result: dict[str, object] = json.loads(text)
    return result


@router.post("/pages/{page_id}/duplicate", response_model=PageResponse, status_code=201)
async def duplicate_page(
    page_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> Page:
    """Deep-copy a page subtree (with database schemas/views).

    Powers both plain duplication and "Use template" — the copy is never a
    template itself.
    """
    original = await _owned_page(page_id, user, session)
    subtree_ids = await _descendant_ids(original, user, session)
    originals = list(
        await session.scalars(
            select(Page).where(Page.id.in_(subtree_ids), Page.deleted_at.is_(None))
        )
    )
    page_map = {page.id: str(uuid4()) for page in originals}
    properties = list(
        await session.scalars(
            select(DatabaseProperty).where(DatabaseProperty.page_id.in_(subtree_ids))
        )
    )
    views = list(
        await session.scalars(select(DatabaseView).where(DatabaseView.page_id.in_(subtree_ids)))
    )
    mapping = page_map | {prop.id: str(uuid4()) for prop in properties}

    sibling_count = await session.scalar(
        select(func.count(Page.id)).where(
            Page.user_id == user.id, Page.parent_page_id == original.parent_page_id
        )
    )
    clones: list[Page] = []
    for page in originals:
        is_root = page.id == original.id
        clone = Page(
            id=page_map[page.id],
            user_id=user.id,
            parent_page_id=(
                original.parent_page_id if is_root else page_map.get(page.parent_page_id or "")
            ),
            title=page.title,
            icon=page.icon,
            cover=page.cover,
            type=page.type,
            is_template=False,
            content=_remap_ids(page.content, mapping),
            properties=_remap_ids(page.properties, mapping),
            position=f"a{sibling_count or 0:08d}" if is_root else page.position,
        )
        session.add(clone)
        clones.append(clone)
    for prop in properties:
        session.add(
            DatabaseProperty(
                id=mapping[prop.id],
                page_id=page_map[prop.page_id],
                name=prop.name,
                type=prop.type,
                config=_remap_ids(prop.config, mapping),
                position=prop.position,
            )
        )
    for view in views:
        session.add(
            DatabaseView(
                page_id=page_map[view.page_id],
                name=view.name,
                type=view.type,
                config=_remap_ids(view.config, mapping),
                position=view.position,
            )
        )
    await session.flush()
    for clone in clones:
        await _sync_mentions(clone, clone.content, user, session)
    await session.commit()
    root = await session.get(Page, page_map[original.id])
    assert root is not None
    return root
