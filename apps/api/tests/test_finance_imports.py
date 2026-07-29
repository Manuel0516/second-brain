from decimal import Decimal
from pathlib import Path

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    File,
    FinanceAccount,
    FinanceEvent,
    FinanceEventRevision,
    FinanceEvidenceDocument,
    Link,
    User,
)
from app.services import finance_imports
from app.services.finance_evidence import compute_sha256
from app.services.finance_import_projection import project_import_records
from app.services.finance_imports import (
    FinanceImportError,
    build_import_preview,
    commit_raw_records,
    parse_records,
    parse_source,
    preview_import,
    provider_fingerprint,
    row_fingerprint,
    semantic_fingerprint,
)

FIXTURE = Path(__file__).parent / "fixtures" / "finance" / "staking_rewards.csv"
MAPPING: dict[str, object] = {
    "date_column": "timestamp",
    "quantity_column": "quantity",
    "asset_column": "asset",
    "description_column": "description",
    "external_id_column": "external_id",
    "event_type_column": "event_type",
    "timezone": "Europe/Madrid",
    "decimal_separator": ".",
}


def test_frozen_24_row_fixture_previews_without_loss() -> None:
    data = FIXTURE.read_bytes()
    preview = build_import_preview(
        import_id="8612f006-027d-40a7-afca-9c1e16cfed40",
        data=data,
        account_id="1e9793bb-df01-46b9-8870-1245640db77b",
        parser_id="csv",
        parser_version="staking-v1",
        import_mode="normal",
        mapping=MAPPING,
    )
    parsed = parse_records(
        parse_source(data, "csv"),
        MAPPING,
        account_id="1e9793bb-df01-46b9-8870-1245640db77b",
        parser_id="csv",
    )
    total = sum(
        Decimal(str(record.extracted_payload["quantity"]))
        for record in parsed
        if record.extracted_payload is not None
    )
    assert preview["expected_record_count"] == 24
    assert preview["rejected_record_count"] == 0
    assert preview["coverage_start"] == "2026-07-01"
    assert preview["coverage_end"] == "2026-07-01"
    assert total == Decimal("0.003000")
    assert len({record.provider_external_id for record in parsed}) == 24


def test_mapping_rejections_remain_visible_in_preview() -> None:
    preview = build_import_preview(
        import_id="1d016453-07d2-4539-9599-fdd1cce638c9",
        data=b"timestamp,amount\n2026-01-01T00:00:00Z,not-a-number\n",
        account_id="account",
        parser_id="csv",
        parser_version="1",
        import_mode="normal",
        mapping={"date_column": "timestamp", "amount_column": "amount"},
    )
    assert preview["rejected_record_count"] == 1
    assert preview["rejected_rows"] == [
        {
            "source_index": "2",
            "code": "mapping_error",
            "message": "Mapped decimal value is invalid",
        }
    ]


@pytest.mark.parametrize(
    ("mapping", "message"),
    [
        ({}, "require date_column"),
        ({"date_column": "timestamp"}, "require amount_column or quantity_column"),
    ],
)
def test_transaction_mapping_requires_projectable_fields(
    mapping: dict[str, object], message: str
) -> None:
    source = parse_source(b"timestamp,amount\n2026-01-01T00:00:00Z,1\n", "csv")
    with pytest.raises(FinanceImportError, match=message):
        parse_records(source, mapping, account_id="account", parser_id="csv")


def test_transaction_rows_reject_invalid_timezone_event_type_and_json_primitives() -> None:
    bad_timezone = parse_records(
        parse_source(b"timestamp,amount\n2026-01-01T00:00:00Z,1\n", "csv"),
        {
            "date_column": "timestamp",
            "amount_column": "amount",
            "timezone": "Not/A_Timezone",
        },
        account_id="account",
        parser_id="csv",
    )
    assert bad_timezone[0].rejection_reason == "Mapping timezone is invalid"

    bad_event = parse_records(
        parse_source(b"timestamp,amount,type\n2026-01-01T00:00:00Z,1,typo\n", "csv"),
        {
            "date_column": "timestamp",
            "amount_column": "amount",
            "event_type_column": "type",
        },
        account_id="account",
        parser_id="csv",
    )
    assert bad_event[0].rejection_reason == "Mapped event type is unsupported"

    primitive = parse_records(
        parse_source(b'[1, {"timestamp":"2026-01-01T00:00:00Z","amount":1}]', "json"),
        {"date_column": "timestamp", "amount_column": "amount"},
        account_id="account",
        parser_id="json",
    )
    assert primitive[0].rejection_code == "malformed_row"
    assert primitive[1].rejection_code is None


