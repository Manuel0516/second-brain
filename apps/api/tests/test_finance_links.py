from datetime import UTC, datetime
from decimal import Decimal
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    File,
    FinanceAuditEntry,
    FinanceEvent,
    FinanceEvidenceDocument,
    FinanceReportRun,
    FinanceTaxProfile,
    Link,
    User,
)
from app.security import hash_password

pytestmark = pytest.mark.anyio


async def _user_and_token(
    client: AsyncClient, session: AsyncSession, name: str
) -> tuple[User, str]:
    user = User(
        id=str(uuid4()),
        username=name,
        email=f"{name}@example.com",
        password_hash=hash_password("testpassword123"),
        is_active=True,
    )
    session.add(user)
    await session.commit()
    response = await client.post(
        "/api/auth/login",
        json={"email": user.email, "password": "testpassword123"},
    )
    assert response.status_code == 200
    token = response.cookies.get("access_token")
    assert token
    return user, token


async def _finance_nodes(session: AsyncSession, user: User) -> dict[str, str]:
    event = FinanceEvent(user_id=user.id)
    file = File(
        user_id=user.id,
        name="statement.pdf",
        content_type="application/pdf",
        size=42,
    )
    report_file = File(
        user_id=user.id,
        name="finance-report.zip",
        content_type="application/zip",
        size=84,
    )
    tax_profile = FinanceTaxProfile(
        user_id=user.id,
        tax_year=2026,
        jurisdiction="SE",
        reporting_currency="SEK",
        materiality_threshold=Decimal("1"),
        reconciliation_tolerance=Decimal("0.01"),
        status="active",
        valuation_policy={},
    )
    session.add_all([event, file, report_file, tax_profile])
    await session.flush()
    evidence = FinanceEvidenceDocument(
        user_id=user.id,
        file_id=file.id,
        original_name="statement.pdf",
        media_type="application/pdf",
        size=42,
        sha256="a" * 64,
        object_version="fixture-v1",
        source_kind="statement",
        captured_at=datetime.now(UTC),
        extraction_status="not_requested",
        retention_status="immutable",
        attributes={},
    )
    report = FinanceReportRun(
        user_id=user.id,
        tax_profile_id=tax_profile.id,
        tax_year=2026,
        jurisdiction="SE",
        reporting_currency="SEK",
        format="zip",
        status="ready",
        ruleset_versions={},
        algorithm_version="fixture-v1",
        blockers=[],
        warnings=[],
        manifest={},
        manifest_sha256="b" * 64,
        file_id=report_file.id,
        file_sha256="c" * 64,
    )
    session.add_all([evidence, report])
    await session.commit()
    return {
        "finance_event": event.id,
        "finance_evidence": evidence.id,
        "finance_report": report.id,
    }


async def test_finance_nodes_link_to_notes_with_backlinks_and_audit(
    client: AsyncClient, test_db_session: AsyncSession
) -> None:
    user, token = await _user_and_token(client, test_db_session, "finance-link-owner")
    nodes = await _finance_nodes(test_db_session, user)
    page = (
        await client.post(
            "/api/pages",
            json={"title": "Tax evidence"},
            cookies={"access_token": token},
        )
    ).json()

    link_ids: list[str] = []
    for node_type, node_id in nodes.items():
        response = await client.post(
            "/api/links",
            json={
                "source_type": node_type,
                "source_id": node_id,
                "target_type": "page",
                "target_id": page["id"],
                "relation": "documents",
            },
            cookies={"access_token": token},
        )
        assert response.status_code == 201
        assert response.json()["source_type"] == node_type
        link_ids.append(response.json()["id"])

    backlinks = await client.get(
        f"/api/nodes/page/{page['id']}/backlinks",
        cookies={"access_token": token},
    )
    assert backlinks.status_code == 200
    assert {(item["source_type"], item["title"]) for item in backlinks.json()} == {
        ("finance_event", "Finance event"),
        ("finance_evidence", "statement.pdf"),
        ("finance_report", "SE 2026 finance report"),
    }
    created_audits = list(
        await test_db_session.scalars(
            select(FinanceAuditEntry).where(
                FinanceAuditEntry.user_id == user.id,
                FinanceAuditEntry.action == "link.created",
            )
        )
    )
    assert len(created_audits) == 3
    assert {audit.entity_id for audit in created_audits} == set(link_ids)

    for link_id in link_ids:
        response = await client.delete(f"/api/links/{link_id}", cookies={"access_token": token})
        assert response.status_code == 204
    deleted_audits = list(
        await test_db_session.scalars(
            select(FinanceAuditEntry).where(
                FinanceAuditEntry.user_id == user.id,
                FinanceAuditEntry.action == "link.deleted",
            )
        )
    )
    assert len(deleted_audits) == 3


async def test_finance_link_creation_hides_every_cross_owner_node(
    client: AsyncClient, test_db_session: AsyncSession
) -> None:
    owner, _ = await _user_and_token(client, test_db_session, "finance-node-owner")
    _, other_token = await _user_and_token(client, test_db_session, "finance-node-other")
    nodes = await _finance_nodes(test_db_session, owner)
    other_page = (
        await client.post(
            "/api/pages",
            json={"title": "Other user's page"},
            cookies={"access_token": other_token},
        )
    ).json()

    for node_type, node_id in nodes.items():
        response = await client.post(
            "/api/links",
            json={
                "source_type": "page",
                "source_id": other_page["id"],
                "target_type": node_type,
                "target_id": node_id,
                "relation": "references",
            },
            cookies={"access_token": other_token},
        )
        assert response.status_code == 404
    assert list(await test_db_session.scalars(select(Link))) == []


async def test_non_finance_generic_links_keep_existing_behavior_without_finance_audit(
    client: AsyncClient, test_db_session: AsyncSession
) -> None:
    user, token = await _user_and_token(client, test_db_session, "ordinary-link-owner")
    source = (
        await client.post("/api/pages", json={"title": "Source"}, cookies={"access_token": token})
    ).json()
    target = (
        await client.post("/api/pages", json={"title": "Target"}, cookies={"access_token": token})
    ).json()

    created = await client.post(
        "/api/links",
        json={
            "source_type": "page",
            "source_id": source["id"],
            "target_type": "page",
            "target_id": target["id"],
            "relation": "mentions",
        },
        cookies={"access_token": token},
    )
    assert created.status_code == 201
    backlinks = await client.get(
        f"/api/nodes/page/{target['id']}/backlinks",
        cookies={"access_token": token},
    )
    assert backlinks.status_code == 200
    assert backlinks.json()[0]["title"] == "Source"
    assert (
        list(
            await test_db_session.scalars(
                select(FinanceAuditEntry).where(FinanceAuditEntry.user_id == user.id)
            )
        )
        == []
    )
