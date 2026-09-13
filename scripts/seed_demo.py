"""Create a local-only showcase account with deterministic demo data.

Run from the repository root after migrations:

    uv run --directory apps/api python ../../scripts/seed_demo.py
"""

import asyncio
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "apps/api"))

from app.config import get_settings
from app.database import async_session_factory
from app.models import (
    BodyMetric,
    Calendar,
    CalendarEvent,
    Exercise,
    FoodDailyExtras,
    Goal,
    Link,
    MealLog,
    Page,
    SetEntry,
    User,
    UserSettings,
    WorkoutSession,
)
from app.security import hash_password

DEMO_EMAIL = "demo@example.com"
DEMO_PASSWORD = "second-brain-demo"


async def ensure_demo_workout_link(session: AsyncSession, user: User) -> bool:
    """Add the showcase event → planned-workout edge when it is missing."""
    event = await session.scalar(
        select(CalendarEvent)
        .join(Calendar, Calendar.id == CalendarEvent.calendar_id)
        .where(Calendar.user_id == user.id, CalendarEvent.title == "💪 Push session")
    )
    if event is None:
        return False
    existing_link = await session.scalar(
        select(Link).where(
            Link.source_type == "event",
            Link.source_id == event.id,
            Link.target_type == "workout_session",
            Link.relation == "logged_from",
        )
    )
    if existing_link is not None:
        return False

    workout = WorkoutSession(
        id=str(uuid4()),
        user_id=user.id,
        date=event.start_at,
        type="Push",
        status="planned",
        scheduled_at=event.start_at,
        plan=["Bench Press", "Overhead Press", "Lateral Raises"],
        notes=note_doc(paragraph("Focus on controlled reps and leave one rep in reserve.")),
    )
    session.add(workout)
    await session.flush()
    session.add(
        Link(
            id=str(uuid4()),
            source_type="event",
            source_id=event.id,
            target_type="workout_session",
            target_id=workout.id,
            relation="logged_from",
        )
    )
    return True


def text_node(text: str, *, bold: bool = False) -> dict[str, object]:
    node: dict[str, object] = {"type": "text", "text": text}
    if bold:
        node["marks"] = [{"type": "bold"}]
    return node


def note_doc(*nodes: dict[str, object]) -> dict[str, object]:
    return {"type": "doc", "content": list(nodes)}


def paragraph(text: str) -> dict[str, object]:
    return {"type": "paragraph", "content": [text_node(text)]}


def heading(text: str, level: int = 2) -> dict[str, object]:
    return {
        "type": "heading",
        "attrs": {"level": level},
        "content": [text_node(text)],
    }


def task(text: str, checked: bool) -> dict[str, object]:
    return {
        "type": "taskList",
        "content": [
            {
                "type": "taskItem",
                "attrs": {"checked": checked},
                "content": [paragraph(text)],
            }
        ],
    }


