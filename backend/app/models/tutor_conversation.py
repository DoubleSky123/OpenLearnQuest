import uuid
from datetime import datetime
from sqlalchemy import String, Integer, DateTime, ForeignKey, JSON, Boolean, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base


class TutorConversation(Base):
    """
    One tutoring conversation per (session, question) — the episodic-memory unit.

    Layer mapping (see tutor memory PRD):
      - summary / key_struggles / resolved  -> episodic memory (written by the
        summariser after the question attempt is recorded)
      - compact_summary / compacted_through_id -> working-memory view state
        (mid-conversation compaction; storage below stays verbatim)
    """
    __tablename__ = "tutor_conversations"
    __table_args__ = (
        UniqueConstraint("session_id", "question_title", name="uq_tutor_conv_session_question"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False, index=True)
    # SET NULL: memory belongs to the USER — it must survive session-row cleanup
    # (and avoids delete-ordering FK violations when a user cascade-deletes)
    session_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("game_sessions.id", ondelete="SET NULL"), nullable=True
    )
    operation: Mapped[str] = mapped_column(String, nullable=False)   # e.g. 'insertAtHead' — key into the concept graph
    question_title: Mapped[str] = mapped_column(String, nullable=False)  # matches q.title (same convention as mistakes.title)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    message_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # episodic layer — "" means "summarised, nothing worth remembering" (won't be retried)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    key_struggles: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # {"concepts": [...], "misconception": "..."}
    resolved: Mapped[bool | None] = mapped_column(Boolean, nullable=True)    # backfilled from the question attempt, never LLM-guessed

    # working-memory view state
    compact_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    compacted_through_id: Mapped[str | None] = mapped_column(String, nullable=True)

    user: Mapped["User"] = relationship("User", back_populates="tutor_conversations")
    messages: Mapped[list["TutorMessage"]] = relationship(
        "TutorMessage", back_populates="conversation",
        cascade="all, delete-orphan", order_by="TutorMessage.created_at",
    )


class TutorMessage(Base):
    """Verbatim transcript line — append-only, never updated (audit source of truth)."""
    __tablename__ = "tutor_messages"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    conversation_id: Mapped[str] = mapped_column(
        String, ForeignKey("tutor_conversations.id"), nullable=False, index=True
    )
    role: Mapped[str] = mapped_column(String, nullable=False)  # 'user' | 'assistant'
    # clean text only (what the student typed / what the tutor said) — prompt
    # wrappers (context blocks, refreshes) are assembled at send time, never stored
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    conversation: Mapped["TutorConversation"] = relationship("TutorConversation", back_populates="messages")
