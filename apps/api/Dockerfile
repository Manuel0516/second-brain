FROM ghcr.io/astral-sh/uv:0.11.24 AS uv

FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

WORKDIR /app

RUN useradd --create-home --uid 10001 app

COPY --from=uv /uv /uvx /bin/
COPY apps/api/pyproject.toml apps/api/uv.lock ./
RUN uv sync --locked --no-dev
# web_fetch's click-through mode (agent/web.py fetch_dynamic) needs a real browser.
# --with-deps pulls the system libraries Chromium needs onto this slim base image.
RUN uv run playwright install --with-deps chromium

COPY apps/api/app ./app
COPY apps/api/alembic.ini ./alembic.ini
COPY apps/api/alembic ./alembic
COPY apps/api/entrypoint.sh ./entrypoint.sh

RUN chown -R app:app /app /ms-playwright && chmod +x ./entrypoint.sh
USER app

EXPOSE 8000
ENTRYPOINT ["./entrypoint.sh"]
