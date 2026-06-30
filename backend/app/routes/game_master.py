"""
Game Master API — AI-driven adaptive question generation.

POST /api/gm/session/start    — start session, get first question
POST /api/gm/session/next     — record result, get next question
POST /api/gm/session/hint     — get inline hint from Hint Agent
GET  /api/gm/mastery          — current user's mastery profile
POST /api/gm/test-generation  — Sprint-1 quality test
GET  /api/gm/operations       — list all supported operations
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import get_current_user
from ..models.user import User
from ..services.claude_service import run_generation_test, OP_META
from ..services import game_master as gm

router = APIRouter(prefix="/api/gm", tags=["game_master"])


# ── Schemas ────────────────────────────────────────────────────────────────────

class StartSessionRequest(BaseModel):
    module_id: str                  # 'singly' | 'doubly'
    mode: str                       # 'stress-free' | 'competitive'
    emotion: str = "engaged"
    operation: str | None = None    # None = AI picks; set = user chose from skill tree


class RecordResultRequest(BaseModel):
    session_id: str
    operation: str
    question_id: str
    question_number: int
    passed: bool
    error_count: int
    time_ms: int
    intra_difficulty: int | None = None
    scaffold_level: int | None = None
    emotion: str | None = None


class NextQuestionRequest(BaseModel):
    session_id: str
    operation: str
    question_id: str
    question_number: int
    passed: bool
    error_count: int
    time_ms: int
    emotion: str = "engaged"
    skip_record: bool = False
    planned_questions: int = 3
    pinned_operation: str | None = None
    intra_difficulty: int | None = None
    scaffold_level: int | None = None
    question_type: str | None = None


class PrefetchRequest(BaseModel):
    session_id: str
    last_operation: str | None = None
    emotion: str = "engaged"
    pinned_operation: str | None = None


class LevelUpRequest(BaseModel):
    session_id: str
    operation: str
    emotion: str = "engaged"


class HintRequest(BaseModel):
    operation: str
    pseudocode: list[str]
    correct_answer: list[str] = []   # correct steps in order (as text)
    wrong_assembly: list[str]
    distractors: list[str] = []      # distractor step texts
    error_count: int
    emotion: str = "engaged"


class TestRequest(BaseModel):
    operation: str
    n: int = 10
    emotion: str = "engaged"


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/session/start")
def start_session(
    body: StartSessionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Game Master starts a new learning session.
    Selects first operation based on mastery profile + emotion,
    generates first question via Question Agent.
    """
    try:
        return gm.start_session(
            db=db,
            user_id=current_user.id,
            module_id=body.module_id,
            mode=body.mode,
            emotion=body.emotion,
            operation=body.operation,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.post("/session/record")
def record_result(
    body: RecordResultRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Save the current question's result immediately when the student answers correctly.
    Frontend calls this before showing the success overlay so progress is never lost.
    Returns updated concept_mastery for immediate UI refresh.
    """
    _assert_session_owner(db, body.session_id, current_user.id)
    return gm.record_result(
        db=db,
        user_id=current_user.id,
        module_id=_infer_module(db, body.session_id),
        session_id=body.session_id,
        operation=body.operation,
        passed=body.passed,
        error_count=body.error_count,
        time_ms=body.time_ms,
        question_id=body.question_id,
        question_number=body.question_number,
        intra_difficulty=body.intra_difficulty,
        scaffold_level=body.scaffold_level,
        emotion=body.emotion,
    )


@router.post("/session/next")
def next_question(
    body: NextQuestionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Record result of the current question.
    Game Master receives Emotion Agent output, updates mastery,
    selects next operation, generates next question.
    """
    _assert_session_owner(db, body.session_id, current_user.id)
    try:
        return gm.next_question(
            db=db,
            user_id=current_user.id,
            module_id=_infer_module(db, body.session_id),
            session_id=body.session_id,
            operation=body.operation,
            passed=body.passed,
            error_count=body.error_count,
            time_ms=body.time_ms,
            question_id=body.question_id,
            question_number=body.question_number,
            emotion=body.emotion,
            skip_record=body.skip_record,
            planned_questions=body.planned_questions,
            pinned_operation=body.pinned_operation,
            intra_difficulty=body.intra_difficulty,
            scaffold_level=body.scaffold_level,
            question_type=body.question_type,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.post("/session/prefetch")
def prefetch_next(
    body: PrefetchRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Pre-generate the next AI question while student works on current one.
    Frontend calls this immediately after a question loads so 'Next' is instant.
    """
    _assert_session_owner(db, body.session_id, current_user.id)
    try:
        return gm.prefetch_question(
            db=db,
            user_id=current_user.id,
            module_id=_infer_module(db, body.session_id),
            last_op=body.last_operation,
            emotion=body.emotion,
            pinned_operation=body.pinned_operation,
            session_id=body.session_id,
        )
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.post("/session/level-up")
def level_up(
    body: LevelUpRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Student opts into the highest unlocked question type for an operation.
    Sets the active level to the earned ceiling and returns a fresh question
    of the new type (replaces the current one).
    """
    _assert_session_owner(db, body.session_id, current_user.id)
    try:
        return gm.level_up(
            db=db,
            user_id=current_user.id,
            module_id=_infer_module(db, body.session_id),
            session_id=body.session_id,
            operation=body.operation,
            emotion=body.emotion,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.post("/session/hint")
def get_hint(
    body: HintRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Hint Agent: generates an inline contextual hint when student is stuck.
    Called after >= 2 errors on the same question.
    """
    return gm.get_hint(
        operation=body.operation,
        pseudocode=body.pseudocode,
        correct_answer=body.correct_answer,
        wrong_assembly=body.wrong_assembly,
        distractors=body.distractors,
        error_count=body.error_count,
        emotion=body.emotion,
    )


@router.get("/mastery")
def get_mastery(
    module_id: str = "singly",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return current user's mastery profile for the given module."""
    mastery_map = gm.get_mastery_map(db, current_user.id, module_id)
    return gm.mastery_summary(mastery_map, module_id)


@router.post("/test-generation")
def test_generation(
    body: TestRequest,
    current_user: User = Depends(get_current_user),
):
    """Sprint-1 quality test: generate N questions, report pass rate."""
    if body.operation not in OP_META:
        raise HTTPException(status_code=400, detail=f"Unknown operation: {body.operation}")
    if not 1 <= body.n <= 20:
        raise HTTPException(status_code=400, detail="n must be 1–20")
    return run_generation_test(body.operation, body.n, body.emotion)


@router.get("/operations")
def list_operations(current_user: User = Depends(get_current_user)):
    return [{"operation": op, **meta} for op, meta in OP_META.items()]


# ── Helper ─────────────────────────────────────────────────────────────────────

def _infer_module(db: Session, session_id: str) -> str:
    from ..models.game_session import GameSession
    sess = db.query(GameSession).filter(GameSession.id == session_id).first()
    return sess.module_id if sess else "singly"


def _assert_session_owner(db: Session, session_id: str, user_id: str) -> None:
    from ..models.game_session import GameSession
    sess = db.query(GameSession).filter(GameSession.id == session_id).first()
    if not sess or sess.user_id != user_id:
        raise HTTPException(status_code=403, detail="Session not found or access denied")
