import ipaddress
from collections.abc import AsyncIterator
from datetime import datetime
from typing import Literal
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_async_session
from app.dependencies import get_current_user
from app.models import (
    AIAction,
    AIConversation,
    AIMemory,
    AIMessage,
    AISettings,
    AISkill,
    AITool,
    User,
)
from app.modules.ai import agent, memory, tools
from app.modules.ai.sse import event

router = APIRouter(prefix="/api/ai", tags=["ai"])


class SettingsResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    user_id: str
    provider: str
    model_name: str
    local_endpoint_url: str | None
    autonomy_level: str
    embedding_provider: str
    embedding_model: str
    embedding_endpoint_url: str | None
    embedding_dimensions: int
    web_fetch_enabled: bool


class SettingsPatch(BaseModel):
    provider: Literal["openrouter", "local"] | None = None
    model_name: str | None = Field(default=None, min_length=1, max_length=255)
    local_endpoint_url: str | None = Field(default=None, max_length=2048)
    autonomy_level: Literal["ask_before_write", "auto_low_risk", "auto_all"] | None = None
    embedding_provider: Literal["openrouter", "local"] | None = None
    embedding_model: str | None = Field(default=None, min_length=1, max_length=255)
    embedding_endpoint_url: str | None = Field(default=None, max_length=2048)
    embedding_dimensions: int | None = Field(default=None, ge=1, le=4096)
    web_fetch_enabled: bool | None = None


class ConversationCreate(BaseModel):
    title: str | None = Field(default=None, max_length=255)


class MessageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    role: str
    content: str | None
    tool_calls: list[dict[str, object]] | None
    tool_results: list[dict[str, object]] | None
    status: str
    created_at: datetime


class ConversationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    title: str
    created_at: datetime
    updated_at: datetime


class ConversationDetail(ConversationResponse):
    messages: list[MessageResponse]
    pending_actions: list[dict[str, object]]


class ChatRequest(BaseModel):
    content: str = Field(min_length=1, max_length=100_000)


class ActionRequest(BaseModel):
    action_id: str
    secure_args: dict[str, str] = Field(default_factory=dict)


class ActionResponse(BaseModel):
    id: str
    status: str


class CapabilityPatch(BaseModel):
    enabled: bool


class MemoryPatch(BaseModel):
    fact: str = Field(min_length=1, max_length=10_000)
    category: Literal["fact", "profile", "preference", "correction"]


class SkillPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    content: str | None = Field(default=None, min_length=1, max_length=100_000)
    enabled: bool | None = None


class FeedbackPatch(BaseModel):
    feedback: Literal["up", "down"] | None


async def owned_conversation(
    session: AsyncSession, user: User, conversation_id: str
) -> AIConversation:
    row = (
        await session.execute(
            select(AIConversation).where(
                AIConversation.id == conversation_id, AIConversation.user_id == user.id
            )
        )
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "Conversation not found")
    return row


def pending_action_payload(action: AIAction) -> dict[str, object]:
    args = action.preview.get("args")
    preview = dict(args) if isinstance(args, dict) else {}
    secure_fields = action.preview.get("secure_fields")
    if isinstance(secure_fields, list) and secure_fields:
        preview["_secure_fields"] = secure_fields
    return {
        "action_id": action.id,
        "tool": action.tool,
        "preview": preview,
        "high_risk": action.risk_level == "high_risk",
        "confirmation": 1,
    }


async def get_ai_settings(session: AsyncSession, user: User) -> AISettings:
    row = await session.get(AISettings, user.id)
    if not row:
        row = AISettings(user_id=user.id)
        session.add(row)
        await session.commit()
        await session.refresh(row)
    return row


@router.get("/settings", response_model=SettingsResponse)
async def settings_get(
    user: User = Depends(get_current_user), session: AsyncSession = Depends(get_async_session)
) -> AISettings:
    return await get_ai_settings(session, user)


