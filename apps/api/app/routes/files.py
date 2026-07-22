"""File upload, download, and embed-metadata endpoints.

Uploaded images are stored in MinIO; metadata rows live in the `files` table.
Embed metadata is fetched server-side to avoid CORS issues.
"""

import asyncio
from html.parser import HTMLParser
from urllib.parse import urlparse
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile
from fastapi.responses import Response as FastAPIResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.access import shared_ids
from app.database import get_async_session
from app.dependencies import get_current_user
from app.models import File as FileModel
from app.models import Page, User
from app.storage import allowed_content_type, download, max_file_size, remove, upload

router = APIRouter(prefix="/api", tags=["files"])


def _references_file(value: object, file_id: str) -> bool:
    if isinstance(value, list):
        return any(_references_file(item, file_id) for item in value)
    if not isinstance(value, dict):
        return False
    return any(
        item == f"/api/files/{file_id}" or _references_file(item, file_id)
        for item in value.values()
    )


# ── Schemas ─────────────────────────────────────────────────────────────


class FileResponse(BaseModel):
    id: str
    url: str
    name: str
    content_type: str
    size: int
    created_at: str


class EmbedResponse(BaseModel):
    url: str
    title: str | None = None
    description: str | None = None
    image: str | None = None
    favicon: str | None = None


# ponytail: SSRF guard — only public http/https, reject private/loopback.
_PRIVATE_PREFIXES = (
    "10.",
    "172.16.",
    "172.17.",
    "172.18.",
    "172.19.",
    "172.20.",
    "172.21.",
    "172.22.",
    "172.23.",
    "172.24.",
    "172.25.",
    "172.26.",
    "172.27.",
    "172.28.",
    "172.29.",
    "172.30.",
    "172.31.",
    "192.168.",
    "127.",
    "0.",
)
_PRIVATE_HOSTS = {"localhost", "::1"}


def _is_safe_url(url: str) -> bool:
    try:
        parsed = urlparse(url)
    except Exception:
        return False
    if parsed.scheme not in ("http", "https"):
        return False
    host = parsed.hostname or ""
    if host in _PRIVATE_HOSTS:
        return False
    if host.startswith(_PRIVATE_PREFIXES):
        return False
    return True


# ── HTML metadata parser (stdlib only — no new dependency) ─────────────


class _MetadataParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.title: str | None = None
        self.description: str | None = None
        self.image: str | None = None
        self.favicon: str | None = None
        self._in_title = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attrs_dict = {k.lower(): v or "" for k, v in attrs}
        if tag == "title":
            self._in_title = True
        if tag == "meta":
            prop = attrs_dict.get("property", "") or attrs_dict.get("name", "")
            content = attrs_dict.get("content", "")
            if prop in ("og:title", "twitter:title") and content:
                self.title = self.title or content
            if prop in ("og:description", "description", "twitter:description") and content:
                self.description = self.description or content
            if prop in ("og:image", "twitter:image") and content:
                self.image = self.image or content
        if tag == "link":
            rel = attrs_dict.get("rel", "")
            href = attrs_dict.get("href", "")
            if "icon" in rel and href and not self.favicon:
                # Prefer the largest icon via sizes attr, but take the first
                # that mentions "icon" in rel — ponytail: no size comparison.
                self.favicon = href

    def handle_endtag(self, tag: str) -> None:
        if tag == "title":
            self._in_title = False

    def handle_data(self, data: str) -> None:
        if self._in_title and not self.title:
            self.title = data.strip() or None


