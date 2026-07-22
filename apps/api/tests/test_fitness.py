from datetime import UTC, datetime

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Exercise, User, WorkoutSession

pytestmark = pytest.mark.anyio


async def test_created_set_preserves_feeling(
    client: AsyncClient, test_db_session: AsyncSession, test_user: User
) -> None:
    exercise = Exercise(
        user_id=test_user.id,
        name="Bench press",
        category="strength",
        unit="reps+weight",
    )
    workout = WorkoutSession(
        user_id=test_user.id,
        date=datetime.now(UTC),
        type="Push",
        notes={},
    )
    test_db_session.add_all([exercise, workout])
    await test_db_session.commit()

    login = await client.post(
        "/api/auth/login",
        json={"email": test_user.email, "password": "testpassword123"},
    )
    cookies = {"access_token": login.cookies["access_token"]}

    created = await client.post(
        f"/api/fitness/sessions/{workout.id}/sets",
        cookies=cookies,
        json={
            "exercise_id": exercise.id,
            "set_number": 1,
            "reps": 8,
            "weight": 70,
            "feeling": 5,
        },
    )

    assert created.status_code == 201
    assert created.json()["feeling"] == 5

    history = await client.get(
        f"/api/fitness/sessions/{workout.id}/sets",
        cookies=cookies,
    )
    assert history.status_code == 200
    assert history.json()[0]["feeling"] == 5
