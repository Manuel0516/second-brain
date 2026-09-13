# Configuration

Copy `.env.example` to `.env` and treat the result as a secret. The repository
ignores `.env`; do not commit it.

## Required values

| Variable                | Purpose                                                         |
| ----------------------- | --------------------------------------------------------------- |
| `APP_ENVIRONMENT`       | `dev` or `prod`; production enables stricter startup validation |
| `POSTGRES_DB`           | PostgreSQL database name                                        |
| `POSTGRES_USER`         | PostgreSQL user                                                 |
| `POSTGRES_PASSWORD`     | PostgreSQL password; use a unique random value                  |
| `DATABASE_URL`          | Host-side SQLAlchemy URL used by local commands and FastAPI     |
| `MINIO_ROOT_USER`       | MinIO access key                                                |
| `MINIO_ROOT_PASSWORD`   | MinIO secret key                                                |
| `JWT_SECRET_KEY`        | JWT signing key; use at least 32 random characters              |
| `INITIAL_USER_USERNAME` | Username created only when the users table is empty             |
| `INITIAL_USER_EMAIL`    | Email for the initial administrator                             |
| `INITIAL_USER_PASSWORD` | Initial administrator password                                  |

Changing `INITIAL_USER_*` later does not modify an existing account.

## Web and production routing

| Variable       | Default                 | Purpose                                                  |
| -------------- | ----------------------- | -------------------------------------------------------- |
| `APP_ORIGIN`   | `http://localhost:5173` | Browser-visible application origin and bot approval base |
| `APP_HOST`     | `brain.example.com`     | Hostname used by production Traefik labels               |
| `FRONTEND_URL` | `http://localhost:5173` | OAuth callback destination                               |

## Authentication

| Variable                          | Default | Purpose                               |
| --------------------------------- | ------- | ------------------------------------- |
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | `1440`  | Access-cookie lifetime                |
| `JWT_REFRESH_TOKEN_EXPIRE_DAYS`   | `30`    | Refresh-cookie lifetime               |
| `LOGIN_RATE_LIMIT_ATTEMPTS`       | `5`     | Failed attempts allowed per window    |
| `LOGIN_RATE_LIMIT_WINDOW_MINUTES` | `5`     | Rate-limit window                     |
| `TOTP_ENCRYPTION_KEY`             | empty   | Fernet key for encrypted TOTP secrets |

Generate a Fernet key with:

```bash
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

## Google Calendar

Google sync is optional. Create a Web OAuth client, enable the Google Calendar
API, and configure:

| Variable                         | Purpose                                       |
| -------------------------------- | --------------------------------------------- |
| `GOOGLE_CLIENT_ID`               | OAuth client ID                               |
| `GOOGLE_CLIENT_SECRET`           | OAuth client secret                           |
| `GOOGLE_REDIRECT_URI`            | Exact backend callback registered with Google |
| `GOOGLE_TOKEN_ENCRYPTION_KEY`    | Fernet key used for refresh tokens at rest    |
| `CALENDAR_SYNC_INTERVAL_MINUTES` | Background pull interval                      |

ICS subscriptions do not require Google credentials.

## AI and photo analysis

| Variable             | Purpose                                                |
| -------------------- | ------------------------------------------------------ |
| `OPENROUTER_API_KEY` | Optional OpenRouter key used by configured AI features |
| `OPENROUTER_MODEL`   | Default model identifier for food-photo analysis       |

Provider settings and assistant capabilities can be adjusted per user from the
AI settings screen.

## Telegram bridge

The bot is optional and disabled unless its Compose profile is started.

| Variable                 | Purpose                                   |
| ------------------------ | ----------------------------------------- |
| `TELEGRAM_BOT_TOKEN`     | Token issued by BotFather                 |
| `TELEGRAM_ALLOWED_USERS` | Comma-separated Telegram numeric user IDs |

Start it locally or in production with the `bot` profile described in the
[self-hosting guide](self-hosting.md).
