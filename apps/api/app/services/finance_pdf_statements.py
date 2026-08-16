"""Generic, conservative PDF statement row extraction."""

from __future__ import annotations

import re
import shutil
import subprocess
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation

from app.config import get_settings

PdfConfidence = str

_DATE_PATTERNS = (
    (re.compile(r"\b\d{4}-\d{2}-\d{2}\b"), "%Y-%m-%d"),
    (re.compile(r"\b\d{2}[./-]\d{2}[./-]\d{4}\b"), "day-first"),
)
_AMOUNT = re.compile(r"(?<![\w])\(?[-+]?\d[\d .,'\u00a0]*\d\)?(?![\w])")
_CURRENCY = re.compile(r"\b[A-Z]{3}\b")


@dataclass(frozen=True, slots=True)
class PdfStatementRow:
    source_index: str
    date: str | None
    description: str
    amount: str | None
    currency: str | None
    confidence: PdfConfidence
    source_line: str

    def payload(self) -> dict[str, object]:
        return {
            "date": self.date,
            "description": self.description,
            "amount": self.amount,
            "currency": self.currency,
            "confidence": self.confidence,
            "source_line": self.source_line,
        }


@dataclass(frozen=True, slots=True)
class PdfStatementParse:
    rows: tuple[PdfStatementRow, ...]
    unparsed_line_count: int


def _extract_text(data: bytes) -> str:
    executable = shutil.which("pdftotext")
    if executable is None:
        raise ValueError("pdftotext is unavailable")
    try:
        completed = subprocess.run(
            [executable, "-layout", "-", "-"],
            input=data,
            capture_output=True,
            check=False,
            timeout=get_settings().finance_ocr_timeout_seconds,
            env={"LANG": "C", "LC_ALL": "C", "PATH": "/usr/local/bin:/usr/bin:/bin"},
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise ValueError("PDF statement text extraction failed") from exc
    if completed.returncode != 0:
        raise ValueError("PDF statement text extraction failed")
    return completed.stdout.decode("utf-8", "replace")


def _date(line: str) -> tuple[str | None, tuple[int, int] | None, bool]:
    for pattern, kind in _DATE_PATTERNS:
        match = pattern.search(line)
        if match is None:
            continue
        value = match.group(0)
        if kind == "%Y-%m-%d":
            return value, match.span(), False
        separator = next(character for character in value if not character.isdigit())
        day, month, year = value.split(separator)
        try:
            normalized = f"{int(year):04d}-{int(month):02d}-{int(day):02d}"
        except ValueError:
            return None, match.span(), True
        return normalized, match.span(), True
    return None, None, False


def _decimal(value: str) -> tuple[str | None, bool]:
    text = value.strip().replace("\u00a0", "").replace(" ", "").replace("'", "")
    negative_parentheses = text.startswith("(") and text.endswith(")")
    text = text.strip("()")
    guessed = False
    if "," in text and "." in text:
        decimal_separator = "," if text.rfind(",") > text.rfind(".") else "."
        thousands_separator = "." if decimal_separator == "," else ","
        text = text.replace(thousands_separator, "").replace(decimal_separator, ".")
        guessed = True
    elif "," in text:
        suffix = text.rsplit(",", 1)[1]
        if len(suffix) in {1, 2}:
            text = text.replace(".", "").replace(",", ".")
        else:
            text = text.replace(",", "")
        guessed = True
    elif text.count(".") > 1:
        head, suffix = text.rsplit(".", 1)
        text = head.replace(".", "") + "." + suffix
        guessed = True
    try:
        amount = Decimal(text)
    except InvalidOperation:
        return None, True
    if not amount.is_finite():
        return None, True
    if negative_parentheses:
        amount = -amount
    return format(amount, "f"), guessed


def parse_pdf_statement(data: bytes, *, extracted_text: str | None = None) -> PdfStatementParse:
    text = extracted_text if extracted_text and extracted_text.strip() else _extract_text(data)
    rows: list[PdfStatementRow] = []
    unparsed = 0
    for line_number, raw_line in enumerate(text.splitlines(), start=1):
        line = re.sub(r"\s+", " ", raw_line).strip()
        if not line:
            continue
        parsed_date, date_span, date_guessed = _date(line)
        without_date = (
            line[: date_span[0]] + " " * (date_span[1] - date_span[0]) + line[date_span[1] :]
            if date_span is not None
            else line
        )
        amount_matches = list(_AMOUNT.finditer(without_date))
        amount_match = amount_matches[-1] if amount_matches else None
        amount, amount_guessed = (
            _decimal(amount_match.group(0)) if amount_match is not None else (None, False)
        )
        if parsed_date is None and amount is None:
            unparsed += 1
            continue
        currency_match = _CURRENCY.search(line)
        currency = currency_match.group(0) if currency_match else None
        description_parts = list(line)
        for span in (
            date_span,
            amount_match.span() if amount_match is not None else None,
            currency_match.span() if currency_match is not None else None,
        ):
            if span is not None:
                description_parts[span[0] : span[1]] = " " * (span[1] - span[0])
        description = re.sub(r"\s+", " ", "".join(description_parts)).strip(" -–—")
        confidence = (
            "low"
            if parsed_date is None or amount is None
            else "medium"
            if date_guessed or amount_guessed or len(amount_matches) > 1
            else "high"
        )
        rows.append(
            PdfStatementRow(
                source_index=str(line_number),
                date=parsed_date,
                description=description,
                amount=amount,
                currency=currency,
                confidence=confidence,
                source_line=line,
            )
        )
    # ponytail: generic line heuristics only; add provider templates after a real statement fails.
    return PdfStatementParse(rows=tuple(rows), unparsed_line_count=unparsed)
