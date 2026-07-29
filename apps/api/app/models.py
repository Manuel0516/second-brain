from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import uuid4

from sqlalchemy import (
    JSON,
    UUID,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    __table_args__ = (Index("ix_users_email", "email"),)

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
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
        UUID(as_uuid=False), ForeignKey("users.id"), nullable=False, index=True
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
        UUID(as_uuid=False), ForeignKey("users.id"), nullable=False, index=True
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
    __table_args__ = (
        Index(
            "ix_calendar_events_calendar_external",
            "calendar_id",
            "external_id",
            unique=True,
            postgresql_where=text("external_id IS NOT NULL"),
        ),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    calendar_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("calendars.id"), nullable=False, index=True
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
    recurrence_byday: Mapped[list[str]] = mapped_column(
        JSON().with_variant(JSONB(), "postgresql"), default=list, nullable=False
    )
    recurrence_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    recurrence_until: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    recurrence_exdates: Mapped[list[str]] = mapped_column(
        JSON().with_variant(JSONB(), "postgresql"), default=list, nullable=False
    )
    recurrence_parent_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey(
            "calendar_events.id",
            name="fk_calendar_events_recurrence_parent",
            ondelete="CASCADE",
        ),
        nullable=True,
    )
    recurrence_overridden_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    connections: Mapped[dict[str, object]] = mapped_column(
        JSON().with_variant(JSONB(), "postgresql"), default=dict, nullable=False
    )
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
    visual_style: Mapped[str] = mapped_column(
        String(16), default="neon", nullable=False, server_default="neon"
    )
    # Calendar
    favorite_emojis: Mapped[list[str]] = mapped_column(
        JSON().with_variant(JSONB(), "postgresql"), default=list, nullable=False
    )
    favorite_colors: Mapped[list[str]] = mapped_column(
        JSON().with_variant(JSONB(), "postgresql"), default=list, nullable=False
    )
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
        UUID(as_uuid=False), ForeignKey("users.id"), nullable=False, index=True
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


class MealLogPhoto(Base):
    """An ordered image attached to one meal log."""

    __tablename__ = "meal_log_photos"
    __table_args__ = (
        UniqueConstraint("file_id", name="uq_meal_log_photos_file"),
        UniqueConstraint("meal_log_id", "position", name="uq_meal_log_photos_position"),
    )

    meal_log_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("meal_logs.id", ondelete="CASCADE"), primary_key=True
    )
    file_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("files.id"), primary_key=True
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)


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


# Finance --------------------------------------------------------------------
#
# ponytail: Finance stays in the existing declarative model module so Alembic,
# tests and ownership conventions keep one source of truth.


