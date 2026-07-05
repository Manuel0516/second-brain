"""Per-set feeling rating + weight Integer->Float on set_entries.

- `set_entries.feeling`: nullable int 1-5, subjective per-set rating
  (1 = dying/too tired ... 5 = felt great). Range enforced in the API layer.
- `set_entries.weight`: Integer -> Float. Weights are routinely fractional
  (2.5 kg plates); Integer was an oversight in 015_fitness_core. Postgres
  casts int -> float losslessly, and the downgrade rounds back, so no data
  is lost on upgrade (downgrade may round fractional weights — acceptable,
  documented backup plan: pg_dump before downgrading in production).
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "017"
down_revision: str | Sequence[str] | None = "016"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("set_entries", sa.Column("feeling", sa.Integer(), nullable=True))
    op.alter_column(
        "set_entries",
        "weight",
        existing_type=sa.Integer(),
        type_=sa.Float(),
        existing_nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "set_entries",
        "weight",
        existing_type=sa.Float(),
        type_=sa.Integer(),
        existing_nullable=True,
        postgresql_using="round(weight)::integer",
    )
    op.drop_column("set_entries", "feeling")
