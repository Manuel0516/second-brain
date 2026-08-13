from collections.abc import AsyncIterator
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_async_session
from app.dependencies import get_current_user
from app.models import AIAction, AIConversation, AIMessage, AISettings, User
from app.modules.ai import agent, tools
from app.modules.ai.sse import event

router = APIRouter(prefix="/api/ai", tags=["ai"])


class SettingsResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    user_id: str
    provider: str
    model_name: str
    local_endpoint_url: str | None
    autonomy_level: str


class SettingsPatch(BaseModel):
    provider: Literal["openrouter"] | None = None
    model_name: str | None = Field(default=None, min_length=1, max_length=255)
    autonomy_level: Literal["ask_before_write"] | None = None


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


class ChatRequest(BaseModel):
    content: str = Field(min_length=1, max_length=100_000)


class ActionRequest(BaseModel):
    action_id: str


class ActionResponse(BaseModel):
    id: str
    status: str


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
    row = await get_ai_settings(session, user)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    await session.commit()
    await session.refresh(row)
    return row


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
    return ConversationDetail(
        id=row.id,
        title=row.title,
        created_at=row.created_at,
        updated_at=row.updated_at,
        messages=[MessageResponse.model_validate(item) for item in messages],
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
        agent.run(session, user, row, settings.model_name, payload.content),
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
    message, call_id, args = await awaiting_message(session, action)
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
