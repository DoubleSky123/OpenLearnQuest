from pydantic import field_validator
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
    # What a student who gets remediation (on / the ab 'targeted' arm) receives,
    # comma-separated: tutor (the tutor is told the misconception), remediation
    # (targeted questions), feedback (the analysis card's "What your choice did").
    # A study that varies ONLY the tutor sets "tutor".
    misconception_channels: str = "tutor,remediation,feedback"
    # Where tags come from: execution (behaviour on the harness boards, unless a
    # teacher labelled the edit) or reviewed (teacher-confirmed labels only).
    misconception_tags: str = "execution"
    # Where find_bug / ordering questions come from:
    #   any      — the class-shared AI pool, then live generation, then authored content
    #   authored — authored content only (_BUGS, TEMPLATES distractors): no pool row,
    #              no model call. A study sets this so every option a student can
    #              pick is one a teacher can label (the pool adds ~450 more edits).
    # fill_blank is always authored. An unknown value refuses to start: a typo must
    # not quietly serve the pool during a study.
    question_source: str = "any"
    # "Teach Quinn", the elective where the student teaches an AI classmate
    # (services/npc_agent.py). Off by default: it shows a new screen to students.
    npc_enabled: bool = False
    # The classroom study (services/study.py). Off by default: nothing changes.
    # On: consent first, then a pre-test, then a stored random assignment
    # (stratified by the pre-test), then practice; post / delayed tests when
    # STUDY_TESTS opens them. The arms only differ under MISCONCEPTION_MODE=ab.
    study_enabled: bool = False
    #   between   — each student is in one arm for the whole course
    #   crossover — the arm alternates by unit (half start targeted, half control)
    study_design: str = "between"
    # Which tests are open, comma-separated: "pre", then "pre,post" at the end of
    # the course, then "pre,post,delayed" 1-2 weeks later. The pre-test is always open.
    study_tests: str = "pre"

    @field_validator("study_design")
    @classmethod
    def _known_study_design(cls, v: str) -> str:
        v = (v or "between").strip().lower()
        if v not in ("between", "crossover"):
            raise ValueError(f"STUDY_DESIGN must be 'between' or 'crossover', not {v!r}")
        return v

    @field_validator("study_tests")
    @classmethod
    def _known_study_tests(cls, v: str) -> str:
        parts = [p.strip().lower() for p in (v or "").split(",") if p.strip()]
        bad = [p for p in parts if p not in ("pre", "post", "delayed")]
        if bad:
            raise ValueError(f"STUDY_TESTS takes pre, post, delayed — not {bad}")
        return ",".join(dict.fromkeys(["pre"] + parts))

    @property
    def unlock_all_emails(self) -> set[str]:
        # exact addresses, matched exactly: registration keeps an email's case, so a
        # case-insensitive match would let "Shi.Kun@..." inherit the test account's units
        return {e.strip() for e in self.unlock_all_units_for.split(",") if e.strip()}

    @field_validator("question_source")
    @classmethod
    def _known_question_source(cls, v: str) -> str:
        v = (v or "any").strip().lower()
        if v not in ("any", "authored"):
            raise ValueError(f"QUESTION_SOURCE must be 'any' or 'authored', not {v!r}")
        return v

    @property
    def authored_only(self) -> bool:
        """QUESTION_SOURCE=authored: no question pool, no live generation."""
        return self.question_source == "authored"


settings = Settings()

if settings.unlock_all_emails:
    import logging
    logging.getLogger(__name__).warning(
        "UNLOCK_ALL_UNITS_FOR is set: all units are unlocked for %s (testing only)",
        ", ".join(sorted(settings.unlock_all_emails)))

if settings.study_enabled:
    import logging
    logging.getLogger(__name__).warning(
        "STUDY_ENABLED: design=%s, tests open=%s, MISCONCEPTION_MODE=%s%s", settings.study_design,
        settings.study_tests, settings.misconception_mode,
        "" if (settings.misconception_mode or "").strip().lower() == "ab"
        else " (not 'ab': both arms get the same tutor)")

if settings.authored_only:
    import logging
    logging.getLogger(__name__).warning(
        "QUESTION_SOURCE=authored: find_bug/ordering come from authored content only "
        "(no question pool, no live generation)")

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
