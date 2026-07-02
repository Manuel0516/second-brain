from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import (
    JSON,
    UUID,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
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
    source: Mapped[str] = mapped_column(String(20), default="local", nullable=False)
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