class FinanceAccount(Base):
    __tablename__ = "finance_accounts"
    __table_args__ = (
        CheckConstraint(
            "account_type IN ('bank','broker','exchange','wallet','bot','cash')",
            name="ck_finance_accounts_type",
        ),
        CheckConstraint("status IN ('active','closed')", name="ck_finance_accounts_status"),
        Index("ix_finance_accounts_user_status", "user_id", "status"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    institution: Mapped[str] = mapped_column(String(255), nullable=False)
    account_type: Mapped[str] = mapped_column(String(20), nullable=False)
    country_code: Mapped[str] = mapped_column(String(2), nullable=False)
    base_currency: Mapped[str] = mapped_column(String(3), nullable=False)
    tax_jurisdiction: Mapped[str | None] = mapped_column(String(2), nullable=True)
    external_reference_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    provider: Mapped[str] = mapped_column(String(50), default="manual", nullable=False)
    status: Mapped[str] = mapped_column(
        String(16), default="active", server_default="active", nullable=False
    )
    opened_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    attributes: Mapped[dict[str, object]] = mapped_column(
        "metadata", JSON, default=dict, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )


class FinanceAsset(Base):
    __tablename__ = "finance_assets"
    __table_args__ = (
        CheckConstraint(
            "asset_type IN ('fiat','fund','etf','stock','gold','crypto','derivative','other')",
            name="ck_finance_assets_type",
        ),
        UniqueConstraint("user_id", "isin", name="uq_finance_assets_user_isin"),
        UniqueConstraint(
            "user_id",
            "chain_id",
            "contract_address",
            name="uq_finance_assets_user_contract",
        ),
        Index("ix_finance_assets_user_symbol", "user_id", "symbol"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id"), nullable=False
    )
    asset_type: Mapped[str] = mapped_column(String(20), nullable=False)
    symbol: Mapped[str | None] = mapped_column(String(32), nullable=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    isin: Mapped[str | None] = mapped_column(String(12), nullable=True)
    chain_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    contract_address: Mapped[str | None] = mapped_column(String(255), nullable=True)
    issuer_country: Mapped[str | None] = mapped_column(String(2), nullable=True)
    decimals: Mapped[int | None] = mapped_column(Integer, nullable=True)
    attributes: Mapped[dict[str, object]] = mapped_column(
        "metadata", JSON, default=dict, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )


class FinanceSourceConnection(Base):
    __tablename__ = "finance_source_connections"
    __table_args__ = (
        UniqueConstraint("user_id", "account_id", "provider", name="uq_finance_source_connection"),
        CheckConstraint(
            "status IN ('disabled','active','error','revoked')",
            name="ck_finance_source_connections_status",
        ),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id"), nullable=False
    )
    account_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("finance_accounts.id"), nullable=False
    )
    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    credential_reference_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    permission_scope: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    status: Mapped[str] = mapped_column(
        String(16), default="disabled", server_default="disabled", nullable=False
    )
    last_cursor: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error_summary: Mapped[dict[str, object]] = mapped_column(JSON, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )


class FinanceEvidenceDocument(Base):
    __tablename__ = "finance_evidence_documents"
    __table_args__ = (
        UniqueConstraint("user_id", "sha256", name="uq_finance_evidence_user_hash"),
        CheckConstraint(
            "extraction_status IN ('not_requested','pending','complete','failed')",
            name="ck_finance_evidence_extraction",
        ),
        CheckConstraint(
            "retention_status = 'immutable'",
            name="ck_finance_evidence_retention",
        ),
        Index("ix_finance_evidence_user_created", "user_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id"), nullable=False
    )
    file_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("files.id"), unique=True, nullable=False
    )
    original_name: Mapped[str] = mapped_column(String(255), nullable=False)
    media_type: Mapped[str] = mapped_column(String(100), nullable=False)
    size: Mapped[int] = mapped_column(Integer, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    object_version: Mapped[str] = mapped_column(String(255), nullable=False)
    source_kind: Mapped[str] = mapped_column(String(50), nullable=False)
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    coverage_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    coverage_end: Mapped[date | None] = mapped_column(Date, nullable=True)
    parser_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    parser_version: Mapped[str | None] = mapped_column(String(50), nullable=True)
    extraction_status: Mapped[str] = mapped_column(
        String(20), default="not_requested", server_default="not_requested", nullable=False
    )
    retention_status: Mapped[str] = mapped_column(
        String(20), default="immutable", server_default="immutable", nullable=False
    )
    attributes: Mapped[dict[str, object]] = mapped_column(
        "metadata", JSON, default=dict, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )


class FinanceImport(Base):
    __tablename__ = "finance_imports"
    __table_args__ = (
        UniqueConstraint("user_id", "import_fingerprint", name="uq_finance_import_fingerprint"),
        CheckConstraint(
            "status IN "
            "('previewed','committed','committed_with_rejections','reprocessed','failed')",
            name="ck_finance_imports_status",
        ),
        CheckConstraint(
            "import_mode IN ('normal','reprocess')",
            name="ck_finance_imports_mode",
        ),
        Index("ix_finance_imports_user_created", "user_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id"), nullable=False
    )
    account_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("finance_accounts.id"), nullable=False
    )
    evidence_document_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("finance_evidence_documents.id"), nullable=False
    )
    content_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    parser_id: Mapped[str] = mapped_column(String(100), nullable=False)
    parser_version: Mapped[str] = mapped_column(String(50), nullable=False)
    import_mode: Mapped[str] = mapped_column(String(16), nullable=False)
    import_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    coverage_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    coverage_end: Mapped[date | None] = mapped_column(Date, nullable=True)
    mapping: Mapped[dict[str, object]] = mapped_column(JSON, default=dict, nullable=False)
    preview: Mapped[dict[str, object]] = mapped_column(JSON, default=dict, nullable=False)
    error_summary: Mapped[dict[str, object]] = mapped_column(JSON, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    committed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class FinanceRawRecord(Base):
    __tablename__ = "finance_raw_records"
    __table_args__ = (
        UniqueConstraint(
            "import_id", "record_fingerprint", name="uq_finance_raw_record_fingerprint"
        ),
        UniqueConstraint(
            "user_id",
            "provider_external_id",
            name="uq_finance_raw_record_provider_external_id",
        ),
        Index("ix_finance_raw_records_user_import", "user_id", "import_id"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id"), nullable=False
    )
    import_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("finance_imports.id"), nullable=False
    )
    source_index: Mapped[str] = mapped_column(String(100), nullable=False)
    provider_external_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    record_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    semantic_fingerprint: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    original_payload: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False)
    extracted_payload: Mapped[dict[str, object] | None] = mapped_column(JSON, nullable=True)
    source_timestamp: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    source_timezone: Mapped[str | None] = mapped_column(String(63), nullable=True)
    rejection_code: Mapped[str | None] = mapped_column(String(100), nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )


class FinanceEvent(Base):
    __tablename__ = "finance_events"
    __table_args__ = (Index("ix_finance_events_user_created", "user_id", "created_at"),)

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id"), nullable=False
    )
    current_revision_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey(
            "finance_event_revisions.id",
            use_alter=True,
            name="fk_finance_events_current_revision",
        ),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )


class FinanceEventRevision(Base):
    __tablename__ = "finance_event_revisions"
    __table_args__ = (
        UniqueConstraint("event_id", "revision_number", name="uq_finance_event_revision_number"),
        CheckConstraint("revision_number > 0", name="ck_finance_event_revision_positive"),
        CheckConstraint(
            "event_type IN "
            "('income','expense','transfer','trade','staking_reward','interest','dividend',"
            "'funding_payment','derivative_fill','fee','withholding','corporate_action',"
            "'valuation_adjustment','other')",
            name="ck_finance_event_revision_type",
        ),
        CheckConstraint(
            "status IN ('proposed','confirmed','superseded','voided')",
            name="ck_finance_event_revision_status",
        ),
        UniqueConstraint(
            "user_id",
            "semantic_fingerprint",
            "derivation_version",
            name="uq_finance_event_revision_semantic",
        ),
        Index("ix_finance_event_revisions_user_effective", "user_id", "effective_at"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id"), nullable=False
    )
    event_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("finance_events.id"), nullable=False
    )
    revision_number: Mapped[int] = mapped_column(Integer, nullable=False)
    event_type: Mapped[str] = mapped_column(String(32), nullable=False)
    effective_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    source_local_time: Mapped[str | None] = mapped_column(String(64), nullable=True)
    source_timezone: Mapped[str | None] = mapped_column(String(63), nullable=True)
    tax_date: Mapped[date] = mapped_column(Date, nullable=False)
    tax_day_policy: Mapped[str] = mapped_column(String(100), nullable=False)
    source_account_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("finance_accounts.id"), nullable=False
    )
    external_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    semantic_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    derivation_type: Mapped[str] = mapped_column(String(50), nullable=False)
    derivation_version: Mapped[str] = mapped_column(String(50), nullable=False)
    supersedes_revision_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("finance_event_revisions.id"), nullable=True
    )
    created_by_type: Mapped[str] = mapped_column(String(32), nullable=False)
    created_by_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), nullable=True)
    attributes: Mapped[dict[str, object]] = mapped_column(
        "metadata", JSON, default=dict, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )


class FinanceRevisionRawRecord(Base):
    __tablename__ = "finance_revision_raw_records"

    event_revision_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("finance_event_revisions.id"),
        primary_key=True,
    )
    raw_record_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("finance_raw_records.id"),
        primary_key=True,
    )


class FinanceEventComponent(Base):
    __tablename__ = "finance_event_components"
    __table_args__ = (
        CheckConstraint(
            "role IN ('asset_in','asset_out','fee','withholding','collateral','funding',"
            "'reward','transfer','disposal','income','expense','other')",
            name="ck_finance_event_components_role",
        ),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id"), nullable=False
    )
    event_revision_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("finance_event_revisions.id"), nullable=False, index=True
    )
    role: Mapped[str] = mapped_column(String(32), nullable=False)
    account_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("finance_accounts.id"), nullable=True
    )
    asset_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("finance_assets.id"), nullable=False
    )
    quantity: Mapped[Decimal] = mapped_column(Numeric(38, 18), nullable=False)
    fiat_value: Mapped[Decimal | None] = mapped_column(Numeric(24, 8), nullable=True)
    currency: Mapped[str | None] = mapped_column(String(3), nullable=True)
    attributes: Mapped[dict[str, object]] = mapped_column(
        "metadata", JSON, default=dict, nullable=False
    )


class FinancePosting(Base):
    __tablename__ = "finance_postings"
    __table_args__ = (
        Index("ix_finance_postings_user_account_asset", "user_id", "account_id", "asset_id"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id"), nullable=False
    )
    event_revision_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("finance_event_revisions.id"), nullable=False, index=True
    )
    account_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("finance_accounts.id"), nullable=True
    )
    ledger_account: Mapped[str] = mapped_column(String(100), nullable=False)
    asset_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("finance_assets.id"), nullable=False
    )
    quantity: Mapped[Decimal] = mapped_column(Numeric(38, 18), nullable=False)
    fiat_value: Mapped[Decimal | None] = mapped_column(Numeric(24, 8), nullable=True)
    currency: Mapped[str | None] = mapped_column(String(3), nullable=True)
    posting_role: Mapped[str] = mapped_column(String(50), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )


class FinanceValuation(Base):
    __tablename__ = "finance_valuations"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "asset_id",
            "valued_at",
            "target_currency",
            "provider_reference",
            name="uq_finance_valuation_provenance",
        ),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id"), nullable=False
    )
    event_revision_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("finance_event_revisions.id"), nullable=True
    )
    asset_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("finance_assets.id"), nullable=False
    )
    source_currency: Mapped[str] = mapped_column(String(32), nullable=False)
    target_currency: Mapped[str] = mapped_column(String(3), nullable=False)
    rate: Mapped[Decimal] = mapped_column(Numeric(38, 18), nullable=False)
    value: Mapped[Decimal | None] = mapped_column(Numeric(24, 8), nullable=True)
    valued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    provider: Mapped[str] = mapped_column(String(100), nullable=False)
    provider_reference: Mapped[str] = mapped_column(String(255), nullable=False)
    valuation_policy: Mapped[str] = mapped_column(String(100), nullable=False)
    tax_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    jurisdiction: Mapped[str | None] = mapped_column(String(2), nullable=True)
    override_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )


class FinanceRevisionValuation(Base):
    __tablename__ = "finance_revision_valuations"

    event_revision_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("finance_event_revisions.id"),
        primary_key=True,
    )
    valuation_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("finance_valuations.id"),
        primary_key=True,
    )


