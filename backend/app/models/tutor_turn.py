import uuid
from datetime import datetime
from sqlalchemy import String, Integer, DateTime, ForeignKey, JSON, Boolean, Text
from sqlalchemy.orm import Mapped, mapped_column
from .base import Base


class TutorTurn(Base):
    """
    One row per tutor request — telemetry, never chat text.

    The transcript lives in tutor_messages; this table holds what can leave the
    database for research: derived labels, board/question state (game state, not
    something the student typed), usage and timing. Written at the start of the
    turn (status='started') and finished in a `finally`, so rate-limited, failed
    and abandoned turns are counted too.
    """
    __tablename__ = "tutor_turns"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False, index=True)
    conversation_id: Mapped[str] = mapped_column(
        String, ForeignKey("tutor_conversations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    message_id: Mapped[str | None] = mapped_column(String, nullable=True)   # the stored assistant reply, if any
    session_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("game_sessions.id", ondelete="SET NULL"), nullable=True, index=True
    )
    question_id: Mapped[str | None] = mapped_column(String, nullable=True)  # joins question_attempts on (session_id, question_id)

    # started | ok | partial | error | rate_limited | cancelled
    status: Mapped[str] = mapped_column(String, nullable=False, default="started")
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    phase: Mapped[str | None] = mapped_column(String, nullable=True)
    final_hint: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)  # as honoured server-side
    final_hint_step: Mapped[dict | None] = mapped_column(JSON, nullable=True)        # {stepNo, answer} shown on the card
    proactive: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # question + board state at request time
    question_type: Mapped[str | None] = mapped_column(String, nullable=True)
    operation: Mapped[str | None] = mapped_column(String, nullable=True)
    your_answer: Mapped[list | None] = mapped_column(JSON, nullable=True)
    correct_answer: Mapped[list | None] = mapped_column(JSON, nullable=True)
    board_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    board_phase: Mapped[str | None] = mapped_column(String, nullable=True)
    diagnosis: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    error_count_claimed: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # answer guard (leak_guard.py) — off until it ships
    guard_mode: Mapped[str] = mapped_column(String, default="off", nullable=False)  # off | shadow | block
    guard_rules_draft: Mapped[list | None] = mapped_column(JSON, nullable=True)
    guard_rules_regen: Mapped[list | None] = mapped_column(JSON, nullable=True)
    regenerated: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    fallback_used: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # which tutor produced this turn
    tutor_version: Mapped[str | None] = mapped_column(String, nullable=True)
    arm: Mapped[str | None] = mapped_column(String, nullable=True)
    model: Mapped[str | None] = mapped_column(String, nullable=True)

    input_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    output_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    ttft_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)   # first model token
    ttfv_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)   # first text the student saw
    total_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    tool_calls: Mapped[list | None] = mapped_column(JSON, nullable=True)  # [{name, concept}] — never the model's `reason`

    # derived in real time by the guard; judge_rung is backfilled by the batch judge
    proposal_in_message: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    verdict_given: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    verdict_on_proposal: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    proposal_correct: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    judge_rung: Mapped[int | None] = mapped_column(Integer, nullable=True)
