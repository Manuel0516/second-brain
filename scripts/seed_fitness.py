"""Seed fake fitness data for UI development and chart visibility."""
import asyncio
import sys
from datetime import UTC, datetime, timedelta
from uuid import uuid4

# Allow running from repo root or apps/api
sys.path.insert(0, "apps/api")

from app.database import async_session_factory
from app.models import BodyMetric, Exercise, Goal, SetEntry, User, WorkoutSession

USER_ID = None  # Auto-detect first user if not provided

EXERCISES = [
    ("Bench Press", "strength", "reps+weight"),
    ("Squat", "strength", "reps+weight"),
    ("Deadlift", "strength", "reps+weight"),
    ("Overhead Press", "strength", "reps+weight"),
    ("Pull-ups", "strength", "reps"),
    ("Barbell Row", "strength", "reps+weight"),
    ("Lateral Raises", "strength", "reps+weight"),
    ("Bicep Curls", "strength", "reps+weight"),
    ("Tricep Pushdowns", "strength", "reps+weight"),
    ("Leg Press", "strength", "reps+weight"),
]

SESSION_TYPES = [
    ("Push", ["Bench Press", "Overhead Press", "Lateral Raises", "Tricep Pushdowns"]),
    ("Pull", ["Deadlift", "Pull-ups", "Barbell Row", "Bicep Curls"]),
    ("Legs", ["Squat", "Leg Press", "Romanian Deadlift"]),
]


async def seed(user_id: str | None = None):
    async with async_session_factory() as session:
        from sqlalchemy import select

        if user_id is None:
            first_user = await session.scalar(select(User).limit(1))
            if not first_user:
                print("No users found in database. Create an account first.")
                return
            user_id = first_user.id
            print(f"Using user: {first_user.email} ({user_id[:8]}...)")

        # ── Check if already seeded ──
        existing = await session.scalar(select(Exercise).where(Exercise.user_id == user_id).limit(1))
        if existing:
            print("Already seeded — skipping.")
            return
        ex_map: dict[str, str] = {}
        for name, cat, unit in EXERCISES:
            ex = Exercise(id=str(uuid4()), user_id=user_id, name=name, category=cat, unit=unit)
            session.add(ex)
            ex_map[name] = ex.id
        await session.flush()

        # ── Workout sessions + Set entries (last 14 days) ──
        today = datetime.now(UTC).replace(hour=12, minute=0, second=0, microsecond=0)
        for day_offset in range(14, 0, -1):
            d = today - timedelta(days=day_offset)
            # Skip weekends occasionally (ponytail: realistic pattern)
            if d.weekday() >= 5 and day_offset % 2 == 0:
                continue
            stype, exercises = SESSION_TYPES[day_offset % len(SESSION_TYPES)]
            ws = WorkoutSession(
                id=str(uuid4()),
                user_id=user_id,
                date=d,
                type=stype,
                notes={"type": "doc", "content": []},
            )
            session.add(ws)
            await session.flush()

            # Small progressive overload: weight increases ~1% per session
            base_weight_offset = 1 + (14 - day_offset) * 0.01
            for set_num, ex_name in enumerate(exercises):
                ex_id = ex_map.get(ex_name)
                if not ex_id:
                    continue
                base_w = {
                    "Bench Press": 80, "Squat": 90, "Deadlift": 110,
                    "Overhead Press": 50, "Pull-ups": 0, "Barbell Row": 70,
                    "Lateral Raises": 12, "Bicep Curls": 14, "Tricep Pushdowns": 20,
                    "Leg Press": 140, "Romanian Deadlift": 80,
                }.get(ex_name, 50)
                for rep_set in range(3):
                    w = round(base_w * base_weight_offset, 1) if base_w > 0 else 0
                    reps = max(5, 8 - rep_set)  # 8, 7, 6 pyramid
                    se = SetEntry(
                        id=str(uuid4()),
                        workout_session_id=ws.id,
                        exercise_id=ex_id,
                        set_number=rep_set + 1,
                        reps=reps,
                        weight=w if w > 0 else None,
                        rpe=min(10, 7 + rep_set),
                    )
                    session.add(se)

        # ── Body metrics (last 90 days, ~every 3 days) ──
        start_weight = 80.5
        for day_offset in range(89, -1, -3):
            d = today - timedelta(days=day_offset)
            w = round(start_weight - (89 - day_offset) * 0.03, 1)  # trending down
            bm = BodyMetric(
                id=str(uuid4()),
                user_id=user_id,
                date=d,
                weight=w,
                body_fat_pct=round(14.5 - (89 - day_offset) * 0.015, 1),
                measurements={},
            )
            session.add(bm)

        # ── Goals ──
        goals_data = [
            ("exercise_max", "Bench Press", None, 100.0),
            ("exercise_max", "Squat", None, 120.0),
            ("exercise_max", "Deadlift", None, 150.0),
            ("body_metric", None, "weight", 78.0),
        ]
        for target_type, ex_name, metric_key, target in goals_data:
            g = Goal(
                id=str(uuid4()),
                user_id=user_id,
                target_type=target_type,
                exercise_id=ex_map.get(ex_name) if ex_name else None,
                metric_key=metric_key,
                target_value=target,
            )
            session.add(g)

        await session.commit()
        print(f"Seeded: {len(EXERCISES)} exercises, ~{14 - 4} sessions, body metrics, 4 goals")


if __name__ == "__main__":
    uid = None
    if len(sys.argv) > 2 and sys.argv[1] == "--user":
        uid = sys.argv[2]
    asyncio.run(seed(uid))
