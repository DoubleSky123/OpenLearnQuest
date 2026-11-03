"""
The teachable classmate (services/npc_agent.py, docs/designs/misconception-*.md).

npc_cases   one "help Quinn" case: the operation, the misconceptions Quinn holds
            (code state — never a model's opinion), Quinn's current program, the
            explanation choices offered and the student's tests.
npc_events  everything that happened in a case, in order: tests run, explanations
            given (choice or free text) and how execution judged them, coach hints,
            and Quinn's lines with their guard / fallback telemetry.
"""
import uuid
from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class NpcCase(Base):
    __tablename__ = "npc_cases"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    operation: Mapped[str] = mapped_column(String, nullable=False)
    held_initial: Mapped[list] = mapped_column(JSON, nullable=False, default=list)   # misconception ids at the start
    held: Mapped[list] = mapped_column(JSON, nullable=False, default=list)           # still held
    program: Mapped[list] = mapped_column(JSON, nullable=False, default=list)        # Quinn's code now (symbolic lines)
    changed: Mapped[list] = mapped_column(JSON, nullable=False, default=list)        # lines changed by the last fix
    choices: Mapped[list] = mapped_column(JSON, nullable=False, default=list)        # [{"id", "mid"}] as offered
    tried: Mapped[list] = mapped_column(JSON, nullable=False, default=list)          # choice ids that changed nothing
    tests: Mapped[list] = mapped_column(JSON, nullable=False, default=list)          # the student's boards, in order
    coach: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)          # hints used per situation
    policy: Mapped[str] = mapped_column(String, nullable=False, default="random")    # how `held` was chosen
    status: Mapped[str] = mapped_column(String, nullable=False, default="open")      # open | solved | abandoned
    n_wrong: Mapped[int] = mapped_column(Integer, nullable=False, default=0)         # explanations that changed nothing
    arm: Mapped[str | None] = mapped_column(String, nullable=True)                   # research group, later
    npc_version: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    solved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class NpcEvent(Base):
    __tablename__ = "npc_events"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    case_id: Mapped[str] = mapped_column(String, ForeignKey("npc_cases.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String, nullable=False)          # start | test | explain | coach
    payload: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
