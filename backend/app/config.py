from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "CircUIt API"
    api_prefix: str = "/api"
    log_level: str = "INFO"
    mongo_uri: str | None = None
    mongo_database: str = "circuitui"
    dev_user_id: str = "local-dev-user"
    clerk_issuer: str | None = None
    clerk_clock_skew_seconds: int = 90
    vite_clerk_publishable_key: str | None = None
    cors_origins: list[str] = ["http://127.0.0.1:8091"]
    # Base URL (including /api) of the Circuit workflow_builder backend that
    # published apps call into for data and actions.
    workflow_builder_api_url: str = "http://127.0.0.1:8010/api"
    vite_circuitui_api_url: str | None = None
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[2] / ".env",
        env_file_encoding="utf-8",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
