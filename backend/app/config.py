from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "postgresql://postgres:postgres@localhost:5432/openlearnquest"
    secret_key: str = "change-me-in-production-use-openssl-rand-hex-32"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days
    anthropic_api_key: str = ""
    admin_key: str = "change-me-admin-key"
    debug: bool = False
    frontend_origin: str = "http://localhost:5173"


settings = Settings()

if "change-me" in settings.secret_key:
    import warnings
    warnings.warn(
        "SECRET_KEY is using the default insecure value. "
        "Set SECRET_KEY in your .env file: openssl rand -hex 32",
        stacklevel=1,
    )

if "change-me" in settings.admin_key:
    import warnings
    warnings.warn(
        "ADMIN_KEY is using the default insecure value. "
        "Set ADMIN_KEY in your .env file.",
        stacklevel=1,
    )