class FinanceReviewPolicy(Base):
    __tablename__ = "finance_review_policies"
    __table_args__ = (
        UniqueConstraint(
            "user_id", "policy_key", "version", name="uq_finance_review_policy_version"
        ),
        CheckConstraint("status IN ('active','revoked')", name="ck_finance_review_policies_status"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id"), nullable=False
    )
    policy_key: Mapped[str] = mapped_column(String(64), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    criteria: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False)
    decision: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False)
    source_group_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class FinanceReviewGroup(Base):
    __tablename__ = "finance_review_groups"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending','confirmed','split','deferred')",
            name="ck_finance_review_groups_status",
        ),
        UniqueConstraint("user_id", "grouping_key", name="uq_finance_review_group_key"),
        Index("ix_finance_review_groups_user_status", "user_id", "status"),
        Index("ix_finance_review_groups_supersedes", "supersedes_group_id"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id"), nullable=False
    )
    supersedes_group_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("finance_review_groups.id"),
        nullable=True,
    )
    grouping_key: Mapped[str] = mapped_column(String(64), nullable=False)
    grouping_rule_version: Mapped[str] = mapped_column(String(50), nullable=False)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    account_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("finance_accounts.id"), nullable=False
    )
    asset_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("finance_assets.id"), nullable=False
    )
    event_type: Mapped[str] = mapped_column(String(32), nullable=False)
    tax_date: Mapped[date] = mapped_column(Date, nullable=False)
    first_effective_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_effective_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    native_quantity: Mapped[Decimal] = mapped_column(Numeric(38, 18), nullable=False)
    report_value: Mapped[Decimal | None] = mapped_column(Numeric(24, 8), nullable=True)
    report_currency: Mapped[str | None] = mapped_column(String(3), nullable=True)
    materiality: Mapped[Decimal] = mapped_column(Numeric(24, 8), nullable=False)
    evidence_coverage: Mapped[Decimal] = mapped_column(Numeric(7, 6), nullable=False)
    confidence_explanation: Mapped[str] = mapped_column(Text, nullable=False)
    candidate_treatment: Mapped[str | None] = mapped_column(String(100), nullable=True)
    warnings: Mapped[list[dict[str, object]]] = mapped_column(JSON, default=list, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deferred_until: Mapped[date | None] = mapped_column(Date, nullable=True)


class FinanceReviewGroupMember(Base):
    __tablename__ = "finance_review_group_members"

    group_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("finance_review_groups.id"),
        primary_key=True,
    )
    event_revision_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("finance_event_revisions.id"),
        primary_key=True,
    )


class FinanceTransferMatch(Base):
    __tablename__ = "finance_transfer_matches"
    __table_args__ = (
        UniqueConstraint(
            "outgoing_revision_id",
            "incoming_revision_id",
            name="uq_finance_transfer_match_pair",
        ),
        CheckConstraint(
            "status IN ('proposed','confirmed','rejected')",
            name="ck_finance_transfer_matches_status",
        ),
        CheckConstraint(
            "outgoing_revision_id <> incoming_revision_id",
            name="ck_finance_transfer_matches_distinct",
        ),
        CheckConstraint(
            "score >= 0 AND score <= 1",
            name="ck_finance_transfer_matches_score",
        ),
        CheckConstraint(
            "fee_quantity >= 0",
            name="ck_finance_transfer_matches_fee",
        ),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id"), nullable=False
    )
    outgoing_revision_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("finance_event_revisions.id"), nullable=False
    )
    incoming_revision_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("finance_event_revisions.id"), nullable=False
    )
    score: Mapped[Decimal] = mapped_column(Numeric(7, 6), nullable=False)
    fee_quantity: Mapped[Decimal] = mapped_column(
        Numeric(38, 18), default=Decimal("0"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    explanation: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )


class FinanceReconciliation(Base):
    __tablename__ = "finance_reconciliations"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending','reconciled','warning','blocked')",
            name="ck_finance_reconciliations_status",
        ),
        CheckConstraint(
            "period_end >= period_start",
            name="ck_finance_reconciliations_period",
        ),
        CheckConstraint(
            "tolerance >= 0",
            name="ck_finance_reconciliations_tolerance",
        ),
        Index("ix_finance_reconciliations_user_period", "user_id", "period_start", "period_end"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id"), nullable=False
    )
    account_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("finance_accounts.id"), nullable=False
    )
    asset_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("finance_assets.id"), nullable=True
    )
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    opening_balance: Mapped[Decimal] = mapped_column(Numeric(38, 18), nullable=False)
    movement_total: Mapped[Decimal] = mapped_column(Numeric(38, 18), nullable=False)
    closing_balance: Mapped[Decimal] = mapped_column(Numeric(38, 18), nullable=False)
    difference: Mapped[Decimal] = mapped_column(Numeric(38, 18), nullable=False)
    tolerance: Mapped[Decimal] = mapped_column(Numeric(38, 18), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    source_revision_ids: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    open_question_ids: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    explanation: Mapped[str | None] = mapped_column(Text, nullable=True)
    run_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )


class FinanceAuditHead(Base):
    __tablename__ = "finance_audit_heads"

    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id"), primary_key=True
    )
    last_entry_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), nullable=True)
    last_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    next_sequence: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )


class FinanceAuditEntry(Base):
    __tablename__ = "finance_audit_entries"
    __table_args__ = (
        UniqueConstraint("user_id", "sequence", name="uq_finance_audit_user_sequence"),
        UniqueConstraint("entry_hash", name="uq_finance_audit_entry_hash"),
        Index("ix_finance_audit_entity", "user_id", "entity_type", "entity_id"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id"), nullable=False
    )
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    actor_type: Mapped[str] = mapped_column(String(32), nullable=False)
    actor_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), nullable=True)
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(100), nullable=False)
    entity_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    prior_revision_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), nullable=True)
    new_revision_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    request_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    previous_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    entry_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )


class FinanceIdempotencyKey(Base):
    __tablename__ = "finance_idempotency_keys"
    __table_args__ = (
        UniqueConstraint("user_id", "workflow", "key", name="uq_finance_idempotency_scope"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id"), nullable=False
    )
    workflow: Mapped[str] = mapped_column(String(100), nullable=False)
    key: Mapped[str] = mapped_column(String(255), nullable=False)
    request_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    response_body: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False)
    entity_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), nullable=True)
    audit_entry_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )


class FinanceLot(Base):
    __tablename__ = "finance_lots"
    __table_args__ = (
        CheckConstraint("acquired_quantity > 0", name="ck_finance_lots_quantity_positive"),
        CheckConstraint(
            "remaining_quantity >= 0 AND remaining_quantity <= acquired_quantity",
            name="ck_finance_lots_remaining",
        ),
        CheckConstraint("status IN ('open','depleted','voided')", name="ck_finance_lots_status"),
        CheckConstraint("cost_basis >= 0", name="ck_finance_lots_cost_basis"),
        UniqueConstraint(
            "user_id",
            "asset_id",
            "acquisition_revision_id",
            "jurisdiction",
            "method",
            name="uq_finance_lot_identity",
        ),
        Index("ix_finance_lots_user_asset_status", "user_id", "asset_id", "status"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id"), nullable=False
    )
    account_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("finance_accounts.id"), nullable=False
    )
    asset_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("finance_assets.id"), nullable=False
    )
    acquisition_revision_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("finance_event_revisions.id"), nullable=False
    )
    acquisition_valuation_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("finance_valuations.id"), nullable=True
    )
    jurisdiction: Mapped[str] = mapped_column(String(2), nullable=False)
    tax_year: Mapped[int] = mapped_column(Integer, nullable=False)
    method: Mapped[str] = mapped_column(String(50), nullable=False)
    acquired_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    acquired_quantity: Mapped[Decimal] = mapped_column(Numeric(38, 18), nullable=False)
    remaining_quantity: Mapped[Decimal] = mapped_column(Numeric(38, 18), nullable=False)
    cost_basis: Mapped[Decimal] = mapped_column(Numeric(24, 8), nullable=False)
    reporting_currency: Mapped[str] = mapped_column(String(3), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    provenance: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )


class FinanceLotDisposal(Base):
    __tablename__ = "finance_lot_disposals"
    __table_args__ = (
        CheckConstraint(
            "allocated_quantity > 0",
            name="ck_finance_lot_disposals_quantity_positive",
        ),
        UniqueConstraint(
            "lot_id",
            "disposal_revision_id",
            "jurisdiction",
            "method",
            name="uq_finance_lot_disposal_allocation",
        ),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id"), nullable=False
    )
    lot_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("finance_lots.id"), nullable=False
    )
    disposal_revision_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("finance_event_revisions.id"), nullable=False
    )
    jurisdiction: Mapped[str] = mapped_column(String(2), nullable=False)
    tax_year: Mapped[int] = mapped_column(Integer, nullable=False)
    method: Mapped[str] = mapped_column(String(50), nullable=False)
    allocated_quantity: Mapped[Decimal] = mapped_column(Numeric(38, 18), nullable=False)
    cost_basis: Mapped[Decimal] = mapped_column(Numeric(24, 8), nullable=False)
    proceeds: Mapped[Decimal] = mapped_column(Numeric(24, 8), nullable=False)
    gain_loss: Mapped[Decimal] = mapped_column(Numeric(24, 8), nullable=False)
    reporting_currency: Mapped[str] = mapped_column(String(3), nullable=False)
    calculation_trace: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )


class FinancePosition(Base):
    __tablename__ = "finance_positions"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "account_id",
            "provider_position_id",
            name="uq_finance_position_provider",
        ),
        Index("ix_finance_positions_user_account", "user_id", "account_id"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id"), nullable=False
    )
    account_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("finance_accounts.id"), nullable=False
    )
    asset_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("finance_assets.id"), nullable=False
    )
    provider_position_id: Mapped[str] = mapped_column(String(255), nullable=False)
    current_revision_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey(
            "finance_position_revisions.id",
            use_alter=True,
            name="fk_finance_positions_current_revision",
        ),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )


class FinancePositionRevision(Base):
    __tablename__ = "finance_position_revisions"
    __table_args__ = (
        UniqueConstraint("position_id", "revision_number", name="uq_finance_position_revision"),
        CheckConstraint("revision_number > 0", name="ck_finance_position_revision_positive"),
        CheckConstraint(
            "contract_type IN ('perpetual','dated','cfd','option','other')",
            name="ck_finance_position_contract_type",
        ),
        CheckConstraint("direction IN ('long','short')", name="ck_finance_position_direction"),
        CheckConstraint("leverage > 0", name="ck_finance_position_leverage"),
        CheckConstraint("size >= 0", name="ck_finance_position_size"),
        CheckConstraint("collateral >= 0", name="ck_finance_position_collateral"),
        CheckConstraint(
            "closed_at IS NULL OR closed_at >= opened_at",
            name="ck_finance_position_period",
        ),
        CheckConstraint(
            "status IN ('open','closed','liquidated','superseded','voided')",
            name="ck_finance_position_status",
        ),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id"), nullable=False
    )
    position_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("finance_positions.id"), nullable=False
    )
    revision_number: Mapped[int] = mapped_column(Integer, nullable=False)
    contract_type: Mapped[str] = mapped_column(String(20), nullable=False)
    direction: Mapped[str] = mapped_column(String(8), nullable=False)
    leverage: Mapped[Decimal] = mapped_column(Numeric(18, 8), nullable=False)
    margin_mode: Mapped[str] = mapped_column(String(20), nullable=False)
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    entry_price: Mapped[Decimal] = mapped_column(Numeric(38, 18), nullable=False)
    exit_price: Mapped[Decimal | None] = mapped_column(Numeric(38, 18), nullable=True)
    size: Mapped[Decimal] = mapped_column(Numeric(38, 18), nullable=False)
    collateral: Mapped[Decimal] = mapped_column(Numeric(38, 18), nullable=False)
    realized_pnl: Mapped[Decimal | None] = mapped_column(Numeric(24, 8), nullable=True)
    unrealized_pnl: Mapped[Decimal | None] = mapped_column(Numeric(24, 8), nullable=True)
    funding_total: Mapped[Decimal] = mapped_column(Numeric(24, 8), nullable=False)
    fee_total: Mapped[Decimal] = mapped_column(Numeric(24, 8), nullable=False)
    liquidation_price: Mapped[Decimal | None] = mapped_column(Numeric(38, 18), nullable=True)
    reporting_currency: Mapped[str] = mapped_column(String(3), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    source_revision_ids: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    supersedes_revision_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("finance_position_revisions.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )


class FinanceBotEquitySnapshot(Base):
    __tablename__ = "finance_bot_equity_snapshots"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "account_id",
            "as_of",
            "source_hash",
            name="uq_finance_bot_equity_snapshot",
        ),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id"), nullable=False
    )
    account_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("finance_accounts.id"), nullable=False
    )
    as_of: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    opening_equity: Mapped[Decimal] = mapped_column(Numeric(24, 8), nullable=False)
    deposits: Mapped[Decimal] = mapped_column(Numeric(24, 8), nullable=False)
    withdrawals: Mapped[Decimal] = mapped_column(Numeric(24, 8), nullable=False)
    transfers: Mapped[Decimal] = mapped_column(Numeric(24, 8), nullable=False)
    trading_pnl: Mapped[Decimal] = mapped_column(Numeric(24, 8), nullable=False)
    funding: Mapped[Decimal] = mapped_column(Numeric(24, 8), nullable=False)
    fees: Mapped[Decimal] = mapped_column(Numeric(24, 8), nullable=False)
    expected_equity: Mapped[Decimal] = mapped_column(Numeric(24, 8), nullable=False)
    observed_equity: Mapped[Decimal] = mapped_column(Numeric(24, 8), nullable=False)
    difference: Mapped[Decimal] = mapped_column(Numeric(24, 8), nullable=False)
    reporting_currency: Mapped[str] = mapped_column(String(3), nullable=False)
    source_revision_ids: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    source_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )


class FinanceTaxProfile(Base):
    __tablename__ = "finance_tax_profiles"
    __table_args__ = (
        UniqueConstraint("user_id", "tax_year", "jurisdiction", name="uq_finance_tax_profile"),
        CheckConstraint("jurisdiction IN ('SE','ES')", name="ck_finance_tax_profile_jurisdiction"),
        CheckConstraint(
            "status IN ('draft','active','closed')",
            name="ck_finance_tax_profile_status",
        ),
        CheckConstraint(
            "materiality_threshold >= 0",
            name="ck_finance_tax_profile_materiality_nonnegative",
        ),
        CheckConstraint(
            "reconciliation_tolerance >= 0",
            name="ck_finance_tax_profile_tolerance_nonnegative",
        ),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id"), nullable=False
    )
    tax_year: Mapped[int] = mapped_column(Integer, nullable=False)
    jurisdiction: Mapped[str] = mapped_column(String(2), nullable=False)
    reporting_currency: Mapped[str] = mapped_column(String(3), nullable=False)
    materiality_threshold: Mapped[Decimal] = mapped_column(Numeric(24, 8), nullable=False)
    reconciliation_tolerance: Mapped[Decimal] = mapped_column(Numeric(38, 18), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    valuation_policy: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )


class FinanceResidencyFact(Base):
    __tablename__ = "finance_residency_facts"
    __table_args__ = (
        CheckConstraint(
            "status IN ('observed','adviser_confirmed','disputed')",
            name="ck_finance_residency_fact_status",
        ),
        CheckConstraint(
            "period_end IS NULL OR period_start IS NULL OR period_end >= period_start",
            name="ck_finance_residency_fact_period",
        ),
        Index("ix_finance_residency_facts_profile", "user_id", "tax_profile_id"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id"), nullable=False
    )
    tax_profile_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("finance_tax_profiles.id"), nullable=False
    )
    fact_type: Mapped[str] = mapped_column(String(100), nullable=False)
    period_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    period_end: Mapped[date | None] = mapped_column(Date, nullable=True)
    value: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False)
    evidence_document_ids: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    source: Mapped[str] = mapped_column(String(100), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )


class FinanceTaxTreatment(Base):
    __tablename__ = "finance_tax_treatments"
    __table_args__ = (
        UniqueConstraint(
            "event_revision_id",
            "tax_profile_id",
            name="uq_finance_tax_treatment_event_profile",
        ),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id"), nullable=False
    )
    event_revision_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("finance_event_revisions.id"), nullable=False
    )
    tax_profile_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("finance_tax_profiles.id"), nullable=False
    )
    current_revision_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey(
            "finance_tax_treatment_revisions.id",
            use_alter=True,
            name="fk_finance_tax_treatments_current_revision",
        ),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )


