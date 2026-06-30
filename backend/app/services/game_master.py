"""
Game Master — orchestrates the multi-agent learning loop.

Agent ecosystem:
  ┌─────────────────────────────────────────────────────────┐
  │                    Game Master                          │
  │                                                         │
  │  ┌──────────────┐  emotion  ┌──────────────────────┐   │
  │  │ Emotion Agent│ ────────► │ Operation Selector   │   │
  │  │ (behavioral  │           │ (mastery + emotion)  │   │
  │  │  + chat)     │           └──────────┬───────────┘   │
  │  └──────────────┘                      │ operation      │
  │                                        ▼                │
  │                             ┌──────────────────────┐   │
  │                             │ Question Agent       │   │
  │                             │ (claude_service.py   │   │
  │                             │  via Claude API)     │   │
  │                             └──────────┬───────────┘   │
  │                                        │ question       │
  │                                        ▼                │
  │                             ┌──────────────────────┐   │
  │                             │ Hint Agent           │   │
  │                             │ (on error_count ≥ 2) │   │
  │                             └──────────────────────┘   │
  └─────────────────────────────────────────────────────────┘

The Game Master does NOT implement game UI logic — that lives in the frontend.
It only decides WHAT to send: which question, and (on demand) which hint.
"""

import logging
import uuid
from datetime import datetime

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from ..models.mastery import Mastery
from ..models.concept_mastery import ConceptMastery
from ..models.game_session import GameSession
from ..models.question_attempt import QuestionAttempt
from .claude_service import generate_question, OP_META
from .static_questions import generate_static_question, CONCEPT_HINTS
from .error_analyzer import analyze_error
from .concept_graph import concepts_for_op, op_prereqs_met, weakest_concept_score, CONCEPTS

# ── Operation difficulty tiers ─────────────────────────────────────────────────

LEVEL_OPS = {
    1: ["insertAtHead", "insertAtTail", "removeAtHead", "removeAtTail"],
    2: ["insertIntoEmpty", "deleteEntireList", "insertAtPosition", "removeAtPosition"],
    3: ["reverseList", "mergeSortedLists", "detectCycle", "sortList"],
}
ALL_OPS = [op for ops in LEVEL_OPS.values() for op in ops]

MAX_QUESTIONS_PER_SESSION = 20


# ── Mastery helpers ────────────────────────────────────────────────────────────

def get_mastery_map(db: Session, user_id: str, module_id: str) -> dict[str, dict]:
    """Return {operation: {attempts, passes, consecutive_passes, last_seen}}."""
    records = db.query(Mastery).filter(
        Mastery.user_id == user_id,
        Mastery.module_id == module_id,
    ).all()
    return {
        r.operation: {
            "attempts":          r.attempts,
            "passes":            r.passes,
            "consecutive_passes":r.consecutive_passes,
            "perfect_pass":      r.perfect_pass,
            "type_unlocked":     r.type_unlocked or 1,
            "active_type_level": r.active_type_level or 1,
            "last_seen":         r.last_seen,
        }
        for r in records
    }


def update_mastery(
    db: Session, user_id: str, module_id: str, operation: str, passed: bool, error_count: int = 0
) -> None:
    # ── Operation-level mastery (existing) ────────────────────────────────
    record = db.query(Mastery).filter(
        Mastery.user_id  == user_id,
        Mastery.module_id == module_id,
        Mastery.operation == operation,
    ).first()

    if not record:
        record = Mastery(
            id=str(uuid.uuid4()),
            user_id=user_id,
            module_id=module_id,
            operation=operation,
            attempts=0,
            passes=0,
            consecutive_passes=0,
            type_unlocked=1,
            active_type_level=1,
        )
        db.add(record)

    record.attempts += 1
    if passed:
        record.passes += 1
        if error_count == 0:
            record.consecutive_passes += 1
            record.perfect_pass = True
            # Unlock next type: 1=fill_blank, 2=find_bug, 3=ordering
            if record.consecutive_passes >= 2:
                record.type_unlocked = max(record.type_unlocked, 3)
            elif record.consecutive_passes >= 1:
                record.type_unlocked = max(record.type_unlocked, 2)
        else:
            record.consecutive_passes = 0
    record.last_seen = datetime.utcnow()

    # ── Concept-level mastery (new) ────────────────────────────────────────
    # Primary concept (first in list) gets full update weight;
    # secondary concepts get half weight since they're only partially exercised.
    for idx, concept in enumerate(concepts_for_op(operation)):
        weight = 1.0 if idx == 0 else 0.5
        cm = db.query(ConceptMastery).filter(
            ConceptMastery.user_id == user_id,
            ConceptMastery.concept == concept,
        ).first()
        if not cm:
            cm = ConceptMastery(
                id=str(uuid.uuid4()),
                user_id=user_id,
                concept=concept,
                mastery=0.0,
                attempts=0,
            )
            db.add(cm)
        cm.attempts += 1
        if passed:
            cm.mastery = min(1.0, cm.mastery + (1.0 - cm.mastery) * 0.3 * weight)
        else:
            cm.mastery = max(0.0, cm.mastery - cm.mastery * 0.15 * weight)
        cm.last_updated = datetime.utcnow()

    db.commit()


