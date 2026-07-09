from datetime import UTC, date, datetime
from uuid import uuid4

from sqlalchemy import (
    JSON,
    UUID,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    totp_secret: Mapped[str | None] = mapped_column(String(255), nullable=True)
    role: Mapped[str] = mapped_column(String(20), default="user", nullable=False)
    is_test_account: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )

    refresh_tokens: Mapped[list["RefreshToken"]] = relationship(
        "RefreshToken", back_populates="user"
    )
    calendars: Mapped[list["Calendar"]] = relationship("Calendar", back_populates="user")
    settings: Mapped["UserSettings | None"] = relationship(
        "UserSettings", back_populates="user", uselist=False
    )


class LoginAttempt(Base):
    __tablename__ = "login_attempts"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    ip_address: Mapped[str] = mapped_column(String(45), nullable=False, index=True)
    success: Mapped[bool] = mapped_column(Boolean, nullable=False)
    attempted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
        index=True,
    )


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id"), nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )

    user: Mapped["User"] = relationship("User", back_populates="refresh_tokens")


class Calendar(Base):
    __tablename__ = "calendars"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    color: Mapped[str] = mapped_column(String(7), nullable=False)  # hex color
    is_visible: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # "local" | "google" | "ics" — value set enforced in the API layer.
    source: Mapped[str] = mapped_column(String(20), default="local", nullable=False)
    # Google sync (source="google"): calendar id, Fernet-encrypted refresh token,
    # incremental-sync cursor. ICS subscription (source="ics"): feed URL.
    google_calendar_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    google_refresh_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    sync_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    # "pull" (Google -> app only, default) | "push" (two-way). Google calendars only.
    sync_direction: Mapped[str] = mapped_column(
        String(4), default="pull", server_default="pull", nullable=False
    )
    ics_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )

    user: Mapped["User"] = relationship("User", back_populates="calendars")
    events: Mapped[list["CalendarEvent"]] = relationship("CalendarEvent", back_populates="calendar")


class CalendarEvent(Base):
    __tablename__ = "calendar_events"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    calendar_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("calendars.id"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    icon: Mapped[str | None] = mapped_column(String(32), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    all_day: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    timezone: Mapped[str] = mapped_column(String(63), default="UTC", nullable=False)
    color_override: Mapped[str | None] = mapped_column(String(7), nullable=True)
    link: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    reminder_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # rrule holds the frequency: DAILY / WEEKLY / MONTHLY / YEARLY.
    rrule: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Recurrence rule (single stored row + on-read expansion):
    #  - recurrence_interval: repeat every N freq units
    #  - recurrence_byday: weekday codes for weekly rules, e.g. ["MO","WE"]
    #  - recurrence_count: stop after N occurrences (mutually exclusive with until)
    #  - recurrence_until: series stops before this occurrence ("this and following")
    #  - recurrence_exdates: occurrence starts skipped during expansion
    #  - recurrence_parent_id / recurrence_overridden_at: override row for one occurrence
    recurrence_interval: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    recurrence_byday: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    recurrence_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    recurrence_until: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    recurrence_exdates: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    recurrence_parent_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("calendar_events.id"), nullable=True
    )
    recurrence_overridden_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    connections: Mapped[dict[str, object]] = mapped_column(JSON, default=dict, nullable=False)
    # ponytail: tag system events (workout logs, meal logs) to distinguish
    # auto-created calendar entries from user-created ones.
    created_by: Mapped[str] = mapped_column(String(50), default="user", nullable=False)
    # Sync provenance. external_id holds the foreign system's stable event id
    # (Google event id or ICS UID). Unique per calendar via partial index (024).
    external_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    google_etag: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # "user" | "google" | "ics" — value set enforced in the API layer.
    source: Mapped[str] = mapped_column(
        String(20), default="user", server_default="user", nullable=False
    )
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )

    calendar: Mapped["Calendar"] = relationship("Calendar", back_populates="events")