@router.patch("/settings", response_model=SettingsResponse)
async def settings_patch(
    payload: SettingsPatch,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> AISettings:
    for endpoint in (payload.local_endpoint_url, payload.embedding_endpoint_url):
        if endpoint:
            parsed = urlparse(endpoint)
            if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username:
                raise HTTPException(422, "Endpoint must be an http(s) URL without credentials")
            try:
                address = ipaddress.ip_address(parsed.hostname)
                if address.is_link_local:
                    raise HTTPException(422, "Link-local endpoints are not allowed")
            except ValueError:
                pass
    row = await get_ai_settings(session, user)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    await session.commit()
    await session.refresh(row)
    return row


@router.get("/capabilities", response_model=list[dict[str, object]])
async def capability_list(
    query: str = "",
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> list[dict[str, object]]:
    from app.modules.ai import capabilities

    enabled = set(
        (
            await session.execute(
                select(AITool.name).where(AITool.user_id == user.id, AITool.enabled.is_(True))
            )
        ).scalars()
    )
    return [
        {**item, "enabled": capabilities.tool_schema(item["id"])["name"] in enabled}
        for item in capabilities.search(query)
    ]


@router.patch("/capabilities/{capability_id}", response_model=dict[str, object])
async def capability_patch(
    capability_id: str,
    payload: CapabilityPatch,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> dict[str, object]:
    from app.modules.ai import capabilities

    item = capabilities.find(capability_id)
    if item is None:
        raise HTTPException(404, "Capability not found")
    generated = capabilities.tool_schema(capability_id)
    row = await session.scalar(
        select(AITool).where(AITool.user_id == user.id, AITool.name == generated["name"])
    )
    if row is None:
        row = AITool(
            user_id=user.id,
            name=generated["name"],
            description=generated["description"],
            kind="read" if item["risk"] == "read" else "write",
            spec={"capability_id": capability_id},
            enabled=payload.enabled,
            source="openapi",
        )
        session.add(row)
    else:
        row.enabled = payload.enabled
    await session.commit()
    return {"id": capability_id, "enabled": row.enabled}


@router.get("/memories", response_model=list[dict[str, object]])
async def memory_list(
    user: User = Depends(get_current_user), session: AsyncSession = Depends(get_async_session)
) -> list[dict[str, object]]:
    rows = (
        await session.execute(
            select(AIMemory).where(AIMemory.user_id == user.id).order_by(AIMemory.created_at.desc())
        )
    ).scalars()
    return [{"id": row.id, "fact": row.fact, "category": row.category} for row in rows]


@router.patch("/memories/{memory_id}", response_model=dict[str, object])
async def memory_patch(
    memory_id: str,
    payload: MemoryPatch,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> dict[str, object]:
    row = await session.scalar(
        select(AIMemory).where(AIMemory.id == memory_id, AIMemory.user_id == user.id)
    )
    if row is None:
        raise HTTPException(404, "Memory not found")
    row.fact, row.category, row.normalized_key = payload.fact, payload.category, None
    await session.commit()
    return {"id": row.id, "fact": row.fact, "category": row.category}


@router.delete("/memories/{memory_id}", status_code=204)
async def memory_delete(
    memory_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> Response:
    row = await session.scalar(
        select(AIMemory).where(AIMemory.id == memory_id, AIMemory.user_id == user.id)
    )
    if row is None:
        raise HTTPException(404, "Memory not found")
    await session.delete(row)
    await session.commit()
    return Response(status_code=204)


@router.get("/skills", response_model=list[dict[str, object]])
async def skill_list(
    user: User = Depends(get_current_user), session: AsyncSession = Depends(get_async_session)
) -> list[dict[str, object]]:
    await memory.ensure_starter_skills(session, user.id)
    rows = (
        await session.execute(
            select(AISkill).where(AISkill.user_id == user.id).order_by(AISkill.name)
        )
    ).scalars()
    return [
        {"id": row.id, "name": row.name, "content": row.content, "enabled": row.enabled}
        for row in rows
    ]


@router.patch("/skills/{skill_id}", response_model=dict[str, object])
async def skill_patch(
    skill_id: str,
    payload: SkillPatch,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> dict[str, object]:
    row = await session.scalar(
        select(AISkill).where(AISkill.id == skill_id, AISkill.user_id == user.id)
    )
    if row is None:
        raise HTTPException(404, "Skill not found")
    if payload.name is not None:
        row.name = payload.name
    if payload.content is not None:
        row.content = payload.content
    if payload.enabled is not None:
        row.enabled = payload.enabled
    await session.commit()
    return {"id": row.id, "name": row.name, "content": row.content, "enabled": row.enabled}


@router.get("/actions", response_model=list[dict[str, object]])
async def action_list(
    user: User = Depends(get_current_user), session: AsyncSession = Depends(get_async_session)
) -> list[dict[str, object]]:
    rows = (
        await session.execute(
            select(AIAction)
            .where(AIAction.user_id == user.id)
            .order_by(AIAction.created_at.desc())
            .limit(100)
        )
    ).scalars()
    return [
        {
            "id": row.id,
            "tool": row.tool,
            "status": row.status,
            "risk": row.risk_level,
            "created_at": row.created_at,
        }
        for row in rows
    ]


@router.patch("/messages/{message_id}/feedback", response_model=dict[str, object])
async def message_feedback(
    message_id: str,
    payload: FeedbackPatch,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> dict[str, object]:
    row = await session.scalar(
        select(AIMessage)
        .join(AIConversation)
        .where(AIMessage.id == message_id, AIConversation.user_id == user.id)
    )
    if row is None:
        raise HTTPException(404, "Message not found")
    row.feedback = payload.feedback
    await session.commit()
    return {"id": row.id, "feedback": row.feedback}


@router.post("/search/reindex", response_model=dict[str, object])
async def search_reindex(
    user: User = Depends(get_current_user), session: AsyncSession = Depends(get_async_session)
) -> dict[str, object]:
    from app.modules.ai import search as graph_search

    settings = await get_ai_settings(session, user)
    await graph_search.sync(session, user.id, settings)
    return {"status": "complete"}


@router.get("/conversations", response_model=list[ConversationResponse])
async def conversations(
    user: User = Depends(get_current_user), session: AsyncSession = Depends(get_async_session)
) -> list[AIConversation]:
    return list(
        (
            await session.execute(
                select(AIConversation)
                .where(AIConversation.user_id == user.id)
                .order_by(AIConversation.updated_at.desc())
            )
        ).scalars()
    )


@router.post("/conversations", response_model=ConversationResponse, status_code=201)
async def conversation_create(
    payload: ConversationCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> AIConversation:
    row = AIConversation(user_id=user.id, title=payload.title or "New conversation")
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return row


@router.get("/conversations/{conversation_id}", response_model=ConversationDetail)
async def conversation_get(
    conversation_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> ConversationDetail:
    row = await owned_conversation(session, user, conversation_id)
    messages = list(
        (
            await session.execute(
                select(AIMessage)
                .where(AIMessage.conversation_id == row.id)
                .order_by(AIMessage.created_at)
            )
        ).scalars()
    )
    pending_actions = list(
        (
            await session.execute(
                select(AIAction)
                .where(
                    AIAction.user_id == user.id,
                    AIAction.conversation_id == row.id,
                    AIAction.status == "pending",
                )
                .order_by(AIAction.created_at)
            )
        ).scalars()
    )
    return ConversationDetail(
        id=row.id,
        title=row.title,
        created_at=row.created_at,
        updated_at=row.updated_at,
        messages=[MessageResponse.model_validate(item) for item in messages],
        pending_actions=[pending_action_payload(action) for action in pending_actions],
    )


@router.delete(
    "/conversations/{conversation_id}",
    status_code=204,
    response_class=Response,
    response_model=None,
)
async def conversation_delete(
    conversation_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> Response:
    row = await owned_conversation(session, user, conversation_id)
    await session.delete(row)
    await session.commit()
    return Response(status_code=204)


@router.post(
    "/conversations/{conversation_id}/messages",
    response_class=StreamingResponse,
    response_model=None,
)
async def chat(
    conversation_id: str,
    payload: ChatRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> StreamingResponse:
    row = await owned_conversation(session, user, conversation_id)
    if await pending_action_count(session, conversation_id):
        raise HTTPException(409, "Resolve pending confirmations before continuing")
    settings = await get_ai_settings(session, user)
    return StreamingResponse(
        agent.run(
            session,
            user,
            row,
            settings.model_name,
            payload.content,
            settings.provider,
            settings.local_endpoint_url,
            settings.autonomy_level,
        ),
        media_type="text/event-stream",
    )


async def action_for(
    session: AsyncSession, user: User, conversation_id: str, action_id: str
) -> AIAction:
    action = (
        await session.execute(
            select(AIAction).where(
                AIAction.id == action_id,
                AIAction.user_id == user.id,
                AIAction.conversation_id == conversation_id,
            )
        )
    ).scalar_one_or_none()
    if not action or action.status != "pending":
        raise HTTPException(409, "Action is not pending")
    return action


async def awaiting_message(
    session: AsyncSession, action: AIAction
) -> tuple[AIMessage, str, dict[str, object]]:
    message = (
        (
            await session.execute(
                select(AIMessage)
                .where(
                    AIMessage.conversation_id == action.conversation_id,
                    AIMessage.status == "awaiting_confirmation",
                )
                .order_by(AIMessage.created_at.desc())
            )
        )
        .scalars()
        .first()
    )
    preview = dict(action.preview)
    call_id = preview.get("call_id")
    args = preview.get("args")
    if message is None or not isinstance(call_id, str) or not isinstance(args, dict):
        raise HTTPException(409, "Pending action context is invalid")
    return message, call_id, args


async def pending_action_count(session: AsyncSession, conversation_id: str) -> int:
    """Number of still-unresolved write proposals for a conversation."""
    return (
        await session.execute(
            select(func.count())
            .select_from(AIAction)
            .where(
                AIAction.conversation_id == conversation_id,
                AIAction.status == "pending",
            )
        )
    ).scalar_one()


async def action_result_stream(action: AIAction, summary: str, ok: bool) -> StreamingResponse:
    """SSE for a resolved action while sibling actions are still pending: emit the
    tool_result (updates the UI chip) and close WITHOUT resuming the agent loop."""

    async def _gen() -> AsyncIterator[str]:
        yield event("tool_result", name=action.tool, ok=ok, summary=summary)
        yield event("done")

    return StreamingResponse(_gen(), media_type="text/event-stream")


@router.post(
    "/conversations/{conversation_id}/confirm",
    response_class=StreamingResponse,
    response_model=None,
)
async def confirm(
    conversation_id: str,
    payload: ActionRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> StreamingResponse:
    conversation = await owned_conversation(session, user, conversation_id)
    action = await action_for(session, user, conversation_id, payload.action_id)
    action.confirmations_received = 1
    message, call_id, args = await awaiting_message(session, action)
    secure_field_value = action.preview.get("secure_fields", [])
    allowed_secure = (
        {str(value) for value in secure_field_value}
        if isinstance(secure_field_value, list)
        else set()
    )
    if set(payload.secure_args) - allowed_secure:
        raise HTTPException(422, "Unexpected secure argument")
    if allowed_secure - payload.secure_args.keys():
        raise HTTPException(422, "Required secure arguments are missing")
    args = {**args, **payload.secure_args}
    before = await tools.preimage(action.tool, args, session, user.id)
    result = await tools.execute(action.tool, args, session, user.id)
    if not result["ok"]:
        raise HTTPException(502, str(result["summary"]))
    action.status = "executed"
    data = result.get("data")
    action.entity_id = data.get("id") if isinstance(data, dict) else None
    action.undo_payload = {"before": before, "result": data}
    tool_result = {"role": "tool", "tool_call_id": call_id, "content": result["summary"]}
    message.tool_results = [*(message.tool_results or []), tool_result]
    if await pending_action_count(session, conversation_id):
        # Sibling write proposals from the same turn are still awaiting the user —
        # keep the message open and do NOT resume the loop until all are resolved.
        await session.commit()
        return await action_result_stream(action, result["summary"], ok=True)
    message.status = "complete"
    await session.commit()
    settings = await get_ai_settings(session, user)
    return StreamingResponse(
        agent.run(
            session,
            user,
            conversation,
            settings.model_name,
            provider_name=settings.provider,
            endpoint=settings.local_endpoint_url,
            autonomy_level=settings.autonomy_level,
        ),
        media_type="text/event-stream",
    )


@router.post(
    "/conversations/{conversation_id}/reject",
    response_class=StreamingResponse,
    response_model=None,
)
async def reject(
    conversation_id: str,
    payload: ActionRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> StreamingResponse:
    conversation = await owned_conversation(session, user, conversation_id)
    action = await action_for(session, user, conversation_id, payload.action_id)
    message, call_id, _ = await awaiting_message(session, action)
    action.status = "rejected"
    tool_result: dict[str, object] = {
        "role": "tool",
        "tool_call_id": call_id,
        "content": "user rejected this action",
    }
    message.tool_results = [*(message.tool_results or []), tool_result]
    if await pending_action_count(session, conversation_id):
        await session.commit()
        return await action_result_stream(action, "user rejected this action", ok=False)
    message.status = "rejected"
    await session.commit()
    settings = await get_ai_settings(session, user)
    return StreamingResponse(
        agent.run(
            session,
            user,
            conversation,
            settings.model_name,
            provider_name=settings.provider,
            endpoint=settings.local_endpoint_url,
            autonomy_level=settings.autonomy_level,
        ),
        media_type="text/event-stream",
    )


@router.post("/actions/{action_id}/undo", response_model=ActionResponse)
async def undo(
    action_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> ActionResponse:
    action = (
        await session.execute(
            select(AIAction).where(AIAction.id == action_id, AIAction.user_id == user.id)
        )
    ).scalar_one_or_none()
    if not action or action.status != "executed":
        raise HTTPException(409, "Action is not executed")
    ok, _, summary = await tools.undo(
        action.tool, dict(action.undo_payload or {}), user.id, session
    )
    if not ok:
        raise HTTPException(502, summary)
    action.status = "undone"
    await session.commit()
    return ActionResponse(id=action.id, status=action.status)
