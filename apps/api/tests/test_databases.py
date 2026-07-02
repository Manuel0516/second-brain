from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import DatabaseProperty, Page, User
from app.security import hash_password

pytestmark = pytest.mark.anyio


async def _user_and_token(
    client: AsyncClient, session: AsyncSession, name: str
) -> tuple[User, str]:
    user = User(
        id=str(uuid4()),
        username=name,
        email=f"{name}@example.com",
        password_hash=hash_password("testpassword123"),
        is_active=True,
    )
    session.add(user)
    await session.commit()
    response = await client.post(
        "/api/auth/login",
        json={"email": user.email, "password": "testpassword123"},
    )
    assert response.status_code == 200
    token = response.cookies.get("access_token")
    assert token
    return user, token


async def _database(client: AsyncClient, token: str, title: str = "Tasks") -> str:
    created = await client.post(
        "/api/pages",
        json={"title": title, "type": "database"},
        cookies={"access_token": token},
    )
    assert created.status_code == 201
    assert created.json()["type"] == "database"
    page_id: str = created.json()["id"]
    return page_id


async def test_property_and_view_crud_with_ownership(
    client: AsyncClient, test_db_session: AsyncSession
) -> None:
    _, owner = await _user_and_token(client, test_db_session, "db-owner")
    _, other = await _user_and_token(client, test_db_session, "db-other")
    database_id = await _database(client, owner)

    created = await client.post(
        f"/api/pages/{database_id}/properties",
        json={"name": "Status", "type": "select", "config": {"options": ["Todo", "Done"]}},
        cookies={"access_token": owner},
    )
    assert created.status_code == 201
    property_id = created.json()["id"]

    patched = await client.patch(
        f"/api/properties/{property_id}",
        json={"name": "State"},
        cookies={"access_token": owner},
    )
    assert patched.status_code == 200
    assert patched.json()["name"] == "State"

    view = await client.post(
        f"/api/pages/{database_id}/views",
        json={"name": "Board", "type": "board", "config": {"group_by": property_id}},
        cookies={"access_token": owner},
    )
    assert view.status_code == 201
    view_id = view.json()["id"]

    # Trust boundary: another user can neither read nor mutate the schema.
    for response in (
        await client.get(f"/api/pages/{database_id}/properties", cookies={"access_token": other}),
        await client.patch(
            f"/api/properties/{property_id}", json={"name": "X"}, cookies={"access_token": other}
        ),
        await client.delete(f"/api/views/{view_id}", cookies={"access_token": other}),
    ):
        assert response.status_code == 404

    assert (
        await client.delete(f"/api/views/{view_id}", cookies={"access_token": owner})
    ).status_code == 204
    assert (
        await client.delete(f"/api/properties/{property_id}", cookies={"access_token": owner})
    ).status_code == 204


async def test_properties_require_database_page(
    client: AsyncClient, test_db_session: AsyncSession
) -> None:
    _, owner = await _user_and_token(client, test_db_session, "db-plain")
    plain = await client.post("/api/pages", json={"title": "Note"}, cookies={"access_token": owner})
    response = await client.post(
        f"/api/pages/{plain.json()['id']}/properties",
        json={"name": "Status", "type": "text"},
        cookies={"access_token": owner},
    )
    assert response.status_code == 422


async def test_duplicate_copies_subtree_and_remaps_property_ids(
    client: AsyncClient, test_db_session: AsyncSession
) -> None:
    _, owner = await _user_and_token(client, test_db_session, "db-dup")
    database_id = await _database(client, owner)
    prop = await client.post(
        f"/api/pages/{database_id}/properties",
        json={"name": "Done", "type": "checkbox"},
        cookies={"access_token": owner},
    )
    property_id = prop.json()["id"]
    record = await client.post(
        "/api/pages",
        json={"title": "Ship it", "parent_page_id": database_id},
        cookies={"access_token": owner},
    )
    await client.patch(
        f"/api/pages/{record.json()['id']}",
        json={"properties": {property_id: True}},
        cookies={"access_token": owner},
    )
    await client.patch(
        f"/api/pages/{database_id}",
        json={"is_template": True},
        cookies={"access_token": owner},
    )

    duplicated = await client.post(
        f"/api/pages/{database_id}/duplicate", cookies={"access_token": owner}
    )
    assert duplicated.status_code == 201
    clone = duplicated.json()
    assert clone["id"] != database_id
    assert clone["is_template"] is False

    clone_props = (
        await client.get(f"/api/pages/{clone['id']}/properties", cookies={"access_token": owner})
    ).json()
    assert len(clone_props) == 1
    assert clone_props[0]["id"] != property_id

    pages = (await client.get("/api/pages", cookies={"access_token": owner})).json()
    clone_records = [p for p in pages if p["parent_page_id"] == clone["id"]]
    assert len(clone_records) == 1
    # The record's value is keyed by the *cloned* property id.
    assert clone_records[0]["properties"] == {clone_props[0]["id"]: True}


async def test_trash_purges_pages_older_than_thirty_days(
    client: AsyncClient, test_db_session: AsyncSession
) -> None:
    user, owner = await _user_and_token(client, test_db_session, "db-purge")
    database_id = await _database(client, owner)
    await client.post(
        f"/api/pages/{database_id}/properties",
        json={"name": "Done", "type": "checkbox"},
        cookies={"access_token": owner},
    )
    assert (
        await client.delete(f"/api/pages/{database_id}", cookies={"access_token": owner})
    ).status_code == 204
    await test_db_session.execute(
        update(Page)
        .where(Page.id == database_id)
        .values(deleted_at=datetime.now(UTC) - timedelta(days=31))
    )
    await test_db_session.commit()

    trash = await client.get("/api/pages/trash", cookies={"access_token": owner})
    assert trash.status_code == 200
    assert trash.json() == []
    assert (await test_db_session.scalar(select(Page).where(Page.id == database_id))) is None
    assert (
        await test_db_session.scalar(
            select(DatabaseProperty).where(DatabaseProperty.page_id == database_id)
        )
    ) is None
    assert user is not None
