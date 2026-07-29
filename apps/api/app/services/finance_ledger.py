"""Deterministic plans for Finance events, postings, grouping, and review actions.

The helpers in this module do not write database state. Routes persist a complete plan and its
audit intents in one transaction, which keeps financial arithmetic testable and retries safe.
"""

from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, field, replace
from datetime import UTC, date, datetime
from decimal import Decimal, InvalidOperation
from typing import Literal
from uuid import uuid4

from app.services.finance_core import hash_payload

EVENT_TYPES = frozenset(
    {
        "income",
        "expense",
        "transfer",
        "trade",
        "staking_reward",
        "interest",
        "dividend",
        "funding_payment",
        "derivative_fill",
        "fee",
        "withholding",
        "corporate_action",
        "valuation_adjustment",
        "other",
    }
)
COMPONENT_ROLES = frozenset(
    {
        "asset_in",
        "asset_out",
        "fee",
        "withholding",
        "collateral",
        "funding",
        "reward",
        "transfer",
        "disposal",
        "income",
        "expense",
        "other",
    }
)
REVISION_STATUSES = frozenset({"proposed", "confirmed", "superseded", "voided"})
REUSABLE_POLICY_FIELDS = (
    "account_id",
    "source_id",
    "asset_id",
    "event_type",
    "jurisdiction",
    "candidate_treatment",
    "valuation_policy",
    "evidence_condition",
    "warning_free",
)


class FinanceLedgerError(ValueError):
    """A deterministic ledger invariant failed."""


class UnbalancedPostingsError(FinanceLedgerError):
    """Postings do not conserve every asset and valued currency."""


def as_decimal(value: Decimal | int | str, *, field: str = "value") -> Decimal:
    """Coerce base-10 input without permitting a binary-float boundary."""
    if isinstance(value, bool) or isinstance(value, float):
        raise FinanceLedgerError(f"{field} must be a Decimal, integer, or decimal string")
    try:
        result = value if isinstance(value, Decimal) else Decimal(value)
    except (InvalidOperation, ValueError) as exc:
        raise FinanceLedgerError(f"{field} must be a valid decimal") from exc
    if not result.is_finite():
        raise FinanceLedgerError(f"{field} must be finite")
    return result


@dataclass(frozen=True, slots=True)
class ComponentInput:
    role: str
    asset_id: str
    quantity: Decimal | int | str
    account_id: str | None = None
    fiat_value: Decimal | int | str | None = None
    currency: str | None = None
    attributes: Mapping[str, object] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class PostingInput:
    ledger_account: str
    asset_id: str
    quantity: Decimal | int | str
    posting_role: str
    account_id: str | None = None
    fiat_value: Decimal | int | str | None = None
    currency: str | None = None
    event_revision_id: str | None = None


@dataclass(frozen=True, slots=True)
class AuditIntent:
    action: str
    entity_type: str
    entity_id: str
    request: Mapping[str, object]
    reason: str | None = None
    prior_revision_id: str | None = None
    new_revision_id: str | None = None


@dataclass(frozen=True, slots=True)
class CanonicalEventRevisionPlan:
    user_id: str
    event_id: str
    revision_id: str
    revision_number: int
    event_type: str
    effective_at: datetime
    tax_date: date
    tax_day_policy: str
    source_account_id: str
    status: str
    semantic_fingerprint: str
    derivation_type: str
    derivation_version: str
    source_local_time: str | None
    source_timezone: str | None
    external_id: str | None
    supersedes_revision_id: str | None
    raw_record_ids: tuple[str, ...]
    valuation_ids: tuple[str, ...]
    evidence_document_ids: tuple[str, ...]
    components: tuple[ComponentInput, ...]
    postings: tuple[PostingInput, ...]
    attributes: Mapping[str, object]
    audit: AuditIntent