class FinanceTaxTreatmentRevision(Base):
    __tablename__ = "finance_tax_treatment_revisions"
    __table_args__ = (
        UniqueConstraint(
            "treatment_id",
            "revision_number",
            name="uq_finance_tax_treatment_revision",
        ),
        CheckConstraint(
            "status IN ('candidate','confirmed','rejected','superseded')",
            name="ck_finance_tax_treatment_revision_status",
        ),
        CheckConstraint(
            "revision_number > 0",
            name="ck_finance_tax_treatment_revision_number",
        ),
        CheckConstraint(
            "jurisdiction IN ('SE','ES')",
            name="ck_finance_tax_treatment_jurisdiction",
        ),
        CheckConstraint(
            "(status = 'confirmed' AND confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL) "
            "OR (status <> 'confirmed' AND confirmed_by IS NULL AND confirmed_at IS NULL)",
            name="ck_finance_tax_treatment_confirmation",
        ),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id"), nullable=False
    )
    treatment_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("finance_tax_treatments.id"), nullable=False
    )
    revision_number: Mapped[int] = mapped_column(Integer, nullable=False)
    event_revision_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("finance_event_revisions.id"), nullable=False
    )
    tax_profile_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("finance_tax_profiles.id"), nullable=False
    )
    jurisdiction: Mapped[str] = mapped_column(String(2), nullable=False)
    tax_year: Mapped[int] = mapped_column(Integer, nullable=False)
    ruleset_id: Mapped[str] = mapped_column(String(100), nullable=False)
    ruleset_version: Mapped[str] = mapped_column(String(50), nullable=False)
    category: Mapped[str] = mapped_column(String(100), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    inputs: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False)
    output: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False)
    rationale: Mapped[str] = mapped_column(Text, nullable=False)
    source_citations: Mapped[list[dict[str, object]]] = mapped_column(JSON, nullable=False)
    missing_facts: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    confirmed_by: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id"), nullable=True
    )
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    supersedes_revision_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("finance_tax_treatment_revisions.id"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )


class FinanceOpenQuestion(Base):
    __tablename__ = "finance_open_questions"
    __table_args__ = (
        CheckConstraint(
            "severity IN ('info','warning','blocking')",
            name="ck_finance_open_question_severity",
        ),
        CheckConstraint(
            "status IN ('open','resolved','deferred')",
            name="ck_finance_open_question_status",
        ),
        Index("ix_finance_open_questions_user_status", "user_id", "status"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id"), nullable=False
    )
    tax_profile_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("finance_tax_profiles.id"), nullable=True
    )
    question_type: Mapped[str] = mapped_column(String(100), nullable=False)
    severity: Mapped[str] = mapped_column(String(16), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    owner_role: Mapped[str] = mapped_column(String(32), nullable=False)
    related_entities: Mapped[list[dict[str, str]]] = mapped_column(JSON, nullable=False)
    resolution: Mapped[str | None] = mapped_column(Text, nullable=True)
    resolution_audit_entry_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class FinanceReportRun(Base):
    __tablename__ = "finance_report_runs"
    __table_args__ = (
        CheckConstraint(
            "status IN ('ready','ready_with_warnings','blocked')",
            name="ck_finance_report_run_status",
        ),
        CheckConstraint(
            "format IN ('zip','csv','pdf_summary')",
            name="ck_finance_report_run_format",
        ),
        CheckConstraint(
            "(status = 'blocked' AND file_id IS NULL AND file_sha256 IS NULL) OR "
            "(status IN ('ready','ready_with_warnings') AND file_id IS NOT NULL "
            "AND file_sha256 IS NOT NULL)",
            name="ck_finance_report_run_file_state",
        ),
        CheckConstraint(
            "length(manifest_sha256) = 64",
            name="ck_finance_report_manifest_hash",
        ),
        CheckConstraint(
            "file_sha256 IS NULL OR length(file_sha256) = 64",
            name="ck_finance_report_file_hash",
        ),
        UniqueConstraint("user_id", "manifest_sha256", "format", name="uq_finance_report_manifest"),
        Index("ix_finance_report_runs_user_created", "user_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id"), nullable=False
    )
    tax_profile_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("finance_tax_profiles.id"), nullable=False
    )
    tax_year: Mapped[int] = mapped_column(Integer, nullable=False)
    jurisdiction: Mapped[str] = mapped_column(String(2), nullable=False)
    reporting_currency: Mapped[str] = mapped_column(String(3), nullable=False)
    format: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False)
    ruleset_versions: Mapped[dict[str, str]] = mapped_column(JSON, nullable=False)
    algorithm_version: Mapped[str] = mapped_column(String(50), nullable=False)
    blockers: Mapped[list[dict[str, object]]] = mapped_column(JSON, nullable=False)
    warnings: Mapped[list[dict[str, object]]] = mapped_column(JSON, nullable=False)
    manifest: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False)
    manifest_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    file_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("files.id"), nullable=True
    )
    file_sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )


