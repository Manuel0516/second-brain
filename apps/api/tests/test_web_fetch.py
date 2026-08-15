import http.server
import threading
from collections.abc import Iterator
from typing import Any, Self

import httpx
import pytest

from app.modules.ai import web

pytestmark = pytest.mark.anyio


def test_check_url_rejects_non_http_scheme() -> None:
    with pytest.raises(web.FetchError):
        web._check_url("ftp://example.com/file")


def test_check_url_rejects_credentials() -> None:
    with pytest.raises(web.FetchError):
        web._check_url("https://user:pass@example.com")


def test_check_url_rejects_missing_host() -> None:
    with pytest.raises(web.FetchError):
        web._check_url("https:///path")


def test_check_url_accepts_plain_https() -> None:
    assert web._check_url("https://example.com/page") == "example.com"


async def test_check_host_is_public_rejects_loopback() -> None:
    with pytest.raises(web.FetchError):
        await web._check_host_is_public("localhost")


def test_extract_text_strips_script_style_and_reads_title() -> None:
    html = (
        "<html><head><title>Willys erbjudanden</title>"
        "<style>body{color:red}</style></head>"
        "<body><script>evil()</script><h1>Veckans varor</h1>"
        "<p>Kaffe 20% rabatt</p></body></html>"
    )
    title, text = web._extract_text(html)
    assert title == "Willys erbjudanden"
    assert "Veckans varor" in text and "Kaffe 20% rabatt" in text
    assert "evil()" not in text and "color:red" not in text


class _FakeStreamResponse:
    def __init__(self, status_code: int, headers: dict[str, str], body: bytes, url: str) -> None:
        self.status_code = status_code
        self.headers = headers
        self._body = body
        self.url = httpx.URL(url)
        self.encoding = "utf-8"

    async def aiter_bytes(self) -> Any:
        yield self._body


class _FakeStreamCtx:
    def __init__(self, response: _FakeStreamResponse) -> None:
        self._response = response

    async def __aenter__(self) -> _FakeStreamResponse:
        return self._response

    async def __aexit__(self, *_args: object) -> bool:
        return False


def _fake_client(responses: dict[str, _FakeStreamResponse]) -> type:
    class FakeClient:
        def __init__(self, **_kwargs: object) -> None:
            pass

        async def __aenter__(self) -> Self:
            return self

        async def __aexit__(self, *_args: object) -> bool:
            return False

        def stream(self, _method: str, url: str, **_kwargs: object) -> _FakeStreamCtx:
            return _FakeStreamCtx(responses[url])

    return FakeClient


@pytest.fixture
def _skip_dns(monkeypatch: pytest.MonkeyPatch) -> None:
    """These tests exercise fetch()'s HTTP/redirect/content-type handling, not DNS-based
    SSRF blocking (already covered by test_check_host_is_public_rejects_loopback) — and a
    sandboxed test run may have no outbound DNS at all."""

    async def _allow(_hostname: str) -> None:
        return None

    monkeypatch.setattr(web, "_check_host_is_public", _allow)


async def test_fetch_returns_title_and_text(
    monkeypatch: pytest.MonkeyPatch, _skip_dns: None
) -> None:
    url = "https://example.com/offers"
    response = _FakeStreamResponse(
        200,
        {"content-type": "text/html; charset=utf-8"},
        b"<html><head><title>Offers</title></head><body><p>Coffee -20%</p></body></html>",
        url,
    )
    monkeypatch.setattr(httpx, "AsyncClient", _fake_client({url: response}))
    result = await web.fetch(url)
    assert result["title"] == "Offers"
    assert "Coffee -20%" in str(result["text"])
    assert result["truncated"] is False


async def test_fetch_follows_redirect_and_revalidates(
    monkeypatch: pytest.MonkeyPatch, _skip_dns: None
) -> None:
    start = "https://example.com/old"
    final = "https://example.com/new"
    responses = {
        start: _FakeStreamResponse(302, {"location": final}, b"", start),
        final: _FakeStreamResponse(
            200,
            {"content-type": "text/html"},
            b"<html><body>moved</body></html>",
            final,
        ),
    }
    monkeypatch.setattr(httpx, "AsyncClient", _fake_client(responses))
    result = await web.fetch(start)
    assert result["url"] == final
    assert "moved" in str(result["text"])


async def test_fetch_rejects_unsupported_content_type(
    monkeypatch: pytest.MonkeyPatch, _skip_dns: None
) -> None:
    url = "https://example.com/image.png"
    response = _FakeStreamResponse(200, {"content-type": "image/png"}, b"\x89PNG", url)
    monkeypatch.setattr(httpx, "AsyncClient", _fake_client({url: response}))
    with pytest.raises(web.FetchError):
        await web.fetch(url)


async def test_fetch_truncates_long_text(monkeypatch: pytest.MonkeyPatch, _skip_dns: None) -> None:
    url = "https://example.com/long"
    long_body = ("<html><body><p>" + "word " * 5000 + "</p></body></html>").encode()
    response = _FakeStreamResponse(200, {"content-type": "text/html"}, long_body, url)
    monkeypatch.setattr(httpx, "AsyncClient", _fake_client({url: response}))
    result = await web.fetch(url)
    assert result["truncated"] is True
    assert len(str(result["text"])) <= web.MAX_TEXT_CHARS


