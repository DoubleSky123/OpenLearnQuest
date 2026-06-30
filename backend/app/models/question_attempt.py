import uuid
from datetime import datetime
from sqlalchemy import String, Integer, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base


class QuestionAttempt(Base):
    __tablename__ = "question_attempts"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id: Mapped[str] = mapped_column(String, ForeignKey("game_sessions.id"), nullable=False)
    question_id: Mapped[str] = mapped_column(String, nullable=False)
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
    completed_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    session: Mapped["GameSession"] = relationship("GameSession", back_populates="attempts")
