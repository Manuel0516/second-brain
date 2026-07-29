"""Validation and persistence helpers for immutable Finance evidence."""

from __future__ import annotations

import asyncio
import csv
import io
import json
import re
import resource
import shutil
import struct
import subprocess
import tarfile
import tempfile
import time
import zipfile
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, date, datetime
from functools import partial
from hashlib import sha256
from pathlib import Path, PurePosixPath
from uuid import UUID, uuid5

from sqlalchemy import exists, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import (
    File,
    FinanceEvidenceDocument,
    FinanceImport,
    FinanceRawRecord,
    FinanceRevisionRawRecord,
    Link,
)
from app.storage import max_file_size

MAX_ARCHIVE_MEMBERS = 1_000
MAX_ARCHIVE_MEMBER_SIZE = 50 * 1024 * 1024
MAX_ARCHIVE_UNCOMPRESSED_SIZE = 250 * 1024 * 1024
MAX_ARCHIVE_COMPRESSION_RATIO = 100
MAX_IMAGE_PIXELS = 40_000_000
MAX_OCR_PDF_PAGES = 25
MAX_OCR_TEXT_BYTES = 512 * 1024
MAX_OCR_RASTER_BYTES = 25 * 1024 * 1024
MIN_EMBEDDED_PDF_TEXT_CHARACTERS = 40
OCR_LANGUAGES = "eng+spa+swe"
OCR_PARSER_VERSION = "finance-ocr-v1"

_EICAR_TEST_SIGNATURE = b"X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"

_MEDIA_BY_EXTENSION = {
    ".csv": "text/csv",
    ".json": "application/json",
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".zip": "application/zip",
    ".tar": "application/x-tar",
}
_MEDIA_ALIASES = {
    "application/csv": "text/csv",
    "application/tar": "application/x-tar",
    "application/x-zip-compressed": "application/zip",
    "image/jpg": "image/jpeg",
}


class FinanceUploadValidationError(ValueError):
    """Stable validation failure suitable for the Finance upload error envelope."""

    def __init__(self, code: str, message: str, *, retryable: bool = False) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.retryable = retryable

    def detail(self) -> dict[str, str | bool]:
        return {"code": self.code, "message": self.message, "retryable": self.retryable}


@dataclass(frozen=True)
class ArchiveMember:
    path: str
    size: int
    compressed_size: int | None
    is_directory: bool

    def as_dict(self) -> dict[str, str | int | bool | None]:
        return {
            "path": self.path,
            "size": self.size,
            "compressed_size": self.compressed_size,
            "is_directory": self.is_directory,
        }


@dataclass(frozen=True)
class MalwareScanResult:
    status: str
    engine: str | None
    engine_version: str | None
    signature_version: str | None

    def as_dict(self) -> dict[str, str | None]:
        return {
            "status": self.status,
            "engine": self.engine,
            "engine_version": self.engine_version,
            "signature_version": self.signature_version,
        }


@dataclass(frozen=True)
class EvidenceTextExtraction:
    text: str
    method: str
    parser_version: str
    text_sha256: str
    truncated: bool
    executable_versions: dict[str, str]

    def as_attributes(self) -> dict[str, object]:
        return {
            "extracted_text": self.text,
            "extracted_text_sha256": self.text_sha256,
            "extracted_text_bytes": len(self.text.encode("utf-8")),
            "extraction_method": self.method,
            "extraction_truncated": self.truncated,
            "extractor_versions": self.executable_versions,
        }


def compute_sha256(data: bytes) -> str:
    return sha256(data).hexdigest()