async def test_fetch_gives_up_after_too_many_redirects(
    monkeypatch: pytest.MonkeyPatch, _skip_dns: None
) -> None:
    url = "https://example.com/loop"
    response = _FakeStreamResponse(302, {"location": url}, b"", url)
    monkeypatch.setattr(httpx, "AsyncClient", _fake_client({url: response}))
    with pytest.raises(web.FetchError):
        await web.fetch(url)


_PAGINATED_PAGE = b"""<!doctype html>
<html><head><title>Offers</title></head>
<body>
<div id="items"><p>Item 1</p></div>
<button id="more">Show more</button>
<script>
let n = 1;
document.getElementById('more').onclick = () => {
  n++;
  document.getElementById('items').innerHTML += `<p>Item ${n}</p>`;
  if (n >= 4) document.getElementById('more').remove();
};
</script>
</body></html>"""


class _PaginatedHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.end_headers()
        self.wfile.write(_PAGINATED_PAGE)

    def log_message(self, *_args: object) -> None:
        pass


@pytest.fixture
def paginated_server(monkeypatch: pytest.MonkeyPatch) -> Iterator[str]:
    """A real local HTTP server serving a page whose 'Show more' button reveals one more
    item per click (up to 4 total) via JS, then removes itself — a minimal stand-in for a
    site like Willys' offers list. Runs an actual headless Chromium against it; not mocked,
    because the click-loop is exactly the new, real-network-facing logic worth proving end
    to end (see history 0237)."""
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), _PaginatedHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    async def _allow(_hostname: str) -> None:
        return None

    monkeypatch.setattr(web, "_check_host_is_public", _allow)
    try:
        yield f"http://127.0.0.1:{server.server_address[1]}/"
    finally:
        server.shutdown()


async def test_fetch_dynamic_clicks_until_button_disappears(paginated_server: str) -> None:
    result = await web.fetch_dynamic(paginated_server, click_text="Show more", max_clicks=10)
    text = str(result["text"])
    assert "Item 1" in text and "Item 4" in text
    assert "Item 5" not in text


async def test_fetch_dynamic_respects_max_clicks(paginated_server: str) -> None:
    result = await web.fetch_dynamic(paginated_server, click_text="Show more", max_clicks=1)
    text = str(result["text"])
    assert "Item 1" in text and "Item 2" in text
    assert "Item 3" not in text


async def test_fetch_dynamic_without_click_text_does_not_click(paginated_server: str) -> None:
    result = await web.fetch_dynamic(paginated_server)
    text = str(result["text"])
    assert "Item 1" in text
    assert "Item 2" not in text


_PICKER_PAGE = b"""<!doctype html>
<html><head><title>Store</title></head>
<body>
<div id="result">No store selected</div>
<button id="open">Select store</button>
<div id="picker" style="display:none">
  <input type="text" id="search" placeholder="Search store" />
  <ul id="matches"></ul>
</div>
<script>
const stores = ["Willys Lund Magistratsvagen", "Willys Hemma Lund Stortorget", "Willys Malmo"];
document.getElementById('open').onclick = () => {
  document.getElementById('picker').style.display = 'block';
};
document.getElementById('search').addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase();
  const ul = document.getElementById('matches');
  ul.innerHTML = '';
  stores.filter(s => s.toLowerCase().includes(q)).forEach(s => {
    const li = document.createElement('li');
    li.textContent = s;
    li.onclick = () => { document.getElementById('result').textContent = 'Selected: ' + s; };
    ul.appendChild(li);
  });
});
</script>
</body></html>"""


class _PickerHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.end_headers()
        self.wfile.write(_PICKER_PAGE)

    def log_message(self, *_args: object) -> None:
        pass


@pytest.fixture
def picker_server(monkeypatch: pytest.MonkeyPatch) -> Iterator[str]:
    """A real local page with a 'Select store' button that opens a search box, filters a
    list as you type, and records a click on one result — a minimal stand-in for Willys'
    JS-driven store picker that a plain fetch (and a single-button click loop) can't drive
    (see history 0238)."""
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), _PickerHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    async def _allow(_hostname: str) -> None:
        return None

    monkeypatch.setattr(web, "_check_host_is_public", _allow)
    try:
        yield f"http://127.0.0.1:{server.server_address[1]}/"
    finally:
        server.shutdown()


async def test_fetch_dynamic_steps_open_type_and_select(picker_server: str) -> None:
    result = await web.fetch_dynamic(
        picker_server,
        steps=[
            {"click": "Select store"},
            {"type": "Lund", "into": "Search store"},
            {"click": "Willys Lund Magistratsvagen"},
        ],
    )
    assert "Selected: Willys Lund Magistratsvagen" in str(result["text"])


async def test_fetch_dynamic_step_type_falls_back_to_first_visible_input(
    picker_server: str,
) -> None:
    """`into` is optional — omitting it should still find the search box that just
    appeared after the preceding click step."""
    result = await web.fetch_dynamic(
        picker_server,
        steps=[{"click": "Select store"}, {"type": "Malmo"}, {"click": "Willys Malmo"}],
    )
    assert "Selected: Willys Malmo" in str(result["text"])


async def test_fetch_dynamic_step_click_raises_when_target_not_found(
    picker_server: str,
) -> None:
    with pytest.raises(web.FetchError):
        await web.fetch_dynamic(picker_server, steps=[{"click": "Nonexistent button"}])
