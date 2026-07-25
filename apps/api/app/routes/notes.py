import base64
from datetime import UTC, date, datetime, timedelta
from typing import Literal

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    Response,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from sqlalchemy import delete, func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.access import effective_role, shared_ids
from app.collaboration import note_connections
from app.database import async_session_factory, get_async_session
from app.dependencies import get_current_user, get_websocket_user
from app.models import (
    Calendar,
    CalendarEvent,
    DatabaseProperty,
    DatabaseView,
    Link,
    MealLog,
    NoteCollaborationUpdate,
    Page,
    ResourceShare,
    User,
    WorkoutSession,
)
from app.routes.calendar import owned_event

router = APIRouter(prefix="/api", tags=["notes"])
NodeType = Literal["page", "event", "meal_log", "workout_session"]


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
    effective_role: Literal["owner", "editor", "viewer"] = "owner"
    owner_email: str | None = None
    owner_name: str | None = None
    collaborators: list["CollaboratorResponse"] = Field(default_factory=list)


class CollaboratorResponse(BaseModel):
    user_id: str
    email: str
    role: Literal["viewer", "editor"]


class ShareWrite(BaseModel):
    email: EmailStr
    role: Literal["viewer", "editor"]


class SharePatch(BaseModel):
    role: Literal["viewer", "editor"]


class BacklinkResponse(BaseModel):
    id: str
    source_type: str
    source_id: str
    relation: str
    title: str
    icon: str | None
    page_type: str | None = None
    parent_title: str | None = None


class LinkedNodeResponse(BaseModel):
    id: str
    target_type: str
    target_id: str
    relation: str
    direction: Literal["incoming", "outgoing"]
    title: str
    icon: str | None
    page_type: str | None = None
    parent_title: str | None = None


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
    parent_title: str | None = None


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


async def _readable_page(
    page_id: str, user: User, session: AsyncSession, *, include_deleted: bool = False
) -> Page:
    page = await session.get(Page, page_id)
    if page is None or (page.deleted_at is not None and not include_deleted):
        raise HTTPException(status_code=404, detail="Page not found")
    if not await effective_role("page", page.id, page.user_id, user.id, session):
        raise HTTPException(status_code=404, detail="Page not found")
    return page


async def _editable_page(page_id: str, user: User, session: AsyncSession) -> Page:
    page = await _readable_page(page_id, user, session)
    if await effective_role("page", page.id, page.user_id, user.id, session) == "viewer":
        raise HTTPException(status_code=403, detail="Page is read-only")
    return page


async def _page_response(page: Page, user: User, session: AsyncSession) -> PageResponse:
    role = await effective_role("page", page.id, page.user_id, user.id, session)
    assert role is not None
    owner = await session.scalar(select(User).where(User.id == page.user_id))
    owner_email = owner.email if owner else None
    owner_name = owner.username if owner else None
    collaborators: list[CollaboratorResponse] = []
    if role == "owner":
        rows = await session.execute(
            select(ResourceShare, User)
            .join(User, User.id == ResourceShare.recipient_user_id)
            .where(ResourceShare.resource_type == "page", ResourceShare.resource_id == page.id)
            .order_by(User.email)
        )
        collaborators = [
            CollaboratorResponse(user_id=recipient.id, email=recipient.email, role=share.role)
            for share, recipient in rows
        ]
    parent_page_id = page.parent_page_id
    if parent_page_id and page.user_id != user.id:
        parent = await session.get(Page, parent_page_id)
        if parent is None or not await effective_role(
            "page", parent.id, parent.user_id, user.id, session
        ):
            # A per-note grant does not expose the owner's private tree.
            parent_page_id = None
    return PageResponse(
        id=page.id,
        parent_page_id=parent_page_id,
        title=page.title,
        icon=page.icon,
        content=page.content,
        position=page.position,
        type=page.type,
        is_template=page.is_template,
        cover=page.cover,
        properties=page.properties,
        created_at=page.created_at,
        updated_at=page.updated_at,
        deleted_at=page.deleted_at,
        effective_role=role,
        owner_email=owner_email,
        owner_name=owner_name,
        collaborators=collaborators,
    )


