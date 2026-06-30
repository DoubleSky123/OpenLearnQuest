from datetime import datetime
from pydantic import BaseModel


class XPUpdate(BaseModel):
    amount: int


class MistakeCreate(BaseModel):
    question_id: str
    source: str
    title: str
    your_answer: list[str]
    correct_answer: list[str]
    explanation: str


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
