# Deployment Guide — Second Brain

This guide deploys Second Brain into the existing Zero Five VPS stack at
`brain.zero-five.space`. The Hub's Traefik instance owns ports 80/443, TLS, and
container routing. Second Brain does not run another reverse proxy on the host.
The application route is VPN-only: the hostname must resolve to the WireGuard
address and Traefik only accepts clients from `10.8.0.0/24`.

## Existing VPS contract

- Docker Engine and Docker Compose are already installed.
- The Hub router is already running Traefik with the `websecure` entrypoint and
  `letsencrypt` certificate resolver.
- Traefik owns the external Docker network named `traefik`.
- DNS for `brain.zero-five.space` resolves to the VPS's VPN address (`10.8.0.1`)
  for VPN clients; it must not expose the public VPS address.
- Only Second Brain's nginx `web` service joins `traefik`. The API, PostgreSQL,
  and MinIO remain on Compose's private `internal` network with no host ports.

The labels in `compose.yaml` are the integration contract. They register the
VPN-only HTTPS route with Traefik and make Second Brain visible in the Hub as
an admin-only web app. Do not recreate these labels in the Hub stack.

## 1. One-time application setup

The project lives at `/home/manuel/services/second-brain` on the VPS.

```bash
git clone <repository-url> /home/manuel/services/second-brain
cd /home/manuel/services/second-brain

# This must already exist and be owned by the Hub/Traefik stack.
docker network inspect traefik >/dev/null
```

Do not create a second `traefik` network if that check fails. Fix or start the
Hub router first so both stacks use the same external network.

## 2. Production environment

Create the application environment file on the VPS:

```bash
cd /home/manuel/services/second-brain
cp .env.example .env
chmod 600 .env
nano .env
```

Set at least these values:

```dotenv
APP_ENVIRONMENT=prod

POSTGRES_DB=secondbrain
POSTGRES_USER=secondbrain
POSTGRES_PASSWORD=<unique-random-password>

JWT_SECRET_KEY=<at-least-32-random-characters>
INITIAL_USER_USERNAME=manuel
INITIAL_USER_EMAIL=<your-email>
INITIAL_USER_PASSWORD=<unique-initial-password>
TOTP_ENCRYPTION_KEY=<fernet-key>
```

Generate the random values locally or on the VPS:

```bash
openssl rand -hex 32
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

`compose.yaml` constructs the container-only `DATABASE_URL` from the PostgreSQL
values, so the localhost value in `.env.example` is not used by the production
API container. Keep `.env` out of Git and include it in the VPS secret-backup
procedure.

## 3. Validate and deploy

Run the repository checks before updating the VPS:

```bash
npm run check
```

Then deploy on the VPS:

```bash
cd /home/manuel/services/second-brain
docker compose config --quiet
docker compose build api web
docker compose up -d
docker compose ps
```

The API entrypoint runs `alembic upgrade head` before starting FastAPI. Do not
run a separate migration command during a normal single-node deployment.

## 4. Verify the Hub route

Run the external route checks from a device connected to the VPN:

```bash
dig +short brain.zero-five.space
# Expected: the WireGuard/VPS address (currently 10.8.0.1), not Cloudflare IPs.
curl --fail --silent --show-error https://brain.zero-five.space/api/health
curl --fail --silent --show-error https://brain.zero-five.space/api/ready
curl --silent --show-error --head https://brain.zero-five.space/
docker compose ps
```

Expected results:

- Both API calls return an OK response.
- HTTPS presents a valid Let's Encrypt certificate.
- The response includes the nginx security headers.
- The Hub shows **Second Brain** for admin users and opens
  `https://brain.zero-five.space`.
- `docker compose ps` shows no published ports for `api`, `db`, or `minio`.

If the app returns 404 or 502, verify the shared network and labels before
changing nginx:

```bash
docker network inspect traefik
docker compose logs --tail=100 web api
```

The private request path is:

```text
VPN client -> wg0 -> Hub Traefik -> secondbrain web/nginx -> api:8000
```

## 5. First login and 2FA

The API creates the initial admin user only when no user exists. Log in with the
`INITIAL_USER_*` values, change the initial password, then enable TOTP in the
application's security settings. Keep recovery material outside the VPS.

Changing `INITIAL_USER_PASSWORD` later does not reset an existing user's
password.

## 6. Automatic deployment from GitHub

`.github/workflows/deploy.yml` deploys every successful `main` push after the
existing `CI` workflow passes. It connects with SSH, checks out the exact commit
that CI tested, rebuilds the application containers, runs migrations through
the API entrypoint, and verifies readiness through the internal nginx container
path. This avoids requiring the deployment host to reach the VPN-only hostname.

Create a dedicated SSH key for GitHub Actions. Add its public key to
`/home/manuel/.ssh/authorized_keys` on the VPS. Add these secrets to the
repository's `production` environment in GitHub:

| Secret            | Value                                    |
| ----------------- | ---------------------------------------- |
| `VPS_HOST`        | VPS hostname or IP address               |
| `VPS_USER`        | `manuel`                                 |
| `VPS_SSH_KEY`     | Dedicated private SSH key for deployment |
| `VPS_KNOWN_HOSTS` | Verified `[host]:2020` SSH host-key line |

