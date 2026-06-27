from collections.abc import AsyncIterator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.exc import OperationalError

from app.main import app

pytestmark = pytest.mark.anyio


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture
async def client() -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as test_client:
        yield test_client


async def test_health(client: AsyncClient) -> None:
    response = await client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


async def test_ready_when_database_is_available(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def available() -> None:
        return None

    monkeypatch.setattr("app.main.check_database", available)

    response = await client.get("/api/ready")

    assert response.status_code == 200
    assert response.json() == {"status": "ready"}


async def test_not_ready_when_database_is_unavailable(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def unavailable() -> None:
        raise OperationalError("SELECT 1", {}, Exception("database unavailable"))

    monkeypatch.setattr("app.main.check_database", unavailable)

    response = await client.get("/api/ready")

    assert response.status_code == 503
    assert response.json() == {"detail": "Service unavailable"}
