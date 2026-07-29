"""Deterministic tax-profile, residency-fact, and treatment foundations.

The service records jurisdiction-specific interpretations of immutable event revisions.  It
deliberately has no function that derives or confirms tax residence from observed facts.
"""

from collections.abc import Mapping
from dataclasses import dataclass, replace
from datetime import UTC, date, datetime
from decimal import Decimal
from types import MappingProxyType
from typing import Any, Literal, cast
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    FinanceAuditEntry,
    FinanceEventRevision,
    FinanceTaxProfile,
    FinanceTaxTreatment,
)
from app.models import (
    FinanceTaxTreatmentRevision as FinanceTaxTreatmentRevisionModel,
)
from app.services.finance_core import append_audit_entry, hash_payload

Jurisdiction = Literal["SE", "ES"]
TaxProfileStatus = Literal["draft", "active", "closed"]
TreatmentStatus = Literal["candidate", "confirmed", "rejected", "superseded"]


OFFICIAL_TAX_SOURCES: dict[Jurisdiction, tuple[dict[str, str], ...]] = {
    "SE": (
        {
            "publisher": "Skatteverket",
            "title": "Cryptocurrencies",
            "url": (
                "https://www.skatteverket.se/privat/skatter/vardepapper/andratillgangar/"
                "kryptovalutor.4.15532c7b1442f256bae11b60.html"
            ),
        },
        {
            "publisher": "Skatteverket",
            "title": "Liability for taxation",
            "url": (
                "https://www.skatteverket.se/servicelankar/otherlanguages/inenglishengelska/"
                "individualsandemployees/newinswedenandwillbeemployedhere/"
                "liabilityfortaxation.4.676f4884175c97df41930a7.html"
            ),
        },
    ),
    "ES": (
        {
            "publisher": "Agencia Tributaria",
            "title": "Fiscal residence overview",
            "url": (
                "https://sede.agenciatributaria.gob.es/Sede/no-residentes/"
                "residencia-personas-fisicas-juridicas.html"
            ),
        },
        {
            "publisher": "Agencia Tributaria",
            "title": "Modelo 720",
            "url": "https://sede.agenciatributaria.gob.es/Sede/procedimientoini/GI34.shtml",
        },
        {
            "publisher": "Agencia Tributaria",
            "title": "Modelo 721",
            "url": "https://sede.agenciatributaria.gob.es/Sede/procedimientoini/GI55.shtml",
        },
        {
            "publisher": "Agencia Tributaria",
            "title": "Gains and losses from virtual currencies",
            "url": (
                "https://sede.agenciatributaria.gob.es/Sede/Ayuda/24Presentacion/100/7_6_6_2/"
                "ganancias_perdidas_monedas_virtuales.html"
            ),
        },
    ),
}

for _source_rows in OFFICIAL_TAX_SOURCES.values():
    for _source_row in _source_rows:
        _source_row["source_policy"] = "official_only"
        _source_row["reviewed_at"] = "2026-07-29"

_INVENTORY_CATEGORY_BY_EVENT_TYPE = {
    "income": "income_inventory",
    "expense": "expense_inventory",
    "transfer": "transfer_review",
    "trade": "asset_disposal_inventory",
    "staking_reward": "crypto_reward_inventory",
    "interest": "interest_inventory",
    "dividend": "dividend_inventory",
    "funding_payment": "derivative_funding_inventory",
    "derivative_fill": "derivative_transaction_inventory",
    "fee": "fee_inventory",
    "withholding": "foreign_withholding_inventory",
    "corporate_action": "corporate_action_review",
    "valuation_adjustment": "valuation_review",
    "other": "unclassified_event_review",
}


class TaxDomainError(ValueError):
    """Raised when tax-domain invariants are violated."""


def _id(value: str, field: str) -> str:
    try:
        UUID(value)
    except (TypeError, ValueError) as exc:
        raise TaxDomainError(f"{field} must be a UUID") from exc
    return value


def _decimal(value: Decimal | str, field: str) -> str:
    if isinstance(value, float):
        raise TaxDomainError(f"{field} must not use binary floating point")
    try:
        number = value if isinstance(value, Decimal) else Decimal(value)
    except Exception as exc:
        raise TaxDomainError(f"{field} must be a decimal string") from exc
    if not number.is_finite():
        raise TaxDomainError(f"{field} must be finite")
    return format(number, "f")


