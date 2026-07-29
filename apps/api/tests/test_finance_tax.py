from datetime import UTC, date, datetime
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    FinanceAccount,
    FinanceEvent,
    FinanceEventRevision,
    FinanceTaxProfile,
    FinanceTaxTreatmentRevision,
    User,
)
from app.services.finance_tax import (
    ResidencyFact,
    TaxDomainError,
    TaxProfile,
    build_residency_workspace,
    confirm_treatment,
    create_candidate_treatment,
    persist_candidate_treatment,
)

SE_PROFILE_ID = "11111111-1111-4111-8111-111111111111"
ES_PROFILE_ID = "22222222-2222-4222-8222-222222222222"
EVENT_REVISION_ID = "33333333-3333-4333-8333-333333333333"


async def _login(client: AsyncClient, user: User) -> dict[str, str]:
    response = await client.post(
        "/api/auth/login", json={"email": user.email, "password": "testpassword123"}
    )
    assert response.status_code == 200
    return {"access_token": response.cookies["access_token"]}


def _profile(*, profile_id: str, jurisdiction: str, currency: str) -> TaxProfile:
    return TaxProfile(
        id=profile_id,
        tax_year=2026,
        jurisdiction=jurisdiction,
        reporting_currency=currency,
        materiality_threshold=Decimal("1.00"),
        reconciliation_tolerance="0.01",
        status="active",
    )


def test_residency_workspace_reports_observed_days_without_a_conclusion() -> None:
    profile = _profile(profile_id=SE_PROFILE_ID, jurisdiction="SE", currency="SEK")
    facts = (
        ResidencyFact(
            id="44444444-4444-4444-8444-444444444444",
            tax_profile_id=profile.id,
            fact_type="physical_presence",
            period_start=date(2026, 1, 1),
            period_end=date(2026, 1, 10),
            value="passport stamps",
            evidence_document_ids=("55555555-5555-4555-8555-555555555555",),
            observed_at=datetime(2026, 1, 11, tzinfo=UTC),
        ),
        ResidencyFact(
            id="66666666-6666-4666-8666-666666666666",
            tax_profile_id=profile.id,
            fact_type="physical_presence",
            period_start=date(2026, 1, 5),
            period_end=date(2026, 1, 15),
            value="travel log",
            evidence_document_ids=(),
            observed_at=datetime(2026, 1, 16, tzinfo=UTC),
        ),
    )

    workspace = build_residency_workspace(profile, facts)

    assert workspace.observed_presence_days == 15
    assert workspace.determination_status == "requires_human_confirmation"
    assert not hasattr(workspace, "confirmed_tax_residence")
    assert workspace.conflicting_fact_ids == ()


def test_same_event_keeps_independent_jurisdiction_candidates() -> None:
    se = _profile(profile_id=SE_PROFILE_ID, jurisdiction="SE", currency="SEK")
    es = _profile(profile_id=ES_PROFILE_ID, jurisdiction="ES", currency="EUR")

    se_candidate = create_candidate_treatment(
        treatment_id="77777777-7777-4777-8777-777777777777",
        event_revision_id=EVENT_REVISION_ID,
        profile=se,
        ruleset_id="se-income",
        ruleset_version="2026.1",
        category="staking_income_inventory",
        inputs={"native_quantity": Decimal("0.003000")},
        outputs={"report_value": Decimal("7.20")},
        rationale="Deterministic fixture classification.",
        source_citation_ids=("88888888-8888-4888-8888-888888888888",),
    )
    es_candidate = create_candidate_treatment(
        treatment_id="99999999-9999-4999-8999-999999999999",
        event_revision_id=EVENT_REVISION_ID,
        profile=es,
        ruleset_id="es-income",
        ruleset_version="2026.3",
        category="crypto_reward_inventory",
        inputs={"native_quantity": "0.003000"},
        outputs={"report_value": "7.20"},
        rationale="Separate Spanish candidate.",
        source_citation_ids=(),
    )

    assert se_candidate.event_revision_id == es_candidate.event_revision_id
    assert se_candidate.jurisdiction == "SE"
    assert es_candidate.jurisdiction == "ES"
    assert se_candidate.inputs["native_quantity"] == "0.003000"
    assert se_candidate.status == es_candidate.status == "candidate"


