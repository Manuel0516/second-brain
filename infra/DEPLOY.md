# Deployment notes

The supported public self-hosting guide lives in
[`docs/public/self-hosting.md`](../docs/public/self-hosting.md).

The production Compose file expects an existing external Docker network named
`traefik`. Set `APP_HOST` and the required secrets in `.env`, then validate the
rendered configuration before starting services:

```bash
docker network inspect traefik
docker compose config --quiet
docker compose build api web
docker compose up -d
```

Start the optional Telegram bridge explicitly:

```bash
docker compose --profile bot up -d bot
```

Never use `docker compose down --volumes` on a deployment you want to keep. The
named PostgreSQL, MinIO, and bot volumes contain the application's durable data.