def _financial_json(value: Any, path: str = "value") -> Any:
    """Copy JSON-like data immutably while converting Decimal values to wire strings."""
    if isinstance(value, float):
        raise TaxDomainError(f"{path} must not use binary floating point")
    if isinstance(value, Decimal):
        return format(value, "f")
    if isinstance(value, Mapping):
        return MappingProxyType(
            {str(key): _financial_json(item, f"{path}.{key}") for key, item in value.items()}
        )
    if isinstance(value, (list, tuple)):
        return tuple(_financial_json(item, f"{path}[]") for item in value)
    if value is None or isinstance(value, (str, int, bool)):
        return value
    raise TaxDomainError(f"{path} contains an unsupported value")


def thaw_financial_json(value: Any) -> Any:
    """Return a JSON-serializable copy of immutable tax calculation data."""
    if isinstance(value, Mapping):
        return {key: thaw_financial_json(item) for key, item in value.items()}
    if isinstance(value, tuple):
        return [thaw_financial_json(item) for item in value]
    return value


@dataclass(frozen=True, slots=True)
class TaxProfile:
    id: str
    tax_year: int
    jurisdiction: Jurisdiction | str
    reporting_currency: str
    materiality_threshold: Decimal | str
    reconciliation_tolerance: Decimal | str
    status: TaxProfileStatus | str = "draft"

    def __post_init__(self) -> None:
        _id(self.id, "profile id")
        if self.jurisdiction not in {"SE", "ES"}:
            raise TaxDomainError("jurisdiction must be SE or ES")
        if not 1900 <= self.tax_year <= 2200:
            raise TaxDomainError("tax year is outside the supported range")
        currency = self.reporting_currency.upper()
        if len(currency) != 3 or not currency.isalpha():
            raise TaxDomainError("reporting currency must be a three-letter code")
        if self.status not in {"draft", "active", "closed"}:
            raise TaxDomainError("invalid tax profile status")
        object.__setattr__(self, "reporting_currency", currency)
        object.__setattr__(
            self,
            "materiality_threshold",
            _decimal(self.materiality_threshold, "materiality threshold"),
        )
        object.__setattr__(
            self,
            "reconciliation_tolerance",
            _decimal(self.reconciliation_tolerance, "reconciliation tolerance"),
        )


@dataclass(frozen=True, slots=True)
class ResidencyFact:
    id: str
    tax_profile_id: str
    fact_type: str
    period_start: date | None
    period_end: date | None
    value: str
    evidence_document_ids: tuple[str, ...]
    observed_at: datetime

    def __post_init__(self) -> None:
        _id(self.id, "residency fact id")
        _id(self.tax_profile_id, "tax profile id")
        for evidence_id in self.evidence_document_ids:
            _id(evidence_id, "evidence document id")
        if not self.fact_type.strip() or not self.value.strip():
            raise TaxDomainError("residency facts require a type and factual value")
        if (self.period_start is None) != (self.period_end is None):
            raise TaxDomainError("residency fact periods require both start and end")
        if self.period_start and self.period_end and self.period_end < self.period_start:
            raise TaxDomainError("residency fact period end precedes its start")
        if self.observed_at.tzinfo is None:
            raise TaxDomainError("observed_at must be timezone-aware")


@dataclass(frozen=True, slots=True)
class ResidencyWorkspace:
    tax_profile_id: str
    jurisdiction: Jurisdiction
    tax_year: int
    fact_ids: tuple[str, ...]
    observed_presence_days: int
    conflicting_fact_ids: tuple[str, ...]
    missing_evidence_fact_ids: tuple[str, ...]
    determination_status: Literal["requires_human_confirmation"] = "requires_human_confirmation"


