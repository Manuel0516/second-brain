"""Bounded MCP inputs, shared with the application's human approval handler."""

from datetime import date, timedelta
from typing import Annotated, Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator

Text = Annotated[str, Field(min_length=1, max_length=10_000)]
Title = Annotated[str, Field(min_length=1, max_length=255)]
Limit = Annotated[int, Field(ge=1, le=100)]
Category = Literal["fact", "profile", "preference", "correction"]


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True, allow_inf_nan=False)


class DateRange(Input):
    start: date
    end: date

    @model_validator(mode="after")
    def valid_range(self) -> "DateRange":
        if not self.start <= self.end <= self.start + timedelta(days=366):
            raise ValueError("Date range must be ordered and at most 366 days")
        return self


class MemoryFilters(Input):
    category: Category | None = None


class MemoryCreate(Input):
    content: Text
    category: Category = "fact"
    # The existing memory model has no arbitrary metadata field.
    metadata: dict[str, str] = Field(default_factory=dict, max_length=0)


class Changes(Input):
    @model_validator(mode="after")
    def valid_changes(self) -> "Changes":
        if not self.model_fields_set:
            raise ValueError("Supply at least one change")
        for field in self.model_fields_set - {"description", "due_date", "plan"}:
            if getattr(self, field) is None:
                raise ValueError("This field cannot be cleared")
        return self


class MemoryChanges(Changes):
    content: Text | None = None
    category: Category | None = None


class MemoryUpdate(Input):
    id: UUID
    changes: MemoryChanges


class TaskCreate(Input):
    title: Title
    description: Text | None = None
    due_date: AwareDatetime | None = None
    priority: Literal["low", "normal", "high"] = "normal"


class TaskChanges(Changes):
    title: Title | None = None
    description: Text | None = None
    due_date: AwareDatetime | None = None
    priority: Literal["low", "normal", "high"] | None = None
    completed: bool | None = None


class TaskUpdate(Input):
    id: UUID
    changes: TaskChanges


class Identifier(Input):
    id: UUID


class Activity(Input):
    title: Title
    start_at: AwareDatetime
    end_at: AwareDatetime

    @model_validator(mode="after")
    def valid_times(self) -> "Activity":
        if self.end_at <= self.start_at:
            raise ValueError("end_at must follow start_at")
        return self


class DailyPlan(Input):
    date: date
    activities: list[Activity] = Field(min_length=1, max_length=50)


class Quantity(Input):
    amount: float = Field(gt=0, le=100_000)
    unit: str = Field(default="item", min_length=1, max_length=32)


class GroceryCreate(Input):
    name: Title
    quantity: Quantity = Field(default_factory=lambda: Quantity(amount=1))
    category: str = Field(default="other", min_length=1, max_length=64)


class GroceryChanges(Changes):
    name: Title | None = None
    quantity: Quantity | None = None
    category: str | None = Field(default=None, min_length=1, max_length=64)


class GroceryUpdate(Input):
    id: UUID
    changes: GroceryChanges


class WorkoutSet(Input):
    exercise_id: UUID
    set_number: int = Field(ge=1, le=100)
    reps: int | None = Field(default=None, ge=0, le=10_000)
    weight: float | None = Field(default=None, ge=0, le=10_000)
    distance_km: float | None = Field(default=None, gt=0, le=10_000)
    duration_min: float | None = Field(default=None, gt=0, le=10_000)


class WorkoutCreate(Input):
    date: AwareDatetime
    type: Title = "Workout"
    exercises: list[WorkoutSet] = Field(min_length=1, max_length=200)


class WorkoutChanges(Changes):
    date: AwareDatetime | None = None
    type: Title | None = None
    plan: list[Title] | None = Field(default=None, max_length=50)


class WorkoutUpdate(Input):
    id: UUID
    changes: WorkoutChanges


class NoteCreate(Input):
    title: Title
    content: Text


WRITE_INPUTS: dict[str, type[Input]] = {
    "create_memory": MemoryCreate,
    "update_memory": MemoryUpdate,
    "create_task": TaskCreate,
    "update_task": TaskUpdate,
    "complete_task": Identifier,
    "create_daily_plan": DailyPlan,
    "add_grocery_item": GroceryCreate,
    "update_grocery_item": GroceryUpdate,
    "remove_grocery_item": Identifier,
    "log_workout_session": WorkoutCreate,
    "update_workout_session": WorkoutUpdate,
    "create_note": NoteCreate,
}
