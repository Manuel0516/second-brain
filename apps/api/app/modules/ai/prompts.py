from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AIMemory, AISkill


async def build_system_prompt(session: AsyncSession, user_id: str) -> str:
    memories = (
        (await session.execute(select(AIMemory).where(AIMemory.user_id == user_id))).scalars().all()
    )
    skills = (
        (await session.execute(select(AISkill).where(AISkill.user_id == user_id))).scalars().all()
    )
    facts = "\n".join(f"- {item.fact}" for item in memories) or "- none"
    index = (
        "\n".join(f"- {item.name}: {item.content.splitlines()[0]}" for item in skills) or "- none"
    )
    return (
        "You are the assistant embedded in the user's Second Brain: calendar, notes, food "
        f"and fitness.\nCurrent UTC date/time: {datetime.now(UTC).isoformat()}\n"
        f"Memories:\n{facts}\nSkills (load one when relevant):\n{index}\n"
        "Search before answering from memory and prefer search_pages over guessing. Writes "
        "are proposals requiring confirmation; never claim they happened before confirmation. "
        "Be concise and direct, and reply in the user's language."
    )
