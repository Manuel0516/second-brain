from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://secondbrain:secondbrain@localhost:5432/secondbrain"

    # JWT and Auth
    jwt_secret_key: str = "your-secret-key-change-in-production"
    jwt_access_token_expire_minutes: int = 15
    jwt_refresh_token_expire_days: int = 30

    # Initial user (seeded on first run)
    initial_user_email: str = "user@example.com"
    initial_user_password: str = "changeme"

    # Rate limiting
    login_rate_limit_attempts: int = 5
    login_rate_limit_window_minutes: int = 5

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
