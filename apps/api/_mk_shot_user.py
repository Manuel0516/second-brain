"""Throwaway: insert an isolated no-2FA test user for visual screenshots.
Deleted after use. Does not touch the real account."""
import asyncio
from sqlalchemy import select
from app.database import async_session_factory
from app.models import User, Calendar
from app.security import hash_password

EMAIL = "shots@local"
USERNAME = "shots"
PASSWORD = "shotpass123"


async def main() -> None:
    async with async_session_factory() as s:
        existing = await s.scalar(select(User).where(User.email == EMAIL))
        if existing:
            print("exists:", existing.id)
            return
        u = User(
            username=USERNAME,
            email=EMAIL,
            password_hash=hash_password(PASSWORD),
            totp_secret=None,
            role="user",
            is_test_account=True,
        )
        s.add(u)
        await s.flush()
        s.add(Calendar(user_id=u.id, name="Personal", color="#8B5CF6", source="local"))
        await s.commit()
        print("created:", u.id)


asyncio.run(main())