def mastery_summary(mastery_map: dict, module_id: str) -> dict:
    ops = []
    for op in ALL_OPS:
        m     = mastery_map.get(op, {})
        rate  = m.get("passes", 0) / max(m.get("attempts", 0), 1)
        ops.append({
            "operation": op,
            "title":     OP_META[op]["title"],
            "attempts":  m.get("attempts", 0),
            "passes":    m.get("passes", 0),
            "pass_rate": round(rate, 2),
            "mastered":  _is_mastered(m),
            "level":     next(lv for lv, ops_ in LEVEL_OPS.items() if op in ops_),
        })
    return {
        "operations":    ops,
        "total_mastered": sum(1 for o in ops if o["mastered"]),
        "total_ops":     len(ops),
    }


def _is_mastered(m: dict) -> bool:
    """An operation is mastered once the student answers it correctly with zero errors."""
    return m.get("perfect_pass", False)


# ── Operation selector (Emotion Agent → Game Master decision) ──────────────────

def get_concept_mastery_map(db: Session, user_id: str) -> dict[str, float]:
    """Return {concept: mastery_score} for the user."""
    records = db.query(ConceptMastery).filter(ConceptMastery.user_id == user_id).all()
    return {r.concept: r.mastery for r in records}


def select_next_operation(
    mastery_map: dict,
    emotion: str,
    last_op: str | None = None,
    concept_mastery: dict[str, float] | None = None,
) -> str:
    """
    Select the next operation using concept mastery scoring.

    Scoring formula per operation:
      - learning_gain: how weak are the concepts this op exercises (higher = more to learn)
      - prereq_penalty: ops with unmet concept prerequisites are deprioritised
      - emotion_modifier: adjusts difficulty preference based on student state

    Falls back to pass-rate scoring if concept_mastery is not available.
    """
    unmastered = [op for op in ALL_OPS if not _is_mastered(mastery_map.get(op, {}))]

    if not unmastered:
        sorted_ops = sorted(
            ALL_OPS,
            key=lambda op: mastery_map.get(op, {}).get("last_seen") or datetime.min,
        )
        return sorted_ops[0]

    candidates = [op for op in unmastered if op != last_op] or unmastered

    # ── Concept-aware scoring ──────────────────────────────────────────────
    if concept_mastery is not None:
        def concept_score(op: str) -> float:
            # Core signal: weakest concept this op exercises (0=never seen, 1=mastered)
            weakness = 1.0 - weakest_concept_score(op, concept_mastery)

            # Prerequisite gate: soft penalty if prereqs not met (avoid frustration)
            prereq_ok = op_prereqs_met(op, concept_mastery)
            prereq_penalty = 0.0 if prereq_ok else 0.4

            # Emotion modifier
            level = next(lv for lv, ops in LEVEL_OPS.items() if op in ops)
            if emotion in ("frustrated", "confused"):
                difficulty_penalty = (level - 1) * 0.2   # prefer level 1
            elif emotion == "bored":
                difficulty_penalty = (3 - level) * 0.2   # prefer level 3
            else:
                difficulty_penalty = 0.0

            # Higher score = better candidate (more to learn, prereqs met, right difficulty)
            return weakness - prereq_penalty - difficulty_penalty

        return max(candidates, key=concept_score)

    # ── Fallback: original pass-rate scoring ──────────────────────────────
    def pass_rate(op: str) -> float:
        m = mastery_map.get(op, {})
        return m.get("passes", 0) / max(m.get("attempts", 0), 1)

    if emotion in ("frustrated", "confused"):
        for level in [1, 2, 3]:
            pool = [op for op in candidates if op in LEVEL_OPS[level]]
            if pool:
                return min(pool, key=pass_rate)

    elif emotion == "bored":
        for level in [3, 2, 1]:
            pool = [op for op in candidates if op in LEVEL_OPS[level]]
            if pool:
                return min(pool, key=pass_rate)

    return min(candidates, key=pass_rate)


# ── Session start ──────────────────────────────────────────────────────────────

