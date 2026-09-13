# Deployment notes

The supported public self-hosting guide lives in
[`docs/public/self-hosting.md`](../docs/public/self-hosting.md).

The production Compose file expects an existing external Docker network named
`traefik`. Set `APP_HOST` and the required secrets in `.env`, then validate the
rendered configuration before the first start:

```bash
docker network inspect traefik
docker compose config --quiet
docker compose build api web
docker compose up -d
```

For later updates, log into the VPS and run the repository-owned updater:

```bash
./scripts/update-production.sh
```

It fast-forwards `main`, rebuilds and restarts the application containers, and
checks readiness without stopping or deleting PostgreSQL and MinIO volumes. A
configured Telegram bot is included automatically. The GitHub Actions workflow
runs checks only; it does not connect to or deploy the VPS.

The removed GitHub workflow left older VPS checkouts on a detached commit. Run
this once to move that checkout back onto `main` and obtain the updater:

```bash
git fetch origin main
git switch main
git merge --ff-only origin/main
./scripts/update-production.sh
```

Start the optional Telegram bridge explicitly:

```bash
docker compose --profile bot up -d bot
```

Never use `docker compose down --volumes` on a deployment you want to keep. The
named PostgreSQL, MinIO, and bot volumes contain the application's durable data.
