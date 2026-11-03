"""
Misconception diagnosis (services/misconception_model.py).

served_items        what the server actually handed this student, with every
                    option's misconception tags computed server-side. Picks are
                    tagged by looking the item up here, never by trusting the client.
misconception_events  the evidence stream: a tagged option picked, avoided, or a
                    misconception taught. State is derived from it and auditable.
misconception_state   the current diagnosis per (student, misconception).
"""
import uuid
from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class ServedItem(Base):
    __tablename__ = "served_items"
    # pool questions keep their pool row id for every student, so the item is
    # (student, question), not the question id alone
    __table_args__ = (UniqueConstraint("user_id", "question_id", name="uq_served_items_user_question"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    question_id: Mapped[str] = mapped_column(String, nullable=False)
    session_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("game_sessions.id", ondelete="SET NULL"), nullable=True)
    operation: Mapped[str] = mapped_column(String, nullable=False)
    question_type: Mapped[str] = mapped_column(String, nullable=False)
    variant: Mapped[str | None] = mapped_column(String, nullable=True)
    purpose: Mapped[str | None] = mapped_column(String, nullable=True)
    target_misconception: Mapped[str | None] = mapped_column(String, nullable=True)
    arm: Mapped[str | None] = mapped_column(String, nullable=True)          # MISCONCEPTION_MODE=ab group
    operation_value: Mapped[dict | int | None] = mapped_column(JSON, nullable=True)
    # {"lines": {"<line>": {"<symbolic option>": ["m-id", ...]}}, "steps": [...symbolic]}
    tags: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    board: Mapped[dict | None] = mapped_column(JSON, nullable=True)         # the board the student saw
    shadow_plan: Mapped[dict | None] = mapped_column(JSON, nullable=True)   # remediation that WOULD have run
    served_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class MisconceptionEvent(Base):
    __tablename__ = "misconception_events"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    misconception_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String, nullable=False)              # picked | avoided | taught
    question_id: Mapped[str | None] = mapped_column(String, nullable=True)
    operation: Mapped[str | None] = mapped_column(String, nullable=True)
    question_type: Mapped[str | None] = mapped_column(String, nullable=True)
    line: Mapped[int | None] = mapped_column(Integer, nullable=True)
    option: Mapped[str | None] = mapped_column(String, nullable=True)       # symbolic, as tagged
    targeted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)  # the item targeted this one
    p_after: Mapped[float | None] = mapped_column(Float, nullable=True)
    at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class MisconceptionState(Base):
    __tablename__ = "misconception_state"
    __table_args__ = (UniqueConstraint("user_id", "misconception_id", name="uq_misconception_state_user_m"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    misconception_id: Mapped[str] = mapped_column(String, nullable=False)
    p_hold: Mapped[float] = mapped_column(Float, nullable=False)
    n_picked: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    n_avoided: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    picked_items: Mapped[list] = mapped_column(JSON, nullable=False, default=list)   # question ids (distinct)
    picked_ops: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    resolved_ops: Mapped[list] = mapped_column(JSON, nullable=False, default=list)   # clean targeted passes
    status: Mapped[str] = mapped_column(String, default="unknown", nullable=False)   # unknown|suspected|active|resolved
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
