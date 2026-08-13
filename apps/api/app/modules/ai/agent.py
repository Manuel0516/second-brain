import json
from collections.abc import AsyncIterator, Callable
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AIAction, AIConversation, AIMessage, User
from app.modules.ai import tools
from app.modules.ai.prompts import build_system_prompt
from app.modules.ai.providers import OpenRouterProvider, ProviderProtocol
from app.modules.ai.sse import event

ProviderFactory = Callable[[str], ProviderProtocol]
provider_factory: ProviderFactory | None = None


def provider(model: str) -> ProviderProtocol:
    from app.config import get_settings

    settings = get_settings()
    return (
        provider_factory(model)
        if provider_factory
        else OpenRouterProvider(settings.openrouter_api_key, model)
    )


def _history_message(message: AIMessage) -> list[dict[str, Any]]:
    if message.role == "assistant" and message.tool_calls:
        result: list[dict[str, Any]] = [
            {"role": "assistant", "content": message.content, "tool_calls": message.tool_calls}
        ]
        result.extend(message.tool_results or [])
        return result
    if message.role in {"user", "assistant"}:
        return [{"role": message.role, "content": message.content or ""}]
    return []


async def run(
    session: AsyncSession,
    user: User,
    conversation: AIConversation,
    model: str,
    content: str | None = None,
) -> AsyncIterator[str]:
    if content is not None:
        session.add(AIMessage(conversation_id=conversation.id, role="user", content=content))
        if conversation.title == "New conversation":
            conversation.title = content[:60]
        await session.commit()

    history = list(
        (
            await session.execute(
                select(AIMessage)
                .where(AIMessage.conversation_id == conversation.id)
                .order_by(AIMessage.created_at, AIMessage.id)
            )
        ).scalars()
    )
    messages: list[dict[str, Any]] = [
        {"role": "system", "content": await build_system_prompt(session, user.id)}
    ]
    for item in history:
        messages.extend(_history_message(item))

    yield event("conversation", id=conversation.id, title=conversation.title)
    engine = provider(model)
    for _ in range(12):
        response = await engine.complete(messages, tools.schemas())
        calls = response.get("tool_calls") or []
        if not calls:
            chunks: list[str] = []
            async for chunk in engine.stream(messages, tools.schemas()):
                chunks.append(chunk)
                yield event("text_delta", content=chunk)
            text = "".join(chunks)
            message = AIMessage(conversation_id=conversation.id, role="assistant", content=text)
            session.add(message)
            await session.commit()
            await session.refresh(message)
            yield event("message_done", message_id=message.id)
            yield event("done")
            return

        messages.append(response)
        writes: list[tuple[dict[str, Any], str, dict[str, Any]]] = []
        for call in calls:
            name = str(call["function"]["name"])
            try:
                args = json.loads(call["function"].get("arguments") or "{}")
            except json.JSONDecodeError:
                args = {}
            yield event("tool_call", name=name, args=args)
            registered = tools.BY_NAME.get(name)
            if registered is None:
                result = {"ok": False, "summary": f"Unknown tool: {name}"}
            elif registered.is_write:
                writes.append((call, name, args))
                continue
            else:
                result = await tools.execute(name, args, session, user.id)
            yield event("tool_result", name=name, ok=result["ok"], summary=result["summary"])
            messages.append(
                {"role": "tool", "tool_call_id": call["id"], "content": result["summary"]}
            )

        if writes:
            message = AIMessage(
                conversation_id=conversation.id,
                role="assistant",
                content=response.get("content"),
                tool_calls=calls,
                tool_results=[],
                status="awaiting_confirmation",
            )
            session.add(message)
            for call, name, args in writes:
                action = AIAction(
                    user_id=user.id,
                    conversation_id=conversation.id,
                    tool=name,
                    entity_type=_entity_type(name),
                    action=name.split("_")[0],
                    preview={"call_id": call["id"], "args": args},
                    status="pending",
                )
                session.add(action)
                await session.flush()
                yield event("confirm_required", action_id=action.id, tool=name, preview=args)
            await session.commit()
            return
    yield event("error", message="too many steps")
    yield event("done")


def _entity_type(name: str) -> str | None:
    if "page" in name:
        return "page"
    if "event" in name:
        return "event"
    if name == "create_link":
        return "link"
    if name == "log_food":
        return "meal_log"
    if name == "log_workout_session":
        return "workout_session"
    return None
