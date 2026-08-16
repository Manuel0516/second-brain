"""The agent must not be able to silently wipe a note.

PATCH /api/pages/{id} replaces `content` wholesale, so an update_page carrying only
part of the document destroys the rest. See history 0256.
"""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User
from app.modules.ai import tools

pytestmark = pytest.mark.anyio


@pytest.fixture(autouse=True)
async def internal_api(client: AsyncClient):
    """tools._api calls the app's own routes; in tests that has to go through the
    test client rather than a real socket."""
    tools.request_factory = lambda: client
    yield
    tools.request_factory = None


async def login(client: AsyncClient) -> None:
    response = await client.post(
        "/api/auth/login", json={"email": "test@example.com", "password": "testpassword123"}
    )
    assert response.status_code == 200


def _doc(text: str) -> dict:
    return {
        "type": "doc",
        "content": [{"type": "paragraph", "content": [{"type": "text", "text": text}]}],
    }


async def _page(client: AsyncClient, text: str) -> str:
    created = await client.post("/api/pages", json={"title": "Shopping list"})
    page_id = created.json()["id"]
    await client.patch(f"/api/pages/{page_id}", json={"content": _doc(text)})
    return page_id


async def test_update_page_refuses_to_delete_most_of_a_note(
    client: AsyncClient, test_user: User, test_db_session: AsyncSession
) -> None:
    await login(client)
    page_id = await _page(client, "x" * 600)

    result = await tools.execute(
        "update_page", {"id": page_id, "content": _doc("y" * 20)}, test_db_session, test_user.id
    )
    assert result["ok"] is False
    assert "Refused" in result["summary"]
    assert "append_page_content" in result["summary"]

    # The page must be untouched.
    current = (await client.get(f"/api/pages/{page_id}")).json()
    assert tools._doc_text(current["content"]) == "x" * 600


async def test_update_page_allows_a_genuine_edit(
    client: AsyncClient, test_user: User, test_db_session: AsyncSession
) -> None:
    """Resending the whole document with a change applied is the correct pattern and
    must not be blocked."""
    await login(client)
    page_id = await _page(client, "x" * 600)

    result = await tools.execute(
        "update_page",
        {"id": page_id, "content": _doc("x" * 600 + " plus a new line")},
        test_db_session,
        test_user.id,
    )
    assert result["ok"] is True


async def test_short_pages_are_not_guarded(
    client: AsyncClient, test_user: User, test_db_session: AsyncSession
) -> None:
    """A nearly-empty page has nothing worth protecting; the guard must not get in the
    way of normal early edits."""
    await login(client)
    page_id = await _page(client, "short note")

    result = await tools.execute(
        "update_page", {"id": page_id, "content": _doc("")}, test_db_session, test_user.id
    )
    assert result["ok"] is True, result["summary"]


async def test_doc_text_walks_nested_blocks() -> None:
    nested = {
        "type": "doc",
        "content": [
            {
                "type": "bulletList",
                "content": [
                    {
                        "type": "listItem",
                        "content": [
                            {"type": "paragraph", "content": [{"type": "text", "text": "milk"}]}
                        ],
                    }
                ],
            }
        ],
    }
    assert tools._doc_text(nested) == "milk"
