import hashlib
import re
from typing import Any, cast

from sqlalchemy import CursorResult, delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AIMemory, AISkill

_CATEGORIES = ("fact", "profile", "preference", "correction")
_CATEGORY_LABELS = {
    "profile": "Profile",
    "preference": "Preferences",
    "correction": "Corrections",
    "fact": "Facts",
}
_CONSOLIDATION_SKILL = """# Memory consolidation

When asked to review or consolidate memory:
1. Call `profile()` (or `recall()`) to see current entries, grouped by category.
2. Look at the `fact` category for repeated patterns (the same kind of observation
   showing up across multiple entries) that add up to a durable preference or trait.
3. For each pattern found, call `remember(fact="<the consolidated insight>",
   category="preference")` (or `category="profile"` if it is about who the user is,
   not a preference).
4. Clear the raw facts that pattern replaced: `forget(category="fact")` if every fact
   entry fed into the consolidation, otherwise `forget(fact="<original fact text>")`
   one at a time for just the superseded ones. Do not leave superseded raw facts behind.
5. Never touch `profile`/`preference`/`correction` entries — only `fact` entries are
   raw enough to consolidate.
6. Tell the user briefly what you consolidated.
"""

_STARTER_SKILLS = {
    "memory-consolidation": _CONSOLIDATION_SKILL,
    "plan-my-day": """# Plan my day

When asked to plan the day, inspect today's calendar, incomplete tasks, recent food logs,
and current fitness goals. Identify conflicts and constraints, then propose a realistic
time-blocked plan. Ask before creating or moving events unless current autonomy permits it.
""",
    "weekly-review": """# Weekly review

When asked for a weekly review, summarize completed and incomplete tasks, calendar load,
workouts, food patterns, and notable spending. Highlight wins, recurring friction, and no
more than three concrete priorities for next week. Never invent missing data.
""",
    "meal-planning": """# Meal planning

When asked for meal help, inspect recent food logs, nutrition goals, preferences, and the
calendar. Suggest practical meals that fit the user's targets and available time. State
assumptions, avoid medical claims, and only log food after the user confirms what was eaten.
""",
    "workout-coach": """# Workout coach

When asked about training, inspect fitness goals, recent sessions, and schedule constraints.
Recommend the next session using recent volume and recovery signals. Prefer gradual changes,
flag pain or injury concerns, and never record a workout that has not happened.
""",
    "spending-review": """# Spending review

When asked about finances, inspect the requested date range and group transactions into clear
patterns. Separate facts from estimates, call out unusual changes, and suggest a short list of
actionable adjustments. Never create or alter financial records without confirmation.
""",
    "capture-and-organize": """# Capture and organize

When the user gives unstructured thoughts, extract decisions, tasks, dates, and reference
material. Reuse existing pages when appropriate, suggest links to related entities, and show
the proposed structure before making broad or destructive changes.
""",
    "calendar-conventions": """# Calendar conventions

Resolve calendar ids and colors via list_calendars ONCE per conversation — check recent
facts (already in this prompt) first, since a prior conversation may have already cached
them. Never call list_calendars again just to re-check something already remembered.

Color rule: gym/workout events always go on the calendar colored blue; food/meal events
always go on the calendar colored green. Match by each calendar's actual `color` from
list_calendars, not by name alone (a calendar named "Fitness" is not necessarily blue).

The first time you resolve these in a conversation, cache them for every future
conversation, e.g.:
remember(fact="Gym calendar: <id> (<hex>, blue)", category="fact")
remember(fact="Food calendar: <id> (<hex>, green)", category="fact")
If no calendar clearly matches, ask once, then remember the answer — never guess a
calendar_id or assume a color.
""",
}


async def remember(session: AsyncSession, user_id: str, fact: str, category: str = "fact") -> str:
    if category not in _CATEGORIES:
        category = "fact"
    normalized = re.sub(r"\s+", " ", fact.strip().casefold())
    key = hashlib.sha256(f"{category}:{normalized}".encode()).hexdigest()
    existing = await session.scalar(
        select(AIMemory.id).where(AIMemory.user_id == user_id, AIMemory.normalized_key == key)
    )
    if existing:
        return "Already remembered."
    session.add(AIMemory(user_id=user_id, fact=fact.strip(), category=category, normalized_key=key))
    await session.commit()
    return "Remembered." if category == "fact" else f"Remembered ({category})."


async def recall(session: AsyncSession, user_id: str) -> list[str]:
    return list(
        (await session.execute(select(AIMemory.fact).where(AIMemory.user_id == user_id))).scalars()
    )


async def forget(
    session: AsyncSession, user_id: str, fact: str | None = None, category: str | None = None
) -> str:
    query = delete(AIMemory).where(AIMemory.user_id == user_id)
    if fact:
        query = query.where(AIMemory.fact == fact)
    elif category:
        query = query.where(AIMemory.category == category)
    result = cast("CursorResult[Any]", await session.execute(query))
    await session.commit()
    count = result.rowcount or 0
    return f"Forgot {count} entr{'y' if count == 1 else 'ies'}."


async def profile(session: AsyncSession, user_id: str) -> str:
    rows = (
        (
            await session.execute(
                select(AIMemory).where(AIMemory.user_id == user_id).order_by(AIMemory.created_at)
            )
        )
        .scalars()
        .all()
    )
    by_category: dict[str, list[str]] = {category: [] for category in _CATEGORIES}
    for row in rows:
        by_category.setdefault(row.category, []).append(row.fact)
    sections = [
        f"{_CATEGORY_LABELS[category]}:\n" + "\n".join(f"- {item}" for item in items)
        for category in ("profile", "preference", "correction", "fact")
        if (items := by_category.get(category))
    ]
    return "\n\n".join(sections) if sections else "Nothing remembered yet."


async def ensure_starter_skills(session: AsyncSession, user_id: str) -> None:
    existing = set(
        (await session.execute(select(AISkill.name).where(AISkill.user_id == user_id))).scalars()
    )
    missing = [
        AISkill(user_id=user_id, name=name, content=content)
        for name, content in _STARTER_SKILLS.items()
        if name not in existing
    ]
    if missing:
        session.add_all(missing)
        await session.commit()


async def save_skill(session: AsyncSession, user_id: str, name: str, content: str) -> str:
    skill = (
        await session.execute(
            select(AISkill).where(AISkill.user_id == user_id, AISkill.name == name)
        )
    ).scalar_one_or_none()
    if skill:
        skill.content = content
    else:
        session.add(AISkill(user_id=user_id, name=name, content=content))
    await session.commit()
    return "Skill saved."


async def delete_skill(session: AsyncSession, user_id: str, name: str) -> str:
    await session.execute(delete(AISkill).where(AISkill.user_id == user_id, AISkill.name == name))
    await session.commit()
    return "Skill deleted."
