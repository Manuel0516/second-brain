import asyncio
import json
import logging
import re
import time
from collections.abc import AsyncIterator, Callable
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.database import async_session_factory
from app.models import AIAction, AIConversation, AIMessage
from app.modules.ai import tools
from app.modules.ai.prompts import build_system_prompt
from app.modules.ai.providers import LocalProvider, OpenRouterProvider, ProviderProtocol
from app.modules.ai.sse import event

logger = logging.getLogger(__name__)

ProviderFactory = Callable[[str], ProviderProtocol]
provider_factory: ProviderFactory | None = None

# Overridable in tests, same pattern as provider_factory — points at the real DB by
# default, swapped to the test session factory in tests/conftest.py.
session_factory: async_sessionmaker[AsyncSession] = async_session_factory
MAX_AGENT_STEPS = 24
SSE_KEEPALIVE_SECONDS = 15.0
_background_tasks: set[asyncio.Task[None]] = set()


def provider(
    model: str, provider_name: str = "openrouter", endpoint: str | None = None
) -> ProviderProtocol:
    from app.config import get_settings

    settings = get_settings()
    return (
        provider_factory(model)
        if provider_factory
        else LocalProvider(endpoint, model)
        if provider_name == "local" and endpoint
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
    user_id: str,
    conversation_id: str,
    model: str,
    content: str | None = None,
    provider_name: str = "openrouter",
    endpoint: str | None = None,
    autonomy_level: str = "ask_before_write",
) -> AsyncIterator[str]:
    conversation = await session.get(AIConversation, conversation_id)
    if conversation is None:
        yield event("error", message="This conversation no longer exists.")
        yield event("done")
        return

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
        {"role": "system", "content": await build_system_prompt(session, user_id)}
    ]
    for item in history:
        messages.extend(_history_message(item))

    yield event("conversation", id=conversation.id, title=conversation.title)
    engine = provider(model, provider_name, endpoint)
    started = time.perf_counter()
    tool_count = 0
    for _ in range(MAX_AGENT_STEPS):
        # Refresh each step: load_capability can add a typed OpenAPI tool mid-turn.
        tool_schemas, is_write = await tools.schemas_for(session, user_id)
        response = await engine.complete(messages, tool_schemas)
        calls = response.get("tool_calls") or []
        tool_count += len(calls)
        if not calls:
            # Use the answer from the same request that decided no tool was needed.
            # A second generation can disagree and doubles cost/latency.
            text = response.get("content") or ""
            if text:
                yield event("text_delta", content=text)
            message = AIMessage(
                conversation_id=conversation.id,
                role="assistant",
                content=text,
                metrics={
                    "provider": provider_name,
                    "model": model,
                    "latency_ms": round((time.perf_counter() - started) * 1000),
                    "tool_calls": tool_count,
                },
            )
            session.add(message)
            if content and autonomy_level in {"auto_low_risk", "auto_all"}:
                await _learn_explicit(session, user_id, content)
            await session.commit()
            await session.refresh(message)
            yield event("message_done", message_id=message.id)
            yield event("done")
            return

        messages.append(response)
        writes: list[tuple[dict[str, Any], str, dict[str, Any]]] = []
        # Reads execute inline; a batch can mix reads and writes (deferred). If it does,
        # the completed reads' results must be persisted alongside the deferred write's
        # tool_calls — otherwise the next turn's history has tool_calls with no matching
        # tool result for those reads, which corrupts the conversation for the provider.
        completed_results: list[dict[str, Any]] = []
        for call in calls:
            name = str(call["function"]["name"])
            try:
                args = json.loads(call["function"].get("arguments") or "{}")
            except json.JSONDecodeError:
                args = {}
            yield event("tool_call", name=name, args=args)
            write = is_write.get(name)
            if write is None:
                result = {"ok": False, "summary": f"Unknown tool: {name}"}
            elif write:
                risk = await tools.risk_for(name, session, user_id)
                auto = autonomy_level == "auto_all" or (
                    autonomy_level == "auto_low_risk" and risk == "low"
                )
                if not auto or risk == "high_risk":
                    writes.append((call, name, args))
                    continue
                before = await tools.preimage(name, args, session, user_id)
                result = await tools.execute(name, args, session, user_id)
                data = result.get("data")
                session.add(
                    AIAction(
                        user_id=user_id,
                        conversation_id=conversation.id,
                        tool=name,
                        entity_type=_entity_type(name),
                        entity_id=data.get("id") if isinstance(data, dict) else None,
                        action=name.split("_")[0],
                        preview={"call_id": call["id"], "args": args},
                        undo_payload={"before": before, "result": data},
                        status="executed" if result["ok"] else "rejected",
                        risk_level=risk,
                        confirmations_required=0,
                    )
                )
            else:
                result = await tools.execute(name, args, session, user_id)
            yield event("tool_result", name=name, ok=result["ok"], summary=result["summary"])
            tool_message = {
                "role": "tool",
                "tool_call_id": call["id"],
                # UI chips use the concise summary; the provider gets complete content
                # for tools such as get_page/load_skill that cannot be safely truncated.
                "content": result.get("model_content", result["summary"]),
            }
            messages.append(tool_message)
            completed_results.append(tool_message)

        if writes:
            message = AIMessage(
                conversation_id=conversation.id,
                role="assistant",
                content=response.get("content"),
                tool_calls=calls,
                tool_results=completed_results,
                status="awaiting_confirmation",
            )
            session.add(message)
            for call, name, args in writes:
                risk = await tools.risk_for(name, session, user_id)
                secure_fields = await tools.secure_fields_for(name, session, user_id)
                action = AIAction(
                    user_id=user_id,
                    conversation_id=conversation.id,
                    tool=name,
                    entity_type=_entity_type(name),
                    action=name.split("_")[0],
                    preview={"call_id": call["id"], "args": args, "secure_fields": secure_fields},
                    status="pending",
                    risk_level=risk,
                    confirmations_required=1,
                )
                session.add(action)
                await session.flush()
                yield event(
                    "confirm_required",
                    action_id=action.id,
                    tool=name,
                    preview={**args, "_secure_fields": secure_fields} if secure_fields else args,
                    high_risk=risk == "high_risk",
                    confirmation=1,
                )
            await session.commit()
            return
    failure = (
        "I made too many tool calls without finishing — try rephrasing, or break this into "
        "smaller steps."
    )
    message = AIMessage(
        conversation_id=conversation.id,
        role="assistant",
        content=failure,
        metrics={
            "provider": provider_name,
            "model": model,
            "latency_ms": round((time.perf_counter() - started) * 1000),
            "tool_calls": tool_count,
        },
    )
    session.add(message)
    await session.commit()
    await session.refresh(message)
    yield event("error", message=failure)
    yield event("message_done", message_id=message.id)
    yield event("done")