async def _node_details(
    node_type: str,
    node_id: str,
    user: User,
    session: AsyncSession,
    *,
    include_deleted: bool = False,
) -> tuple[str, str | None, str | None, str | None, date | None] | None:
    """Returns (title, icon, page_type, parent_title, day). `day` is the record's
    own date for dated nodes (meal/workout), else None — used to scope links to a
    single occurrence of a recurring event."""
    if node_type == "page":
        query = select(Page.title, Page.icon, Page.type, Page.parent_page_id).where(
            Page.id == node_id, Page.user_id == user.id
        )
        if not include_deleted:
            query = query.where(Page.deleted_at.is_(None))
        page_row = (await session.execute(query)).one_or_none()
        if page_row is None:
            return None
        parent_title = None
        if page_row.parent_page_id:
            parent_title = await session.scalar(
                select(Page.title).where(
                    Page.id == page_row.parent_page_id, Page.user_id == user.id
                )
            )
        return (page_row.title, page_row.icon, page_row.type, parent_title, None)
    if node_type == "event":
        event_row = (
            await session.execute(
                select(CalendarEvent.title, CalendarEvent.icon)
                .join(Calendar)
                .where(CalendarEvent.id == node_id, Calendar.user_id == user.id)
            )
        ).one_or_none()
        return (event_row.title, event_row.icon, None, None, None) if event_row else None
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
        return (title, None, None, None, when.date() if when else None)
    if node_type == "meal_log":
        meal = await session.scalar(
            select(MealLog).where(MealLog.id == node_id, MealLog.user_id == user.id)
        )
        if meal is None:
            return None
        when = meal.date or meal.logged_at
        title = (
            f"{meal.meal_type.capitalize()} · {when.date()}"
            if when
            else meal.meal_type.capitalize()
        )
        return (title, None, None, None, when.date() if when else None)
    return None


async def _require_node(
    node_type: str,
    node_id: str,
    user: User,
    session: AsyncSession,
    *,
    include_deleted: bool = False,
) -> None:
    if node_type == "page":
        await _readable_page(node_id, user, session, include_deleted=include_deleted)
        return
    if node_type == "event":
        await owned_event(node_id, user, session)
        return
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
) -> list[PageResponse]:
    ids = await shared_ids("page", user.id, session)
    pages = list(
        await session.scalars(
            select(Page)
            .where((Page.user_id == user.id) | Page.id.in_(ids), Page.deleted_at.is_(None))
            .order_by(Page.parent_page_id, Page.position, Page.created_at)
        )
    )
    return [await _page_response(page, user, session) for page in pages]