def build_residency_workspace(
    profile: TaxProfile, facts: tuple[ResidencyFact, ...]
) -> ResidencyWorkspace:
    """Summarize observations without applying domestic or treaty residence conclusions."""
    for fact in facts:
        if fact.tax_profile_id != profile.id:
            raise TaxDomainError("residency fact belongs to a different tax profile")

    year_start = date(profile.tax_year, 1, 1)
    year_end = date(profile.tax_year, 12, 31)
    observed_dates: set[date] = set()
    presence_by_day: dict[date, list[str]] = {}
    for fact in facts:
        if fact.fact_type != "physical_presence" or fact.period_start is None:
            continue
        start = max(fact.period_start, year_start)
        end = min(fact.period_end or fact.period_start, year_end)
        ordinal = start.toordinal()
        while ordinal <= end.toordinal():
            day = date.fromordinal(ordinal)
            observed_dates.add(day)
            presence_by_day.setdefault(day, []).append(fact.id)
            ordinal += 1

    # Overlapping corroborating facts are not conflicts.  A conflict is explicit data recorded
    # with the fact type used by the residency workspace.
    conflicts = tuple(sorted(fact.id for fact in facts if fact.fact_type == "conflicting_claim"))
    return ResidencyWorkspace(
        tax_profile_id=profile.id,
        jurisdiction=profile.jurisdiction,  # type: ignore[arg-type]
        tax_year=profile.tax_year,
        fact_ids=tuple(sorted(fact.id for fact in facts)),
        observed_presence_days=len(observed_dates),
        conflicting_fact_ids=conflicts,
        missing_evidence_fact_ids=tuple(
            sorted(fact.id for fact in facts if not fact.evidence_document_ids)
        ),
    )


@dataclass(frozen=True, slots=True)
class TaxTreatmentRevision:
    id: str
    event_revision_id: str
    tax_profile_id: str
    jurisdiction: Jurisdiction
    tax_year: int
    ruleset_id: str
    ruleset_version: str
    category: str
    status: TreatmentStatus
    inputs: Mapping[str, Any]
    outputs: Mapping[str, Any]
    rationale: str
    source_citation_ids: tuple[str, ...]
    missing_fact_ids: tuple[str, ...]
    supersedes_treatment_id: str | None = None
    confirmed_by: str | None = None
    confirmed_at: datetime | None = None
    confirmation_reason: str | None = None


def create_candidate_treatment(
    *,
    treatment_id: str,
    event_revision_id: str,
    profile: TaxProfile,
    ruleset_id: str,
    ruleset_version: str,
    category: str,
    inputs: Mapping[str, Any],
    outputs: Mapping[str, Any],
    rationale: str,
    source_citation_ids: tuple[str, ...],
    missing_fact_ids: tuple[str, ...] = (),
) -> TaxTreatmentRevision:
    """Create one jurisdiction-specific candidate; never confirm it implicitly."""
    _id(treatment_id, "treatment id")
    _id(event_revision_id, "event revision id")
    for value in (*source_citation_ids, *missing_fact_ids):
        _id(value, "provenance id")
    if not all(value.strip() for value in (ruleset_id, ruleset_version, category, rationale)):
        raise TaxDomainError("candidate treatment fields must not be blank")
    return TaxTreatmentRevision(
        id=treatment_id,
        event_revision_id=event_revision_id,
        tax_profile_id=profile.id,
        jurisdiction=profile.jurisdiction,  # type: ignore[arg-type]
        tax_year=profile.tax_year,
        ruleset_id=ruleset_id,
        ruleset_version=ruleset_version,
        category=category,
        status="candidate",
        inputs=_financial_json(inputs, "inputs"),
        outputs=_financial_json(outputs, "outputs"),
        rationale=rationale.strip(),
        source_citation_ids=tuple(sorted(set(source_citation_ids))),
        missing_fact_ids=tuple(sorted(set(missing_fact_ids))),
    )


def confirm_treatment(
    candidate: TaxTreatmentRevision,
    *,
    confirmed_treatment_id: str,
    expected_ruleset_version: str,
    confirmed_by: str,
    confirmed_at: datetime,
    reason: str,
) -> TaxTreatmentRevision:
    """Return an append-only confirmed revision after explicit human review."""
    if candidate.status != "candidate":
        raise TaxDomainError("only a candidate treatment can be confirmed")
    if candidate.ruleset_version != expected_ruleset_version:
        raise TaxDomainError("ruleset version changed since candidate review")
    _id(confirmed_treatment_id, "confirmed treatment id")
    _id(confirmed_by, "confirming user id")
    if confirmed_treatment_id == candidate.id:
        raise TaxDomainError("confirmation must create a new treatment revision")
    if confirmed_at.tzinfo is None:
        raise TaxDomainError("confirmed_at must be timezone-aware")
    if not reason.strip():
        raise TaxDomainError("confirmation reason is required")
    return replace(
        candidate,
        id=confirmed_treatment_id,
        status="confirmed",
        supersedes_treatment_id=candidate.id,
        confirmed_by=confirmed_by,
        confirmed_at=confirmed_at.astimezone(UTC),
        confirmation_reason=reason.strip(),
    )