def _normalise_component(component: ComponentInput) -> ComponentInput:
    if component.role not in COMPONENT_ROLES:
        raise FinanceLedgerError(f"Unsupported component role: {component.role}")
    quantity = as_decimal(component.quantity, field="component quantity")
    if quantity == 0:
        raise FinanceLedgerError("Component quantity must not be zero")
    fiat_value = (
        None
        if component.fiat_value is None
        else as_decimal(component.fiat_value, field="component fiat value")
    )
    currency = component.currency.upper() if component.currency else None
    if (fiat_value is None) != (currency is None):
        raise FinanceLedgerError("Component fiat value and currency must be supplied together")
    return replace(component, quantity=quantity, fiat_value=fiat_value, currency=currency)


def _normalise_posting(posting: PostingInput, revision_id: str | None = None) -> PostingInput:
    quantity = as_decimal(posting.quantity, field="posting quantity")
    fiat_value = (
        None
        if posting.fiat_value is None
        else as_decimal(posting.fiat_value, field="posting fiat value")
    )
    currency = posting.currency.upper() if posting.currency else None
    if not posting.ledger_account.strip() or not posting.posting_role.strip():
        raise FinanceLedgerError("Posting ledger account and role are required")
    if (fiat_value is None) != (currency is None):
        raise FinanceLedgerError("Posting fiat value and currency must be supplied together")
    return replace(
        posting,
        quantity=quantity,
        fiat_value=fiat_value,
        currency=currency,
        event_revision_id=revision_id or posting.event_revision_id,
    )


def validate_balanced_postings(postings: Sequence[PostingInput]) -> None:
    """Require exact conservation independently for every asset and valued currency."""
    if len(postings) < 2:
        raise UnbalancedPostingsError("A canonical event requires at least two postings")
    asset_totals: dict[str, Decimal] = {}
    currency_totals: dict[str, Decimal] = {}
    for raw_posting in postings:
        posting = _normalise_posting(raw_posting)
        quantity = as_decimal(posting.quantity)
        asset_totals[posting.asset_id] = asset_totals.get(posting.asset_id, Decimal(0)) + quantity
        if posting.fiat_value is not None and posting.currency is not None:
            value = as_decimal(posting.fiat_value)
            currency_totals[posting.currency] = (
                currency_totals.get(posting.currency, Decimal(0)) + value
            )
    unbalanced_assets = {key: value for key, value in asset_totals.items() if value != 0}
    unbalanced_currencies = {key: value for key, value in currency_totals.items() if value != 0}
    if unbalanced_assets or unbalanced_currencies:
        raise UnbalancedPostingsError(
            f"Unbalanced postings: assets={unbalanced_assets}, currencies={unbalanced_currencies}"
        )


def validate_component_postings(
    components: Sequence[ComponentInput], postings: Sequence[PostingInput]
) -> None:
    """Validate component values and ensure every explained asset reaches the ledger."""
    if not components:
        raise FinanceLedgerError("A canonical event requires at least one component")
    normalised = tuple(_normalise_component(component) for component in components)
    validate_balanced_postings(postings)
    posting_assets = {posting.asset_id for posting in postings}
    missing = sorted({component.asset_id for component in normalised} - posting_assets)
    if missing:
        raise FinanceLedgerError(f"Components have no postings for assets: {missing}")


def balanced_postings_for_components(
    components: Sequence[ComponentInput],
) -> tuple[PostingInput, ...]:
    """Create a transparent two-sided proposal for each economic component."""
    counter_accounts = {
        "reward": "income:reward",
        "income": "income:other",
        "fee": "expense:fee",
        "withholding": "expense:withholding",
        "expense": "expense:other",
    }
    postings: list[PostingInput] = []
    for raw_component in components:
        component = _normalise_component(raw_component)
        quantity = as_decimal(component.quantity)
        fiat_value = None if component.fiat_value is None else as_decimal(component.fiat_value)
        postings.extend(
            (
                PostingInput(
                    ledger_account="asset:custody",
                    account_id=component.account_id,
                    asset_id=component.asset_id,
                    quantity=quantity,
                    fiat_value=fiat_value,
                    currency=component.currency,
                    posting_role=component.role,
                ),
                PostingInput(
                    ledger_account=counter_accounts.get(
                        component.role, f"clearing:{component.role}"
                    ),
                    asset_id=component.asset_id,
                    quantity=-quantity,
                    fiat_value=None if fiat_value is None else -fiat_value,
                    currency=component.currency,
                    posting_role=f"{component.role}_counter",
                ),
            )
        )
    validate_component_postings(components, postings)
    return tuple(postings)