class FinanceReportInput(Base):
    __tablename__ = "finance_report_inputs"
    __table_args__ = (
        UniqueConstraint(
            "report_run_id",
            "input_type",
            "input_id",
            name="uq_finance_report_input",
        ),
        CheckConstraint(
            "input_type IN ('event_revision','valuation','tax_treatment_revision',"
            "'evidence_document','residency_fact','reconciliation','open_question')",
            name="ck_finance_report_input_type",
        ),
        CheckConstraint("length(input_hash) = 64", name="ck_finance_report_input_hash"),
        CheckConstraint("ordinal >= 0", name="ck_finance_report_input_ordinal"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    report_run_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("finance_report_runs.id"), nullable=False
    )
    input_type: Mapped[str] = mapped_column(String(50), nullable=False)
    input_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    input_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    ordinal: Mapped[int] = mapped_column(Integer, nullable=False)


class FinanceReportItem(Base):
    __tablename__ = "finance_report_items"
    __table_args__ = (
        UniqueConstraint(
            "report_run_id", "schedule", "line_key", name="uq_finance_report_item_line"
        ),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    report_run_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("finance_report_runs.id"), nullable=False
    )
    schedule: Mapped[str] = mapped_column(String(100), nullable=False)
    line_key: Mapped[str] = mapped_column(String(255), nullable=False)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    value: Mapped[Decimal] = mapped_column(Numeric(24, 8), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    event_revision_ids: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    valuation_ids: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    treatment_revision_ids: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    evidence_document_ids: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    calculation_trace: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False)


class FinanceGuidanceSource(Base):
    __tablename__ = "finance_guidance_sources"
    __table_args__ = (
        UniqueConstraint("url", "content_hash", "accessed_at", name="uq_finance_guidance_access"),
        CheckConstraint(
            "source_policy IN ('official_only','primary_preferred','broader_web')",
            name="ck_finance_guidance_source_policy",
        ),
        CheckConstraint(
            "length(content_hash) = 64",
            name="ck_finance_guidance_content_hash",
        ),
        CheckConstraint(
            "length(retrieved_url) > 0",
            name="ck_finance_guidance_retrieved_url",
        ),
        CheckConstraint(
            "media_type IS NULL OR length(media_type) > 0",
            name="ck_finance_guidance_media_type",
        ),
        CheckConstraint(
            "http_status BETWEEN 200 AND 299",
            name="ck_finance_guidance_http_status",
        ),
        CheckConstraint(
            "body_size > 0 AND body_size = length(body)",
            name="ck_finance_guidance_body_size",
        ),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id"), nullable=False
    )
    jurisdiction: Mapped[str | None] = mapped_column(String(2), nullable=True)
    tax_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    publisher: Mapped[str] = mapped_column(String(255), nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    url: Mapped[str] = mapped_column(Text, nullable=False)
    published_or_updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    accessed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    source_policy: Mapped[str] = mapped_column(String(32), nullable=False)
    retrieved_url: Mapped[str] = mapped_column(Text, nullable=False)
    media_type: Mapped[str | None] = mapped_column(String(255), nullable=True)
    http_status: Mapped[int] = mapped_column(Integer, nullable=False)
    body_size: Mapped[int] = mapped_column(Integer, nullable=False)
    body: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)


class FinanceToolAudit(Base):
    __tablename__ = "finance_tool_audits"
    __table_args__ = (
        CheckConstraint(
            "permission_class IN ('read','calculate','research','propose')",
            name="ck_finance_tool_audit_permission",
        ),
        CheckConstraint(
            "status IN ('complete','failed','rejected')",
            name="ck_finance_tool_audit_status",
        ),
        CheckConstraint(
            "length(arguments_hash) = 64",
            name="ck_finance_tool_audit_arguments_hash",
        ),
        Index("ix_finance_tool_audits_user_created", "user_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id"), nullable=False
    )
    tool_name: Mapped[str] = mapped_column(String(100), nullable=False)
    permission_class: Mapped[str] = mapped_column(String(16), nullable=False)
    scope: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False)
    arguments_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    result_metadata: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False)
    citations: Mapped[list[dict[str, object]]] = mapped_column(JSON, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )


class FinanceAssistantProposal(Base):
    __tablename__ = "finance_assistant_proposals"
    __table_args__ = (
        CheckConstraint(
            "proposal_type IN "
            "('event_classification','review_policy','open_question','export_note')",
            name="ck_finance_assistant_proposal_type",
        ),
        CheckConstraint(
            "status IN ('pending','confirmed','rejected','expired')",
            name="ck_finance_assistant_proposal_status",
        ),
        CheckConstraint(
            "(status = 'pending' AND resolved_at IS NULL) OR "
            "(status <> 'pending' AND resolved_at IS NOT NULL)",
            name="ck_finance_assistant_proposal_resolution",
        ),
        CheckConstraint(
            "affected_record_count >= 0",
            name="ck_finance_assistant_proposal_affected_count",
        ),
        CheckConstraint(
            "length(confirmation_token_hash) = 64",
            name="ck_finance_assistant_proposal_token_hash",
        ),
        Index("ix_finance_assistant_proposals_user_status", "user_id", "status"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id"), nullable=False
    )
    proposal_type: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    scope: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False)
    before: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False)
    after: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False)
    affected_record_count: Mapped[int] = mapped_column(Integer, nullable=False)
    impacted_report_ids: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    rationale: Mapped[str] = mapped_column(Text, nullable=False)
    citations: Mapped[list[dict[str, object]]] = mapped_column(JSON, nullable=False)
    confirmation_token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