def default_candidate_definition(
    *, event_revision: FinanceEventRevision, profile: FinanceTaxProfile
) -> dict[str, object]:
    """Return the conservative, deterministic SE/ES inventory rule for an event.

    These foundations deliberately inventory the fact and require human review.  They do not
    encode changing tax rates, infer residency, or turn an inventory category into legal advice.
    """
    jurisdiction = profile.jurisdiction
    if jurisdiction not in OFFICIAL_TAX_SOURCES:
        raise TaxDomainError("jurisdiction must be SE or ES")
    category = _INVENTORY_CATEGORY_BY_EVENT_TYPE.get(
        event_revision.event_type, "unclassified_event_review"
    )
    ruleset_version = f"{profile.tax_year}.inventory-v1"
    return {
        "ruleset_id": f"{jurisdiction.lower()}-{profile.tax_year}-inventory",
        "ruleset_version": ruleset_version,
        "category": category,
        "inputs": {
            "event_revision_id": event_revision.id,
            "event_type": event_revision.event_type,
            "tax_date": event_revision.tax_date.isoformat(),
            "valuation_policy": profile.valuation_policy,
        },
        "output": {
            "classification": category,
            "calculation_status": "requires_human_review",
        },
        "rationale": (
            f"Deterministic {jurisdiction} {profile.tax_year} inventory classification; "
            "tax residence and final legal treatment require human confirmation."
        ),
        "source_citations": [dict(item) for item in OFFICIAL_TAX_SOURCES[jurisdiction]],
        "missing_facts": ["confirmed_tax_residence", "human_tax_review"],
    }


