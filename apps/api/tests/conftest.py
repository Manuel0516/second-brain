from collections.abc import AsyncIterator
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool

from app.database import get_async_session
from app.main import app
from app.models import Base, User
from app.modules.ai import agent
from app.security import hash_password


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


_test_counter = 0


@pytest.fixture
async def test_engine() -> AsyncIterator[AsyncEngine]:
    """Create an in-memory SQLite database for testing."""
    global _test_counter
    _test_counter += 1

    # Use a unique shared in-memory database for each test
    db_name = f"test_{_test_counter}"
    engine = create_async_engine(
        f"sqlite+aiosqlite:///file:{db_name}?mode=memory&cache=shared&uri=true",
        poolclass=StaticPool,
        echo=False,
        connect_args={"timeout": 15, "check_same_thread": False},
    )

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield engine

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    await engine.dispose()


@pytest.fixture
async def test_db_session(test_engine: AsyncEngine) -> AsyncIterator[AsyncSession]:
    """Create a database session for testing."""
    async_session_factory = async_sessionmaker(
        test_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    async with async_session_factory() as session:
        yield session


@pytest.fixture
async def client(test_engine: AsyncEngine) -> AsyncIterator[AsyncClient]:
    """Create a test client with a mocked database."""
    # Create a test session factory
    test_session_factory = async_sessionmaker(
        test_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    async def override_get_session() -> AsyncIterator[AsyncSession]:
        async with test_session_factory() as session:
            yield session

    app.dependency_overrides[get_async_session] = override_get_session

    # agent.run_detached opens its own session outside any request — point it at the
    # test database too, same reasoning as overriding get_async_session above.
    agent.session_factory = test_session_factory

    # Reset rate limiter for testing
    from app.dependencies import _login_attempts

    _login_attempts.clear()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as test_client:
        yield test_client

    app.dependency_overrides.clear()
    _login_attempts.clear()


@pytest.fixture
async def test_user(test_db_session: AsyncSession) -> User:
    """Create a test user in the database."""
    user = User(
        id=str(uuid4()),
        username="testuser",
        email="test@example.com",
        password_hash=hash_password("testpassword123"),
        is_active=True,
    )
    test_db_session.add(user)
    await test_db_session.commit()
    await test_db_session.refresh(user)
    return user
