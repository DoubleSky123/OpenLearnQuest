import uuid
from datetime import datetime
from sqlalchemy import String, Float, Integer, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base


class ConceptMastery(Base):
    __tablename__ = "concept_mastery"
    __table_args__ = (
        UniqueConstraint("user_id", "concept", name="uq_concept_mastery_user_concept"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False)
    concept: Mapped[str] = mapped_column(String, nullable=False)
    mastery: Mapped[float] = mapped_column(Float, default=0.0)   # 0.0 – 1.0
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    last_updated: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped["User"] = relationship("User", back_populates="concept_mastery_records")
