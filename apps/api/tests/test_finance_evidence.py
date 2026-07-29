import io
import shutil
import subprocess
import tarfile
import zipfile
from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Link, User
from app.services import finance_evidence
from app.services.finance_evidence import (
    EvidenceTextExtraction,
    FinanceUploadValidationError,
    MalwareScanResult,
    create_evidence_document,
    evidence_response,
    file_has_immutable_evidence,
    inspect_archive,
    validate_evidence_file,
)


def _zip(entries: dict[str, bytes]) -> bytes:
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path, content in entries.items():
            archive.writestr(path, content)
    return output.getvalue()


def _tar(*, path: str = "statement.csv", content: bytes = b"date,amount\n") -> bytes:
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode="w") as archive:
        info = tarfile.TarInfo(path)
        info.size = len(content)
        archive.addfile(info, io.BytesIO(content))
    return output.getvalue()


@pytest.mark.parametrize(
    ("filename", "media_type", "data", "canonical"),
    [
        ("rows.csv", "text/csv", b"date,amount\n2026-01-01,1\n", "text/csv"),
        ("rows.json", "application/json", b"[]", "application/json"),
        ("statement.pdf", "application/pdf", b"%PDF-1.7\n%%EOF", "application/pdf"),
        (
            "scan.png",
            "image/png",
            b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR"
            + (1).to_bytes(4, "big")
            + (1).to_bytes(4, "big"),
            "image/png",
        ),
        (
            "scan.jpg",
            "image/jpeg",
            b"\xff\xd8\xff\xc0\x00\x0b\x08\x00\x01\x00\x01\x03\x01\x11\x00\xff\xd9",
            "image/jpeg",
        ),
        (
            "scan.webp",
            "image/webp",
            b"RIFF\x16\x00\x00\x00WEBPVP8X\x0a\x00\x00\x00" + b"\x00" * 10,
            "image/webp",
        ),
        ("bundle.zip", "application/zip", _zip({"rows.csv": b"a\n1\n"}), "application/zip"),
        ("bundle.tar", "application/x-tar", _tar(), "application/x-tar"),
    ],
)
def test_allowed_evidence_types_are_validated(
    filename: str, media_type: str, data: bytes, canonical: str
) -> None:
    assert validate_evidence_file(filename, media_type, data) == canonical


def test_extension_mismatch_uses_frozen_error_shape() -> None:
    with pytest.raises(FinanceUploadValidationError) as caught:
        validate_evidence_file("statement.pdf", "image/png", b"%PDF-1.7\n%%EOF")
    assert caught.value.detail() == {
        "code": "extension_mismatch",
        "message": "Finance evidence extension does not match its declared type",
        "retryable": False,
    }


def test_zero_dimension_png_is_rejected() -> None:
    with pytest.raises(FinanceUploadValidationError) as caught:
        validate_evidence_file(
            "scan.png",
            "image/png",
            b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR" + b"\x00" * 8,
        )
    assert caught.value.code == "malformed_file"


@pytest.mark.parametrize("path", ["../escape.csv", "/absolute.csv", "C:\\escape.csv"])
def test_archive_traversal_paths_are_rejected(path: str) -> None:
    with pytest.raises(FinanceUploadValidationError, match="unsafe path") as caught:
        inspect_archive(_zip({path: b"secret"}), "application/zip")
    assert caught.value.code == "archive_unsafe_path"


def test_archive_member_limit_is_enforced(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(finance_evidence, "MAX_ARCHIVE_MEMBERS", 2)
    with pytest.raises(FinanceUploadValidationError) as caught:
        inspect_archive(_zip({"1": b"", "2": b"", "3": b""}), "application/zip")
    assert caught.value.code == "archive_too_many_entries"


def test_archive_decompression_ratio_is_bounded() -> None:
    with pytest.raises(FinanceUploadValidationError) as caught:
        inspect_archive(_zip({"compressed.txt": b"0" * 100_000}), "application/zip")
    assert caught.value.code == "archive_too_large"


def test_tar_links_are_rejected() -> None:
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode="w") as archive:
        info = tarfile.TarInfo("link")
        info.type = tarfile.SYMTYPE
        info.linkname = "../outside"
        archive.addfile(info)
    with pytest.raises(FinanceUploadValidationError) as caught:
        inspect_archive(output.getvalue(), "application/x-tar")
    assert caught.value.code == "archive_unsafe_path"


def test_encrypted_zip_members_are_rejected() -> None:
    data = bytearray(_zip({"private.csv": b"a\n1\n"}))
    local_flag_offset = 6
    central_header = data.find(b"PK\x01\x02")
    assert central_header > 0
    data[local_flag_offset : local_flag_offset + 2] = (1).to_bytes(2, "little")
    data[central_header + 8 : central_header + 10] = (1).to_bytes(2, "little")
    with pytest.raises(FinanceUploadValidationError) as caught:
        inspect_archive(bytes(data), "application/zip")
    assert caught.value.code == "archive_unsafe_path"


