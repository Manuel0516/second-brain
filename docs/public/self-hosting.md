# Self-hosting

The production stack is designed for a single host running Docker Compose and
an existing Traefik instance. Only nginx joins Traefik; FastAPI, PostgreSQL, and
MinIO remain on private Docker networks.

## Before you start

- Point a hostname at the address your intended clients can reach.
- Create the external Docker network used by Traefik if your proxy stack has
  not already created it.
- Decide whether access will be public, private-network-only, or VPN-only. The
  supplied Compose file restricts the route to `10.40.0.0/24`; change that CIDR
  deliberately for your network.
- Back up both PostgreSQL and MinIO. One without the other is incomplete.

## Configure

```bash
cp .env.example .env
chmod 600 .env
```

Set `APP_ENVIRONMENT=prod`, `APP_HOST`, `APP_ORIGIN`, every required password,
the initial administrator fields, and both encryption keys. Production startup
rejects the default JWT secret, a short signing key, the default initial
password, and a localhost database URL.

Create the shared network once:

```bash
docker network create traefik
```

If Traefik already owns a network with that name, keep the existing one.

## Validate and start

```bash
docker compose config --quiet
docker compose build api web
docker compose up -d
docker compose ps
```

The API container applies pending Alembic migrations before it starts. Verify
health through the web container and your configured hostname:

```bash
docker compose exec -T web wget -q -O - http://127.0.0.1/api/ready
curl --fail --silent --show-error "https://YOUR_APP_HOST/api/ready"
```

## First login

Sign in with `INITIAL_USER_EMAIL` and `INITIAL_USER_PASSWORD`, immediately set
a new password in Settings, and enable TOTP. Updating `.env` afterward does not
reset the database account.

## Optional Telegram bot

Configure `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_USERS`, and `APP_ORIGIN`, then
start the opt-in profile:

```bash
docker compose --profile bot up -d bot
```

The bot does not receive an account token until an authenticated user approves
its short-lived device code in the web app.

## Updating

```bash
git pull --ff-only
docker compose config --quiet
docker compose build api web
docker compose up -d
```

Compose recreates changed services and preserves named volumes. Review incoming
migrations and release notes before updating a deployment with important data.

## Optional GitHub deployment

The included deployment workflow is restricted to this repository so forks do
not attempt to contact the maintainer's server. Maintainers using that workflow
configure the `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `VPS_KNOWN_HOSTS`,
`VPS_SSH_PORT`, and `VPS_DEPLOY_PATH` production secrets. Forks should adapt the
workflow and repository guard to their own host, or remove it and deploy with
the Compose commands above.

## Backups

Create a restricted backup directory outside the repository. Back up the
database, MinIO volume, and `.env` through your normal encrypted backup system.

Example database dump:

```bash
docker compose exec -T db pg_dump -U secondbrain -d secondbrain > secondbrain.sql
```

For MinIO, use a volume-aware backup tool or an `mc mirror` job that retains
object metadata. Test restores on another host; an untested backup is only a
hope.

## Important safety notes

- Never commit `.env` or provider credentials.
- Never expose PostgreSQL, MinIO, or FastAPI directly to the internet.
- Never run `docker compose down --volumes` unless you intend to delete all
  database, uploaded-file, and bot state.
- Review the Traefik allowlist for your own network instead of copying a CIDR
  you do not control.
- Keep Docker, base images, and the host operating system patched.