async def _fetch_embed(url: str) -> EmbedResponse:
    """Fetch and parse metadata from a URL. Runs the HTTP fetch in a thread
    pool to avoid blocking the event loop."""
    if not _is_safe_url(url):
        raise HTTPException(status_code=400, detail="Unsafe or invalid URL")

    loop = asyncio.get_running_loop()

    def _fetch() -> EmbedResponse:
        import urllib.request

        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (compatible; SecondBrain/1.0)",
                "Accept": "text/html,application/xhtml+xml",
                "Accept-Language": "en-US",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=5) as resp:
                # Size cap ~512 KB
                raw = resp.read(512 * 1024)
        except Exception:
            return EmbedResponse(url=url)

        # Decode with best-effort charset detection
        ct = resp.headers.get("Content-Type", "")
        charset = "utf-8"
        if "charset=" in ct:
            charset = ct.split("charset=")[-1].split(";")[0].strip()
        try:
            html = raw.decode(charset)
        except (UnicodeDecodeError, LookupError):
            html = raw.decode("utf-8", errors="replace")

        parser = _MetadataParser()
        try:
            parser.feed(html)
        except Exception:
            pass

        # Resolve relative favicon URL
        favicon = parser.favicon
        if favicon and not favicon.startswith(("http://", "https://", "data:")):
            base = _base_url(url)
            favicon = base.rstrip("/") + "/" + favicon.lstrip("/")

        return EmbedResponse(
            url=url,
            title=parser.title or url,
            description=parser.description,
            image=parser.image,
            favicon=favicon,
        )

    return await loop.run_in_executor(None, _fetch)


def _base_url(url: str) -> str:
    parsed = urlparse(url)
    return f"{parsed.scheme}://{parsed.netloc}"


# ── Routes ──────────────────────────────────────────────────────────────


@router.post("/files", status_code=201, response_model=FileResponse)
async def upload_file(
    file: UploadFile,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> FileResponse:
    """Upload an image file. Validates content type and size, stores in MinIO."""
    if not file.content_type or not allowed_content_type(file.content_type):
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported content type: {file.content_type}. "
            f"Allowed: image/png, image/jpeg, image/gif, image/webp, image/svg+xml",
        )

    data = await file.read()
    if len(data) > max_file_size():
        raise HTTPException(status_code=400, detail="File too large (max 50 MB)")

    file_id = str(uuid4())
    name = file.filename or "untitled"

    upload(user.id, file_id, data, file.content_type)

    db_file = FileModel(
        id=file_id,
        user_id=user.id,
        name=name,
        content_type=file.content_type,
        size=len(data),
    )
    session.add(db_file)
    await session.commit()

    return FileResponse(
        id=file_id,
        url=f"/api/files/{file_id}",
        name=name,
        content_type=file.content_type,
        size=len(data),
        created_at=db_file.created_at.isoformat(),
    )


@router.get("/files/{file_id}")
async def download_file(
    file_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> FastAPIResponse:
    """Download an owned file from MinIO with the stored content type."""
    row = await session.get(FileModel, file_id)
    if row is None:
        raise HTTPException(status_code=404, detail="File not found")
    if row.user_id != user.id:
        page_ids = await shared_ids("page", user.id, session)
        pages = await session.scalars(
            select(Page.content).where(Page.id.in_(page_ids), Page.deleted_at.is_(None))
        )
        if not any(_references_file(content, file_id) for content in pages):
            raise HTTPException(status_code=404, detail="File not found")

    data, _ = download(row.user_id, file_id)

    return FastAPIResponse(
        content=data,
        media_type=row.content_type,
        headers={
            "Cache-Control": "public, max-age=31536000, immutable",
            "Content-Disposition": f'inline; filename="{row.name}"',
        },
    )


@router.delete("/files/{file_id}", status_code=204)
async def delete_file(
    file_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> None:
    """Delete a file from MinIO and its metadata row."""
    row = await session.scalar(
        select(FileModel).where(FileModel.id == file_id, FileModel.user_id == user.id)
    )
    if row is None:
        raise HTTPException(status_code=404, detail="File not found")

    try:
        remove(user.id, file_id)
    except Exception:
        pass  # ponytail: orphan-sweep upgrade path — if MinIO is down, at
        # least the DB row is removed so the file won't be user-visible.

    await session.delete(row)
    await session.commit()


@router.get("/embed", response_model=EmbedResponse)
async def fetch_embed(
    url: str = Query(..., description="URL to fetch metadata from"),
    user: User = Depends(get_current_user),
) -> EmbedResponse:
    """Fetch Open Graph / page metadata for a link embed card."""
    return await _fetch_embed(url)