async def _delete_page_links(ids: set[str], session: AsyncSession) -> None:
    if not ids:
        return
    await session.execute(
        delete(Link).where(
            or_(
                (Link.source_type == "page") & Link.source_id.in_(ids),
                (Link.target_type == "page") & Link.target_id.in_(ids),
            )
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
    await _delete_page_links(ids, session)
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
) -> PageResponse:
    return await _page_response(await _readable_page(page_id, user, session), user, session)


@router.post("/pages", response_model=PageResponse, status_code=201)
async def create_page(
    data: PageCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> PageResponse:
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
    return await _page_response(page, user, session)


@router.patch("/pages/{page_id}", response_model=PageResponse)
async def patch_page(
    page_id: str,
    data: PagePatch,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> PageResponse:
    page = await _editable_page(page_id, user, session)
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
    live_update = {
        key: getattr(page, key) for key in ("title", "icon", "cover", "content") if key in values
    }
    if live_update:
        await note_connections.send_others(page.id, None, {"type": "page", "page": live_update})
    return await _page_response(page, user, session)


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
    await _delete_page_links(ids, session)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/pages/{page_id}/restore", response_model=PageResponse)
async def restore_page(
    page_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> PageResponse:
    page = await _owned_page(page_id, user, session, include_deleted=True)
    ids = await _descendant_ids(page, user, session)
    await session.execute(
        update(Page).where(Page.id.in_(ids), Page.user_id == user.id).values(deleted_at=None)
    )
    await session.commit()
    await session.refresh(page)
    return await _page_response(page, user, session)


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


async def _share_recipient(data: ShareWrite, owner: User, session: AsyncSession) -> User:
    recipient = await session.scalar(select(User).where(User.email == str(data.email).casefold()))
    if recipient is None or recipient.id == owner.id:
        raise HTTPException(status_code=422, detail="Cannot share with that account")
    return recipient


@router.get("/pages/{page_id}/shares", response_model=list[CollaboratorResponse])
async def list_page_shares(
    page_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> list[CollaboratorResponse]:
    page = await _owned_page(page_id, user, session)
    return (await _page_response(page, user, session)).collaborators


@router.post("/pages/{page_id}/shares", response_model=CollaboratorResponse, status_code=201)
async def create_page_share(
    page_id: str,
    data: ShareWrite,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> CollaboratorResponse:
    await _owned_page(page_id, user, session)
    recipient = await _share_recipient(data, user, session)
    share = await session.scalar(
        select(ResourceShare).where(
            ResourceShare.resource_type == "page",
            ResourceShare.resource_id == page_id,
            ResourceShare.recipient_user_id == recipient.id,
        )
    )
    if share is None:
        share = ResourceShare(
            resource_type="page",
            resource_id=page_id,
            recipient_user_id=recipient.id,
            role=data.role,
        )
        session.add(share)
    else:
        share.role = data.role
    await session.commit()
    return CollaboratorResponse(user_id=recipient.id, email=recipient.email, role=data.role)


@router.patch("/pages/{page_id}/shares/{recipient_id}", response_model=CollaboratorResponse)
async def patch_page_share(
    page_id: str,
    recipient_id: str,
    data: SharePatch,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> CollaboratorResponse:
    await _owned_page(page_id, user, session)
    share = await session.scalar(
        select(ResourceShare).where(
            ResourceShare.resource_type == "page",
            ResourceShare.resource_id == page_id,
            ResourceShare.recipient_user_id == recipient_id,
        )
    )
    recipient = await session.get(User, recipient_id)
    if share is None or recipient is None:
        raise HTTPException(status_code=404, detail="Share not found")
    share.role = data.role
    await session.commit()
    return CollaboratorResponse(user_id=recipient.id, email=recipient.email, role=share.role)


@router.delete("/pages/{page_id}/shares/{recipient_id}", status_code=204)
async def delete_page_share(
    page_id: str,
    recipient_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> Response:
    await _owned_page(page_id, user, session)
    share = await session.scalar(
        select(ResourceShare).where(
            ResourceShare.resource_type == "page",
            ResourceShare.resource_id == page_id,
            ResourceShare.recipient_user_id == recipient_id,
        )
    )
    if share is None:
        raise HTTPException(status_code=404, detail="Share not found")
    await session.delete(share)
    await session.commit()
    await note_connections.close_page_user(page_id, recipient_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.websocket("/pages/{page_id}/collaboration")
async def collaborate_page(websocket: WebSocket, page_id: str) -> None:
    """Authenticated Yjs relay. Updates stay opaque; the editor derives snapshots."""
    async with async_session_factory() as session:
        user = await get_websocket_user(websocket, session)
        if user is None:
            await websocket.close(code=1008)
            return
        try:
            page = await _readable_page(page_id, user, session)
        except HTTPException:
            await websocket.close(code=1008)
            return
        role = await effective_role("page", page.id, page.user_id, user.id, session)
        await note_connections.join(page_id, websocket, user.id)
        try:
            updates = list(
                await session.scalars(
                    select(NoteCollaborationUpdate.update)
                    .where(NoteCollaborationUpdate.page_id == page_id)
                    .order_by(NoteCollaborationUpdate.created_at)
                )
            )
            await websocket.send_json(
                {
                    "type": "sync",
                    "updates": [base64.b64encode(update).decode() for update in updates],
                    "read_only": role == "viewer",
                }
            )
            while True:
                message = await websocket.receive_json()
                if message.get("type") != "update":
                    continue
                page = await _readable_page(page_id, user, session)
                role = await effective_role("page", page.id, page.user_id, user.id, session)
                if role == "viewer":
                    await websocket.close(code=1008)
                    return
                raw = message.get("update")
                snapshot = message.get("content")
                if not isinstance(raw, str) or not isinstance(snapshot, dict):
                    await websocket.send_json({"type": "error", "detail": "Invalid update"})
                    continue
                try:
                    update = base64.b64decode(raw, validate=True)
                except ValueError:
                    await websocket.send_json({"type": "error", "detail": "Invalid update"})
                    continue
                if not update or len(update) > 1_000_000:
                    await websocket.send_json({"type": "error", "detail": "Invalid update"})
                    continue
                # The Tiptap/Yjs document is the source; this JSON is its
                # rendered snapshot so normal reads, search and printing stay useful.
                page.content = snapshot
                session.add(NoteCollaborationUpdate(page_id=page_id, update=update))
                await session.commit()
                await note_connections.send_others(page_id, websocket, message)
        except WebSocketDisconnect:
            pass
        finally:
            await note_connections.leave(page_id, websocket)


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
                    parent_title=details[3],
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
    shared_page_ids = await shared_ids("page", user.id, session)
    pages = list(
        await session.scalars(
            select(Page).where(
                (Page.user_id == user.id) | Page.id.in_(shared_page_ids),
                Page.deleted_at.is_(None),
            )
        )
    )
    titles_by_id = {page.id: page.title for page in pages}
    results = [
        SearchResultResponse(
            type="page",
            id=page.id,
            title=page.title,
            icon=page.icon,
            page_type=page.type,
            parent_title=titles_by_id.get(page.parent_page_id) if page.parent_page_id else None,
        )
        for page in pages
        if needle in f"{page.title} {_plain_text(page.content)}".casefold()
    ]
    shared_calendar_ids = await shared_ids("calendar", user.id, session)
    events = await session.scalars(
        select(CalendarEvent)
        .join(Calendar)
        .where((Calendar.user_id == user.id) | Calendar.id.in_(shared_calendar_ids))
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
    on: date | None = Query(None),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> list[LinkedNodeResponse]:
    # `on` scopes dated links (meal/workout) to a single recurring occurrence:
    # a series stores one meal per day all linked to the same event id, so
    # without this every occurrence would show every day's meal.
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
        if on is not None and node_type in {"workout_session", "meal_log"}:
            if details is None or details[4] != on:
                continue
        if details and node_type in {"page", "event", "workout_session", "meal_log"}:
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
                    parent_title=details[3],
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
    if data.source_type == "page":
        await _editable_page(data.source_id, user, session)
    elif data.source_type == "event":
        from app.routes.calendar import writable_event

        await writable_event(data.source_id, user, session)
    link = Link(**data.model_dump())
    session.add(link)
    try:
        await session.commit()
    except IntegrityError as error:
        await session.rollback()
        raise HTTPException(status_code=409, detail="Link already exists") from error
    await session.refresh(link)

    # ponytail: when linking an event to an existing meal/workout, sync the
    # target's date to match the event so they stay aligned as if created together.
    if data.source_type == "event" and data.target_type in ("meal_log", "workout_session"):
        event = await session.get(CalendarEvent, data.source_id)
        if event is not None:
            if data.target_type == "meal_log":
                meal = await session.get(MealLog, data.target_id)
                if meal is not None:
                    meal.date = event.start_at
                    meal.scheduled_at = event.start_at
            elif data.target_type == "workout_session":
                wkt = await session.get(WorkoutSession, data.target_id)
                if wkt is not None:
                    wkt.date = event.start_at
                    wkt.scheduled_at = event.start_at
            await session.commit()

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