def build_canonical_event_revision(
    *,
    user_id: str,
    event_type: str,
    effective_at: datetime,
    tax_date: date,
    tax_day_policy: str,
    source_account_id: str,
    components: Sequence[ComponentInput],
    postings: Sequence[PostingInput],
    raw_record_ids: Iterable[str] = (),
    valuation_ids: Iterable[str] = (),
    evidence_document_ids: Iterable[str] = (),
    status: str = "proposed",
    derivation_type: str = "import",
    derivation_version: str = "1",
    source_local_time: str | None = None,
    source_timezone: str | None = None,
    external_id: str | None = None,
    attributes: Mapping[str, object] | None = None,
    event_id: str | None = None,
    revision_id: str | None = None,
    revision_number: int = 1,
    supersedes_revision_id: str | None = None,
    semantic_fingerprint: str | None = None,
    audit_action: str = "event.proposed",
    audit_reason: str | None = None,
) -> CanonicalEventRevisionPlan:
    """Build a complete new immutable revision after checking ledger invariants."""
    if event_type not in EVENT_TYPES:
        raise FinanceLedgerError(f"Unsupported event type: {event_type}")
    if status not in REVISION_STATUSES:
        raise FinanceLedgerError(f"Unsupported revision status: {status}")
    if revision_number < 1:
        raise FinanceLedgerError("Revision number must be positive")
    if effective_at.tzinfo is None or effective_at.utcoffset() is None:
        raise FinanceLedgerError("Effective timestamp must be timezone-aware")
    if not tax_day_policy.strip():
        raise FinanceLedgerError("Tax-day policy is required")

    resolved_event_id = event_id or str(uuid4())
    resolved_revision_id = revision_id or str(uuid4())
    raw_ids = tuple(dict.fromkeys(raw_record_ids))
    resolved_valuation_ids = tuple(dict.fromkeys(valuation_ids))
    resolved_evidence_ids = tuple(dict.fromkeys(evidence_document_ids))
    normalised_components = tuple(_normalise_component(component) for component in components)
    normalised_postings = tuple(
        _normalise_posting(posting, resolved_revision_id) for posting in postings
    )
    validate_component_postings(normalised_components, normalised_postings)
    event_attributes: Mapping[str, object] = dict(attributes or {})
    fingerprint = semantic_fingerprint or hash_payload(
        {
            "user_id": user_id,
            "event_type": event_type,
            "effective_at": effective_at.astimezone(UTC).isoformat(),
            "source_account_id": source_account_id,
            "external_id": external_id,
            "raw_record_ids": raw_ids,
            "components": normalised_components,
        }
    )
    audit_request: dict[str, object] = {
        "event_id": resolved_event_id,
        "revision_id": resolved_revision_id,
        "revision_number": revision_number,
        "status": status,
        "semantic_fingerprint": fingerprint,
        "raw_record_ids": raw_ids,
        "valuation_ids": resolved_valuation_ids,
        "evidence_document_ids": resolved_evidence_ids,
    }
    audit = AuditIntent(
        action=audit_action,
        entity_type="finance_event",
        entity_id=resolved_event_id,
        request=audit_request,
        reason=audit_reason,
        prior_revision_id=supersedes_revision_id,
        new_revision_id=resolved_revision_id,
    )
    return CanonicalEventRevisionPlan(
        user_id=user_id,
        event_id=resolved_event_id,
        revision_id=resolved_revision_id,
        revision_number=revision_number,
        event_type=event_type,
        effective_at=effective_at.astimezone(UTC),
        tax_date=tax_date,
        tax_day_policy=tax_day_policy,
        source_account_id=source_account_id,
        status=status,
        semantic_fingerprint=fingerprint,
        derivation_type=derivation_type,
        derivation_version=derivation_version,
        source_local_time=source_local_time,
        source_timezone=source_timezone,
        external_id=external_id,
        supersedes_revision_id=supersedes_revision_id,
        raw_record_ids=raw_ids,
        valuation_ids=resolved_valuation_ids,
        evidence_document_ids=resolved_evidence_ids,
        components=normalised_components,
        postings=normalised_postings,
        attributes=event_attributes,
        audit=audit,
    )


