from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, Field

# A board line, as a student can see or build it (template lines are under 120
# characters, a question has at most 8 steps plus distractors).
BoardLine = Annotated[str, Field(max_length=400)]


class XPUpdate(BaseModel):
    amount: int


class MistakeCreate(BaseModel):
    # size caps: these are stored, and an ordering assembly is executed by the
    # misconception diagnosis — an unbounded one could tie up a worker
    question_id: str = Field(max_length=200)
    source: str = Field(max_length=40)
    title: str = Field(max_length=200)
    your_answer: list[BoardLine] = Field(max_length=20)
    correct_answer: list[BoardLine] = Field(max_length=20)
    explanation: str = Field(max_length=2000)
    # the wrong pick itself (fill_blank / find_bug): 0-based line + the option text.
    # Misconception diagnosis tags it server-side from the served item; ordering
    # uses your_answer (the assembled lines). Not stored on the mistake row.
    pick_line: int | None = Field(default=None, ge=0, le=50)
    pick_option: str | None = Field(default=None, max_length=400)


class MistakeOut(BaseModel):
    id: str
    question_id: str
    source: str
    title: str
    your_answer: list[str]
    correct_answer: list[str]
    explanation: str
    created_at: datetime

    model_config = {"from_attributes": True}


class SessionCreate(BaseModel):
    module_id: str
    mode: str


class SessionOut(BaseModel):
    id: str
    module_id: str
    mode: str
    started_at: datetime
    completed_at: datetime | None

    model_config = {"from_attributes": True}


class AttemptCreate(BaseModel):
    question_id: str
    difficulty: int
    time_spent_ms: int
    error_count: int
    xp_gained: int
    passed: bool
    lives_after: int | None = None
