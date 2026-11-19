import uuid
from datetime import datetime
from sqlalchemy import String, Integer, DateTime, ForeignKey, Boolean, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base


class QuestionAttempt(Base):
    __tablename__ = "question_attempts"
    # one attempt per (session, question): /session/record and the /session/next
    # resend can race; the loser gets IntegrityError and returns the winner's row
    # (game_master._record_attempt), so mastery is applied once
    __table_args__ = (
        UniqueConstraint("session_id", "question_id", name="uq_question_attempts_session_question"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id: Mapped[str] = mapped_column(String, ForeignKey("game_sessions.id"), nullable=False)
    question_id: Mapped[str] = mapped_column(String, nullable=False)
    # e.g. 'insertAtHead' — enables per-operation peer stats (null on pre-migration rows)
    operation: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    difficulty: Mapped[int] = mapped_column(Integer, nullable=False)  # 1 | 2 | 3
    time_spent_ms: Mapped[int] = mapped_column(Integer, default=0)
    error_count: Mapped[int] = mapped_column(Integer, default=0)
    xp_gained: Mapped[int] = mapped_column(Integer, default=0)
    passed: Mapped[bool] = mapped_column(Boolean, default=False)
    lives_after: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Error diagnosis from error_analyzer (null if no errors)
    error_type: Mapped[str | None] = mapped_column(String, nullable=True)
    error_concept: Mapped[str | None] = mapped_column(String, nullable=True)
    # State axis telemetry (null for attempts recorded before this was added)
    intra_difficulty: Mapped[int | None] = mapped_column(Integer, nullable=True)   # within-type difficulty used (1/2/3)
    scaffold_level: Mapped[int | None] = mapped_column(Integer, nullable=True)     # max scaffold level reached (0-4)
    emotion: Mapped[str | None] = mapped_column(String, nullable=True)             # emotion when answering
    # Content-variant tag ("blanks2", "bug1-s3"); null for AI-generated questions
    variant: Mapped[str | None] = mapped_column(String, nullable=True)
    # fill_blank | find_bug | ordering — server-clamped (never above the type the
    # server would serve); item analysis and mastery both key on it
    question_type: Mapped[str | None] = mapped_column(String, nullable=True)
    # practice | detour | review (curriculum.plan_next). A review is a forgetting
    # check on a mastered op: recorded here, never applied to mastery.
    purpose: Mapped[str | None] = mapped_column(String, nullable=True)
    # remediate: the misconception the item targeted (misconceptions.CATALOG id)
    target_misconception: Mapped[str | None] = mapped_column(String, nullable=True)
    completed_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    session: Mapped["GameSession"] = relationship("GameSession", back_populates="attempts")