Generate the `VPS_KNOWN_HOSTS` value with `ssh-keyscan -p 2020`, but compare its
fingerprint with the VPS host key over an already trusted SSH connection before
saving it. The workflow pins that key to the configured `VPS_HOST`; this avoids
hostname/IP formatting mismatches without disabling host verification. Do not
use `StrictHostKeyChecking=no`.

The VPS checkout must already exist, contain its production `.env`, have access
to the Git repository, and remain clean. Deployment deliberately fails rather
than overwriting local changes. GitHub serializes production deployments so two
pushes cannot run Compose concurrently.

The workflow must exist on the default branch before GitHub can trigger it from
the completed `CI` workflow. The first push that adds it establishes the
automation; later successful pushes deploy normally.

## 7. Manual update

Review the incoming revision and confirm that its deployable images remain
pinned. Then, on the VPS:

```bash
cd /home/manuel/services/second-brain
git pull --ff-only
docker compose config --quiet
docker compose build api web
docker compose up -d
docker compose ps
docker compose exec -T web \
  wget -q -O - http://127.0.0.1/api/ready >/dev/null
```

Run the external hostname checks only from a device connected to the VPN; the
Traefik route intentionally returns `403` to requests outside `10.8.0.0/24`.

Compose replaces only changed services and preserves the named PostgreSQL and
MinIO volumes.

## 8. Backups

Back up both named volumes and the encrypted/off-host copy of `.env`. A database
dump alone does not include files stored in MinIO.

Create a private backup directory for the deployment user:

```bash
install -d -m 700 "$HOME/backups/secondbrain"
```

Database backup:

```bash
cd /home/manuel/services/second-brain
docker compose exec -T db pg_dump -U secondbrain -d secondbrain \
  | gzip > "$HOME/backups/secondbrain/db-$(date +%F).sql.gz"
```

MinIO data backup:

```bash
cd /home/manuel/services/second-brain
docker compose exec -T minio tar -C /data -cf - . \
  | gzip > "$HOME/backups/secondbrain/minio-$(date +%F).tar.gz"
```

Copy backups off the VPS and apply the required retention there. A backup is not
accepted until a restore drill has succeeded on disposable volumes.

Database restore drill:

```bash
cd /home/manuel/services/second-brain
docker compose stop api web
gunzip -c "$HOME/backups/secondbrain/db-YYYY-MM-DD.sql.gz" \
  | docker compose exec -T db psql -U secondbrain -d secondbrain
docker compose up -d
```

The SQL command restores into an empty drill database. Do not feed it into the
live populated database. Restore MinIO into an empty drill volume, then verify
that referenced attachments can be opened through the application.

## 9. Production gate

- [ ] Hub Traefik is healthy and owns the external `traefik` network.
- [ ] `brain.zero-five.space` resolves to the VPS and has valid HTTPS.
- [ ] Hub-level HTTP-to-HTTPS redirect and HSTS are enabled.
- [ ] `.env` is mode `600`, has unique secrets, and is not committed.
- [ ] `APP_ENVIRONMENT=prod`; the API production guard passes.
- [ ] Only `web` joins `traefik`; `api`, `db`, and `minio` publish no ports.
- [ ] Login rate limiting works and Traefik access logs feed the host's fail2ban
      policy, if that policy is enabled in the Hub stack.
- [ ] The initial password was changed and TOTP is enabled.
- [ ] Database, MinIO, and `.env` backups exist off-host.
- [ ] A restore drill has succeeded.
- [ ] `npm run check` passes for the deployed revision.
- [ ] GitHub's `production` environment contains the four deployment secrets.
- [ ] A successful `main` CI run completes the `Deploy` workflow.

## 10. Troubleshooting

| Symptom                        | Check                                                                                  |
| ------------------------------ | -------------------------------------------------------------------------------------- |
| Traefik 404                    | Host rule, `websecure` entrypoint, and `brain.zero-five.space` DNS                     |
| Traefik 403                    | `dig +short brain.zero-five.space` must return the VPN address; configure split DNS or a VPN-only hosts entry if it returns Cloudflare addresses |
| Traefik 502                    | `web` health/logs and membership in the external `traefik` network                     |
| API 502 from nginx             | `docker compose logs api`; API health and migration startup                            |
| Static asset missing           | Check the response `Content-Type`; nginx can return the SPA `index.html` with HTTP 200 for a missing asset, so rebuild the web image and verify the asset is copied into `/usr/share/nginx/html` |
| Logo asset 403                 | Check file modes in `/usr/share/nginx/html`; rebuild the web image after applying the Dockerfile permission normalization |
| Production configuration error | `APP_ENVIRONMENT`, JWT secret, initial password, and container `DATABASE_URL`          |
| Hub entry missing              | The `hub.*` labels on `web` and the Hub's Docker discovery scope                       |
| Login returns 429              | Wait for the configured rate-limit window and inspect the login-attempt audit data     |
| Deploy refuses local changes   | Inspect `git status` on the VPS and preserve or remove the intentional change manually |
| SSH host verification fails    | Refresh `VPS_KNOWN_HOSTS` only after verifying the VPS host-key fingerprint            |

## 11. Private access

VPN-only access is enforced by the `secondbrain-vpn-only` Traefik middleware in
`compose.yaml`. Keep the hostname on the VPN address and do not add host-bound
ports to this Compose project to bypass the router. App login and TOTP remain
enabled as a second layer of protection.
