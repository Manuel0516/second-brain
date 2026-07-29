"""Deterministic transfer matching and opening-to-closing reconciliation."""

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal
from typing import Literal
from uuid import uuid4

from app.services.finance_ledger import AuditIntent, FinanceLedgerError, as_decimal


@dataclass(frozen=True, slots=True)
class TransferLeg:
    revision_id: str
    account_id: str
    asset_id: str
    quantity: Decimal | int | str
    effective_at: datetime
    owner_controlled: bool
    transaction_hash: str | None = None
    provider_reference: str | None = None
    network: str | None = None
    address: str | None = None


@dataclass(frozen=True, slots=True)
class TransferCandidate:
    outgoing_revision_id: str
    incoming_revision_id: str
    score: Decimal
    fee_quantity: Decimal | None
    conserves_quantity: bool
    suggested: bool
    explanation: dict[str, object]


def score_transfer_candidate(
    outgoing: TransferLeg,
    incoming: TransferLeg,
    *,
    maximum_fee_ratio: Decimal | int | str = "0.05",
    suggestion_threshold: Decimal | int | str = "0.75",
) -> TransferCandidate:
    """Score evidence without auto-confirming ownership or a transfer relationship."""
    outgoing_quantity = as_decimal(outgoing.quantity, field="outgoing quantity")
    incoming_quantity = as_decimal(incoming.quantity, field="incoming quantity")
    fee_ratio_limit = as_decimal(maximum_fee_ratio, field="maximum fee ratio")
    threshold = as_decimal(suggestion_threshold, field="suggestion threshold")
    if outgoing_quantity >= 0 or incoming_quantity <= 0:
        raise FinanceLedgerError("Transfer legs require negative outgoing and positive incoming")
    if outgoing.effective_at.tzinfo is None or incoming.effective_at.tzinfo is None:
        raise FinanceLedgerError("Transfer timestamps must be timezone-aware")
    if fee_ratio_limit < 0 or threshold < 0 or threshold > 1:
        raise FinanceLedgerError("Transfer thresholds are outside their valid range")

    sent = abs(outgoing_quantity)
    same_asset = outgoing.asset_id == incoming.asset_id
    fee = sent - incoming_quantity if same_asset and incoming_quantity <= sent else None
    fee_ratio = None if fee is None else fee / sent
    conserves = fee is not None and fee >= 0
    score = Decimal(0)
    factors: dict[str, object] = {
        "same_asset": same_asset,
        "distinct_accounts": outgoing.account_id != incoming.account_id,
        "both_owner_controlled": outgoing.owner_controlled and incoming.owner_controlled,
        "quantity_conserved_with_fee": conserves,
    }
    if same_asset:
        score += Decimal("0.25")
    if fee_ratio is not None:
        if fee_ratio <= fee_ratio_limit:
            score += Decimal("0.25")
        elif fee_ratio <= Decimal("0.20"):
            score += Decimal("0.10")

    time_delta = abs(incoming.effective_at - outgoing.effective_at)
    factors["time_delta_seconds"] = str(Decimal(str(time_delta.total_seconds())))
    if time_delta <= timedelta(minutes=15):
        score += Decimal("0.15")
    elif time_delta <= timedelta(hours=24):
        score += Decimal("0.10")
    elif time_delta <= timedelta(hours=72):
        score += Decimal("0.05")

    owned_accounts = (
        outgoing.owner_controlled
        and incoming.owner_controlled
        and outgoing.account_id != incoming.account_id
    )
    if owned_accounts:
        score += Decimal("0.10")

    exact_hash = bool(
        outgoing.transaction_hash
        and incoming.transaction_hash
        and outgoing.transaction_hash == incoming.transaction_hash
    )
    exact_provider_reference = bool(
        outgoing.provider_reference
        and incoming.provider_reference
        and outgoing.provider_reference == incoming.provider_reference
    )
    factors["exact_transaction_hash"] = exact_hash
    factors["exact_provider_reference"] = exact_provider_reference
    if exact_hash:
        score += Decimal("0.15")
    elif exact_provider_reference:
        score += Decimal("0.10")

    same_network = bool(outgoing.network and outgoing.network == incoming.network)
    matching_address = bool(outgoing.address and outgoing.address == incoming.address)
    factors["same_network"] = same_network
    factors["matching_address"] = matching_address
    if same_network:
        score += Decimal("0.05")
    if matching_address:
        score += Decimal("0.05")
    score = min(score, Decimal(1)).quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP)
    suggested = same_asset and conserves and owned_accounts and score >= threshold
    return TransferCandidate(
        outgoing_revision_id=outgoing.revision_id,
        incoming_revision_id=incoming.revision_id,
        score=score,
        fee_quantity=fee,
        conserves_quantity=conserves,
        suggested=suggested,
        explanation=factors,
    )


