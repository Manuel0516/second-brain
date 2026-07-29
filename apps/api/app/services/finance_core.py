"""Shared deterministic Finance invariants.

Routes own HTTP concerns; finance services own decimal, idempotency and audit rules reused by
multiple workflows.
"""

import json
from datetime import UTC, datetime
from decimal import Decimal
from hashlib import sha256
from typing import Annotated, Any
from uuid import uuid4

from fastapi import HTTPException, status
from pydantic import StringConstraints, WithJsonSchema
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    FinanceAuditEntry,
    FinanceAuditHead,
    FinanceIdempotencyKey,
)

GENESIS_AUDIT_HASH = "0" * 64
FINANCE_UUID_PATTERN = (
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-"
    r"[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)
FinanceId = Annotated[
    str,
    StringConstraints(pattern=FINANCE_UUID_PATTERN),
    WithJsonSchema(
        {
            "type": "string",
            "format": "uuid",
            "pattern": FINANCE_UUID_PATTERN,
        }
    ),
]


async def _advisory_xact_lock(session: AsyncSession, namespace: str, *parts: str) -> None:
    """Serialize a Finance mutation on PostgreSQL without weakening SQLite tests."""
    bind = session.bind
    if bind is None or bind.dialect.name != "postgresql":
        return
    digest = sha256(":".join((namespace, *parts)).encode()).digest()
    lock_id = int.from_bytes(digest[:8], byteorder="big", signed=True)
    await session.execute(text("SELECT pg_advisory_xact_lock(:lock_id)"), {"lock_id": lock_id})


def decimal_string(value: Decimal | int | str) -> str:
    """Return a non-exponent base-10 representation for the Finance wire contract."""
    decimal = value if isinstance(value, Decimal) else Decimal(str(value))
    return format(decimal, "f")


def canonical_json(value: object) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), default=str)


def hash_payload(value: object) -> str:
    return sha256(canonical_json(value).encode()).hexdigest()


async def prior_idempotent_response(
    session: AsyncSession,
    *,
    user_id: str,
    workflow: str,
    key: str,
    request: object,
) -> dict[str, Any] | None:
    await _advisory_xact_lock(session, "finance-idempotency", user_id, workflow, key)
    request_hash = hash_payload(request)
    row = await session.scalar(
        select(FinanceIdempotencyKey).where(
            FinanceIdempotencyKey.user_id == user_id,
            FinanceIdempotencyKey.workflow == workflow,
            FinanceIdempotencyKey.key == key,
        )
    )
    if row is None:
        return None
    if row.request_hash != request_hash:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Idempotency key was already used with different request content",
        )
    return row.response_body


def store_idempotent_response(
    session: AsyncSession,
    *,
    user_id: str,
    workflow: str,
    key: str,
    request: object,
    response: dict[str, Any],
    entity_id: str | None,
    audit_entry_id: str | None,
) -> None:
    session.add(
        FinanceIdempotencyKey(
            user_id=user_id,
            workflow=workflow,
            key=key,
            request_hash=hash_payload(request),
            response_body=response,
            entity_id=entity_id,
            audit_entry_id=audit_entry_id,
        )
    )


async def append_audit_entry(
    session: AsyncSession,
    *,
    user_id: str,
    actor_id: str | None,
    action: str,
    entity_type: str,
    entity_id: str,
    request: object,
    reason: str | None = None,
    prior_revision_id: str | None = None,
    new_revision_id: str | None = None,
    actor_type: str = "user",
) -> FinanceAuditEntry:
    await _advisory_xact_lock(session, "finance-audit", user_id)
    head = await session.scalar(
        select(FinanceAuditHead).where(FinanceAuditHead.user_id == user_id).with_for_update()
    )
    if head is None:
        head = FinanceAuditHead(
            user_id=user_id,
            last_hash=GENESIS_AUDIT_HASH,
            next_sequence=1,
        )
        session.add(head)
        await session.flush()

    entry_id = str(uuid4())
    created_at = datetime.now(UTC)
    request_hash = hash_payload(request)
    entry_payload = {
        "id": entry_id,
        "user_id": user_id,
        "sequence": head.next_sequence,
        "actor_type": actor_type,
        "actor_id": actor_id,
        "action": action,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "prior_revision_id": prior_revision_id,
        "new_revision_id": new_revision_id,
        "reason": reason,
        "request_hash": request_hash,
        "previous_hash": head.last_hash,
        "created_at": created_at.isoformat(),
    }
    entry_hash = hash_payload(entry_payload)
    entry = FinanceAuditEntry(
        id=entry_id,
        user_id=user_id,
        sequence=head.next_sequence,
        actor_type=actor_type,
        actor_id=actor_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        prior_revision_id=prior_revision_id,
        new_revision_id=new_revision_id,
        reason=reason,
        request_hash=request_hash,
        previous_hash=head.last_hash,
        entry_hash=entry_hash,
        created_at=created_at,
    )
    session.add(entry)
    head.last_entry_id = entry_id
    head.last_hash = entry_hash
    head.next_sequence += 1
    return entry