def test_evidence_size_is_bounded_before_parsing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(finance_evidence, "max_file_size", lambda: 2)
    with pytest.raises(FinanceUploadValidationError) as caught:
        validate_evidence_file("rows.json", "application/json", b"[1]")
    assert caught.value.code == "file_too_large"


def test_dev_scans_when_clamav_is_available(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        finance_evidence,
        "get_settings",
        lambda: SimpleNamespace(environment="dev", finance_scan_timeout_seconds=7),
    )
    monkeypatch.setattr(shutil, "which", lambda executable: f"/bin/{executable}")
    calls: list[tuple[bytes, str, int]] = []

    def scan(data: bytes, filename: str, *, timeout: int) -> tuple[int, str]:
        calls.append((data, filename, timeout))
        return 0, "ClamAV 1.4.3/27800/Tue"

    monkeypatch.setattr(finance_evidence, "_clamav_scan_code", scan)
    result = finance_evidence.scan_finance_evidence(b"clean", "statement.pdf")
    assert calls == [(b"clean", "statement.pdf", 7)]
    assert result.status == "clean"
    assert result.engine_version == "ClamAV 1.4.3"
    assert result.signature_version == "27800/Tue"


def test_dev_without_clamav_records_not_required(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        finance_evidence,
        "get_settings",
        lambda: SimpleNamespace(environment="dev", finance_scan_timeout_seconds=7),
    )
    monkeypatch.setattr(shutil, "which", lambda executable: None)
    assert finance_evidence.scan_finance_evidence(b"clean", "rows.csv").as_dict() == {
        "status": "not_required",
        "engine": None,
        "engine_version": None,
        "signature_version": None,
    }


def test_production_clamav_detection_and_failure_are_fail_closed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        finance_evidence,
        "get_settings",
        lambda: SimpleNamespace(environment="prod", finance_scan_timeout_seconds=7),
    )
    monkeypatch.setattr(shutil, "which", lambda executable: f"/bin/{executable}")
    monkeypatch.setattr(
        finance_evidence, "_clamav_scan_code", lambda data, filename, timeout: (1, "ClamAV")
    )
    with pytest.raises(FinanceUploadValidationError) as infected:
        finance_evidence.scan_finance_evidence(b"malicious", "rows.csv")
    assert infected.value.code == "malware_detected"
    assert infected.value.retryable is False

    monkeypatch.setattr(
        finance_evidence,
        "_clamav_scan_code",
        lambda data, filename, timeout: (_ for _ in ()).throw(RuntimeError("offline")),
    )
    with pytest.raises(FinanceUploadValidationError) as unavailable:
        finance_evidence.scan_finance_evidence(b"clean", "rows.csv")
    assert unavailable.value.code == "scanner_unavailable"
    assert unavailable.value.retryable is True


def test_poppler_version_uses_stderr_and_v_flag(monkeypatch: pytest.MonkeyPatch) -> None:
    commands: list[list[str]] = []
    monkeypatch.setattr(shutil, "which", lambda executable: f"/bin/{executable}")

    def run(command: list[str], **kwargs: object) -> SimpleNamespace:
        commands.append(command)
        return SimpleNamespace(returncode=0, stdout=b"", stderr=b"pdftotext version 25.06.0\n")

    monkeypatch.setattr(subprocess, "run", run)
    assert finance_evidence._command_version("pdftotext") == "pdftotext version 25.06.0"
    assert commands == [["/bin/pdftotext", "-v"]]