async def persist_candidate_treatment(
    session: AsyncSession,
    *,
    user_id: str,
    actor_id: str | None,
    event_revision_id: str,
    tax_profile_id: str,
    category_override: str | None = None,
    rationale_override: str | None = None,
    reason: str = "Create deterministic tax candidate after event confirmation",
) -> tuple[FinanceTaxTreatment, FinanceTaxTreatmentRevisionModel, FinanceAuditEntry | None]:
    """Persist one append-only candidate and advance its stable identity pointer.

    The callable is transaction-neutral so ledger confirmation can invoke it in the same unit of
    work.  Repeating it for an unchanged rule pack is idempotent and creates no audit entry.
    """
    event_revision = await session.scalar(
        select(FinanceEventRevision).where(
            FinanceEventRevision.id == event_revision_id,
            FinanceEventRevision.user_id == user_id,
        )
    )
    if event_revision is None or event_revision.status != "confirmed":
        raise TaxDomainError("candidate treatments require an owned confirmed event revision")
    profile = await session.scalar(
        select(FinanceTaxProfile).where(
            FinanceTaxProfile.id == tax_profile_id,
            FinanceTaxProfile.user_id == user_id,
        )
    )
    if profile is None or profile.status == "closed":
        raise TaxDomainError("candidate treatments require an open owned tax profile")
    if profile.tax_year != event_revision.tax_date.year:
        raise TaxDomainError("event tax date does not belong to the tax profile year")

    definition = default_candidate_definition(event_revision=event_revision, profile=profile)
    if category_override is not None:
        category = category_override.strip()
        if not category or len(category) > 100:
            raise TaxDomainError("candidate category must be between 1 and 100 characters")
        definition["category"] = category
        output = dict(cast(Mapping[str, object], definition["output"]))
        output["classification"] = category
        definition["output"] = output
    if rationale_override is not None:
        rationale = rationale_override.strip()
        if not rationale:
            raise TaxDomainError("candidate rationale must not be blank")
        definition["rationale"] = rationale
    identity = await session.scalar(
        select(FinanceTaxTreatment)
        .where(
            FinanceTaxTreatment.user_id == user_id,
            FinanceTaxTreatment.event_revision_id == event_revision.id,
            FinanceTaxTreatment.tax_profile_id == profile.id,
        )
        .with_for_update()
    )
    if identity is None:
        identity = FinanceTaxTreatment(
            user_id=user_id,
            event_revision_id=event_revision.id,
            tax_profile_id=profile.id,
        )
        session.add(identity)
        await session.flush()

    current: FinanceTaxTreatmentRevisionModel | None = None
    if identity.current_revision_id:
        current = await session.scalar(
            select(FinanceTaxTreatmentRevisionModel).where(
                FinanceTaxTreatmentRevisionModel.id == identity.current_revision_id,
                FinanceTaxTreatmentRevisionModel.user_id == user_id,
            )
        )
        if (
            current is not None
            and current.ruleset_id == definition["ruleset_id"]
            and current.ruleset_version == definition["ruleset_version"]
            and current.category == definition["category"]
            and current.rationale == definition["rationale"]
            and current.inputs == thaw_financial_json(definition["inputs"])
            and current.output == thaw_financial_json(definition["output"])
        ):
            return identity, current, None

    revision = FinanceTaxTreatmentRevisionModel(
        id=str(uuid4()),
        user_id=user_id,
        treatment_id=identity.id,
        revision_number=(current.revision_number + 1) if current else 1,
        event_revision_id=event_revision.id,
        tax_profile_id=profile.id,
        jurisdiction=profile.jurisdiction,
        tax_year=profile.tax_year,
        ruleset_id=str(definition["ruleset_id"]),
        ruleset_version=str(definition["ruleset_version"]),
        category=str(definition["category"]),
        status="candidate",
        inputs=thaw_financial_json(definition["inputs"]),
        output=thaw_financial_json(definition["output"]),
        rationale=str(definition["rationale"]),
        source_citations=thaw_financial_json(definition["source_citations"]),
        missing_facts=list(cast(list[str], definition["missing_facts"])),
        supersedes_revision_id=current.id if current else None,
    )
    session.add(revision)
    await session.flush()
    identity.current_revision_id = revision.id
    audit = await append_audit_entry(
        session,
        user_id=user_id,
        actor_id=actor_id,
        actor_type="user" if actor_id else "system",
        action="tax_treatment.candidate_created",
        entity_type="finance_tax_treatment",
        entity_id=identity.id,
        prior_revision_id=current.id if current else None,
        new_revision_id=revision.id,
        reason=reason,
        request={
            "event_revision_id": event_revision.id,
            "tax_profile_id": profile.id,
            "ruleset_id": revision.ruleset_id,
            "ruleset_version": revision.ruleset_version,
            "definition_hash": hash_payload(definition),
        },
    )
    return identity, revision, audit


async def persist_default_candidates_for_confirmed_revision(
    session: AsyncSession,
    *,
    user_id: str,
    actor_id: str | None,
    event_revision_id: str,
) -> tuple[FinanceTaxTreatmentRevisionModel, ...]:
    """Create independent SE/ES candidates for every matching open profile."""
    event_revision = await session.scalar(
        select(FinanceEventRevision).where(
            FinanceEventRevision.id == event_revision_id,
            FinanceEventRevision.user_id == user_id,
        )
    )
    if event_revision is None or event_revision.status != "confirmed":
        raise TaxDomainError("candidate treatments require an owned confirmed event revision")
    profiles = list(
        (
            await session.scalars(
                select(FinanceTaxProfile)
                .where(
                    FinanceTaxProfile.user_id == user_id,
                    FinanceTaxProfile.tax_year == event_revision.tax_date.year,
                    FinanceTaxProfile.status.in_(("draft", "active")),
                )
                .order_by(FinanceTaxProfile.jurisdiction, FinanceTaxProfile.id)
            )
        ).all()
    )
    revisions: list[FinanceTaxTreatmentRevisionModel] = []
    for profile in profiles:
        _, revision, _ = await persist_candidate_treatment(
            session,
            user_id=user_id,
            actor_id=actor_id,
            event_revision_id=event_revision.id,
            tax_profile_id=profile.id,
        )
        revisions.append(revision)
    return tuple(revisions)
