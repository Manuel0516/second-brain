"""Small hybrid index over the user's cross-module life data."""

import hashlib
import json
import math
from typing import Any

import httpx
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    AISearchDocument,
    AISettings,
    Calendar,
    CalendarEvent,
    MealLog,
    Page,
    WorkoutSession,
)


def _text(value: Any) -> str:
    if isinstance(value, dict):
        own = str(value.get("text") or "")
        return " ".join(
            [own, *(_text(item) for item in value.values() if item is not value.get("text"))]
        )
    if isinstance(value, list):
        return " ".join(_text(item) for item in value)
    return "" if value is None else str(value)


async def _sources(session: AsyncSession, user_id: str) -> list[tuple[str, str, str, str]]:
    pages = list(
        (
            await session.execute(
                select(Page).where(Page.user_id == user_id, Page.deleted_at.is_(None))
            )
        ).scalars()
    )
    events = list(
        (
            await session.execute(
                select(CalendarEvent).join(Calendar).where(Calendar.user_id == user_id)
            )
        ).scalars()
    )
    meals = list(
        (await session.execute(select(MealLog).where(MealLog.user_id == user_id))).scalars()
    )
    workouts = list(
        (
            await session.execute(select(WorkoutSession).where(WorkoutSession.user_id == user_id))
        ).scalars()
    )
    return [
        *(("page", row.id, row.title, _text(row.content)) for row in pages),
        *(
            ("event", row.id, row.title, " ".join(filter(None, [row.description, row.location])))
            for row in events
        ),
        *(
            (
                "meal_log",
                row.id,
                f"{row.meal_type} {row.date.date()}",
                f"{row.notes or ''} {json.dumps(row.ai_items or [])}",
            )
            for row in meals
        ),
        *(
            (
                "workout_session",
                row.id,
                f"{row.type} {row.date.date()}",
                f"{json.dumps(row.plan or [])} {json.dumps(row.notes)}",
            )
            for row in workouts
        ),
    ]


async def _embed(texts: list[str], settings: AISettings) -> list[list[float]] | None:
    from app.config import get_settings

    base = (
        settings.embedding_endpoint_url
        if settings.embedding_provider == "local"
        else "https://openrouter.ai/api/v1"
    )
    if not base or (
        settings.embedding_provider == "openrouter" and not get_settings().openrouter_api_key
    ):
        return None
    headers = (
        {"Authorization": f"Bearer {get_settings().openrouter_api_key}"}
        if settings.embedding_provider == "openrouter"
        else {}
    )
    try:
        async with httpx.AsyncClient(timeout=60, follow_redirects=False) as client:
            response = await client.post(
                f"{base.rstrip('/')}/embeddings",
                headers=headers,
                json={
                    "model": settings.embedding_model,
                    "input": texts,
                    "dimensions": settings.embedding_dimensions,
                },
            )
        response.raise_for_status()
        return [item["embedding"] for item in response.json()["data"]]
    except (httpx.HTTPError, KeyError, TypeError):
        return None


async def sync(session: AsyncSession, user_id: str, settings: AISettings) -> None:
    sources = await _sources(session, user_id)
    existing = {
        (row.source_type, row.source_id): row
        for row in (
            await session.execute(
                select(AISearchDocument).where(AISearchDocument.user_id == user_id)
            )
        ).scalars()
    }
    changed: list[tuple[AISearchDocument, str]] = []
    live: set[tuple[str, str]] = set()
    for source_type, source_id, title, content in sources:
        live.add((source_type, source_id))
        digest = hashlib.sha256(f"{title}\n{content}".encode()).hexdigest()
        row = existing.get((source_type, source_id))
        if row is None:
            row = AISearchDocument(
                user_id=user_id,
                source_type=source_type,
                source_id=source_id,
                title=title,
                content=content,
                content_hash=digest,
            )
            session.add(row)
        if row.content_hash != digest or row.embedding_model != settings.embedding_model:
            row.title, row.content, row.content_hash = title, content, digest
            changed.append((row, f"{title}\n{content}"))
    stale = set(existing) - live
    if stale:
        await session.execute(
            delete(AISearchDocument).where(
                AISearchDocument.id.in_([existing[key].id for key in stale])
            )
        )
    vectors = await _embed([text for _, text in changed], settings) if changed else []
    if vectors:
        for (row, _), vector in zip(changed, vectors, strict=True):
            row.embedding, row.embedding_model = vector, settings.embedding_model
    await session.commit()


async def search(
    session: AsyncSession, user_id: str, query: str, limit: int = 10
) -> list[dict[str, Any]]:
    settings = await session.get(AISettings, user_id) or AISettings(user_id=user_id)
    await sync(session, user_id, settings)
    rows = list(
        (
            await session.execute(
                select(AISearchDocument).where(AISearchDocument.user_id == user_id)
            )
        ).scalars()
    )
    query_vector = await _embed([query], settings)
    words = query.casefold().split()

    def score(row: AISearchDocument) -> float:
        haystack = f"{row.title} {row.content}".casefold()
        lexical = sum(haystack.count(word) for word in words)
        if not query_vector or row.embedding is None:
            return float(lexical)
        vector = list(row.embedding)
        q = query_vector[0]
        cosine = sum(a * b for a, b in zip(vector, q, strict=True)) / (
            (math.sqrt(sum(a * a for a in vector)) * math.sqrt(sum(b * b for b in q))) or 1
        )
        return lexical + cosine

    ranked = sorted(rows, key=score, reverse=True)
    return [
        {
            "type": row.source_type,
            "id": row.source_id,
            "title": row.title,
            "snippet": row.content[:500],
        }
        for row in ranked[:limit]
        if score(row) > 0
    ]
