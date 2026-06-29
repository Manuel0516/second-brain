from functools import lru_cache
from pathlib import Path
from typing import Literal

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

    model_config = SettingsConfigDict(env_file=_ENV_FILE, extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