class UserSettings(Base):
    __tablename__ = "user_settings"

    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id"), primary_key=True
    )
    # Appearance / general
    theme: Mapped[str] = mapped_column(String(10), default="system", nullable=False)
    timezone: Mapped[str] = mapped_column(String(63), default="Europe/Stockholm", nullable=False)
    week_start: Mapped[str] = mapped_column(String(8), default="monday", nullable=False)
    default_view: Mapped[str] = mapped_column(String(8), default="week", nullable=False)
    time_format: Mapped[str] = mapped_column(String(3), default="24h", nullable=False)
    # Calendar
    favorite_emojis: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    favorite_colors: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    default_event_minutes: Mapped[int] = mapped_column(Integer, default=60, nullable=False)
    default_calendar_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("calendars.id", ondelete="SET NULL"), nullable=True
    )
    default_reminder_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    show_weekends: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    dim_past_events: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # Notes editor
    notes_bullet_style: Mapped[str] = mapped_column(String(16), default="disc", nullable=False)
    notes_numbered_style: Mapped[str] = mapped_column(String(16), default="decimal", nullable=False)
    favorite_text_colors: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    favorite_highlight_colors: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    favorite_block_colors: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    favorite_covers: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    # Fitness
    fitness_rest_seconds: Mapped[int] = mapped_column(Integer, default=90, nullable=False)
    fitness_auto_start_rest: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    fitness_weight_unit: Mapped[str] = mapped_column(String(3), default="kg", nullable=False)
    fitness_weekly_session_target: Mapped[int | None] = mapped_column(Integer, nullable=True)
    fitness_stats_range_days: Mapped[int] = mapped_column(
        Integer, nullable=False, default=90, server_default="90"
    )
    # Food
    food_daily_meal_goal: Mapped[int] = mapped_column(
        Integer, nullable=False, default=5, server_default="5"
    )
    food_calorie_target: Mapped[int | None] = mapped_column(Integer, nullable=True)
    food_protein_target_g: Mapped[float | None] = mapped_column(Float, nullable=True)
    food_carbs_target_g: Mapped[float | None] = mapped_column(Float, nullable=True)
    food_fat_target_g: Mapped[float | None] = mapped_column(Float, nullable=True)
    food_water_target_units: Mapped[int | None] = mapped_column(Integer, nullable=True)
    food_veg_target_units: Mapped[int | None] = mapped_column(Integer, nullable=True)
    food_fruit_target_units: Mapped[int | None] = mapped_column(Integer, nullable=True)
    food_stats_range_days: Mapped[int] = mapped_column(
        Integer, nullable=False, default=90, server_default="90"
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )

    user: Mapped["User"] = relationship("User", back_populates="settings")


class Page(Base):
    __tablename__ = "pages"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id"), nullable=False, index=True
    )
    parent_page_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("pages.id"), nullable=True, index=True
    )
    title: Mapped[str] = mapped_column(String(255), default="Untitled", nullable=False)
    icon: Mapped[str | None] = mapped_column(String(16), nullable=True)
    # ponytail: one JSON doc per page; split into blocks only if scale demands it.
    content: Mapped[dict[str, object]] = mapped_column(JSON, default=dict, nullable=False)
    position: Mapped[str] = mapped_column(String(255), default="a0", nullable=False)
    type: Mapped[str] = mapped_column(String(16), default="page", nullable=False)
    is_template: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Preset token ("gradient:3") or an image URL — no FK so covers work without files.
    cover: Mapped[str | None] = mapped_column(String(512), nullable=True)
    # ponytail: record property values as JSON keyed by property id; extract a
    # values table only if server-side querying at scale demands it.
    properties: Mapped[dict[str, object]] = mapped_column(JSON, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ResourceShare(Base):
    """An explicit account grant for a calendar or page."""

    __tablename__ = "resource_shares"
    __table_args__ = (
        UniqueConstraint("resource_type", "resource_id", "recipient_user_id"),
        Index("ix_resource_shares_recipient", "recipient_user_id", "resource_type"),
        Index("ix_resource_shares_resource", "resource_type", "resource_id"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    resource_type: Mapped[str] = mapped_column(String(16), nullable=False)
    resource_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    recipient_user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[str] = mapped_column(String(8), nullable=False)
    # Recipient-only overrides for calendar shares. Null = inherit the
    # owner's Calendar.is_visible / Calendar.color.
    visible: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    color: Mapped[str | None] = mapped_column(String(7), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )


class NoteCollaborationUpdate(Base):
    """Opaque Yjs update bytes; clients merge them into the note CRDT."""

    __tablename__ = "note_collaboration_updates"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    page_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("pages.id", ondelete="CASCADE"), nullable=False, index=True
    )
    update: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )


class DatabaseProperty(Base):
    __tablename__ = "database_properties"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    page_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("pages.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(String(32), nullable=False)
    config: Mapped[dict[str, object]] = mapped_column(JSON, default=dict, nullable=False)
    position: Mapped[str] = mapped_column(String(255), default="a0", nullable=False)


class DatabaseView(Base):
    __tablename__ = "database_views"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    page_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("pages.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), default="Table", nullable=False)
    type: Mapped[str] = mapped_column(String(32), default="table", nullable=False)
    # ponytail: filters/sort/group_by/visible props in one config blob; split
    # into columns only if they need server-side querying.
    config: Mapped[dict[str, object]] = mapped_column(JSON, default=dict, nullable=False)
    position: Mapped[str] = mapped_column(String(255), default="a0", nullable=False)


class File(Base):
    __tablename__ = "files"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    size: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )


class Link(Base):
    __tablename__ = "links"
    __table_args__ = (
        UniqueConstraint(
            "source_type",
            "source_id",
            "target_type",
            "target_id",
            "relation",
            name="uq_links_edge",
        ),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    source_type: Mapped[str] = mapped_column(String(50), nullable=False)
    source_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False, index=True)
    target_type: Mapped[str] = mapped_column(String(50), nullable=False)
    target_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False, index=True)
    relation: Mapped[str] = mapped_column(String(100), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )


class Exercise(Base):
    __tablename__ = "exercises"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str] = mapped_column(String(20), nullable=False)
    unit: Mapped[str] = mapped_column(String(20), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )


