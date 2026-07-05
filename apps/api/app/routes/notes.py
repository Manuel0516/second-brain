from datetime import UTC, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import delete, func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_async_session
from app.dependencies import get_current_user
from app.models import (
    Calendar,
    CalendarEvent,
    DatabaseProperty,
    DatabaseView,
    Link,
    Page,
    User,
    WorkoutSession,
)
from app.routes.calendar import owned_event

router = APIRouter(prefix="/api", tags=["notes"])
NodeType = Literal["page", "event"]


class PageCreate(BaseModel):
    title: str = Field(default="Untitled", max_length=255)
    icon: str | None = Field(default=None, max_length=16)
    parent_page_id: str | None = None
    type: Literal["page", "database", "folder"] = "page"

    @field_validator("title")
    @classmethod
    def valid_title(cls, value: str) -> str:
        return value.strip() or "Untitled"


class PagePatch(BaseModel):
    title: str | None = Field(default=None, max_length=255)
    icon: str | None = Field(default=None, max_length=16)
    content: dict[str, object] | None = None
    parent_page_id: str | None = None
    position: str | None = Field(default=None, min_length=1, max_length=255)
    type: Literal["page", "database", "folder"] | None = None
    is_template: bool | None = None
    cover: str | None = Field(default=None, max_length=512)
    properties: dict[str, object] | None = None

    @field_validator("title")
    @classmethod
    def valid_title(cls, value: str | None) -> str | None:
        return value.strip() or "Untitled" if value is not None else None

    @field_validator("position")
    @classmethod
    def valid_position(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("position must not be blank")
        return value


class PageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    parent_page_id: str | None
    title: str
    icon: str | None
    content: dict[str, object]
    position: str
    type: str
    is_template: bool
    cover: str | None
    properties: dict[str, object]
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None


class BacklinkResponse(BaseModel):
    id: str
    source_type: str
    source_id: str
    relation: str
    title: str
    icon: str | None
    page_type: str | None = None


class LinkedNodeResponse(BaseModel):
    id: str
    target_type: str
    target_id: str
    relation: str
    direction: Literal["incoming", "outgoing"]
    title: str
    icon: str | None
    page_type: str | None = None


class LinkCreate(BaseModel):
    source_type: NodeType
    source_id: str
    target_type: NodeType
    target_id: str
    relation: str = Field(min_length=1, max_length=100)

    @field_validator("relation")
    @classmethod
    def valid_relation(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("relation must not be blank")
        return value.strip()


class LinkResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    source_type: NodeType
    source_id: str
    target_type: NodeType
    target_id: str
    relation: str
    created_at: datetime


class EventNoteCreate(BaseModel):
    title: str | None = Field(default=None, max_length=255)
    icon: str | None = Field(default=None, max_length=16)
    parent_page_id: str | None = None
    # Skip the idempotent existing-note shortcut — used by the Linked card's
    # "new note" action so one event can gather several notes.
    force_new: bool = False

    @field_validator("title")
    @classmethod
    def valid_title(cls, value: str | None) -> str | None:
        return value.strip() or None if value is not None else None


class SearchResultResponse(BaseModel):
    type: NodeType
    id: str
    title: str
    icon: str | None
    page_type: str | None = None


async def _owned_page(
    page_id: str, user: User, session: AsyncSession, *, include_deleted: bool = False
) -> Page:
    query = select(Page).where(Page.id == page_id, Page.user_id == user.id)
    if not include_deleted:
        query = query.where(Page.deleted_at.is_(None))
    page = await session.scalar(query)
    if page is None:
        raise HTTPException(status_code=404, detail="Page not found")
    return page


async def _node_details(
    node_type: str,
    node_id: str,
    user: User,
    session: AsyncSession,
    *,
    include_deleted: bool = False,
) -> tuple[str, str | None, str | None] | None:
    if node_type == "page":
        query = select(Page.title, Page.icon, Page.type).where(
            Page.id == node_id, Page.user_id == user.id
        )
        if not include_deleted:
            query = query.where(Page.deleted_at.is_(None))
        page_row = (await session.execute(query)).one_or_none()
        return (page_row.title, page_row.icon, page_row.type) if page_row else None
    if node_type == "event":
        event_row = (
            await session.execute(
                select(CalendarEvent.title, CalendarEvent.icon)
                .join(Calendar)
                .where(CalendarEvent.id == node_id, Calendar.user_id == user.id)
            )
        ).one_or_none()
        return (event_row.title, event_row.icon, None) if event_row else None
    if node_type == "workout_session":
        workout = (
            await session.execute(
                select(WorkoutSession.type, WorkoutSession.date, WorkoutSession.scheduled_at).where(
                    WorkoutSession.id == node_id, WorkoutSession.user_id == user.id
                )
            )
        ).one_or_none()
        if workout is None:
            return None
        when = workout.date or workout.scheduled_at
        title = f"{workout.type} · {when.date()}" if when else workout.type
        return (title, None, None)
    return None


async def _require_node(
    node_type: str,
    node_id: str,
    user: User,
    session: AsyncSession,
    *,
    include_deleted: bool = False,
) -> None:
    if (
        await _node_details(node_type, node_id, user, session, include_deleted=include_deleted)
        is None
    ):
        raise HTTPException(status_code=404, detail=f"{node_type.title()} not found")


def _mention_targets(value: object) -> set[tuple[NodeType, str]]:
    targets: set[tuple[NodeType, str]] = set()

    def visit(node: object) -> None:
        if isinstance(node, list):
            for child in node:
                visit(child)
            return
        if not isinstance(node, dict):
            return
        node_type = node.get("type")
        attrs = node.get("attrs")
        if isinstance(attrs, dict) and node_type in {
            "mention",
            "page_mention",
            "event_mention",
            "pageMention",
            "eventMention",
        }:
            target_type = attrs.get("type") or attrs.get("targetType")
            if node_type in {"page_mention", "pageMention"}:
                target_type = "page"
            elif node_type in {"event_mention", "eventMention"}:
                target_type = "event"
            target_id = attrs.get("id") or attrs.get("targetId")
            if target_type in {"page", "event"} and isinstance(target_id, str):
                targets.add((target_type, target_id))
        visit(node.get("content"))

    visit(value)
    return targets


async def _sync_mentions(
    page: Page, content: dict[str, object], user: User, session: AsyncSession
) -> None:
    targets = _mention_targets(content)
    for target_type, target_id in targets:
        await _require_node(target_type, target_id, user, session)
    await session.execute(
        delete(Link).where(
            Link.source_type == "page", Link.source_id == page.id, Link.relation == "mentions"
        )
    )
    session.add_all(
        [
            Link(
                source_type="page",
                source_id=page.id,
                target_type=target_type,
                target_id=target_id,
                relation="mentions",
            )
            for target_type, target_id in targets
        ]
    )


async def _descendant_ids(page: Page, user: User, session: AsyncSession) -> set[str]:
    found = {page.id}
    frontier = {page.id}
    while frontier:
        children = set(
            await session.scalars(
                select(Page.id).where(Page.user_id == user.id, Page.parent_page_id.in_(frontier))
            )
        )
        frontier = children - found
        found.update(frontier)
    return found


async def _validate_parent(
    page: Page | None, parent_page_id: str | None, user: User, session: AsyncSession
) -> None:
    if parent_page_id is None:
        return
    parent = await _owned_page(parent_page_id, user, session)
    if page is None:
        return
    seen = {page.id}
    while parent:
        if parent.id in seen:
            raise HTTPException(status_code=422, detail="A page cannot contain itself")
        seen.add(parent.id)
        if parent.parent_page_id is None:
            return
        parent = await _owned_page(parent.parent_page_id, user, session)


def _plain_text(value: object) -> str:
    if isinstance(value, list):
        return " ".join(_plain_text(item) for item in value)
    if not isinstance(value, dict):
        return ""
    parts: list[str] = []
    if isinstance(value.get("text"), str):
        parts.append(value["text"])
    attrs = value.get("attrs")
    if isinstance(attrs, dict) and isinstance(attrs.get("label"), str):
        parts.append(attrs["label"])
    parts.append(_plain_text(value.get("content")))
    return " ".join(parts)


@router.get("/pages", response_model=list[PageResponse])
async def list_pages(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> list[Page]:
    return list(
        await session.scalars(
            select(Page)
            .where(Page.user_id == user.id, Page.deleted_at.is_(None))
            .order_by(Page.parent_page_id, Page.position, Page.created_at)
        )
    )


async def _purge_pages(ids: set[str], session: AsyncSession) -> None:
    """Hard-delete pages with their links and database schema. No commit."""
    if not ids:
        return
    # Detach any live children before their parent disappears.
    await session.execute(
        update(Page)
        .where(Page.parent_page_id.in_(ids), Page.id.not_in(ids))
        .values(parent_page_id=None)
    )
    await session.execute(
        delete(Link).where(
            or_(
                (Link.source_type == "page") & Link.source_id.in_(ids),
                (Link.target_type == "page") & Link.target_id.in_(ids),
            )
        )
    )
    await session.execute(delete(DatabaseProperty).where(DatabaseProperty.page_id.in_(ids)))
    await session.execute(delete(DatabaseView).where(DatabaseView.page_id.in_(ids)))
    await session.execute(delete(Page).where(Page.id.in_(ids)))


@router.get("/pages/trash", response_model=list[PageResponse])
async def list_trash(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> list[Page]:
    # ponytail: purge on trash open; move to a cron job if it ever matters.
    cutoff = datetime.now(UTC) - timedelta(days=30)
    expired = set(
        await session.scalars(
            select(Page.id).where(Page.user_id == user.id, Page.deleted_at < cutoff)
        )
    )
    if expired:
        await _purge_pages(expired, session)
        await session.commit()
    return list(
        await session.scalars(
            select(Page)
            .where(Page.user_id == user.id, Page.deleted_at.is_not(None))
            .order_by(Page.deleted_at.desc())
        )
    )


@router.get("/pages/{page_id}", response_model=PageResponse)
async def get_page(
    page_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> Page:
    return await _owned_page(page_id, user, session)


@router.post("/pages", response_model=PageResponse, status_code=201)
async def create_page(
    data: PageCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> Page:
    await _validate_parent(None, data.parent_page_id, user, session)
    sibling_count = await session.scalar(
        select(func.count(Page.id)).where(
            Page.user_id == user.id,
            Page.parent_page_id == data.parent_page_id,
        )
    )
    page = Page(
        user_id=user.id,
        parent_page_id=data.parent_page_id,
        title=data.title,
        icon=data.icon,
        type=data.type,
        position=f"a{sibling_count or 0:08d}",
        content={"type": "doc", "content": []},
    )
    session.add(page)
    await session.commit()
    await session.refresh(page)
    return page


@router.patch("/pages/{page_id}", response_model=PageResponse)
async def patch_page(
    page_id: str,
    data: PagePatch,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> Page:
    page = await _owned_page(page_id, user, session)
    values = data.model_dump(exclude_unset=True)
    if values.get("title") is None and "title" in values:
        raise HTTPException(status_code=422, detail="title cannot be null")
    if values.get("content") is None and "content" in values:
        raise HTTPException(status_code=422, detail="content cannot be null")
    if values.get("position") is None and "position" in values:
        raise HTTPException(status_code=422, detail="position cannot be null")
    for non_nullable in ("type", "is_template", "properties"):
        if values.get(non_nullable) is None and non_nullable in values:
            raise HTTPException(status_code=422, detail=f"{non_nullable} cannot be null")
    if "parent_page_id" in values:
        await _validate_parent(page, values["parent_page_id"], user, session)
    if "content" in values:
        await _sync_mentions(page, values["content"], user, session)
    for key, value in values.items():
        setattr(page, key, value)
    await session.commit()
    await session.refresh(page)
    return page


@router.delete("/pages/{page_id}", status_code=204)
async def delete_page(
    page_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> Response:
    page = await _owned_page(page_id, user, session)
    ids = await _descendant_ids(page, user, session)
    await session.execute(
        update(Page)
        .where(Page.id.in_(ids), Page.user_id == user.id)
        .values(deleted_at=datetime.now(UTC))
    )
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/pages/{page_id}/restore", response_model=PageResponse)
async def restore_page(
    page_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> Page:
    page = await _owned_page(page_id, user, session, include_deleted=True)
    ids = await _descendant_ids(page, user, session)
    await session.execute(
        update(Page).where(Page.id.in_(ids), Page.user_id == user.id).values(deleted_at=None)
    )
    await session.commit()
    await session.refresh(page)
    return page


@router.delete("/pages/{page_id}/permanent", status_code=204)
async def permanent_delete_page(
    page_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> Response:
    """Irreversibly delete a trashed page subtree with its links and schema."""
    page = await _owned_page(page_id, user, session, include_deleted=True)
    if page.deleted_at is None:
        raise HTTPException(status_code=409, detail="Page is not in the trash")
    ids = await _descendant_ids(page, user, session)
    await _purge_pages(ids, session)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/nodes/{node_type}/{node_id}/backlinks", response_model=list[BacklinkResponse])
async def get_backlinks(
    node_type: NodeType,
    node_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> list[BacklinkResponse]:
    await _require_node(node_type, node_id, user, session)
    links = await session.scalars(
        select(Link).where(Link.target_type == node_type, Link.target_id == node_id)
    )
    result: list[BacklinkResponse] = []
    for link in links:
        details = await _node_details(link.source_type, link.source_id, user, session)
        if details and link.source_type in {"page", "event"}:
            result.append(
                BacklinkResponse(
                    id=link.id,
                    source_type=link.source_type,
                    source_id=link.source_id,
                    relation=link.relation,
                    title=details[0],
                    icon=details[1],
                    page_type=details[2],
                )
            )
    return result


@router.get("/search", response_model=list[SearchResultResponse])
async def search_nodes(
    q: str = Query(min_length=1, max_length=255),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> list[SearchResultResponse]:
    needle = q.casefold().strip()
    pages = await session.scalars(
        select(Page).where(Page.user_id == user.id, Page.deleted_at.is_(None))
    )
    results = [
        SearchResultResponse(
            type="page", id=page.id, title=page.title, icon=page.icon, page_type=page.type
        )
        for page in pages
        if needle in f"{page.title} {_plain_text(page.content)}".casefold()
    ]
    events = await session.scalars(
        select(CalendarEvent).join(Calendar).where(Calendar.user_id == user.id)
    )
    results.extend(
        SearchResultResponse(type="event", id=event.id, title=event.title, icon=event.icon)
        for event in events
        if needle in event.title.casefold()
    )
    # ponytail: in-memory ILIKE equivalent; add indexed search when the corpus grows.
    return results[:50]


@router.post("/events/{event_id}/note", response_model=PageResponse, status_code=201)
async def create_event_note(
    event_id: str,
    data: EventNoteCreate | None = None,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> Page:
    event = await owned_event(event_id, user, session)
    if not (data and data.force_new):
        existing = await session.scalar(
            select(Page)
            .join(
                Link,
                (Link.target_type == "page")
                & (Link.target_id == Page.id)
                & (Link.source_type == "event")
                & (Link.source_id == event.id)
                & (Link.relation == "note"),
            )
            .where(Page.user_id == user.id, Page.deleted_at.is_(None))
            .order_by(Page.created_at)
        )
        if existing is not None:
            return existing
    draft = (event.connections or {}).get("notes")
    draft_title = draft.get("title") if isinstance(draft, dict) else None
    draft_folder = draft.get("folder_id") if isinstance(draft, dict) else None
    title = (data.title if data else None) or draft_title or event.title
    icon = data.icon if data and data.icon else None
    parent_page_id = (data.parent_page_id if data else None) or (
        draft_folder if isinstance(draft_folder, str) else None
    )
    if parent_page_id is not None:
        await _owned_page(parent_page_id, user, session)
    page = Page(
        user_id=user.id,
        title=title,
        icon=icon or event.icon,
        parent_page_id=parent_page_id,
        position="a0",
        content={"type": "doc", "content": []},
    )
    session.add(page)
    await session.flush()
    session.add(
        Link(
            source_type="event",
            source_id=event.id,
            target_type="page",
            target_id=page.id,
            relation="note",
        )
    )
    await session.commit()
    await session.refresh(page)
    return page


@router.get("/events/{event_id}/links", response_model=list[LinkedNodeResponse])
async def get_event_links(
    event_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> list[LinkedNodeResponse]:
    await owned_event(event_id, user, session)
    links = await session.scalars(
        select(Link).where(
            or_(
                (Link.source_type == "event") & (Link.source_id == event_id),
                (Link.target_type == "event") & (Link.target_id == event_id),
            )
        )
    )
    result: list[LinkedNodeResponse] = []
    for link in links:
        outgoing = link.source_type == "event" and link.source_id == event_id
        node_type = link.target_type if outgoing else link.source_type
        node_id = link.target_id if outgoing else link.source_id
        details = await _node_details(node_type, node_id, user, session)
        if details and node_type in {"page", "event", "workout_session"}:
            result.append(
                LinkedNodeResponse(
                    id=link.id,
                    target_type=node_type,
                    target_id=node_id,
                    relation=link.relation,
                    direction="outgoing" if outgoing else "incoming",
                    title=details[0],
                    icon=details[1],
                    page_type=details[2],
                )
            )
    return result


@router.post("/links", response_model=LinkResponse, status_code=201)
async def create_link(
    data: LinkCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> Link:
    await _require_node(data.source_type, data.source_id, user, session)
    await _require_node(data.target_type, data.target_id, user, session)
    link = Link(**data.model_dump())
    session.add(link)
    try:
        await session.commit()
    except IntegrityError as error:
        await session.rollback()
        raise HTTPException(status_code=409, detail="Link already exists") from error
    await session.refresh(link)
    return link


@router.delete("/links/{link_id}", status_code=204)
async def delete_link(
    link_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> Response:
    link = await session.get(Link, link_id)
    if link is None:
        raise HTTPException(status_code=404, detail="Link not found")
    await _require_node(link.source_type, link.source_id, user, session, include_deleted=True)
    await _require_node(link.target_type, link.target_id, user, session, include_deleted=True)
    await session.delete(link)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