def test_scanned_pdf_fallback_uses_bounded_raster_budget(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[tuple[str, int, bool]] = []
    monkeypatch.setattr(finance_evidence, "_command_version", lambda executable: "version")
    monkeypatch.setattr(finance_evidence, "_pdf_page_count", lambda path, deadline: 1)
    monkeypatch.setattr(shutil, "which", lambda executable: executable)

    def run(
        command: list[str],
        *,
        timeout: float,
        output_limit: int = finance_evidence.MAX_OCR_TEXT_BYTES,
        allow_truncated_output: bool = True,
    ) -> None:
        executable = Path(command[0]).name
        calls.append((executable, output_limit, allow_truncated_output))
        if executable == "pdftotext":
            Path(command[-1]).write_text("   ", encoding="utf-8")
        elif executable == "pdftoppm":
            Path(f"{command[-1]}.png").write_bytes(
                b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR"
                + (100).to_bytes(4, "big")
                + (100).to_bytes(4, "big")
            )

    monkeypatch.setattr(finance_evidence, "_run_bounded_command", run)
    monkeypatch.setattr(
        finance_evidence,
        "_tesseract_text",
        lambda image_path, output_base, deadline: ("OCR result", False),
    )
    result = finance_evidence._extract_pdf_text(b"%PDF-1.7\n%%EOF", timeout=30)
    assert result.method == "pdftoppm+tesseract"
    assert result.text == "OCR result"
    assert ("pdftoppm", finance_evidence.MAX_OCR_RASTER_BYTES, False) in calls


@pytest.mark.anyio
async def test_evidence_hash_is_idempotent_and_response_has_lineage(
    test_db_session: AsyncSession, test_user: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    uploads: list[tuple[str, str, bytes, str]] = []

    def upload(user_id: str, file_id: str, data: bytes, media_type: str) -> str:
        uploads.append((user_id, file_id, data, media_type))
        return f"{user_id}/{file_id}"

    monkeypatch.setattr(
        finance_evidence,
        "scan_finance_evidence",
        lambda data, filename: MalwareScanResult("not_required", None, None, None),
    )

    first, created = await create_evidence_document(
        test_db_session,
        user_id=test_user.id,
        filename="rewards.csv",
        declared_media_type="text/csv",
        data=b"date,amount\n2026-01-01,1\n",
        source_kind="manual_upload",
        captured_at=datetime(2026, 1, 2, tzinfo=UTC),
        upload_object=upload,
    )
    second, created_again = await create_evidence_document(
        test_db_session,
        user_id=test_user.id,
        filename="rewards.csv",
        declared_media_type="text/csv",
        data=b"date,amount\n2026-01-01,1\n",
        source_kind="manual_upload",
        captured_at=datetime(2026, 1, 2, tzinfo=UTC),
        upload_object=upload,
    )
    assert first.id == second.id
    assert created is True
    assert created_again is False
    assert len(uploads) == 1

    revision_id = "2a32aa8f-a38d-4058-b9d1-3ecbc3cf8f6c"
    test_db_session.add(
        Link(
            source_type="finance_event_revision",
            source_id=revision_id,
            target_type="finance_evidence",
            target_id=first.id,
            relation="supported_by",
        )
    )
    await test_db_session.flush()
    body = await evidence_response(test_db_session, first)
    assert body["linked_event_revision_ids"] == [revision_id]
    assert body["retention_status"] == "immutable"
    assert body["download_url"] == f"/api/files/{first.file_id}"
    assert first.object_version == f"sha256:{first.sha256}"
    assert first.attributes["content_addressed"] is True
    assert first.attributes["malware_scan"] == {
        "status": "not_required",
        "engine": None,
        "engine_version": None,
        "signature_version": None,
    }
    assert await file_has_immutable_evidence(
        test_db_session, user_id=test_user.id, file_id=first.file_id
    )


@pytest.mark.anyio
async def test_ocr_and_scanner_provenance_are_stored_with_immutable_evidence(
    test_db_session: AsyncSession,
    test_user: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    extraction = EvidenceTextExtraction(
        text="Saldo 100 EUR",
        method="tesseract",
        parser_version="finance-ocr-v1",
        text_sha256=finance_evidence.compute_sha256(b"Saldo 100 EUR"),
        truncated=False,
        executable_versions={"tesseract": "tesseract 5.5.0"},
    )
    monkeypatch.setattr(
        finance_evidence,
        "scan_finance_evidence",
        lambda data, filename: MalwareScanResult("clean", "clamav", "ClamAV 1.4.3", "27800/Tue"),
    )
    monkeypatch.setattr(finance_evidence, "extract_evidence_text", lambda data, media: extraction)
    png = (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR" + (100).to_bytes(4, "big") + (100).to_bytes(4, "big")
    )
    document, created = await create_evidence_document(
        test_db_session,
        user_id=test_user.id,
        filename="receipt.png",
        declared_media_type="image/png",
        data=png,
        source_kind="manual_upload",
        upload_object=lambda user_id, file_id, data, media: f"{user_id}/{file_id}",
    )
    assert created is True
    assert document.extraction_status == "complete"
    assert document.parser_id == "image_metadata"
    assert document.parser_version == "finance-ocr-v1"
    assert document.attributes["extracted_text"] == "Saldo 100 EUR"
    assert document.attributes["malware_scan"] == {
        "status": "clean",
        "engine": "clamav",
        "engine_version": "ClamAV 1.4.3",
        "signature_version": "27800/Tue",
    }


@pytest.mark.anyio
async def test_evidence_metadata_validation_happens_before_storage(
    test_db_session: AsyncSession, test_user: User
) -> None:
    uploads: list[str] = []

    def upload(user_id: str, file_id: str, data: bytes, media_type: str) -> str:
        uploads.append(file_id)
        return f"{user_id}/{file_id}"

    with pytest.raises(FinanceUploadValidationError, match="must include a timezone"):
        await create_evidence_document(
            test_db_session,
            user_id=test_user.id,
            filename="new.csv",
            declared_media_type="text/csv",
            data=b"date,amount\n2026-02-01,2\n",
            source_kind="manual_upload",
            captured_at=datetime(2026, 2, 1),
            upload_object=upload,
        )
    assert uploads == []
