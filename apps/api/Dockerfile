FROM ghcr.io/astral-sh/uv:0.11.24 AS uv

FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

WORKDIR /app

RUN useradd --create-home --uid 10001 app

COPY --from=uv /uv /uvx /bin/
COPY apps/api/pyproject.toml apps/api/uv.lock ./
RUN uv sync --locked --no-dev

COPY apps/api/app ./app
COPY apps/api/alembic.ini ./alembic.ini
COPY apps/api/alembic ./alembic
COPY apps/api/entrypoint.sh ./entrypoint.sh

RUN chown -R app:app /app && chmod +x ./entrypoint.sh
USER app

EXPOSE 8000
ENTRYPOINT ["./entrypoint.sh"]