def test_csv_headers_are_trimmed_without_losing_row_values() -> None:
    records = parse_records(
        parse_source(b" timestamp , amount \n2026-01-01T00:00:00Z,1.25\n", "csv"),
        {"date_column": "timestamp", "amount_column": "amount"},
        account_id="account",
        parser_id="csv",
    )
    assert records[0].extracted_payload == {
        "effective_at": "2026-01-01T00:00:00+00:00",
        "amount": "1.25",
    }


def test_transaction_record_count_is_bounded(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(finance_imports, "MAX_IMPORT_RECORDS", 1)
    with pytest.raises(FinanceImportError, match="too many records"):
        parse_source(b"timestamp,amount\n2026-01-01,1\n2026-01-02,2\n", "csv")


def test_layered_fingerprints_are_deterministic_and_distinct() -> None:
    assert row_fingerprint({"amount": "1", "description": "x"}) == row_fingerprint(
        {"description": "x", "amount": "1"}
    )
    assert provider_fingerprint("Example", "id-1") != provider_fingerprint("Other", "id-1")
    assert semantic_fingerprint({"amount": "1", "description": " café "}) == semantic_fingerprint(
        {"description": " café ", "amount": "1"}
    )


@pytest.mark.parametrize(
    ("parser_id", "data", "expected_rows"),
    [
        ("json", b'{"records":[{"date":"2026-01-01","amount":1}]}', 1),
        ("pdf_metadata", b"%PDF-1.7\n/Type /Page\n%%EOF", 1),
        (
            "image_metadata",
            b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x02\x00\x00\x00\x03",
            1,
        ),
    ],
)
def test_secondary_parsers_have_deterministic_foundations(
    parser_id: str, data: bytes, expected_rows: int
) -> None:
    source = parse_source(data, parser_id)  # type: ignore[arg-type]
    assert len(source.rows) == expected_rows


def test_pdf_parser_exposes_bounded_immutable_extraction_provenance() -> None:
    text = "Official statement total: 100 EUR"
    source = parse_source(
        b"%PDF-1.7\n/Type /Page\n%%EOF",
        "pdf_metadata",
        extracted_text=text,
    )
    payload = source.rows[0].original_payload
    assert payload["text_excerpt"] == text
    assert payload["extracted_text_characters"] == str(len(text))
    assert payload["extracted_text_sha256"] == compute_sha256(text.encode())


async def _finance_source(
    session: AsyncSession, user: User
) -> tuple[FinanceAccount, FinanceEvidenceDocument]:
    account = FinanceAccount(
        user_id=user.id,
        name="Fixture exchange",
        institution="Example",
        account_type="exchange",
        country_code="SE",
        base_currency="EUR",
        provider="example",
    )
    file = File(
        user_id=user.id,
        name="staking_rewards.csv",
        content_type="text/csv",
        size=len(FIXTURE.read_bytes()),
    )
    session.add_all([account, file])
    await session.flush()
    evidence = FinanceEvidenceDocument(
        user_id=user.id,
        file_id=file.id,
        original_name=file.name,
        media_type=file.content_type,
        size=file.size,
        sha256="7" * 64,
        object_version="fixture-v1",
        source_kind="fixture",
        captured_at=account.created_at,
    )
    session.add(evidence)
    await session.flush()
    return account, evidence


@pytest.mark.anyio
async def test_preview_and_commit_are_idempotent_and_preserve_all_fixture_rows(
    test_db_session: AsyncSession, test_user: User
) -> None:
    account, evidence = await _finance_source(test_db_session, test_user)
    data = FIXTURE.read_bytes()
    first, first_preview, created = await preview_import(
        test_db_session,
        user_id=test_user.id,
        account_id=account.id,
        evidence=evidence,
        data=data,
        parser_id="csv",
        parser_version="staking-v1",
        import_mode="normal",
        mapping=MAPPING,
    )
    second, second_preview, created_again = await preview_import(
        test_db_session,
        user_id=test_user.id,
        account_id=account.id,
        evidence=evidence,
        data=data,
        parser_id="csv",
        parser_version="staking-v1",
        import_mode="normal",
        mapping=MAPPING,
    )
    assert second.id == first.id
    assert second_preview == first_preview
    assert created is True
    assert created_again is False

    committed = await commit_raw_records(
        test_db_session,
        import_row=first,
        data=data,
        mapping=MAPPING,
        provider="example",
    )
    repeated = await commit_raw_records(
        test_db_session,
        import_row=first,
        data=data,
        mapping=MAPPING,
        provider="example",
    )
    assert len(committed.records) == 24
    assert len(committed.accepted_records) == 24
    assert committed.rejected_record_count == 0
    assert repeated.already_committed is True
    assert [row.id for row in repeated.records] == [row.id for row in committed.records]


@pytest.mark.anyio
async def test_duplicate_provider_rows_remain_visible_as_rejections(
    test_db_session: AsyncSession, test_user: User
) -> None:
    account, evidence = await _finance_source(test_db_session, test_user)
    data = (
        b"timestamp,external_id,amount\n2026-01-01T00:00:00Z,same,1\n2026-01-02T00:00:00Z,same,2\n"
    )
    mapping: dict[str, object] = {
        "date_column": "timestamp",
        "external_id_column": "external_id",
        "amount_column": "amount",
    }
    import_row, _, _ = await preview_import(
        test_db_session,
        user_id=test_user.id,
        account_id=account.id,
        evidence=evidence,
        data=data,
        parser_id="csv",
        parser_version="duplicates-v1",
        import_mode="normal",
        mapping=mapping,
    )
    result = await commit_raw_records(
        test_db_session,
        import_row=import_row,
        data=data,
        mapping=mapping,
        provider="example",
    )
    assert len(result.records) == 2
    assert result.duplicate_record_count == 1
    assert result.records[1].rejection_code == "duplicate_provider_id"
    assert result.records[1].provider_external_id is None
    duplicate_link = await test_db_session.scalar(
        select(Link).where(
            Link.source_type == "finance_raw_record",
            Link.source_id == result.records[1].id,
            Link.target_type == "finance_raw_record",
            Link.relation == "possible_duplicate_of",
        )
    )
    assert duplicate_link is not None
    assert duplicate_link.target_id == result.records[0].id


@pytest.mark.anyio
async def test_row_and_provider_deduplication_is_scoped_to_account(
    test_db_session: AsyncSession, test_user: User
) -> None:
    first_account, evidence = await _finance_source(test_db_session, test_user)
    second_account = FinanceAccount(
        user_id=test_user.id,
        name="Second exchange account",
        institution="Example",
        account_type="exchange",
        country_code="SE",
        base_currency="EUR",
        provider="example",
    )
    test_db_session.add(second_account)
    await test_db_session.flush()
    data = b"timestamp,external_id,amount\n2026-01-01T00:00:00Z,same,1\n"
    mapping: dict[str, object] = {
        "date_column": "timestamp",
        "external_id_column": "external_id",
        "amount_column": "amount",
    }
    first_import, _, _ = await preview_import(
        test_db_session,
        user_id=test_user.id,
        account_id=first_account.id,
        evidence=evidence,
        data=data,
        parser_id="csv",
        parser_version="scope-v1",
        import_mode="normal",
        mapping=mapping,
    )
    first_commit = await commit_raw_records(
        test_db_session,
        import_row=first_import,
        data=data,
        mapping=mapping,
        provider="example",
    )
    assert len(first_commit.accepted_records) == 1

    second_import, second_preview, _ = await preview_import(
        test_db_session,
        user_id=test_user.id,
        account_id=second_account.id,
        evidence=evidence,
        data=data,
        parser_id="csv",
        parser_version="scope-v1",
        import_mode="normal",
        mapping=mapping,
    )
    assert second_preview["duplicate_record_count"] == 0
    second_commit = await commit_raw_records(
        test_db_session,
        import_row=second_import,
        data=data,
        mapping=mapping,
        provider="example",
    )
    assert len(second_commit.accepted_records) == 1
    assert (
        first_commit.records[0].provider_external_id
        != second_commit.records[0].provider_external_id
    )

    repeated_import, repeated_preview, _ = await preview_import(
        test_db_session,
        user_id=test_user.id,
        account_id=first_account.id,
        evidence=evidence,
        data=data,
        parser_id="csv",
        parser_version="scope-v2",
        import_mode="normal",
        mapping=mapping,
    )
    assert repeated_import.id != first_import.id
    assert repeated_preview["duplicate_record_count"] == 1


@pytest.mark.anyio
async def test_reprocess_retains_duplicate_snapshot_without_rejecting_it(
    test_db_session: AsyncSession, test_user: User
) -> None:
    account, evidence = await _finance_source(test_db_session, test_user)
    data = b"timestamp,external_id,amount\n2026-01-01T00:00:00Z,same,1\n"
    mapping: dict[str, object] = {
        "date_column": "timestamp",
        "external_id_column": "external_id",
        "amount_column": "amount",
    }
    original, _, _ = await preview_import(
        test_db_session,
        user_id=test_user.id,
        account_id=account.id,
        evidence=evidence,
        data=data,
        parser_id="csv",
        parser_version="reprocess-v1",
        import_mode="normal",
        mapping=mapping,
    )
    original_plan = await commit_raw_records(
        test_db_session,
        import_row=original,
        data=data,
        mapping=mapping,
        provider="example",
    )

    reprocess, _, _ = await preview_import(
        test_db_session,
        user_id=test_user.id,
        account_id=account.id,
        evidence=evidence,
        data=data,
        parser_id="csv",
        parser_version="reprocess-v2",
        import_mode="reprocess",
        mapping=mapping,
    )
    reprocess_plan = await commit_raw_records(
        test_db_session,
        import_row=reprocess,
        data=data,
        mapping=mapping,
        provider="example",
    )
    assert reprocess.status == "reprocessed"
    assert reprocess_plan.duplicate_record_count == 1
    assert reprocess_plan.rejected_record_count == 0
    assert len(reprocess_plan.accepted_records) == 1
    extracted_payload = reprocess_plan.records[0].extracted_payload
    assert extracted_payload is not None
    assert extracted_payload["prior_raw_record_id"] == (original_plan.records[0].id)
    assert reprocess_plan.records[0].provider_external_id is None


@pytest.mark.anyio
async def test_changed_reprocess_creates_successor_revision_on_stable_event(
    test_db_session: AsyncSession, test_user: User
) -> None:
    account, evidence = await _finance_source(test_db_session, test_user)
    data = (
        b"timestamp,external_id,event_type,asset,quantity,corrected_quantity\n"
        b"2026-01-01T00:00:00Z,same,staking_reward,ETH,1,2\n"
    )
    original_mapping: dict[str, object] = {
        "date_column": "timestamp",
        "external_id_column": "external_id",
        "event_type_column": "event_type",
        "asset_column": "asset",
        "quantity_column": "quantity",
    }
    corrected_mapping = {**original_mapping, "quantity_column": "corrected_quantity"}
    original, _, _ = await preview_import(
        test_db_session,
        user_id=test_user.id,
        account_id=account.id,
        evidence=evidence,
        data=data,
        parser_id="csv",
        parser_version="correction-v1",
        import_mode="normal",
        mapping=original_mapping,
    )
    original_raw = await commit_raw_records(
        test_db_session,
        import_row=original,
        data=data,
        mapping=original_mapping,
        provider="example",
    )
    original_projection = await project_import_records(
        test_db_session,
        import_row=original,
        account=account,
        records=original_raw.accepted_records,
    )
    assert len(original_projection.created_event_revision_ids) == 1

    reprocess, _, _ = await preview_import(
        test_db_session,
        user_id=test_user.id,
        account_id=account.id,
        evidence=evidence,
        data=data,
        parser_id="csv",
        parser_version="correction-v2",
        import_mode="reprocess",
        mapping=corrected_mapping,
    )
    corrected_raw = await commit_raw_records(
        test_db_session,
        import_row=reprocess,
        data=data,
        mapping=corrected_mapping,
        provider="example",
    )
    corrected_projection = await project_import_records(
        test_db_session,
        import_row=reprocess,
        account=account,
        records=corrected_raw.accepted_records,
    )
    repeated_projection = await project_import_records(
        test_db_session,
        import_row=reprocess,
        account=account,
        records=corrected_raw.accepted_records,
    )
    assert len(corrected_projection.created_event_revision_ids) == 1
    assert repeated_projection.event_revision_ids == corrected_projection.event_revision_ids
    assert repeated_projection.created is False
    assert await test_db_session.scalar(select(func.count(FinanceEvent.id))) == 1
    assert await test_db_session.scalar(select(func.count(FinanceEventRevision.id))) == 2
    first_revision = await test_db_session.get(
        FinanceEventRevision, original_projection.event_revision_ids[0]
    )
    successor = await test_db_session.get(
        FinanceEventRevision, corrected_projection.event_revision_ids[0]
    )
    assert first_revision is not None
    assert successor is not None
    assert successor.event_id == first_revision.event_id
    assert successor.revision_number == 2
    assert successor.supersedes_revision_id == first_revision.id