class WorkoutSession(Base):
    __tablename__ = "workout_sessions"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id"), nullable=False
    )
    date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    type: Mapped[str] = mapped_column(String(255), nullable=False)
    # Lifecycle: 'planned' | 'active' | 'completed'. Value set enforced in the API layer.
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="completed", server_default="completed"
    )
    # Mirrors the linked calendar event's start for planned sessions; null otherwise.
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Intended exercise list for a planned session, free-form until logged.
    plan: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    notes: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )


class SetEntry(Base):
    __tablename__ = "set_entries"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    workout_session_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("workout_sessions.id"), nullable=False
    )
    exercise_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("exercises.id"), nullable=False
    )
    set_number: Mapped[int] = mapped_column(Integer, nullable=False)
    # Nullable since 018: cardio sets have no rep count.
    reps: Mapped[int | None] = mapped_column(Integer, nullable=True)
    weight: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Cardio fields (018). Pace is derived (duration/distance), never stored.
    distance_km: Mapped[float | None] = mapped_column(Float, nullable=True)
    duration_min: Mapped[float | None] = mapped_column(Float, nullable=True)
    rpe: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Subjective per-set rating, 1 (dying/too tired) .. 5 (felt great).
    feeling: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )


class BodyMetric(Base):
    __tablename__ = "body_metrics"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id"), nullable=False
    )
    date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    weight: Mapped[float | None] = mapped_column(Float, nullable=True)
    measurements: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )


class Goal(Base):
    """User-defined fitness goals — target_type points at exercise or body metric."""

    __tablename__ = "goals"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id"), nullable=False
    )
    target_type: Mapped[str] = mapped_column(
        String(20), nullable=False
    )  # "exercise_max", "exercise_reps", "body_metric"
    exercise_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("exercises.id"), nullable=True
    )
    metric_key: Mapped[str | None] = mapped_column(
        String(50), nullable=True
    )  # e.g. "weight", "bench_press_1rm"
    target_value: Mapped[float] = mapped_column(Float, nullable=False)
    target_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    order_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )
    # ponytail: no relationships — routes query directly


class MealLog(Base):
    """One row per meal — planned or logged. Photos stored via the files table."""

    __tablename__ = "meal_logs"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id"), nullable=False
    )
    date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    meal_type: Mapped[str] = mapped_column(
        String(20), nullable=False
    )  # "breakfast"|"lunch"|"dinner"|"snack" — enforced in API layer
    slot_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="planned", server_default="planned"
    )  # "planned"|"logged"
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    logged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    photo_file_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("files.id"), nullable=True
    )
    calories: Mapped[float | None] = mapped_column(Float, nullable=True)
    protein_g: Mapped[float | None] = mapped_column(Float, nullable=True)
    carbs_g: Mapped[float | None] = mapped_column(Float, nullable=True)
    fat_g: Mapped[float | None] = mapped_column(Float, nullable=True)
    water_units: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    veg_units: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    fruit_units: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_items: Mapped[list[dict[str, object]] | None] = mapped_column(
        JSON, nullable=True
    )  # raw AI item breakdown [{name, quantity, calories, ...}]
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )


class FoodDailyExtras(Base):
    """Per-day quick-log totals for water, vegetables, and fruit outside meals."""

    __tablename__ = "food_daily_extras"
    __table_args__ = (UniqueConstraint("user_id", "date", name="uq_food_daily_extras_user_date"),)

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id"), nullable=False
    )
    date: Mapped[date] = mapped_column(Date, nullable=False)
    water_units: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    veg_units: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    fruit_units: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )
