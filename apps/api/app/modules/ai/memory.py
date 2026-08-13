from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AIMemory, AISkill


async def remember(session: AsyncSession, user_id: str, fact: str) -> str:
    session.add(AIMemory(user_id=user_id, fact=fact))
    await session.commit()
    return "Remembered."


async def recall(session: AsyncSession, user_id: str) -> list[str]:
    return list(
        (await session.execute(select(AIMemory.fact).where(AIMemory.user_id == user_id))).scalars()
    )


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