def _command_version(executable: str) -> str:
    path = shutil.which(executable)
    if path is None:
        raise RuntimeError(f"{executable} is unavailable")
    flag = "-v" if executable in {"pdfinfo", "pdftotext", "pdftoppm"} else "--version"
    try:
        completed = subprocess.run(
            [path, flag],
            stdin=subprocess.DEVNULL,
            capture_output=True,
            check=False,
            timeout=5,
            env={"LANG": "C", "LC_ALL": "C", "PATH": "/usr/local/bin:/usr/bin:/bin"},
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise RuntimeError(f"{executable} is unavailable") from exc
    if completed.returncode != 0:
        raise RuntimeError(f"{executable} is unavailable")
    first_line = (completed.stdout or completed.stderr).decode("utf-8", "replace").splitlines()
    return first_line[0][:200] if first_line else executable


def _run_bounded_command(
    command: list[str],
    *,
    timeout: float,
    output_limit: int = MAX_OCR_TEXT_BYTES,
    allow_truncated_output: bool = True,
) -> None:
    if timeout <= 0:
        raise FinanceUploadValidationError(
            "extraction_timeout", "Finance evidence text extraction timed out", retryable=True
        )
    try:
        completed = subprocess.run(
            command,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
            timeout=timeout,
            env={"LANG": "C", "LC_ALL": "C", "PATH": "/usr/local/bin:/usr/bin:/bin"},
            preexec_fn=partial(
                resource.setrlimit,
                resource.RLIMIT_FSIZE,
                (output_limit + 1, output_limit + 1),
            ),
        )
    except subprocess.TimeoutExpired as exc:
        raise FinanceUploadValidationError(
            "extraction_timeout", "Finance evidence text extraction timed out", retryable=True
        ) from exc
    except OSError as exc:
        raise FinanceUploadValidationError(
            "extractor_unavailable",
            "Finance evidence text extraction is unavailable",
            retryable=True,
        ) from exc
    # SIGXFSZ means the extractor reached the explicit output bound. Its deterministic prefix is
    # retained and marked truncated instead of allowing unbounded output.
    truncated_codes = {-25, 153} if allow_truncated_output else set()
    if completed.returncode not in {0, *truncated_codes}:
        raise FinanceUploadValidationError(
            "extraction_failed", "Finance evidence text extraction failed", retryable=False
        )


def _bounded_text(path: str) -> tuple[str, bool]:
    try:
        with open(path, "rb") as output:
            raw = output.read(MAX_OCR_TEXT_BYTES + 1)
    except OSError as exc:
        raise FinanceUploadValidationError(
            "extraction_failed", "Finance evidence text extraction failed", retryable=False
        ) from exc
    truncated = len(raw) > MAX_OCR_TEXT_BYTES
    raw = raw[:MAX_OCR_TEXT_BYTES]
    text = raw.decode("utf-8", "replace").replace("\r\n", "\n").replace("\r", "\n")
    text = text.replace("\x00", "").strip()
    encoded = text.encode("utf-8")
    if len(encoded) > MAX_OCR_TEXT_BYTES:
        text = encoded[:MAX_OCR_TEXT_BYTES].decode("utf-8", "ignore")
        truncated = True
    return text, truncated


def _tesseract_text(
    image_path: str,
    output_base: str,
    *,
    deadline: float,
) -> tuple[str, bool]:
    executable = shutil.which("tesseract")
    if executable is None:
        raise FinanceUploadValidationError(
            "extractor_unavailable",
            "Finance evidence text extraction is unavailable",
            retryable=True,
        )
    _run_bounded_command(
        [
            executable,
            image_path,
            output_base,
            "-l",
            OCR_LANGUAGES,
            "--psm",
            "6",
        ],
        timeout=deadline - time.monotonic(),
    )
    output_path = f"{output_base}.txt"
    if not Path(output_path).is_file():
        raise FinanceUploadValidationError(
            "extraction_failed", "Finance evidence text extraction failed", retryable=False
        )
    return _bounded_text(output_path)


def _pdf_page_count(pdf_path: str, *, deadline: float) -> int:
    executable = shutil.which("pdfinfo")
    if executable is None:
        raise FinanceUploadValidationError(
            "extractor_unavailable",
            "Finance evidence text extraction is unavailable",
            retryable=True,
        )
    try:
        completed = subprocess.run(
            [executable, pdf_path],
            stdin=subprocess.DEVNULL,
            capture_output=True,
            check=False,
            timeout=max(0.1, deadline - time.monotonic()),
            env={"LANG": "C", "LC_ALL": "C", "PATH": "/usr/local/bin:/usr/bin:/bin"},
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise FinanceUploadValidationError(
            "extraction_failed", "Finance evidence text extraction failed", retryable=False
        ) from exc
    match = re.search(rb"^Pages:\s+(\d+)\s*$", completed.stdout, re.MULTILINE)
    if completed.returncode != 0 or match is None:
        raise FinanceUploadValidationError(
            "extraction_failed", "Finance evidence text extraction failed", retryable=False
        )
    pages = int(match.group(1))
    if pages < 1 or pages > MAX_OCR_PDF_PAGES:
        raise FinanceUploadValidationError(
            "extraction_limit_exceeded",
            f"Finance PDF evidence must contain at most {MAX_OCR_PDF_PAGES} pages",
            retryable=False,
        )
    return pages


def _extract_pdf_text(data: bytes, *, timeout: int) -> EvidenceTextExtraction:
    deadline = time.monotonic() + timeout
    versions = {
        name: _command_version(name) for name in ("pdfinfo", "pdftotext", "pdftoppm", "tesseract")
    }
    with tempfile.TemporaryDirectory(prefix="finance-ocr-") as temp_dir:
        pdf_path = str(Path(temp_dir) / "evidence.pdf")
        Path(pdf_path).write_bytes(data)
        page_count = _pdf_page_count(pdf_path, deadline=deadline)
        text_path = str(Path(temp_dir) / "embedded.txt")
        pdftotext = shutil.which("pdftotext")
        if pdftotext is None:
            raise FinanceUploadValidationError(
                "extractor_unavailable",
                "Finance evidence text extraction is unavailable",
                retryable=True,
            )
        _run_bounded_command(
            [pdftotext, "-f", "1", "-l", str(page_count), "-enc", "UTF-8", pdf_path, text_path],
            timeout=deadline - time.monotonic(),
        )
        embedded, truncated = _bounded_text(text_path)
        if len(re.sub(r"\s+", "", embedded)) >= MIN_EMBEDDED_PDF_TEXT_CHARACTERS:
            return EvidenceTextExtraction(
                text=embedded,
                method="pdftotext",
                parser_version=OCR_PARSER_VERSION,
                text_sha256=compute_sha256(embedded.encode()),
                truncated=truncated,
                executable_versions=versions,
            )

        pdftoppm = shutil.which("pdftoppm")
        if pdftoppm is None:
            raise FinanceUploadValidationError(
                "extractor_unavailable",
                "Finance evidence text extraction is unavailable",
                retryable=True,
            )
        page_text: list[str] = []
        text_bytes = 0
        ocr_truncated = False
        for page in range(1, page_count + 1):
            image_base = str(Path(temp_dir) / f"page-{page}")
            _run_bounded_command(
                [
                    pdftoppm,
                    "-f",
                    str(page),
                    "-l",
                    str(page),
                    "-singlefile",
                    "-scale-to",
                    "2400",
                    "-png",
                    pdf_path,
                    image_base,
                ],
                timeout=deadline - time.monotonic(),
                output_limit=MAX_OCR_RASTER_BYTES,
                allow_truncated_output=False,
            )
            image_path = f"{image_base}.png"
            try:
                raster_size = Path(image_path).stat().st_size
                raster_data = Path(image_path).read_bytes()
            except OSError as exc:
                raise FinanceUploadValidationError(
                    "extraction_failed",
                    "Finance evidence text extraction failed",
                    retryable=False,
                ) from exc
            dimensions = image_dimensions(raster_data)
            if (
                raster_size > MAX_OCR_RASTER_BYTES
                or dimensions is None
                or dimensions[0] * dimensions[1] > MAX_IMAGE_PIXELS
            ):
                raise FinanceUploadValidationError(
                    "extraction_limit_exceeded",
                    "Finance evidence rasterized page exceeded extraction limits",
                    retryable=False,
                )
            text, page_truncated = _tesseract_text(
                image_path, str(Path(temp_dir) / f"page-{page}-ocr"), deadline=deadline
            )
            remaining = MAX_OCR_TEXT_BYTES - text_bytes
            encoded = text.encode()
            if len(encoded) > remaining:
                encoded = encoded[:remaining]
                text = encoded.decode("utf-8", "ignore")
                ocr_truncated = True
            page_text.append(text)
            text_bytes += len(text.encode())
            ocr_truncated = ocr_truncated or page_truncated
            Path(image_path).unlink(missing_ok=True)
            if text_bytes >= MAX_OCR_TEXT_BYTES:
                break
        combined = "\n\f\n".join(page_text).strip()
        combined_bytes = combined.encode()
        if len(combined_bytes) > MAX_OCR_TEXT_BYTES:
            combined = combined_bytes[:MAX_OCR_TEXT_BYTES].decode("utf-8", "ignore")
            ocr_truncated = True
        return EvidenceTextExtraction(
            text=combined,
            method="pdftoppm+tesseract",
            parser_version=OCR_PARSER_VERSION,
            text_sha256=compute_sha256(combined.encode()),
            truncated=ocr_truncated,
            executable_versions=versions,
        )


def _extract_image_text(data: bytes, media_type: str, *, timeout: int) -> EvidenceTextExtraction:
    extension = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp"}[media_type]
    version = _command_version("tesseract")
    with tempfile.TemporaryDirectory(prefix="finance-ocr-") as temp_dir:
        image_path = str(Path(temp_dir) / f"evidence{extension}")
        Path(image_path).write_bytes(data)
        text, truncated = _tesseract_text(
            image_path,
            str(Path(temp_dir) / "ocr"),
            deadline=time.monotonic() + timeout,
        )
    return EvidenceTextExtraction(
        text=text,
        method="tesseract",
        parser_version=OCR_PARSER_VERSION,
        text_sha256=compute_sha256(text.encode()),
        truncated=truncated,
        executable_versions={"tesseract": version},
    )


def extract_evidence_text(data: bytes, media_type: str) -> EvidenceTextExtraction | None:
    """Extract bounded deterministic text for immutable PDF/image evidence."""
    timeout = get_settings().finance_ocr_timeout_seconds
    if media_type == "application/pdf":
        return _extract_pdf_text(data, timeout=timeout)
    if media_type in {"image/png", "image/jpeg", "image/webp"}:
        return _extract_image_text(data, media_type, timeout=timeout)
    return None


def _clamav_scan_code(data: bytes, filename: str, *, timeout: int) -> tuple[int, str]:
    executable = shutil.which("clamscan")
    if executable is None:
        raise RuntimeError("clamscan is unavailable")
    suffix = PurePosixPath(_safe_name(filename)).suffix.lower()
    with tempfile.NamedTemporaryFile(prefix="finance-scan-", suffix=suffix) as source:
        source.write(data)
        source.flush()
        try:
            completed = subprocess.run(
                [
                    executable,
                    "--stdout",
                    "--no-summary",
                    "--alert-exceeds-max=yes",
                    "--max-scansize=300M",
                    "--max-filesize=60M",
                    "--max-files=2000",
                    "--max-recursion=20",
                    source.name,
                ],
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=False,
                timeout=timeout,
                env={"LANG": "C", "LC_ALL": "C", "PATH": "/usr/local/bin:/usr/bin:/bin"},
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise RuntimeError("clamscan failed") from exc
    return completed.returncode, _command_version("clamscan")


def scan_finance_evidence(data: bytes, filename: str) -> MalwareScanResult:
    """Scan every production Finance upload and fail closed on any scanner uncertainty."""
    settings = get_settings()
    required = settings.environment == "prod"
    if not required and shutil.which("clamscan") is None:
        return MalwareScanResult("not_required", None, None, None)
    try:
        code, version = _clamav_scan_code(
            data, filename, timeout=settings.finance_scan_timeout_seconds
        )
    except RuntimeError as exc:
        if not required:
            return MalwareScanResult("unavailable", "clamav", None, None)
        raise FinanceUploadValidationError(
            "scanner_unavailable",
            "Finance evidence malware scanning is unavailable",
            retryable=True,
        ) from exc
    if code == 1:
        raise FinanceUploadValidationError(
            "malware_detected", "Finance evidence was rejected by malware scanning", retryable=False
        )
    if code != 0:
        if not required:
            return MalwareScanResult("unavailable", "clamav", None, None)
        raise FinanceUploadValidationError(
            "scanner_unavailable",
            "Finance evidence malware scanning is unavailable",
            retryable=True,
        )
    # clamscan's version line includes both engine and signature database versions.
    engine_version, _, signature_version = version.partition("/")
    return MalwareScanResult(
        "clean",
        "clamav",
        engine_version.strip() or version,
        signature_version.strip() or None,
    )


def finance_runtime_dependency_issues() -> list[str]:
    """Verify production evidence tooling, including a functioning ClamAV signature DB."""
    issues: list[str] = []
    for executable in ("clamscan", "tesseract", "pdfinfo", "pdftotext", "pdftoppm"):
        try:
            _command_version(executable)
        except RuntimeError:
            issues.append(f"{executable} is required for Finance evidence processing")
    if "tesseract is required for Finance evidence processing" not in issues:
        tesseract_path = shutil.which("tesseract")
        try:
            languages = subprocess.run(
                [tesseract_path or "tesseract", "--list-langs"],
                stdin=subprocess.DEVNULL,
                capture_output=True,
                check=False,
                timeout=5,
                env={"LANG": "C", "LC_ALL": "C", "PATH": "/usr/local/bin:/usr/bin:/bin"},
            )
            available = set(languages.stdout.decode("utf-8", "replace").splitlines()[1:])
            required = set(OCR_LANGUAGES.split("+"))
            if languages.returncode != 0 or not required <= available:
                issues.append("Tesseract eng, spa and swe languages are required")
        except (OSError, subprocess.TimeoutExpired):
            issues.append("Tesseract language data could not be verified")
    if not issues:
        timeout = get_settings().finance_scan_timeout_seconds
        try:
            infected_code, _ = _clamav_scan_code(
                _EICAR_TEST_SIGNATURE, "scanner-self-test.txt", timeout=timeout
            )
            clean_code, _ = _clamav_scan_code(
                b"Second Brain Finance scanner self-test", "clean.txt", timeout=timeout
            )
            if infected_code != 1 or clean_code != 0:
                issues.append("ClamAV signature database is unavailable or unusable")
        except RuntimeError:
            issues.append("ClamAV signature database is unavailable or unusable")
    return issues


async def acquire_finance_advisory_lock(session: AsyncSession, *identity_parts: str) -> None:
    """Serialize one Finance workflow/resource within a PostgreSQL transaction."""
    bind = session.get_bind()
    if bind.dialect.name != "postgresql":
        return
    digest = sha256("\x1f".join(identity_parts).encode()).digest()
    lock_id = int.from_bytes(digest[:8], byteorder="big", signed=True)
    await session.execute(select(func.pg_advisory_xact_lock(lock_id)))


def _upload_error(code: str, message: str) -> FinanceUploadValidationError:
    return FinanceUploadValidationError(code, message, retryable=False)


def _canonical_media_type(declared_media_type: str) -> str:
    normalized = declared_media_type.partition(";")[0].strip().lower()
    return _MEDIA_ALIASES.get(normalized, normalized)


def _safe_name(filename: str) -> str:
    normalized = filename.replace("\\", "/")
    name = normalized.rsplit("/", 1)[-1].strip()
    if not name or name in {".", ".."} or "\x00" in name:
        raise _upload_error("malformed_file", "Finance evidence needs a valid file name")
    if len(name) > 255:
        raise _upload_error("malformed_file", "Finance evidence file name is too long")
    return name


def _assert_signature(media_type: str, data: bytes) -> None:
    valid = True
    if media_type == "application/pdf":
        valid = data.startswith(b"%PDF-") and b"%%EOF" in data[-1_024:]
    elif media_type == "image/png":
        valid = (
            len(data) >= 24
            and data.startswith(b"\x89PNG\r\n\x1a\n")
            and data[12:16] == b"IHDR"
            and int.from_bytes(data[16:20], "big") > 0
            and int.from_bytes(data[20:24], "big") > 0
        )
    elif media_type == "image/jpeg":
        valid = len(data) >= 4 and data.startswith(b"\xff\xd8\xff") and data.endswith(b"\xff\xd9")
    elif media_type == "image/webp":
        valid = (
            len(data) >= 12
            and data.startswith(b"RIFF")
            and data[8:12] == b"WEBP"
            and int.from_bytes(data[4:8], "little") == len(data) - 8
        )
    elif media_type == "application/zip":
        valid = data.startswith((b"PK\x03\x04", b"PK\x05\x06", b"PK\x07\x08"))
    elif media_type == "application/x-tar":
        valid = len(data) >= 512 and data[257:262] == b"ustar"
    if not valid:
        raise _upload_error("malformed_file", "Finance evidence content is malformed")


def image_dimensions(data: bytes) -> tuple[int, int] | None:
    """Read dimensions from supported image headers without decoding untrusted pixels."""
    if len(data) >= 24 and data.startswith(b"\x89PNG\r\n\x1a\n") and data[12:16] == b"IHDR":
        return struct.unpack(">II", data[16:24])
    if data.startswith(b"\xff\xd8"):
        offset = 2
        while offset + 9 < len(data):
            if data[offset] != 0xFF:
                offset += 1
                continue
            marker = data[offset + 1]
            offset += 2
            if marker in {0xD8, 0xD9}:
                continue
            if offset + 2 > len(data):
                break
            length = int.from_bytes(data[offset : offset + 2], "big")
            if length < 2 or offset + length > len(data):
                break
            if marker in {
                0xC0,
                0xC1,
                0xC2,
                0xC3,
                0xC5,
                0xC6,
                0xC7,
                0xC9,
                0xCA,
                0xCB,
            }:
                return (
                    int.from_bytes(data[offset + 5 : offset + 7], "big"),
                    int.from_bytes(data[offset + 3 : offset + 5], "big"),
                )
            offset += length
        return None
    if len(data) >= 30 and data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        chunk = data[12:16]
        if chunk == b"VP8X":
            return (
                1 + int.from_bytes(data[24:27], "little"),
                1 + int.from_bytes(data[27:30], "little"),
            )
        if chunk == b"VP8 " and data[23:26] == b"\x9d\x01\x2a":
            return (
                int.from_bytes(data[26:28], "little") & 0x3FFF,
                int.from_bytes(data[28:30], "little") & 0x3FFF,
            )
        if chunk == b"VP8L" and len(data) >= 25 and data[20] == 0x2F:
            bits = int.from_bytes(data[21:25], "little")
            return (1 + (bits & 0x3FFF), 1 + ((bits >> 14) & 0x3FFF))
    return None


def _validate_text_document(media_type: str, data: bytes) -> None:
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise _upload_error("malformed_file", "Finance evidence text must be UTF-8") from exc
    if "\x00" in text:
        raise _upload_error("malformed_file", "Finance evidence text contains invalid bytes")
    if media_type == "application/json":
        try:
            json.loads(text)
        except (json.JSONDecodeError, RecursionError) as exc:
            raise _upload_error("malformed_file", "Finance evidence JSON is malformed") from exc
    else:
        try:
            header = next(csv.reader(io.StringIO(text), strict=True), [])
        except csv.Error as exc:
            raise _upload_error("malformed_file", "Finance evidence CSV is malformed") from exc
        if not header or not any(value.strip() for value in header):
            raise _upload_error("malformed_file", "Finance evidence CSV needs a header row")


def _validate_archive_path(path: str) -> str:
    if not path or "\x00" in path:
        raise _upload_error("archive_unsafe_path", "Archive contains an unsafe path")
    normalized = path.replace("\\", "/")
    pure_path = PurePosixPath(normalized)
    if (
        pure_path.is_absolute()
        or ".." in pure_path.parts
        or re.match(r"^[A-Za-z]:", normalized) is not None
    ):
        raise _upload_error("archive_unsafe_path", "Archive contains an unsafe path")
    return str(pure_path)


def _validate_archive_limits(members: list[ArchiveMember]) -> None:
    if len(members) > MAX_ARCHIVE_MEMBERS:
        raise _upload_error("archive_too_many_entries", "Archive contains too many entries")
    total_size = 0
    seen_paths: set[str] = set()
    for member in members:
        if member.path in seen_paths:
            raise _upload_error("archive_unsafe_path", "Archive contains duplicate paths")
        seen_paths.add(member.path)
        if member.size < 0 or member.size > MAX_ARCHIVE_MEMBER_SIZE:
            raise _upload_error("archive_too_large", "Archive member exceeds the size limit")
        total_size += member.size
        if total_size > MAX_ARCHIVE_UNCOMPRESSED_SIZE:
            raise _upload_error("archive_too_large", "Archive expands beyond the size limit")
        if member.is_directory or member.size == 0 or member.compressed_size is None:
            continue
        if member.compressed_size <= 0:
            raise _upload_error("archive_too_large", "Archive has an unsafe compression ratio")
        if member.size / member.compressed_size > MAX_ARCHIVE_COMPRESSION_RATIO:
            raise _upload_error("archive_too_large", "Archive has an unsafe compression ratio")


def inspect_archive(data: bytes, media_type: str) -> list[ArchiveMember]:
    """Inspect an archive without extracting it and reject traversal/bomb primitives."""
    canonical_type = _canonical_media_type(media_type)
    members: list[ArchiveMember] = []
    try:
        if canonical_type == "application/zip":
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                for zip_info in archive.infolist():
                    if zip_info.flag_bits & 0x1:
                        raise _upload_error(
                            "archive_unsafe_path",
                            "Archive contains encrypted entries",
                        )
                    members.append(
                        ArchiveMember(
                            path=_validate_archive_path(zip_info.filename),
                            size=zip_info.file_size,
                            compressed_size=zip_info.compress_size,
                            is_directory=zip_info.is_dir(),
                        )
                    )
        elif canonical_type == "application/x-tar":
            with tarfile.open(fileobj=io.BytesIO(data), mode="r:") as archive:
                for tar_info in archive.getmembers():
                    if not (tar_info.isfile() or tar_info.isdir()):
                        raise _upload_error(
                            "archive_unsafe_path",
                            "Archive contains links or special files",
                        )
                    members.append(
                        ArchiveMember(
                            path=_validate_archive_path(tar_info.name),
                            size=tar_info.size,
                            compressed_size=None,
                            is_directory=tar_info.isdir(),
                        )
                    )
        else:
            raise _upload_error("unsupported_type", "Unsupported Finance evidence type")
    except FinanceUploadValidationError:
        raise
    except (zipfile.BadZipFile, tarfile.TarError, OSError, EOFError) as exc:
        raise _upload_error("malformed_file", "Finance evidence archive is malformed") from exc
    _validate_archive_limits(members)
    return members


def validate_evidence_file(filename: str, declared_media_type: str, data: bytes) -> str:
    """Validate size, extension, declared type, content and archive safety.

    Returns the canonical media type stored in the database.
    """
    if len(data) > max_file_size():
        raise _upload_error("file_too_large", "Finance evidence exceeds the 50 MB size limit")
    if not data:
        raise _upload_error("malformed_file", "Finance evidence is empty")

    name = _safe_name(filename)
    extension = PurePosixPath(name).suffix.lower()
    expected_media_type = _MEDIA_BY_EXTENSION.get(extension)
    if expected_media_type is None:
        raise _upload_error("unsupported_type", "Unsupported Finance evidence type")
    media_type = _canonical_media_type(declared_media_type)
    if media_type not in set(_MEDIA_BY_EXTENSION.values()):
        raise _upload_error("unsupported_type", "Unsupported Finance evidence type")
    if media_type != expected_media_type:
        raise _upload_error(
            "extension_mismatch",
            "Finance evidence extension does not match its declared type",
        )

    _assert_signature(media_type, data)
    if media_type in {"text/csv", "application/json"}:
        _validate_text_document(media_type, data)
    elif media_type.startswith("image/"):
        dimensions = image_dimensions(data)
        if dimensions is None or dimensions[0] * dimensions[1] > MAX_IMAGE_PIXELS:
            raise _upload_error(
                "image_dimensions_invalid",
                "Finance evidence image dimensions are invalid or exceed the pixel limit",
            )
    elif media_type in {"application/zip", "application/x-tar"}:
        inspect_archive(data, media_type)
    return media_type


async def create_evidence_document(
    session: AsyncSession,
    *,
    user_id: str,
    filename: str,
    declared_media_type: str,
    data: bytes,
    source_kind: str,
    captured_at: datetime | None = None,
    coverage_start: date | None = None,
    coverage_end: date | None = None,
    upload_object: Callable[[str, str, bytes, str], str],
) -> tuple[FinanceEvidenceDocument, bool]:
    """Store new immutable evidence, or return the owner's existing hash match.

    The bool is true only when a new MinIO object and metadata row were created.
    Transaction commit remains the caller's responsibility.
    """
    media_type = validate_evidence_file(filename, declared_media_type, data)
    scan = await asyncio.to_thread(scan_finance_evidence, data, filename)
    extraction: EvidenceTextExtraction | None = None
    extraction_error: str | None = None
    if media_type == "application/pdf" or media_type.startswith("image/"):
        try:
            extraction = await asyncio.to_thread(extract_evidence_text, data, media_type)
        except FinanceUploadValidationError as exc:
            if get_settings().environment == "prod":
                raise
            extraction_error = exc.code
    digest = compute_sha256(data)
    await acquire_finance_advisory_lock(session, "evidence", user_id, digest)
    existing = await session.scalar(
        select(FinanceEvidenceDocument).where(
            FinanceEvidenceDocument.user_id == user_id,
            FinanceEvidenceDocument.sha256 == digest,
        )
    )
    if existing is not None:
        return existing, False
    if coverage_start is not None and coverage_end is not None and coverage_start > coverage_end:
        raise _upload_error("malformed_file", "Evidence coverage start must not follow its end")
    normalized_source_kind = source_kind.strip()
    if not normalized_source_kind or len(normalized_source_kind) > 50:
        raise _upload_error("malformed_file", "Evidence source kind is invalid")
    if captured_at is not None and captured_at.tzinfo is None:
        raise _upload_error("malformed_file", "Evidence captured_at must include a timezone")

    # ponytail: a deterministic UUID makes the MinIO key content-addressed without changing the
    # existing File/MinIO API. The same owner/hash can only ever address the same bytes.
    file_id = str(uuid5(UUID(user_id), digest))
    name = _safe_name(filename)
    object_key = upload_object(user_id, file_id, data, media_type)
    db_file = File(
        id=file_id,
        user_id=user_id,
        name=name,
        content_type=media_type,
        size=len(data),
    )
    document = FinanceEvidenceDocument(
        user_id=user_id,
        file_id=file_id,
        original_name=name,
        media_type=media_type,
        size=len(data),
        sha256=digest,
        # ponytail: current storage has no version API; content addressing plus SHA is the
        # immutable version until the storage adapter exposes native object version IDs.
        object_version=f"sha256:{digest}",
        source_kind=normalized_source_kind,
        captured_at=captured_at or datetime.now(UTC),
        coverage_start=coverage_start,
        coverage_end=coverage_end,
        parser_id=(
            "pdf_metadata"
            if media_type == "application/pdf"
            else "image_metadata"
            if media_type.startswith("image/")
            else None
        ),
        parser_version=(
            extraction.parser_version
            if extraction is not None
            else OCR_PARSER_VERSION
            if extraction_error is not None
            else None
        ),
        extraction_status=(
            "complete"
            if extraction is not None
            else "failed"
            if extraction_error is not None
            else "not_requested"
        ),
        attributes={
            "archive_member_count": _archive_member_count(data, media_type),
            "content_addressed": True,
            "object_key": object_key,
            "malware_scan": scan.as_dict(),
            **(extraction.as_attributes() if extraction is not None else {}),
            **({"extraction_error": extraction_error} if extraction_error is not None else {}),
        },
    )
    session.add_all([db_file, document])
    await session.flush()
    return document, True


def _archive_member_count(data: bytes, media_type: str) -> int | None:
    if media_type not in {"application/zip", "application/x-tar"}:
        return None
    return len(inspect_archive(data, media_type))


async def file_has_immutable_evidence(session: AsyncSession, *, user_id: str, file_id: str) -> bool:
    return bool(
        await session.scalar(
            select(
                exists().where(
                    FinanceEvidenceDocument.user_id == user_id,
                    FinanceEvidenceDocument.file_id == file_id,
                    FinanceEvidenceDocument.retention_status == "immutable",
                )
            )
        )
    )


async def evidence_response(
    session: AsyncSession, document: FinanceEvidenceDocument
) -> dict[str, object]:
    direct_ids = set(
        (
            await session.scalars(
                select(Link.source_id)
                .where(
                    Link.source_type == "finance_event_revision",
                    Link.target_type == "finance_evidence",
                    Link.target_id == document.id,
                    Link.relation == "supported_by",
                )
                .order_by(Link.source_id)
            )
        ).all()
    )
    raw_lineage_ids = set(
        (
            await session.scalars(
                select(FinanceRevisionRawRecord.event_revision_id)
                .join(
                    FinanceRawRecord,
                    FinanceRawRecord.id == FinanceRevisionRawRecord.raw_record_id,
                )
                .join(FinanceImport, FinanceImport.id == FinanceRawRecord.import_id)
                .where(
                    FinanceImport.user_id == document.user_id,
                    FinanceImport.evidence_document_id == document.id,
                )
            )
        ).all()
    )
    linked_ids = sorted(direct_ids | raw_lineage_ids)
    captured_at = document.captured_at
    if captured_at.tzinfo is None:
        captured_at = captured_at.replace(tzinfo=UTC)
    return {
        "id": document.id,
        "file_id": document.file_id,
        "original_name": document.original_name,
        "media_type": document.media_type,
        "size": document.size,
        "sha256": document.sha256,
        "source_kind": document.source_kind,
        "captured_at": captured_at.isoformat(),
        "coverage_start": document.coverage_start.isoformat() if document.coverage_start else None,
        "coverage_end": document.coverage_end.isoformat() if document.coverage_end else None,
        "parser_id": document.parser_id,
        "parser_version": document.parser_version,
        "extraction_status": document.extraction_status,
        "retention_status": document.retention_status,
        "linked_event_revision_ids": linked_ids,
        "download_url": f"/api/files/{document.file_id}",
    }