def plan_event_correction(
    prior: CanonicalEventRevisionPlan,
    *,
    reason: str,
    components: Sequence[ComponentInput] | None = None,
    postings: Sequence[PostingInput] | None = None,
    event_type: str | None = None,
    effective_at: datetime | None = None,
    tax_date: date | None = None,
    attributes: Mapping[str, object] | None = None,
    status: str = "confirmed",
    revision_id: str | None = None,
) -> CanonicalEventRevisionPlan:
    """Plan a successor without changing the prior immutable revision."""
    if not reason.strip():
        raise FinanceLedgerError("A correction reason is required")
    next_components = tuple(components) if components is not None else prior.components
    next_postings = tuple(postings) if postings is not None else prior.postings
    # A successor gets a new fingerprint even when only its confirmation state changed.
    fingerprint = hash_payload(
        {
            "prior_revision_id": prior.revision_id,
            "revision_number": prior.revision_number + 1,
            "event_type": event_type or prior.event_type,
            "effective_at": (effective_at or prior.effective_at).isoformat(),
            "components": next_components,
            "reason": reason,
        }
    )
    return build_canonical_event_revision(
        user_id=prior.user_id,
        event_id=prior.event_id,
        revision_id=revision_id,
        revision_number=prior.revision_number + 1,
        event_type=event_type or prior.event_type,
        effective_at=effective_at or prior.effective_at,
        tax_date=tax_date or prior.tax_date,
        tax_day_policy=prior.tax_day_policy,
        source_account_id=prior.source_account_id,
        components=next_components,
        postings=next_postings,
        raw_record_ids=prior.raw_record_ids,
        valuation_ids=prior.valuation_ids,
        evidence_document_ids=prior.evidence_document_ids,
        status=status,
        derivation_type="correction",
        derivation_version=prior.derivation_version,
        source_local_time=prior.source_local_time,
        source_timezone=prior.source_timezone,
        external_id=prior.external_id,
        attributes=attributes if attributes is not None else prior.attributes,
        supersedes_revision_id=prior.revision_id,
        semantic_fingerprint=fingerprint,
        audit_action="event.corrected" if status != "confirmed" else "event.confirmed",
        audit_reason=reason,
    )


@dataclass(frozen=True, slots=True)
class ReviewMember:
    revision_id: str
    account_id: str
    source_id: str
    asset_id: str
    event_type: str
    tax_date: date
    tax_day_policy: str
    jurisdiction: str
    candidate_treatment: str | None
    valuation_policy: str
    evidence_condition: str
    effective_at: datetime
    native_quantity: Decimal | int | str
    report_value: Decimal | int | str | None
    report_currency: str | None
    warning_codes: tuple[str, ...] = ()
    observed_at: datetime | None = None
    revision: CanonicalEventRevisionPlan | None = None

    @property
    def warning_free(self) -> bool:
        return not self.warning_codes