async def seed() -> None:
    settings = get_settings()
    if settings.environment == "prod":
        raise RuntimeError("Demo data seeding is disabled in production.")

    async with async_session_factory() as session:
        existing = await session.scalar(select(User).where(User.email == DEMO_EMAIL))
        if existing:
            linked = await ensure_demo_workout_link(session, existing)
            await session.commit()
            print(f"Demo account already exists: {DEMO_EMAIL}")
            if linked:
                print("Added showcase event → planned workout link")
            return

        user = User(
            id=str(uuid4()),
            username="demo_showcase",
            email=DEMO_EMAIL,
            password_hash=hash_password(DEMO_PASSWORD),
            role="admin",
            is_test_account=True,
        )
        session.add(user)
        # ponytail: flush once so models without ORM relationships can reference the user.
        await session.flush()

        settings_row = UserSettings(
            user_id=user.id,
            theme="dark",
            timezone="Europe/Stockholm",
            week_start="monday",
            default_view="week",
            time_format="24h",
            visual_style="neon",
            favorite_emojis=["🧠", "💪", "🥗", "🚀", "📚"],
            favorite_colors=["#67e8f9", "#a78bfa", "#fb7185", "#4ade80"],
            default_event_minutes=60,
            show_weekends=True,
            dim_past_events=True,
            fitness_rest_seconds=90,
            fitness_auto_start_rest=True,
            fitness_weekly_session_target=4,
            fitness_stats_range_days=90,
            food_daily_meal_goal=4,
            food_calorie_target=2400,
            food_protein_target_g=170,
            food_carbs_target_g=260,
            food_fat_target_g=75,
            food_water_target_units=8,
            food_veg_target_units=5,
            food_fruit_target_units=3,
            food_stats_range_days=30,
        )
        session.add(settings_row)

        calendars = {
            "Personal": Calendar(
                id=str(uuid4()), user_id=user.id, name="Personal", color="#67e8f9"
            ),
            "Deep work": Calendar(
                id=str(uuid4()), user_id=user.id, name="Deep work", color="#a78bfa"
            ),
            "Health": Calendar(id=str(uuid4()), user_id=user.id, name="Health", color="#4ade80"),
        }
        session.add_all(calendars.values())
        settings_row.default_calendar_id = calendars["Personal"].id

        today = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
        monday = today - timedelta(days=today.weekday())
        events = [
            (
                "🚀 Weekly planning",
                "Deep work",
                0,
                8,
                30,
                60,
                "Set the week up with three clear outcomes.",
            ),
            (
                "🧠 Product deep work",
                "Deep work",
                0,
                10,
                0,
                120,
                "Design and build without interruptions.",
            ),
            ("🥗 Lunch with Maya", "Personal", 0, 13, 0, 60, "Try the new seasonal menu."),
            (
                "💪 Push session",
                "Health",
                1,
                7,
                30,
                75,
                "Bench press · overhead press · accessories",
            ),
            ("📚 Read & annotate", "Personal", 1, 19, 0, 75, "Atomic Habits — chapter notes."),
            ("✨ Creative sprint", "Deep work", 2, 9, 0, 150, "Prototype the new capture flow."),
            ("🚶 Walk & voice notes", "Health", 2, 16, 30, 45, "Collect ideas away from the desk."),
            (
                "🤝 Project review",
                "Deep work",
                3,
                11,
                0,
                60,
                "Review milestones and unblock next steps.",
            ),
            ("🏃 Easy 5K", "Health", 3, 18, 0, 45, "Conversational pace."),
            (
                "🧘 Weekly reflection",
                "Personal",
                4,
                16,
                0,
                60,
                "Wins, lessons, and next-week intentions.",
            ),
            ("🌿 Offline afternoon", "Personal", 5, 12, 0, 240, "Hike, camera, no notifications."),
        ]
        for title, calendar_name, day, hour, minute, duration, description in events:
            start = monday + timedelta(days=day, hours=hour, minutes=minute)
            session.add(
                CalendarEvent(
                    id=str(uuid4()),
                    calendar_id=calendars[calendar_name].id,
                    title=title,
                    description=description,
                    start_at=start,
                    end_at=start + timedelta(minutes=duration),
                    timezone="Europe/Stockholm",
                    reminder_minutes=15,
                )
            )

        home = Page(
            id=str(uuid4()),
            user_id=user.id,
            title="Life dashboard",
            icon="🧠",
            cover="gradient:4",
            position="a0",
            content=note_doc(
                paragraph("A calm place to think, plan, and connect the moving parts of life."),
                heading("This week"),
                task("Ship the public project page", True),
                task("Finish the capture-flow prototype", False),
                task("Plan Saturday's offline hike", False),
                heading("Current focus"),
                paragraph(
                    "Make the important work visible, keep capture friction low, "
                    "and leave room for recovery."
                ),
            ),
        )
        ideas = Page(
            id=str(uuid4()),
            user_id=user.id,
            parent_page_id=home.id,
            title="Ideas worth building",
            icon="✨",
            cover="gradient:2",
            position="a1",
            content=note_doc(
                heading("A capture inbox", 1),
                paragraph(
                    "Turn quick thoughts into calendar blocks, notes, workouts, "
                    "or meals from one command surface."
                ),
                heading("Design principles"),
                paragraph("Fast by default. Calm on purpose. Every object can connect to another."),
            ),
        )
        reading = Page(
            id=str(uuid4()),
            user_id=user.id,
            parent_page_id=home.id,
            title="Reading notes",
            icon="📚",
            position="a2",
            content=note_doc(
                heading("Atomic Habits", 1),
                paragraph(
                    "Systems make good outcomes repeatable. Make the desired action "
                    "obvious and easy."
                ),
                heading("Questions"),
                paragraph(
                    "What environment changes would make deep work the path of least resistance?"
                ),
            ),
        )
        session.add_all([home, ideas, reading])

        exercise_specs = [
            ("Bench Press", "strength", "reps+weight", 72.5),
            ("Squat", "strength", "reps+weight", 90.0),
            ("Deadlift", "strength", "reps+weight", 110.0),
            ("Overhead Press", "strength", "reps+weight", 45.0),
            ("Pull-ups", "strength", "reps", 0.0),
            ("Easy Run", "cardio", "distance+duration", 0.0),
        ]
        exercises: dict[str, Exercise] = {}
        for name, category, unit, _ in exercise_specs:
            exercise = Exercise(
                id=str(uuid4()),
                user_id=user.id,
                name=name,
                category=category,
                unit=unit,
            )
            exercises[name] = exercise
            session.add(exercise)
        await session.flush()

        for index, day_offset in enumerate(range(84, 1, -6)):
            when = today - timedelta(days=day_offset) + timedelta(hours=17)
            workout_type = ["Push", "Legs", "Pull"][index % 3]
            exercise_names = {
                "Push": ["Bench Press", "Overhead Press"],
                "Legs": ["Squat"],
                "Pull": ["Deadlift", "Pull-ups"],
            }[workout_type]
            workout = WorkoutSession(
                id=str(uuid4()),
                user_id=user.id,
                date=when,
                type=workout_type,
                status="completed",
                notes=note_doc(paragraph("Strong, controlled session.")),
            )
            session.add(workout)
            await session.flush()
            for exercise_name in exercise_names:
                base = next(spec[3] for spec in exercise_specs if spec[0] == exercise_name)
                for set_index, reps in enumerate((8, 7, 6), start=1):
                    progress = 1 + index * 0.012
                    is_bodyweight = exercise_name == "Pull-ups"
                    session.add(
                        SetEntry(
                            id=str(uuid4()),
                            workout_session_id=workout.id,
                            exercise_id=exercises[exercise_name].id,
                            set_number=set_index,
                            reps=reps,
                            weight=None if is_bodyweight else round(base * progress, 1),
                            rpe=min(9, 6 + set_index),
                            feeling=min(5, 3 + (index % 3)),
                        )
                    )

        for day_offset in range(84, -1, -7):
            session.add(
                BodyMetric(
                    id=str(uuid4()),
                    user_id=user.id,
                    date=today - timedelta(days=day_offset) + timedelta(hours=8),
                    weight=round(80.8 - (84 - day_offset) * 0.025, 1),
                    measurements={},
                )
            )

        session.add_all(
            [
                Goal(
                    id=str(uuid4()),
                    user_id=user.id,
                    target_type="exercise_max",
                    exercise_id=exercises["Bench Press"].id,
                    target_value=100,
                    order_index=0,
                ),
                Goal(
                    id=str(uuid4()),
                    user_id=user.id,
                    target_type="exercise_max",
                    exercise_id=exercises["Deadlift"].id,
                    target_value=150,
                    order_index=1,
                ),
                Goal(
                    id=str(uuid4()),
                    user_id=user.id,
                    target_type="body_metric",
                    metric_key="weight",
                    target_value=78,
                    order_index=2,
                ),
            ]
        )

        meal_templates = [
            ("breakfast", 520, 34, 62, 16, "Greek yogurt bowl, berries, oats"),
            ("lunch", 690, 48, 76, 21, "Salmon grain bowl with greens"),
            ("dinner", 760, 56, 82, 24, "Chicken, roasted vegetables, rice"),
            ("snack", 280, 25, 28, 8, "Protein smoothie"),
        ]
        for day_offset in range(13, -1, -1):
            day = today - timedelta(days=day_offset)
            for slot, (meal_type, calories, protein, carbs, fat, notes) in enumerate(
                meal_templates
            ):
                variation = (day_offset % 3 - 1) * 18
                logged_at = day + timedelta(hours=(8, 12, 18, 21)[slot])
                session.add(
                    MealLog(
                        id=str(uuid4()),
                        user_id=user.id,
                        date=day,
                        meal_type=meal_type,
                        slot_index=slot,
                        status="logged",
                        logged_at=logged_at,
                        calories=calories + variation,
                        protein_g=protein,
                        carbs_g=carbs,
                        fat_g=fat,
                        water_units=1,
                        veg_units=2 if meal_type in {"lunch", "dinner"} else 0,
                        fruit_units=1 if meal_type in {"breakfast", "snack"} else 0,
                        notes=notes,
                    )
                )
            session.add(
                FoodDailyExtras(
                    id=str(uuid4()),
                    user_id=user.id,
                    date=day.date(),
                    water_units=4 + day_offset % 3,
                    veg_units=1,
                    fruit_units=1,
                )
            )

        await session.flush()
        await ensure_demo_workout_link(session, user)
        await session.commit()
        print("Demo account created")
        print(f"  email:    {DEMO_EMAIL}")
        print(f"  password: {DEMO_PASSWORD}")


if __name__ == "__main__":
    asyncio.run(seed())