def start_session(
    db: Session,
    user_id: str,
    module_id: str,
    mode: str,                      # 'stress-free' | 'competitive'
    emotion: str = "engaged",
    operation: str | None = None,   # None = AI picks; set = user-chosen from skill tree
) -> dict:
    """
    Create a game session, select the first operation, generate the first question.
    Returns { session_id, question, mastery_summary }.
    """
    # Create session record
    session = GameSession(
        id=str(uuid.uuid4()),
        user_id=user_id,
        module_id=module_id,
        mode=mode,
        game_mode_detail=mode,
    )
    db.add(session)
    db.commit()

    mastery_map     = get_mastery_map(db, user_id, module_id)
    concept_mastery = get_concept_mastery_map(db, user_id)
    if not operation or operation not in ALL_OPS:
        operation = select_next_operation(mastery_map, emotion, concept_mastery=concept_mastery)
    intra_difficulty = compute_intra_difficulty(db, session.id, emotion)
    question        = _generate_with_fallback(operation, emotion, mastery_map, concept_mastery, intra_difficulty)

    op_m    = mastery_map.get(operation, {})
    ceiling = op_m.get("type_unlocked", 1)
    active  = min(op_m.get("active_type_level", ceiling), ceiling)
    return {
        "session_id":      session.id,
        "question":        question,
        "operation":       operation,
        "mastery_summary": mastery_summary(mastery_map, module_id),
        "concept_mastery": concept_mastery,
        "question_number": 1,
        "max_questions":   MAX_QUESTIONS_PER_SESSION,
        "type_unlocked":   ceiling,
        "active_type_level": active,
    }


# ── Next question (after student answers) ─────────────────────────────────────

def record_result(
    db: Session,
    user_id: str,
    module_id: str,
    session_id: str,
    operation: str,
    passed: bool,
    error_count: int,
    time_ms: int,
    question_id: str,
    question_number: int,
    intra_difficulty: int | None = None,
    scaffold_level: int | None = None,
    emotion: str | None = None,
) -> dict:
    """
    Save QuestionAttempt + update mastery immediately when the student answers.
    Called by the frontend as soon as the correct answer is detected, before
    the student clicks Next. Returns updated concept_mastery for UI refresh.
    """
    attempt = QuestionAttempt(
        id=str(uuid.uuid4()),
        session_id=session_id,
        question_id=question_id,
        difficulty=next(lv for lv, ops in LEVEL_OPS.items() if operation in ops),
        time_spent_ms=time_ms,
        error_count=error_count,
        xp_gained=_calc_xp(operation, error_count) if passed else 0,
        passed=passed,
        intra_difficulty=intra_difficulty,
        scaffold_level=scaffold_level,
        emotion=emotion,
    )
    db.add(attempt)
    db.commit()
    update_mastery(db, user_id, module_id, operation, passed, error_count)
    mastery_map = get_mastery_map(db, user_id, module_id)
    return {
        "concept_mastery":  get_concept_mastery_map(db, user_id),
        "mastery_summary":  mastery_summary(mastery_map, module_id),
    }


def level_up(
    db: Session, user_id: str, module_id: str, session_id: str,
    operation: str, emotion: str = "engaged",
) -> dict:
    """
    Student opts into the highest unlocked type for `operation`: set the active
    level to the earned ceiling and serve a fresh question of the new type.
    Replaces the current question (question_number is unchanged on the client).
    """
    record = db.query(Mastery).filter(
        Mastery.user_id == user_id,
        Mastery.module_id == module_id,
        Mastery.operation == operation,
    ).first()
    if record:
        record.active_type_level = record.type_unlocked
        db.commit()

    mastery_map      = get_mastery_map(db, user_id, module_id)
    concept_mastery  = get_concept_mastery_map(db, user_id)
    intra_difficulty = compute_intra_difficulty(db, session_id, emotion)
    question         = _generate_with_fallback(operation, emotion, mastery_map, concept_mastery, intra_difficulty)

    op_m    = mastery_map.get(operation, {})
    ceiling = op_m.get("type_unlocked", 1)
    active  = min(op_m.get("active_type_level", ceiling), ceiling)
    return {
        "question":          question,
        "operation":         operation,
        "type_unlocked":     ceiling,
        "active_type_level": active,
    }


# Question type ladder (competence axis). Used to detect when a just-answered
# question's operation has unlocked a higher type.
_TYPE_BY_LEVEL = {1: "fill_blank", 2: "find_bug", 3: "ordering"}
_TYPE_RANK     = {"fill_blank": 1, "find_bug": 2, "ordering": 3}