def test_confirmation_creates_new_revision_and_checks_ruleset() -> None:
    profile = _profile(profile_id=SE_PROFILE_ID, jurisdiction="SE", currency="SEK")
    candidate = create_candidate_treatment(
        treatment_id="77777777-7777-4777-8777-777777777777",
        event_revision_id=EVENT_REVISION_ID,
        profile=profile,
        ruleset_id="se-income",
        ruleset_version="2026.1",
        category="staking_income_inventory",
        inputs={},
        outputs={"taxable_value": "7.20"},
        rationale="Candidate only.",
        source_citation_ids=(),
    )

    with pytest.raises(TaxDomainError, match="ruleset version"):
        confirm_treatment(
            candidate,
            confirmed_treatment_id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            expected_ruleset_version="2026.2",
            confirmed_by="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            confirmed_at=datetime(2026, 7, 25, tzinfo=UTC),
            reason="Reviewed against source material.",
        )

    confirmed = confirm_treatment(
        candidate,
        confirmed_treatment_id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        expected_ruleset_version="2026.1",
        confirmed_by="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        confirmed_at=datetime(2026, 7, 25, tzinfo=UTC),
        reason="Reviewed against source material.",
    )

    assert candidate.status == "candidate"
    assert confirmed.status == "confirmed"
    assert confirmed.id != candidate.id
    assert confirmed.supersedes_treatment_id == candidate.id
    assert confirmed.confirmed_by == "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"


def test_financial_json_rejects_binary_float() -> None:
    profile = _profile(profile_id=SE_PROFILE_ID, jurisdiction="SE", currency="SEK")
    with pytest.raises(TaxDomainError, match="binary floating point"):
        create_candidate_treatment(
            treatment_id="77777777-7777-4777-8777-777777777777",
            event_revision_id=EVENT_REVISION_ID,
            profile=profile,
            ruleset_id="se-income",
            ruleset_version="2026.1",
            category="staking_income_inventory",
            inputs={"amount": 7.2},
            outputs={},
            rationale="Invalid numeric source.",
            source_citation_ids=(),
        )


@pytest.mark.anyio
async def test_confirmed_event_candidate_persistence_is_versioned_and_retry_idempotent(
    test_db_session: AsyncSession, test_user: User
) -> None:
    account = FinanceAccount(
        user_id=test_user.id,
        name="Fixture wallet",
        institution="Fixture",
        account_type="wallet",
        country_code="SE",
        base_currency="SEK",
        provider="manual",
        status="active",
        attributes={},
    )
    profile = FinanceTaxProfile(
        user_id=test_user.id,
        tax_year=2026,
        jurisdiction="SE",
        reporting_currency="SEK",
        materiality_threshold=Decimal("1"),
        reconciliation_tolerance=Decimal("0.01"),
        status="active",
        valuation_policy={"policy_id": "se-2026-default-v1"},
    )
    event = FinanceEvent(user_id=test_user.id)
    test_db_session.add_all([account, profile, event])
    await test_db_session.flush()
    revision = FinanceEventRevision(
        user_id=test_user.id,
        event_id=event.id,
        revision_number=1,
        event_type="staking_reward",
        effective_at=datetime(2026, 2, 1, 12, tzinfo=UTC),
        tax_date=date(2026, 2, 1),
        tax_day_policy="source_timezone",
        source_account_id=account.id,
        semantic_fingerprint="1" * 64,
        status="confirmed",
        derivation_type="fixture",
        derivation_version="v1",
        created_by_type="user",
        created_by_id=test_user.id,
        attributes={},
    )
    test_db_session.add(revision)
    await test_db_session.flush()
    event.current_revision_id = revision.id

    identity, first, first_audit = await persist_candidate_treatment(
        test_db_session,
        user_id=test_user.id,
        actor_id=test_user.id,
        event_revision_id=revision.id,
        tax_profile_id=profile.id,
    )
    retry_identity, retry, retry_audit = await persist_candidate_treatment(
        test_db_session,
        user_id=test_user.id,
        actor_id=test_user.id,
        event_revision_id=revision.id,
        tax_profile_id=profile.id,
    )

    assert first.category == "crypto_reward_inventory"
    assert first.status == "candidate"
    assert first.missing_facts == ["confirmed_tax_residence", "human_tax_review"]
    assert identity.current_revision_id == first.id
    assert retry_identity.id == identity.id
    assert retry.id == first.id
    assert first_audit is not None
    assert retry_audit is None
    assert (
        await test_db_session.scalar(select(func.count()).select_from(FinanceTaxTreatmentRevision))
        == 1
    )


