import uuid
from datetime import datetime
from sqlalchemy import String, Integer, DateTime, Boolean, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base


class Mastery(Base):
    __tablename__ = "mastery"
    __table_args__ = (
        UniqueConstraint("user_id", "operation", "module_id", name="uq_mastery_user_op_module"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False)
    module_id: Mapped[str] = mapped_column(String, nullable=False)   # 'singly' | 'doubly'
    operation: Mapped[str] = mapped_column(String, nullable=False)   # e.g. 'insertAtHead'
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    passes: Mapped[int] = mapped_column(Integer, default=0)
    consecutive_passes: Mapped[int] = mapped_column(Integer, default=0)
    perfect_pass: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, server_default="false")
    type_unlocked: Mapped[int] = mapped_column(Integer, default=1, nullable=False, server_default="1")   # competence ceiling (earned, monotonic)
    active_type_level: Mapped[int] = mapped_column(Integer, default=1, nullable=False, server_default="1")  # type the student chose to practice (<= type_unlocked)
    last_seen: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    user: Mapped["User"] = relationship("User", back_populates="mastery_records")