@dataclass(frozen=True, slots=True)
class ReconciliationIssue:
    code: str
    severity: Literal["warning", "blocking"]
    message: str


@dataclass(frozen=True, slots=True)
class ReconciliationPlan:
    reconciliation_id: str
    opening_balance: Decimal
    movement_total: Decimal
    expected_closing_balance: Decimal
    closing_balance: Decimal
    difference: Decimal
    tolerance: Decimal
    materiality: Decimal
    status: Literal["reconciled", "warning", "blocked"]
    source_revision_ids: tuple[str, ...]
    issues: tuple[ReconciliationIssue, ...]
    audit: AuditIntent


def reconcile_balances(
    *,
    account_id: str,
    opening_balance: Decimal | int | str,
    movements: Iterable[Decimal | int | str],
    closing_balance: Decimal | int | str,
    tolerance: Decimal | int | str,
    source_revision_ids: Sequence[str],
    materiality: Decimal | int | str | None = None,
    asset_id: str | None = None,
    reconciliation_id: str | None = None,
    require_source_revisions: bool = False,
) -> ReconciliationPlan:
    """Apply opening + movements = closing and classify any exact Decimal difference."""
    opening = as_decimal(opening_balance, field="opening balance")
    closing = as_decimal(closing_balance, field="closing balance")
    allowed_difference = as_decimal(tolerance, field="tolerance")
    material_difference = (
        allowed_difference if materiality is None else as_decimal(materiality, field="materiality")
    )
    if allowed_difference < 0 or material_difference < allowed_difference:
        raise FinanceLedgerError("Materiality must be greater than or equal to tolerance")
    resolved_revision_ids = tuple(source_revision_ids)
    if len(resolved_revision_ids) != len(set(resolved_revision_ids)):
        raise FinanceLedgerError("Source revision IDs must be unique")
    movement_values = tuple(as_decimal(value, field="movement") for value in movements)
    movement_total = sum(movement_values, Decimal(0))
    expected = opening + movement_total
    difference = closing - expected
    absolute_difference = abs(difference)
    issues: list[ReconciliationIssue] = []
    if require_source_revisions and movement_values and not resolved_revision_ids:
        issues.append(
            ReconciliationIssue(
                code="missing_movement_lineage",
                severity="blocking",
                message="Movement totals have no source event revisions",
            )
        )
    if absolute_difference > allowed_difference:
        severity: Literal["warning", "blocking"] = (
            "blocking" if absolute_difference >= material_difference else "warning"
        )
        issues.append(
            ReconciliationIssue(
                code="material_reconciliation_difference"
                if severity == "blocking"
                else "reconciliation_difference",
                severity=severity,
                message="Closing balance does not equal opening balance plus movements",
            )
        )
    if any(issue.severity == "blocking" for issue in issues):
        status: Literal["reconciled", "warning", "blocked"] = "blocked"
    elif issues:
        status = "warning"
    else:
        status = "reconciled"
    resolved_id = reconciliation_id or str(uuid4())
    request: dict[str, object] = {
        "account_id": account_id,
        "asset_id": asset_id,
        "opening_balance": str(opening),
        "movement_total": str(movement_total),
        "closing_balance": str(closing),
        "difference": str(difference),
        "tolerance": str(allowed_difference),
        "materiality": str(material_difference),
        "source_revision_ids": resolved_revision_ids,
        "status": status,
    }
    return ReconciliationPlan(
        reconciliation_id=resolved_id,
        opening_balance=opening,
        movement_total=movement_total,
        expected_closing_balance=expected,
        closing_balance=closing,
        difference=difference,
        tolerance=allowed_difference,
        materiality=material_difference,
        status=status,
        source_revision_ids=resolved_revision_ids,
        issues=tuple(issues),
        audit=AuditIntent(
            action="reconciliation.run",
            entity_type="finance_reconciliation",
            entity_id=resolved_id,
            request=request,
        ),
    )
