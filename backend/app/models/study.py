"""
The classroom study (services/study.py, STUDY_ENABLED).

study_participants  one row per student: consent (version, answer, time, a few
                    background answers) and the stored random assignment
                    (design, sequence, stratum) — never recomputed from a hash
quiz_attempts       one per (student, test): pre / post / delayed, which form,
                    the item and option order the student saw, the score
quiz_responses      one per (attempt, item): the option picked, whether it was
                    right and the misconception it shows (server-judged)
"""
import uuid
from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class StudyParticipant(Base):
    __tablename__ = "study_participants"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id", ondelete="CASCADE"),
                                         nullable=False, unique=True)
    consent_version: Mapped[str | None] = mapped_column(String, nullable=True)
    consented: Mapped[bool | None] = mapped_column(Boolean, nullable=True)      # None = not answered yet
    consent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    withdrawn_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    background: Mapped[dict | None] = mapped_column(JSON, nullable=True)         # optional answers
    pre_form: Mapped[str | None] = mapped_column(String, nullable=True)          # "A" | "B" (post = the other)
    # assignment, made once when the pre-test is submitted
    design: Mapped[str | None] = mapped_column(String, nullable=True)            # between | crossover
    sequence: Mapped[str | None] = mapped_column(String, nullable=True)
    #   between:   targeted | control
    #   crossover: targeted-first (units 1, 3, 5 targeted) | control-first (units 2, 4)
    stratum: Mapped[str | None] = mapped_column(String, nullable=True)           # pre-test band
    pre_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    assigned_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    assign_detail: Mapped[dict | None] = mapped_column(JSON, nullable=True)      # counts seen, random or not
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class QuizAttempt(Base):
    __tablename__ = "quiz_attempts"
    __table_args__ = (UniqueConstraint("user_id", "kind", name="uq_quiz_attempts_user_kind"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id", ondelete="CASCADE"),
                                         nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String, nullable=False)                    # pre | post | delayed
    form: Mapped[str] = mapped_column(String, nullable=False)                    # A | B
    # [{"item": id, "order": [option ids as shown]}], in the order shown
    items: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    n_items: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    n_correct: Mapped[int | None] = mapped_column(Integer, nullable=True)
    bank_built: Mapped[str | None] = mapped_column(String, nullable=True)        # which bank build was served


class QuizResponse(Base):
    __tablename__ = "quiz_responses"
    __table_args__ = (UniqueConstraint("attempt_id", "item_id", name="uq_quiz_responses_attempt_item"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    attempt_id: Mapped[str] = mapped_column(String, ForeignKey("quiz_attempts.id", ondelete="CASCADE"),
                                            nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id", ondelete="CASCADE"),
                                         nullable=False, index=True)
    item_id: Mapped[str] = mapped_column(String, nullable=False)
    operation: Mapped[str] = mapped_column(String, nullable=False)
    unit: Mapped[str] = mapped_column(String, nullable=False)
    option_id: Mapped[str] = mapped_column(String, nullable=False)
    correct: Mapped[bool] = mapped_column(Boolean, nullable=False)
    misconception: Mapped[str | None] = mapped_column(String, nullable=True)     # what the pick shows
    time_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    changes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)    # answer changed before submit
    answered_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
