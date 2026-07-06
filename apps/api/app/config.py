from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Load the repository `.env` locally. Production values are injected by Compose,
# so the shallower container filesystem does not need to contain this file.
_ENV_FILE = next(
    (parent / ".env" for parent in Path(__file__).resolve().parents if (parent / ".env").is_file()),
    None,
)


class Settings(BaseSettings):
    environment: Literal["dev", "prod"] = "dev"
    database_url: str = "postgresql+psycopg://secondbrain:secondbrain@localhost:5432/secondbrain"

    # JWT and Auth
    jwt_secret_key: str = "your-secret-key-change-in-production"
    jwt_access_token_expire_minutes: int = 15
    jwt_refresh_token_expire_days: int = 30

    # Initial user (seeded on first run)
    initial_user_username: str = "manuel"
    initial_user_email: str = "user@example.com"
    initial_user_password: str = "changeme"

    # Rate limiting
    login_rate_limit_attempts: int = 5
    login_rate_limit_window_minutes: int = 5

    # TOTP encryption (Fernet key for encrypted TOTP storage)
    totp_encryption_key: str = ""

    # MinIO / S3-compatible storage. The credentials fall back to the
    # MINIO_ROOT_* names Compose already requires in .env, so one pair of
    # values drives both the server and the client.
    minio_endpoint: str = "localhost:9000"
    minio_access_key: str = Field(
        "secondbrain",
        validation_alias=AliasChoices("minio_access_key", "minio_root_user"),
    )
    minio_secret_key: str = Field(
        "secondbrain",
        validation_alias=AliasChoices("minio_secret_key", "minio_root_password"),
    )
    minio_bucket: str = "secondbrain"
    minio_secure: bool = False
    # Public URL prefix (set to the proxy/external URL in production)
    minio_public_url: str = ""

    # OpenRouter AI (food photo analysis)
    openrouter_api_key: str = ""
    openrouter_model: str = "google/gemini-2.5-flash"

    model_config = SettingsConfigDict(env_file=_ENV_FILE, extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