def next_question(
    db: Session,
    user_id: str,
    module_id: str,
    session_id: str,
    operation: str,
    passed: bool,
    error_count: int,
    time_ms: int,
    question_id: str,
    question_number: int,
    emotion: str = "engaged",
    skip_record: bool = False,
    planned_questions: int = 3,
    pinned_operation: str | None = None,
    intra_difficulty: int | None = None,
    scaffold_level: int | None = None,
    question_type: str | None = None,   # type of the question just answered (for unlock detection)
) -> dict:
    """
    Decide if session is complete, generate next question.
    When skip_record=True, the attempt was already saved via record_result()
    so we skip recording and just select the next operation.

    Returns {question, mastery_summary, session_complete, question_number}.
    """
    if not skip_record:
        attempt = QuestionAttempt(
            id=str(uuid.uuid4()),
            session_id=session_id,
            question_id=question_id,
            difficulty=next(lv for lv, ops in LEVEL_OPS.items() if operation in ops),
            time_spent_ms=time_ms,
            error_count=error_count,
            xp_gained=_calc_xp(operation, error_count) if passed else 0,
            passed=passed,
            intra_difficulty=intra_difficulty,
            scaffold_level=scaffold_level,
            emotion=emotion,
        )
        db.add(attempt)
        db.commit()
        update_mastery(db, user_id, module_id, operation, passed, error_count)
    mastery_map = get_mastery_map(db, user_id, module_id)

    # Session complete?
    all_mastered = all(_is_mastered(mastery_map.get(op, {})) for op in ALL_OPS)
    max_reached  = question_number >= min(planned_questions, 5)
    if all_mastered or max_reached:
        sess = db.query(GameSession).filter(GameSession.id == session_id).first()
        if sess:
            sess.completed_at = datetime.utcnow()
            db.commit()
        return {
            "session_complete": True,
            "mastery_summary":  mastery_summary(mastery_map, module_id),
            "concept_mastery":  get_concept_mastery_map(db, user_id),
            "question":         None,
            "question_number":  question_number,
        }

    # Select next operation (pinned or adaptive). The TYPE is decided inside
    # _generate_with_fallback by the operation's active_type_level (student-chosen).
    concept_mastery  = get_concept_mastery_map(db, user_id)
    if pinned_operation and pinned_operation in ALL_OPS:
        next_op = pinned_operation
    else:
        next_op = select_next_operation(mastery_map, emotion, last_op=operation, concept_mastery=concept_mastery)
    intra_difficulty = compute_intra_difficulty(db, session_id, emotion)
    question         = _generate_with_fallback(next_op, emotion, mastery_map, concept_mastery, intra_difficulty)

    # Surface the level-up state for the upcoming operation so the client can offer
    # the choice (active < ceiling ⇒ a higher type is unlocked but not yet entered).
    next_m   = mastery_map.get(next_op, {})
    ceiling  = next_m.get("type_unlocked", 1)
    active   = min(next_m.get("active_type_level", ceiling), ceiling)
    return {
        "session_complete":   False,
        "question":           question,
        "operation":          next_op,
        "mastery_summary":    mastery_summary(mastery_map, module_id),
        "concept_mastery":    concept_mastery,
        "question_number":    question_number + 1,
        "planned_questions":  min(planned_questions, 5),
        "type_unlocked":      ceiling,
        "active_type_level":  active,
    }


# ── Hint request (deterministic error analysis) ───────────────────────────────

def get_hint(
    operation: str,
    pseudocode: list[str],
    correct_answer: list[str],
    wrong_assembly: list[str],
    distractors: list[str],
    error_count: int,
    emotion: str = "engaged",
) -> dict:
    """
    Instant concept-targeted hint via deterministic error diagnosis.
    No LLM call — returns immediately with structured diagnosis.

    Returns {hint, diagnosis} where:
      hint:      concept-specific guidance sentence for inline display
      diagnosis: structured error dict for Tutor context injection
    """
    diagnosis     = analyze_error(operation, wrong_assembly, correct_answer, distractors)
    error_type    = diagnosis.get("error_type")
    misplaced     = diagnosis.get("misplaced_step")
    pos           = diagnosis.get("first_wrong_pos")
    error_concept = diagnosis.get("error_concept")

    if error_type == "distractor_used" and misplaced:
        hint = (
            f'"{misplaced}" is a distractor — it doesn\'t belong in this operation. '
            f"Remove it and focus on the steps that actually change the list."
        )
    elif error_type == "wrong_order" and misplaced and pos is not None and pos < len(correct_answer):
        expected = correct_answer[pos]
        hint = (
            f'Step {pos + 1}: you placed "{misplaced}", '
            f'but "{expected}" should come here. '
            f'Ask yourself: can you do "{misplaced}" before "{expected}" has run?'
        )
    elif error_type == "missing_steps":
        hint = "You haven't placed all the steps yet — keep going."
    else:
        hint = CONCEPT_HINTS.get(error_concept, "Think about which pointer would be lost if you ran this step first.")

    return {"hint": hint, "diagnosis": diagnosis}


