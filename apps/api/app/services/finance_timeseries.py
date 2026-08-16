"""Small, Decimal-safe read model for Finance overview charts."""

from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal
from typing import Literal, cast

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import FinanceAccount, FinanceEvent, FinanceEventComponent, FinanceEventRevision
from app.services.finance_core import decimal_string

TimeseriesMetric = Literal["net_worth", "income", "expense", "rewards", "readiness"]
TimeseriesGranularity = Literal["day", "week", "month"]
TimeseriesGrouping = Literal["account", "source", "jurisdiction", "none"]


def _bucket(value: date, granularity: TimeseriesGranularity) -> date:
    if granularity == "month":
        return value.replace(day=1)
    if granularity == "week":
        return value - timedelta(days=value.weekday())
    return value


def _included(event_type: str, metric: TimeseriesMetric) -> bool:
    return event_type in {
        "income": {"income", "interest", "dividend"},
        "expense": {"expense", "fee", "withholding"},
        "rewards": {"staking_reward", "funding_payment"},
    }.get(metric, {event_type})


def _group_identity(
    grouping: TimeseriesGrouping,
    *,
    revision: FinanceEventRevision,
    account: FinanceAccount,
) -> tuple[str, str]:
    if grouping == "account":
        return account.id, account.name
    if grouping == "source":
        source = str(revision.attributes.get("source_id") or revision.derivation_type)
        return source, source.replace("_", " ").title()
    if grouping == "jurisdiction":
        jurisdiction = str(revision.attributes.get("jurisdiction") or account.tax_jurisdiction)
        return jurisdiction or "unknown", jurisdiction or "Unknown"
    return "all", "All"


async def finance_timeseries(
    session: AsyncSession,
    *,
    user_id: str,
    tax_year: int,
    metric: TimeseriesMetric,
    granularity: TimeseriesGranularity,
    group_by: TimeseriesGrouping,
    from_date: date | None,
    to_date: date | None,
) -> list[dict[str, object]]:
    start = max(date(tax_year, 1, 1), from_date or date(tax_year, 1, 1))
    end = min(date(tax_year, 12, 31), to_date or date(tax_year, 12, 31))
    if start > end:
        return []
    rows = (
        await session.execute(
            select(FinanceEventRevision, FinanceEventComponent, FinanceAccount)
            .join(FinanceEvent, FinanceEvent.current_revision_id == FinanceEventRevision.id)
            .join(
                FinanceEventComponent,
                FinanceEventComponent.event_revision_id == FinanceEventRevision.id,
            )
            .join(FinanceAccount, FinanceAccount.id == FinanceEventRevision.source_account_id)
            .where(
                FinanceEvent.user_id == user_id,
                FinanceEventRevision.user_id == user_id,
                FinanceEventComponent.user_id == user_id,
                FinanceAccount.user_id == user_id,
                FinanceEventRevision.status == "confirmed",
                FinanceEventRevision.tax_date >= start,
                FinanceEventRevision.tax_date <= end,
            )
            .order_by(FinanceEventRevision.tax_date, FinanceEventRevision.id)
        )
    ).all()
    labels: dict[str, str] = {}
    values: dict[str, dict[date, Decimal]] = defaultdict(lambda: defaultdict(Decimal))
    readiness: dict[str, dict[date, tuple[int, int]]] = defaultdict(dict)
    for revision, component, account in rows:
        key, label = _group_identity(
            group_by,
            revision=cast(FinanceEventRevision, revision),
            account=cast(FinanceAccount, account),
        )
        labels[key] = label
        point_date = _bucket(revision.tax_date, granularity)
        if metric == "readiness":
            complete, total = readiness[key].get(point_date, (0, 0))
            evidence_condition = str(revision.attributes.get("evidence_condition", "missing"))
            readiness[key][point_date] = (
                complete + int(evidence_condition in {"present", "complete"}),
                total + 1,
            )
            continue
        if metric == "net_worth":
            amount = abs(Decimal(component.fiat_value or component.quantity))
            if revision.event_type in {"expense", "fee", "withholding"}:
                amount = -amount
            elif revision.event_type == "transfer":
                amount = Decimal(0)
            values[key][point_date] += amount
            continue
        if _included(revision.event_type, metric):
            values[key][point_date] += abs(Decimal(component.fiat_value or component.quantity))

    result: list[dict[str, object]] = []
    for key in sorted(labels):
        points: list[dict[str, str]] = []
        if metric == "readiness":
            running_complete = 0
            running_total = 0
            for point_date, (complete, total) in sorted(readiness[key].items()):
                running_complete += complete
                running_total += total
                percent = Decimal(running_complete * 100) / Decimal(running_total)
                points.append({"t": point_date.isoformat(), "v": decimal_string(percent)})
        else:
            running = Decimal(0)
            for point_date, value in sorted(values[key].items()):
                if metric == "net_worth":
                    running += value
                    value = running
                points.append({"t": point_date.isoformat(), "v": decimal_string(value)})
        if points:
            result.append({"key": key, "label": labels[key], "points": points})
    # ponytail: compute per request; add materialization only after real data proves this slow.
    return result