async def run_detached(
    user_id: str,
    conversation_id: str,
    model: str,
    content: str | None = None,
    provider_name: str = "openrouter",
    endpoint: str | None = None,
    autonomy_level: str = "ask_before_write",
) -> AsyncIterator[str]:
    """Runs the turn in a background task with its own DB session, so a client that
    disconnects mid-turn (closed tab, backgrounded app, flaky network) does not cancel
    it — a GeneratorExit thrown into this generator only stops relaying events, the
    task keeps running and committing to the DB. Reconnecting (loading the conversation)
    picks up wherever the turn landed."""
    queue: asyncio.Queue[str | None] = asyncio.Queue()

    async def worker() -> None:
        async with session_factory() as bg_session:
            try:
                async for chunk in run(
                    bg_session,
                    user_id,
                    conversation_id,
                    model,
                    content,
                    provider_name,
                    endpoint,
                    autonomy_level,
                ):
                    await queue.put(chunk)
            except Exception:
                logger.exception("agent turn failed for conversation %s", conversation_id)
                await queue.put(event("error", message="The assistant hit an unexpected error."))
            finally:
                await queue.put(None)

    task = asyncio.create_task(worker())
    # asyncio only keeps weak task references. Retain detached turns explicitly so a
    # disconnected client cannot let an in-flight turn be garbage-collected.
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)
    while True:
        try:
            chunk = await asyncio.wait_for(queue.get(), timeout=SSE_KEEPALIVE_SECONDS)
        except TimeoutError:
            # SSE comments are ignored by clients but keep proxies/sockets alive while
            # the provider is thinking between visible events.
            yield ": keepalive\n\n"
            continue
        if chunk is None:
            return
        yield chunk


def _entity_type(name: str) -> str | None:
    if name == "create_event_note":
        return "page"
    if "page" in name:
        return "page"
    if "event" in name:
        return "event"
    if name == "create_link":
        return "link"
    if name == "log_food" or "meal_log" in name:
        return "meal_log"
    if name == "log_workout_session":
        return "workout_session"
    if "tool" in name:
        return "ai_tool"
    return None


async def _learn_explicit(session: AsyncSession, user_id: str, content: str) -> None:
    """Capture only explicit durable signals; the normal remember tool handles inference."""
    from app.modules.ai import memory

    match = re.search(r"\bremember(?: that)?\s+(.+)", content, re.I)
    if match:
        fact = match.group(1).strip(" .")
        category = "preference" if re.search(r"\bprefer|like|always\b", fact, re.I) else "profile"
        await memory.remember(session, user_id, fact, category)
    elif re.match(r"\s*(actually|no[,—:]|correction[:])", content, re.I):
        await memory.remember(session, user_id, content.strip(), "correction")
