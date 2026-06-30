import uuid
from datetime import datetime
from sqlalchemy import String, Integer, DateTime, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    username: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    xp: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    onboarding_singly_done: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    sessions: Mapped[list["GameSession"]] = relationship("GameSession", back_populates="user", cascade="all, delete-orphan")
    mistakes: Mapped[list["Mistake"]] = relationship("Mistake", back_populates="user", cascade="all, delete-orphan")
    emotion_logs: Mapped[list["EmotionLog"]] = relationship("EmotionLog", back_populates="user", cascade="all, delete-orphan")
    mastery_records: Mapped[list["Mastery"]] = relationship("Mastery", back_populates="user", cascade="all, delete-orphan")
    concept_mastery_records: Mapped[list["ConceptMastery"]] = relationship("ConceptMastery", back_populates="user", cascade="all, delete-orphan")