@pytest.mark.anyio
async def test_tax_profile_and_residency_fact_api_are_authenticated_idempotent_and_factual(
    client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
) -> None:
    del test_db_session
    assert (await client.get("/api/finance/tax-profiles")).status_code == 401
    cookies = await _login(client, test_user)
    profile_payload = {
        "tax_year": 2026,
        "jurisdiction": "SE",
        "reporting_currency": "sek",
        "materiality_threshold": "1.00",
        "reconciliation_tolerance": "0.01",
        "status": "active",
    }
    headers = {"Idempotency-Key": "se-profile-2026"}
    first = await client.post(
        "/api/finance/tax-profiles", json=profile_payload, headers=headers, cookies=cookies
    )
    second = await client.post(
        "/api/finance/tax-profiles", json=profile_payload, headers=headers, cookies=cookies
    )
    assert first.status_code == second.status_code == 201
    assert first.json() == second.json()
    profile_id = first.json()["profile"]["id"]
    assert first.json()["profile"]["reporting_currency"] == "SEK"
    listed = await client.get("/api/finance/tax-profiles", cookies=cookies)
    assert listed.json()["completeness"]["is_complete"] is True
    assert listed.json()["empty_state"] is None

    numeric_decimal = await client.post(
        "/api/finance/tax-profiles",
        json={**profile_payload, "tax_year": 2027, "materiality_threshold": 1.0},
        headers={"Idempotency-Key": "numeric-decimal-rejected"},
        cookies=cookies,
    )
    assert numeric_decimal.status_code == 422

    fact = await client.post(
        f"/api/finance/tax-profiles/{profile_id}/residency-facts",
        json={
            "fact_type": "physical_presence",
            "period_start": "2026-01-01",
            "period_end": "2026-01-10",
            "value": {"observed_days": 10},
            "evidence_document_ids": [],
            "source": "travel_log",
            "notes": None,
        },
        headers={"Idempotency-Key": "se-presence-1"},
        cookies=cookies,
    )
    assert fact.status_code == 201
    assert fact.json()["fact"]["status"] == "observed"
    assert fact.json()["determination_status"] == "requires_human_confirmation"

    unowned_evidence = await client.post(
        f"/api/finance/tax-profiles/{profile_id}/residency-facts",
        json={
            "fact_type": "physical_presence",
            "period_start": "2026-02-01",
            "period_end": "2026-02-01",
            "value": {"observed_days": 1},
            "evidence_document_ids": ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
            "source": "travel_log",
            "notes": None,
        },
        headers={"Idempotency-Key": "unowned-evidence"},
        cookies=cookies,
    )
    assert unowned_evidence.status_code == 404


@pytest.mark.anyio
async def test_cross_owner_tax_profile_is_hidden(client: AsyncClient, test_user: User) -> None:
    cookies = await _login(client, test_user)
    hidden_id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    response = await client.get(
        f"/api/finance/tax-profiles/{hidden_id}/residency-facts", cookies=cookies
    )
    assert response.status_code == 404
