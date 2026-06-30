import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base


class GameSession(Base):
    __tablename__ = "game_sessions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False)
    module_id: Mapped[str] = mapped_column(String, nullable=False)        # 'singly' | 'doubly'
    mode: Mapped[str] = mapped_column(String, nullable=False)             # 'tutorial' | 'challenge' etc.
    game_mode_detail: Mapped[str | None] = mapped_column(String, nullable=True)   # 'practice-comp' | 'challenge-comp'
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    lives_remaining: Mapped[int | None] = mapped_column(nullable=True)    # set on competitive completion

    user: Mapped["User"] = relationship("User", back_populates="sessions")
    attempts: Mapped[list["QuestionAttempt"]] = relationship("QuestionAttempt", back_populates="session", cascade="all, delete-orphan")