def _compatibility_fields(member: ReviewMember) -> dict[str, object]:
    return {
        "account_id": member.account_id,
        "source_id": member.source_id,
        "asset_id": member.asset_id,
        "event_type": member.event_type,
        "tax_date": member.tax_date.isoformat(),
        "tax_day_policy": member.tax_day_policy,
        "jurisdiction": member.jurisdiction.upper(),
        "candidate_treatment": member.candidate_treatment,
        "valuation_policy": member.valuation_policy,
        "evidence_condition": member.evidence_condition,
        "warning_free": member.warning_free,
        "report_currency": member.report_currency.upper() if member.report_currency else None,
    }


def daily_grouping_key(member: ReviewMember) -> str:
    return hash_payload(_compatibility_fields(member))


def grouping_compatible(left: ReviewMember, right: ReviewMember) -> bool:
    return _compatibility_fields(left) == _compatibility_fields(right)


@dataclass(frozen=True, slots=True)
class ReviewGroupPlan:
    group_id: str
    grouping_key: str
    compatibility_key: str
    grouping_rule_version: str
    label: str
    status: Literal["pending", "confirmed", "split", "deferred"]
    members: tuple[ReviewMember, ...]
    native_quantity: Decimal
    report_value: Decimal | None
    report_currency: str | None
    minimum_rate: Decimal | None
    maximum_rate: Decimal | None
    weighted_average_rate: Decimal | None
    evidence_coverage: Decimal
    materiality: Decimal
    warnings: tuple[str, ...]


def summarize_daily_group(
    members: Sequence[ReviewMember],
    *,
    label: str,
    group_id: str | None = None,
    grouping_rule_version: str = "daily-v1",
) -> ReviewGroupPlan:
    if not members:
        raise FinanceLedgerError("A review group requires at least one member")
    first = members[0]
    for member in members[1:]:
        if not grouping_compatible(first, member):
            raise FinanceLedgerError("Review group members are not grouping-compatible")
    quantities = [as_decimal(member.native_quantity, field="native quantity") for member in members]
    values = [
        None
        if member.report_value is None
        else as_decimal(member.report_value, field="report value")
        for member in members
    ]
    native_total = sum(quantities, Decimal(0))
    report_total = (
        None
        if any(value is None for value in values)
        else sum((value for value in values if value is not None), Decimal(0))
    )
    rates = [
        abs(value / quantity)
        for value, quantity in zip(values, quantities, strict=True)
        if value is not None and quantity != 0
    ]
    weighted_rate = None
    absolute_quantity = sum((abs(quantity) for quantity in quantities), Decimal(0))
    if report_total is not None and absolute_quantity != 0:
        weighted_rate = (
            sum((abs(value) for value in values if value is not None), Decimal(0))
            / absolute_quantity
        )
    evidence_count = sum(member.evidence_condition == "present" for member in members)
    coverage = Decimal(evidence_count) / Decimal(len(members))
    compatibility_key = daily_grouping_key(first)
    member_ids = tuple(member.revision_id for member in members)
    instance_key = hash_payload(
        {"compatibility_key": compatibility_key, "member_revision_ids": sorted(member_ids)}
    )
    warnings = tuple(sorted({code for member in members for code in member.warning_codes}))
    return ReviewGroupPlan(
        group_id=group_id or str(uuid4()),
        grouping_key=instance_key,
        compatibility_key=compatibility_key,
        grouping_rule_version=grouping_rule_version,
        label=label,
        status="pending",
        members=tuple(members),
        native_quantity=native_total,
        report_value=report_total,
        report_currency=first.report_currency.upper() if first.report_currency else None,
        minimum_rate=min(rates) if rates else None,
        maximum_rate=max(rates) if rates else None,
        weighted_average_rate=weighted_rate,
        evidence_coverage=coverage,
        materiality=abs(report_total) if report_total is not None else abs(native_total),
        warnings=warnings,
    )


