import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, ForeignKey, Float, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base


class EmotionLog(Base):
    __tablename__ = "emotion_logs"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False)
    session_id: Mapped[str | None] = mapped_column(String, ForeignKey("game_sessions.id"), nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    # 'self_report' | 'behavioral' | 'tutor_chat'
    source: Mapped[str] = mapped_column(String, nullable=False)
    # 'engaged' | 'confused' | 'frustrated' | 'bored'
    emotion: Mapped[str] = mapped_column(String, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)
    # raw signals fed to the inference (JSON)
    signals: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # 'none' | 'reduce_difficulty' | 'increase_difficulty' | 'show_hint' | 'encourage'
    action_taken: Mapped[str | None] = mapped_column(String, nullable=True)

    user: Mapped["User"] = relationship("User", back_populates="emotion_logs")
