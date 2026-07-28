import uuid
from datetime import datetime
from sqlalchemy import String, Integer, DateTime, JSON
from sqlalchemy.orm import Mapped, mapped_column
from .base import Base


class QuestionPool(Base):
    """Pre-generated, validated AI questions (find_bug / ordering only).

    Rows are class-shared and never consumed: serving excludes only questions
    the requesting student has already attempted and increments times_served.
    payload["id"] equals this row's id so question_attempts.question_id links
    back for the per-student exclusion.
    """
    __tablename__ = "question_pool"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    operation: Mapped[str] = mapped_column(String, nullable=False, index=True)
    question_type: Mapped[str] = mapped_column(String, nullable=False)      # find_bug | ordering
    intra_difficulty: Mapped[int] = mapped_column(Integer, nullable=False)  # 1 | 2 | 3
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)             # full question dict
    # Dedup key over the pedagogical content (bug identity / distractor set),
    # NOT the whole payload — node values vary per build and must not defeat dedup.
    content_hash: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    times_served: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