def build_reusable_policy_criteria(
    group: ReviewGroupPlan, *, created_at: datetime
) -> dict[str, object]:
    if created_at.tzinfo is None or created_at.utcoffset() is None:
        raise FinanceLedgerError("Policy creation timestamp must be timezone-aware")
    source = group.members[0]
    fields = _compatibility_fields(source)
    return {
        **{field: fields[field] for field in REUSABLE_POLICY_FIELDS},
        "applies_after": created_at.astimezone(UTC).isoformat(),
        "applies_to_future_only": True,
    }


def reusable_policy_matches(criteria: Mapping[str, object], member: ReviewMember) -> bool:
    if criteria.get("applies_to_future_only") is not True or member.observed_at is None:
        return False
    applies_after_raw = criteria.get("applies_after")
    if not isinstance(applies_after_raw, str):
        return False
    try:
        applies_after = datetime.fromisoformat(applies_after_raw)
    except ValueError:
        return False
    if applies_after.tzinfo is None or member.observed_at.tzinfo is None:
        return False
    if member.observed_at <= applies_after:
        return False
    fields = _compatibility_fields(member)
    return all(criteria.get(field) == fields[field] for field in REUSABLE_POLICY_FIELDS)


@dataclass(frozen=True, slots=True)
class ReviewConfirmationPlan:
    group_id: str
    prior_revision_ids: tuple[str, ...]
    confirmed_revisions: tuple[CanonicalEventRevisionPlan, ...]
    policy_criteria: Mapping[str, object] | None
    audit_intents: tuple[AuditIntent, ...]


def plan_group_confirmation(
    group: ReviewGroupPlan,
    *,
    expected_member_revision_ids: Sequence[str],
    create_reusable_policy: bool,
    reason: str,
    confirmed_at: datetime,
) -> ReviewConfirmationPlan:
    actual_ids = tuple(member.revision_id for member in group.members)
    if tuple(expected_member_revision_ids) != actual_ids:
        raise FinanceLedgerError("Review group membership is stale")
    if group.status != "pending":
        raise FinanceLedgerError("Only a pending review group can be confirmed")
    if not reason.strip():
        raise FinanceLedgerError("A confirmation reason is required")
    confirmed: list[CanonicalEventRevisionPlan] = []
    for member in group.members:
        if member.revision is None or member.revision.revision_id != member.revision_id:
            raise FinanceLedgerError("Confirmation requires each immutable source revision plan")
        confirmed.append(
            plan_event_correction(
                member.revision,
                reason=reason,
                status="confirmed",
            )
        )
    group_audit = AuditIntent(
        action="review_group.confirmed",
        entity_type="finance_review_group",
        entity_id=group.group_id,
        request={
            "expected_member_revision_ids": actual_ids,
            "confirmed_revision_ids": tuple(item.revision_id for item in confirmed),
            "create_reusable_policy": create_reusable_policy,
        },
        reason=reason,
    )
    return ReviewConfirmationPlan(
        group_id=group.group_id,
        prior_revision_ids=actual_ids,
        confirmed_revisions=tuple(confirmed),
        policy_criteria=(
            build_reusable_policy_criteria(group, created_at=confirmed_at)
            if create_reusable_policy
            else None
        ),
        audit_intents=tuple(item.audit for item in confirmed) + (group_audit,),
    )


@dataclass(frozen=True, slots=True)
class ReviewPartition:
    label: str
    member_revision_ids: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class ReviewSplitPlan:
    original_group_id: str
    replacement_groups: tuple[ReviewGroupPlan, ...]
    before_native_quantity: Decimal
    after_native_quantity: Decimal
    before_report_value: Decimal | None
    after_report_value: Decimal | None
    audit: AuditIntent


