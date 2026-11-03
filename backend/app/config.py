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
    # Testing only: comma-separated account emails that see every curriculum
    # unit unlocked (progress itself stays real). Leave empty for a class.
    unlock_all_units_for: str = ""
    # Misconception-driven remediation (docs/designs/misconception-npc-implementation.md):
    #   off    — nothing recorded, nothing changes
    #   shadow — tag served items, record evidence, diagnose, log the remediation
    #            that WOULD run; serving is unchanged
    #   ab     — as shadow, and half the students (hash of user id) get remediation
    #   on     — every student gets remediation
    misconception_mode: str = "off"
    # "Teach Quinn", the elective where the student teaches an AI classmate
    # (services/npc_agent.py). Off by default: it shows a new screen to students.
    npc_enabled: bool = False

    @property
    def unlock_all_emails(self) -> set[str]:
        return {e.strip().lower() for e in self.unlock_all_units_for.split(",") if e.strip()}


settings = Settings()

if settings.unlock_all_emails:
    import logging
    logging.getLogger(__name__).warning(
        "UNLOCK_ALL_UNITS_FOR is set: all units are unlocked for %s (testing only)",
        ", ".join(sorted(settings.unlock_all_emails)))

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