# ── Helpers ────────────────────────────────────────────────────────────────────

def prefetch_question(
    db: Session, user_id: str, module_id: str,
    last_op: str | None, emotion: str,
    pinned_operation: str | None = None,
    session_id: str | None = None,
) -> dict:
    """
    Pre-generate the next AI question in the background while the student
    works on the current one. Called by the frontend immediately after a
    question loads — result is cached client-side and shown instantly on
    'Next' click.

    Uses current mastery to predict the next operation (without recording
    the in-progress question result yet).
    """
    mastery_map     = get_mastery_map(db, user_id, module_id)
    concept_mastery = get_concept_mastery_map(db, user_id)
    if pinned_operation and pinned_operation in ALL_OPS:
        next_op = pinned_operation
    else:
        next_op = select_next_operation(mastery_map, emotion, last_op, concept_mastery=concept_mastery)
    intra_difficulty = compute_intra_difficulty(db, session_id, emotion) if session_id else None
    question        = _generate_with_fallback(next_op, emotion, mastery_map, concept_mastery, intra_difficulty)
    return {"operation": next_op, "question": question}


# ── State axis: ZPD within-type difficulty controller ───────────────────────────
_INTRA_WINDOW   = 4
_P_LOW, _P_HIGH = 0.15, 0.5   # target error-rate band (desirable difficulty ≈ 0.25–0.30)


def compute_intra_difficulty(db: Session, session_id: str, emotion: str = "engaged") -> int:
    """
    Within-type difficulty (1=easy, 2=medium, 3=hard) for the next question.

    Driven by the recent error rate in this session (ZPD / desirable difficulty):
    too many errors → ease off; too few → ramp up. Emotion only *modulates*:
    frustrated eases, bored ramps, confused/engaged stay neutral (confusion is
    handled by scaffolding, not by lowering difficulty).
    """
    rows = (
        db.query(QuestionAttempt.error_count)
          .filter(QuestionAttempt.session_id == session_id)
          .order_by(QuestionAttempt.completed_at.desc())
          .limit(_INTRA_WINDOW)
          .all()
    )
    if not rows:
        level = 2   # seed medium on the first question
    else:
        err_rate = sum(1 for (ec,) in rows if (ec or 0) > 0) / len(rows)
        if err_rate > _P_HIGH:
            level = 1
        elif err_rate < _P_LOW:
            level = 3
        else:
            level = 2

    if emotion == "frustrated":
        level = max(1, level - 1)
    elif emotion == "bored":
        level = min(3, level + 1)
    return level


def _generate_with_fallback(
    operation: str,
    emotion: str,
    mastery_map: dict,
    concept_mastery: dict[str, float] | None = None,
    intra_difficulty: int | None = None,
) -> dict:
    """
    Generate question with type determined by mastery level (competence axis) and
    within-type difficulty from intra_difficulty (state axis / ZPD controller).
    generate_question handles retries and static fallback internally.
    """
    op_m          = mastery_map.get(operation, {})
    type_unlocked = op_m.get("type_unlocked", 1)
    # The question TYPE follows the student's chosen active level (<= the earned ceiling),
    # not the ceiling itself — so unlocking a harder type does not force them into it.
    active_level  = min(op_m.get("active_type_level", type_unlocked), type_unlocked)
    try:
        q = generate_question(operation, emotion, active_level, intra_difficulty)
        if q.get("question_type") == "ordering" and q.get("pseudocode") and any(
            str(step).lower().startswith("step") or str(step).strip() == ""
            for step in q["pseudocode"]
        ):
            raise ValueError("AI returned placeholder pseudocode")
    except Exception as e:
        logger.warning("Question generation failed for '%s', using static fallback: %s", operation, e)
        consecutive_passes = op_m.get("consecutive_passes", 0)
        q = generate_static_question(
            operation, emotion, consecutive_passes, concept_mastery, intra_level=intra_difficulty,
        )
    # Tag the within-type difficulty used, so the frontend can echo it back for telemetry
    q["intra_difficulty"] = intra_difficulty
    return q


def _calc_xp(operation: str, error_count: int) -> int:
    level = next(lv for lv, ops in LEVEL_OPS.items() if operation in ops)
    base  = {1: 80, 2: 120, 3: 160}[level]
    return max(round(base * 0.3), base - error_count * 20)