def plan_group_split(
    group: ReviewGroupPlan,
    *,
    partitions: Sequence[ReviewPartition],
    reason: str,
) -> ReviewSplitPlan:
    if group.status != "pending" or len(partitions) < 2:
        raise FinanceLedgerError("A pending group requires at least two split partitions")
    if not reason.strip():
        raise FinanceLedgerError("A split reason is required")
    expected = [member.revision_id for member in group.members]
    supplied = [
        revision_id for partition in partitions for revision_id in partition.member_revision_ids
    ]
    if len(supplied) != len(set(supplied)) or set(supplied) != set(expected):
        raise FinanceLedgerError("Split partitions must contain every member exactly once")
    by_id = {member.revision_id: member for member in group.members}
    replacements = tuple(
        summarize_daily_group(
            [by_id[revision_id] for revision_id in partition.member_revision_ids],
            label=partition.label,
            grouping_rule_version=group.grouping_rule_version,
        )
        for partition in partitions
    )
    after_native = sum((item.native_quantity for item in replacements), Decimal(0))
    after_report = (
        None
        if any(item.report_value is None for item in replacements)
        else sum(
            (item.report_value for item in replacements if item.report_value is not None),
            Decimal(0),
        )
    )
    if after_native != group.native_quantity or after_report != group.report_value:
        raise FinanceLedgerError("A split must preserve native and reporting totals")
    audit = AuditIntent(
        action="review_group.split",
        entity_type="finance_review_group",
        entity_id=group.group_id,
        request={
            "partitions": [
                {"label": partition.label, "member_revision_ids": partition.member_revision_ids}
                for partition in partitions
            ],
            "before_native_quantity": str(group.native_quantity),
            "after_native_quantity": str(after_native),
            "before_report_value": None if group.report_value is None else str(group.report_value),
            "after_report_value": None if after_report is None else str(after_report),
        },
        reason=reason,
    )
    return ReviewSplitPlan(
        original_group_id=group.group_id,
        replacement_groups=replacements,
        before_native_quantity=group.native_quantity,
        after_native_quantity=after_native,
        before_report_value=group.report_value,
        after_report_value=after_report,
        audit=audit,
    )


@dataclass(frozen=True, slots=True)
class ReviewDeferPlan:
    group_id: str
    status: Literal["deferred"]
    revisit_on: date | None
    reason: str
    audit: AuditIntent


def plan_group_defer(
    group: ReviewGroupPlan, *, reason: str, revisit_on: date | None
) -> ReviewDeferPlan:
    if group.status != "pending":
        raise FinanceLedgerError("Only a pending review group can be deferred")
    if not reason.strip():
        raise FinanceLedgerError("A defer reason is required")
    audit = AuditIntent(
        action="review_group.deferred",
        entity_type="finance_review_group",
        entity_id=group.group_id,
        request={"revisit_on": revisit_on.isoformat() if revisit_on else None},
        reason=reason,
    )
    return ReviewDeferPlan(
        group_id=group.group_id,
        status="deferred",
        revisit_on=revisit_on,
        reason=reason,
        audit=audit,
    )


@dataclass(frozen=True, slots=True)
class ReplayedBalance:
    account_id: str | None
    ledger_account: str
    asset_id: str
    quantity: Decimal


def replay_postings(
    postings: Iterable[PostingInput], *, selected_revision_ids: Iterable[str] | None = None
) -> tuple[ReplayedBalance, ...]:
    """Replay only explicitly selected revisions when a frozen revision set is supplied."""
    selected = set(selected_revision_ids) if selected_revision_ids is not None else None
    balances: dict[tuple[str | None, str, str], Decimal] = {}
    for raw_posting in postings:
        posting = _normalise_posting(raw_posting)
        if selected is not None and posting.event_revision_id not in selected:
            continue
        key = (posting.account_id, posting.ledger_account, posting.asset_id)
        balances[key] = balances.get(key, Decimal(0)) + as_decimal(posting.quantity)
    return tuple(
        ReplayedBalance(account_id, ledger_account, asset_id, quantity)
        for (account_id, ledger_account, asset_id), quantity in sorted(
            balances.items(), key=lambda item: tuple(part or "" for part in item[0])
        )
    )
