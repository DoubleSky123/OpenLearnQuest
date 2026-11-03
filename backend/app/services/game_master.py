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

import hashlib
import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from ..models.mastery import Mastery
from ..models.concept_mastery import ConceptMastery
from ..models.emotion_log import EmotionLog
from ..models.game_session import GameSession
from ..models.question_attempt import QuestionAttempt
from ..models.user import User
from ..config import settings
from .claude_service import generate_question, OP_META
from .static_questions import generate_static_question
from . import question_pool
from .error_analyzer import analyze_error
from .concept_graph import concepts_for_op, op_prereqs_met, weakest_concept_score, CONCEPTS
from . import curriculum
from . import misconception_model
from . import misconceptions as mc

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
    out = curriculum.MasteryMap({
        r.operation: {
            "attempts":          r.attempts,
            "passes":            r.passes,
            "consecutive_passes":r.consecutive_passes,
            "perfect_pass":      r.perfect_pass,
            "type_unlocked":     r.type_unlocked or 1,
            "active_type_level": r.active_type_level or 1,
            "best_perfect_type": r.best_perfect_type or 0,
            "last_seen":         r.last_seen,
        }
        for r in records
    })
    allow = settings.unlock_all_emails
    if allow:   # testing accounts only (config UNLOCK_ALL_UNITS_FOR)
        email = db.query(User.email).filter(User.id == user_id).scalar()
        out.unlock_all = email in allow
    return out


def played_level(mastery_map: dict, operation: str, question_type: str | None = None) -> int:
    """The question type (1-3) the student just answered, server-side: the level
    the server serves for this op (active level, or the curriculum's entry level
    for a first attempt), clamped by what the client reports — a client can
    claim LESS (a static fallback served an easier type) but never more."""
    m = mastery_map.get(operation)
    if m:   # a mastery row exists once the op has been attempted
        served = min(m.get("active_type_level", 1), m.get("type_unlocked", 1))
    else:
        served = curriculum.entry_level(operation, mastery_map)
    claimed = curriculum.TYPE_RANK.get(question_type or "", served)
    return max(1, min(served, claimed))


def level_state(mastery_map: dict, operation: str) -> tuple[int, int]:
    """(earned ceiling, active level) for the client — for a never-attempted op
    both are the curriculum's entry level, so a transfer probe shows as such."""
    m = mastery_map.get(operation)
    if not m:
        entry = curriculum.entry_level(operation, mastery_map)
        return entry, entry
    ceiling = m.get("type_unlocked", 1)
    return ceiling, min(m.get("active_type_level", ceiling), ceiling)


def update_mastery(
    db: Session, user_id: str, module_id: str, operation: str, passed: bool, error_count: int = 0,
    question_type: str | None = None, mastery_map: dict | None = None,
) -> None:
    """mastery_map: the caller's map, if it was built since the last mastery
    change (_record_attempt has one) — saves rebuilding it."""
    # ── Operation-level mastery ───────────────────────────────────────────
    if mastery_map is None:
        mastery_map = get_mastery_map(db, user_id, module_id)
    level = played_level(mastery_map, operation, question_type)
    record = db.query(Mastery).filter(
        Mastery.user_id  == user_id,
        Mastery.module_id == module_id,
        Mastery.operation == operation,
    ).first()

    if not record:
        # first attempt: a unit's other ops start at its transfer probe (curriculum)
        entry = curriculum.entry_level(operation, mastery_map)
        record = Mastery(
            id=str(uuid.uuid4()),
            user_id=user_id,
            module_id=module_id,
            operation=operation,
            attempts=0,
            passes=0,
            consecutive_passes=0,
            type_unlocked=entry,
            active_type_level=entry,
            best_perfect_type=0,
        )
        db.add(record)

    record.attempts += 1
    if passed:
        record.passes += 1
        if error_count == 0:
            record.consecutive_passes += 1
            record.perfect_pass = True
            record.best_perfect_type = max(record.best_perfect_type or 0, level)
            # Unlock next type: 1=fill_blank, 2=find_bug, 3=ordering. A clean pass
            # at level L always opens L+1 (a probe that starts at find_bug).
            record.type_unlocked = max(record.type_unlocked, min(3, level + 1))
            if record.consecutive_passes >= 2:
                record.type_unlocked = max(record.type_unlocked, 3)
            elif record.consecutive_passes >= 1:
                record.type_unlocked = max(record.type_unlocked, 2)
        else:
            record.consecutive_passes = 0
    # Step down only from a level the student SKIPPED (a transfer probe): they
    # never passed the level below cleanly and are struggling here. Earned
    # levels are never taken away — the student-controlled ladder stands.
    struggling = (not passed) or error_count >= 2
    if level > 1 and struggling and (record.best_perfect_type or 0) < level - 1:
        record.active_type_level = level - 1
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
    units = curriculum.summary(mastery_map, {op: OP_META[op]["title"] for op in ALL_OPS})
    return {
        "operations":     ops,
        "total_mastered": sum(1 for o in ops if o["mastered"]),
        "total_ops":      len(ops),
        "units":          units,
        "units_mastered": sum(1 for u in units if u["mastered"]),
        "total_units":    len(units),
    }


def _is_mastered(m: dict) -> bool:
    """An operation is mastered by a zero-error ORDERING pass — the student
    assembled the whole procedure (see services/curriculum.py)."""
    return curriculum.op_mastered(m)


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
    Only operations in unlocked curriculum units are candidates.
    """
    available  = curriculum.available_ops(mastery_map)
    unmastered = [op for op in available if not _is_mastered(mastery_map.get(op, {}))]

    if not unmastered:
        sorted_ops = sorted(
            available,
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
    # Started from the unit path: the planner picks the first question too, so
    # a returning student continues the unit's rotation (or gets a due review)
    plan = plan_next(db, user_id, module_id, operation, mastery_map) if operation in ALL_OPS else None
    if plan:
        operation = plan.operation
    elif not operation or operation not in curriculum.available_ops(mastery_map):
        # nothing pinned, an unknown op, or an op of a locked unit
        operation = select_next_operation(mastery_map, emotion, concept_mastery=concept_mastery)
    intra_difficulty = compute_intra_difficulty(db, session.id, emotion)
    question        = _generate_with_fallback(operation, emotion, mastery_map, concept_mastery, intra_difficulty,
                                              db=db, user_id=user_id, plan=plan, session_id=session.id)

    ceiling, active = (3, 3) if plan and plan.purpose == "review" else level_state(mastery_map, operation)
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

def clamp_scaffold(scaffold_level: int | None, error_count: int) -> int | None:
    """Server-side integrity clamp for client-computed scaffold telemetry.

    Mirrors useScaffold.js: level = emotion baseline (max 2, frustrated) +
    one climb per error, ceiling 4. Anything above that cap cannot have been
    produced by the real orchestrator — reject it at the door so telemetry
    (and any future ablation arm) stays trustworthy.
    """
    if scaffold_level is None:
        return None
    cap = min(4, (error_count or 0) + 2)
    return max(0, min(int(scaffold_level), cap))


def _close_intervention_loop(
    db: Session, session_id: str, question_id: str, operation: str,
    passed: bool, error_count: int,
) -> None:
    """Closed-loop intervention telemetry: interventions logged since the last
    recorded attempt belong to this question — write the question's outcome
    back onto them so their effectiveness becomes measurable."""
    pending = (
        db.query(EmotionLog)
        .filter(
            EmotionLog.session_id == session_id,
            EmotionLog.action_taken.isnot(None),
            EmotionLog.action_taken != "none",
            EmotionLog.outcome.is_(None),
        )
        .all()
    )
    for log in pending:
        log.outcome = {
            "question_id": question_id,
            "operation": operation,
            "passed": passed,
            "error_count": error_count,
        }
    if pending:
        db.commit()


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
    variant: str | None = None,
    question_type: str | None = None,
    purpose: str | None = None,
) -> dict:
    """
    Save QuestionAttempt + update mastery immediately when the student answers.
    Called by the frontend as soon as the correct answer is detected, before
    the student clicks Next. Returns updated concept_mastery for UI refresh.
    """
    attempt = _record_attempt(db, user_id, module_id, session_id, operation, passed, error_count,
                              time_ms, question_id, intra_difficulty, scaffold_level, emotion,
                              variant, question_type, purpose)
    mastery_map = get_mastery_map(db, user_id, module_id)
    return {
        "concept_mastery":  get_concept_mastery_map(db, user_id),
        "mastery_summary":  mastery_summary(mastery_map, module_id),
        # for the post-question analysis card
        "xp_gained":          attempt.xp_gained,
        "concepts_exercised": concepts_for_op(operation),
        "peer":               _after_record("peer stats", lambda: _peer_stats(db, operation, attempt.id, time_ms), None),
        # "what your choice did" — only for students who get remediation
        "misconception_feedback": _after_record(
            "misconception feedback", lambda: misconception_model.feedback_for(db, user_id, question_id), [])
                                  if misconception_model.targeting(user_id) else [],
    }


def _after_record(what: str, fn, fallback):
    """Analysis-card extras computed after the attempt is committed: a failure here
    must not fail the request (the client would resend the result via /next)."""
    try:
        return fn()
    except Exception:   # noqa: BLE001
        logger.exception("%s failed after the attempt was recorded", what)
        return fallback


def _record_attempt(
    db: Session, user_id: str, module_id: str, session_id: str, operation: str,
    passed: bool, error_count: int, time_ms: int, question_id: str,
    intra_difficulty: int | None, scaffold_level: int | None, emotion: str | None,
    variant: str | None, question_type: str | None, purpose: str | None,
) -> QuestionAttempt:
    """One attempt row + its mastery update. A review (forgetting check on a
    MASTERED op, always ordering) is recorded but never applied to mastery; a
    client claiming 'review' for anything else is treated as practice. A
    'remediate' claim is accepted only if the server served this student a
    targeted item under that id; it counts as practice for mastery.
    Idempotent per (session, question): /session/next re-sends a result whose
    /session/record landed but whose reply was lost — recording it twice would
    apply mastery twice (one clean answer counting as two)."""
    existing = (db.query(QuestionAttempt)
                .filter(QuestionAttempt.session_id == session_id, QuestionAttempt.question_id == question_id)
                .first())
    if existing is not None:
        return existing
    mastery_map = get_mastery_map(db, user_id, module_id)
    item = misconception_model.served(db, user_id, question_id) if misconception_model.recording() else None
    target = None
    if purpose == "review" and curriculum.op_mastered(mastery_map.get(operation)):
        played = "ordering"
    else:
        if purpose == "remediate" and item is not None and item.purpose == "remediate" \
                and item.target_misconception:
            target = item.target_misconception
        else:
            purpose = purpose if purpose == "detour" else "practice"
        played = _TYPE_BY_LEVEL[played_level(mastery_map, operation, question_type)]
    attempt = QuestionAttempt(
        id=str(uuid.uuid4()),
        session_id=session_id,
        question_id=question_id,
        operation=operation,
        difficulty=next(lv for lv, ops in LEVEL_OPS.items() if operation in ops),
        time_spent_ms=time_ms,
        error_count=error_count,
        xp_gained=_calc_xp(operation, error_count) if passed else 0,
        passed=passed,
        intra_difficulty=intra_difficulty,
        scaffold_level=clamp_scaffold(scaffold_level, error_count),
        emotion=emotion,
        variant=variant,
        question_type=played,
        purpose=purpose,
        target_misconception=target,
    )
    db.add(attempt)
    db.commit()
    _close_intervention_loop(db, session_id, question_id, operation, passed, error_count)
    if operation not in curriculum.available_ops(mastery_map):
        # the server never serves a locked unit's op: a claim for one is recorded, not credited
        logger.warning("attempt on %s (locked unit) not applied to mastery for %s", operation, user_id)
    elif purpose != "review":
        update_mastery(db, user_id, module_id, operation, passed, error_count, played, mastery_map=mastery_map)
    misconception_model.record_outcome(db, user_id, question_id, passed=passed, error_count=error_count)
    return attempt


def _peer_stats(db: Session, operation: str, attempt_id: str, time_ms: int) -> dict | None:
    """'Beats N%' time percentile among passed attempts on the same operation.
    Returns None below a minimum sample (a percentile over 2 attempts is noise)."""
    times = [
        t for (t,) in db.query(QuestionAttempt.time_spent_ms)
        .filter(
            QuestionAttempt.operation == operation,
            QuestionAttempt.passed.is_(True),
            QuestionAttempt.id != attempt_id,
        )
        .all()
        if t is not None
    ]
    if len(times) < 3:
        return None
    slower = sum(1 for t in times if t > time_ms)
    return {"beats_pct": round(100 * slower / len(times)), "sample": len(times)}


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
    question         = _generate_with_fallback(operation, emotion, mastery_map, concept_mastery, intra_difficulty, db=db, user_id=user_id)

    ceiling, active = level_state(mastery_map, operation)
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
    variant: str | None = None,         # content-variant tag of the answered question
    purpose: str | None = None,         # practice | detour | review (echoed from the question)
    prefetched: bool = False,
) -> dict:
    """
    Decide if session is complete, generate next question.
    When skip_record=True, the attempt was already saved via record_result()
    so we skip recording and just select the next operation.
    When prefetched=True, the client is already showing a prefetched question:
    no question is generated (it would be thrown away, yet recorded as served,
    and could re-serve that very pool row under another plan).

    Returns {question, mastery_summary, session_complete, question_number}.
    """
    if not skip_record:
        _record_attempt(db, user_id, module_id, session_id, operation, passed, error_count,
                        time_ms, question_id, intra_difficulty, scaffold_level, emotion,
                        variant, question_type, purpose)
    mastery_map = get_mastery_map(db, user_id, module_id)

    # Session complete?
    all_mastered = curriculum.all_mastered(mastery_map)
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

    # Select next operation (pinned unit or adaptive). The TYPE is decided inside
    # _generate_with_fallback by the operation's active_type_level (student-chosen).
    concept_mastery  = get_concept_mastery_map(db, user_id)
    plan = plan_next(db, user_id, module_id, pinned_operation, mastery_map)
    next_op = plan.operation if plan else \
        select_next_operation(mastery_map, emotion, last_op=operation, concept_mastery=concept_mastery)
    question = None
    if not prefetched:
        intra_difficulty = compute_intra_difficulty(db, session_id, emotion)
        question = _generate_with_fallback(next_op, emotion, mastery_map, concept_mastery, intra_difficulty,
                                           db=db, user_id=user_id, plan=plan, session_id=session_id)

    # Surface the level-up state for the upcoming operation so the client can offer
    # the choice (active < ceiling ⇒ a higher type is unlocked but not yet entered).
    # a review is ordering on a mastered op — never offer a Level Up for it
    ceiling, active = (3, 3) if plan and plan.purpose == "review" else level_state(mastery_map, next_op)
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


# ── Helpers ────────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class Plan:
    """What to serve next in a unit session, and why."""
    operation: str
    purpose: str = "practice"      # practice | detour | review | remediate
    force_level: int | None = None  # review: always ordering
    target_misconception: str | None = None   # remediate: the item must show it
    # MISCONCEPTION_MODE shadow / ab control: the remediation that WOULD have run
    shadow: dict | None = field(default=None, compare=False, hash=False)


def _recent_attempts(db: Session, user_id: str, module_id: str, limit: int = 30) -> list[QuestionAttempt]:
    """This student's latest attempts in the module, newest first."""
    return (
        db.query(QuestionAttempt)
        .join(GameSession, QuestionAttempt.session_id == GameSession.id)
        .filter(GameSession.user_id == user_id, GameSession.module_id == module_id)
        .order_by(QuestionAttempt.completed_at.desc())
        .limit(limit)
        .all()
    )


def _last_attempt_times(db: Session, user_id: str, module_id: str) -> dict[str, datetime]:
    """When this student last answered each op (any purpose, reviews included)."""
    from sqlalchemy import func
    rows = (
        db.query(QuestionAttempt.operation, func.max(QuestionAttempt.completed_at))
        .join(GameSession, QuestionAttempt.session_id == GameSession.id)
        .filter(GameSession.user_id == user_id, GameSession.module_id == module_id)
        .group_by(QuestionAttempt.operation)
        .all()
    )
    return {op: t for op, t in rows if op}


def plan_next(db: Session, user_id: str, module_id: str, pinned_operation: str | None,
              mastery_map: dict) -> Plan | None:
    """Next question for a session started from the unit path (pinned to that
    op's UNIT). Deterministic in the attempt history, so the prefetch and the
    background /next pick the same thing. Priority:
      1. stuck  — STUCK_AFTER questions in a row on one op with mistakes
                  -> one question of a different op in the unit (detour)
      2. remediate — an ACTIVE misconception (misconception_model) that applies
                  to an op of this unit and can be targeted without a model call
                  -> one targeted question, preferring an op where the student has
                  not shown it yet (transfer); never twice in a row. Only when
                  this student gets remediation (MISCONCEPTION_MODE on / ab);
                  in shadow mode it is computed and logged on the item instead.
      3. review — REVIEW_EVERY unit questions since the last review, and a
                  mastered earlier unit exists -> ordering on one of its ops
      4. practice — curriculum.next_op_in_unit: blocked on the anchor, then
                  the least recently practised op in play (2 ops alternate,
                  3-4 ops rotate; a variant joins once its primary is mastered).
    Returns None for unpinned sessions (adaptive selection decides) and for a
    pin into a unit that is still locked — the unit path hides it, but the pin is
    a client value (adaptive selection only offers unlocked units)."""
    unit = curriculum.unit_of(pinned_operation) if pinned_operation in ALL_OPS else None
    if unit is None or not curriculum.unit_unlocked(curriculum.UNITS.index(unit), mastery_map):
        return None
    history = _recent_attempts(db, user_id, module_id)
    seen = _last_attempt_times(db, user_id, module_id)

    # 1. stuck on one op
    if history and history[0].operation in unit.ops and (history[0].purpose or "practice") != "review":
        stuck_op, streak = history[0].operation, 0
        for a in history:
            if a.operation != stuck_op or (a.purpose or "practice") == "review" or (a.error_count or 0) == 0:
                break
            streak += 1
        if streak >= curriculum.STUCK_AFTER and not curriculum.op_mastered(mastery_map.get(stuck_op)):
            detour = curriculum.detour_op(unit, mastery_map, stuck_op, seen)
            if detour:
                return Plan(detour, "detour")

    # 2. remediate an active misconception
    shadow = None
    if misconception_model.recording():
        rem = _remediation(db, user_id, unit, mastery_map, history, seen)
        if rem:
            if misconception_model.targeting(user_id):
                return Plan(rem[0], "remediate", target_misconception=rem[1])
            shadow = {"operation": rem[0], "misconception": rem[1]}

    # 3. review due
    since = 0
    for a in history:
        if (a.purpose or "practice") == "review" or a.operation not in unit.ops:
            break
        since += 1
    if since >= curriculum.REVIEW_EVERY:
        candidates = curriculum.review_candidates(mastery_map, unit)
        if candidates:
            # ops whose latest review had mistakes come back first; then the least recently seen
            last_review = {}
            for a in history:
                if (a.purpose or "") == "review" and a.operation not in last_review:
                    last_review[a.operation] = (a.error_count or 0) > 0 or not a.passed
            failed = [o for o in candidates if last_review.get(o)]
            # recency from the attempts themselves: a review never touches
            # mastery.last_seen, so keying on it re-picked the same op forever
            pick = failed[0] if failed else min(candidates, key=lambda o: seen.get(o) or datetime.min)
            return Plan(pick, "review", force_level=3, shadow=shadow)

    # 4. practice: the least recently practised op in play
    return Plan(curriculum.next_op_in_unit(unit, mastery_map, seen), shadow=shadow)


def _remediation(db: Session, user_id: str, unit, mastery_map: dict,
                 history: list[QuestionAttempt], seen: dict) -> tuple[str, str] | None:
    """(operation, misconception) for one remediation question, or None.
    Most likely active misconception first; an op of the unit that is in play
    (or mastered) where it applies and an authored item / tagged pool row can
    show it at the type this student plays there. Prefers an op where the
    student has NOT shown it (transfer), then the least recently practised."""
    if history and (history[0].purpose or "") == "remediate":
        return None
    in_play = set(curriculum.active_ops(unit, mastery_map))
    allowed = [o for o in unit.ops if o in in_play or curriculum.op_mastered(mastery_map.get(o))]
    for st in misconception_model.active(db, user_id):
        m = mc.CATALOG.get(st.misconception_id)
        if m is None:
            continue
        ops = [o for o in allowed if o in m.mutants and misconception_model.can_target(
            db, user_id, o, _TYPE_BY_LEVEL[played_level(mastery_map, o)], m.id)]
        if not ops:
            continue
        fresh = [o for o in ops if o not in (st.picked_ops or [])] or ops
        return min(fresh, key=lambda o: (seen.get(o) or datetime.min, unit.ops.index(o))), m.id
    return None


def _variant_offset(user_id: str | None) -> int:
    """Per-student start of the content rotation. Without it every student saw
    blank set A on attempt 1, B on attempt 2, ... — set D always came 4th, so
    'set D is easier' and 'students had practised 3 times' were indistinguishable.
    12 = lcm of 4 blank sets and 3 bug variants."""
    if not user_id:
        return 0
    return int(hashlib.sha256(user_id.encode("utf-8")).hexdigest()[:8], 16) % 12


def prefetch_question(
    db: Session, user_id: str, module_id: str,
    last_op: str | None, emotion: str,
    pinned_operation: str | None = None,
    session_id: str | None = None,
    current_question_id: str | None = None,
) -> dict:
    """
    Pre-generate the next AI question in the background while the student
    works on the current one. Called by the frontend immediately after a
    question loads — result is cached client-side and shown instantly on
    'Next' click.

    Uses current mastery to predict the next operation (without recording
    the in-progress question result yet). current_question_id keeps the pool
    from re-serving the question that is still on screen (it is unanswered,
    so the attempted-filter alone cannot exclude it).
    """
    mastery_map     = get_mastery_map(db, user_id, module_id)
    concept_mastery = get_concept_mastery_map(db, user_id)
    plan = plan_next(db, user_id, module_id, pinned_operation, mastery_map)
    next_op = plan.operation if plan else \
        select_next_operation(mastery_map, emotion, last_op, concept_mastery=concept_mastery)
    intra_difficulty = compute_intra_difficulty(db, session_id, emotion) if session_id else None
    question        = _generate_with_fallback(next_op, emotion, mastery_map, concept_mastery, intra_difficulty,
                                              db=db, user_id=user_id, exclude_qid=current_question_id,
                                              plan=plan, session_id=session_id)
    return {"operation": next_op, "question": question}


# ── State axis: ZPD within-type difficulty controller ───────────────────────────
# EMA + hysteresis controller — behavioural contract in tests/test_intra_controller.py.
# Old version (windowed rate + hard thresholds) oscillated: one question moved the
# estimate by 1/window and jumped a whole level (observed reversal rate 0.5/session).
_EMA_ALPHA = 0.25    # per-question learning rate of the error-rate estimate
_EMA_SEED  = 0.275   # start mid target band (desirable difficulty ≈ 25–30% errors)
_UP_T      = 0.22    # estimated error rate below this → candidate to ramp up
_DOWN_T    = 0.40    # above this → candidate to ease off (dead zone in between)
_CONFIRM   = 2       # consecutive out-of-band readings required to move a level


def compute_intra_difficulty(db: Session, session_id: str, emotion: str = "engaged") -> int:
    """
    Within-type difficulty (1=easy, 2=medium, 3=hard) for the next question —
    deterministic replay of the session history; see _intra_from_history.
    """
    rows = (
        db.query(QuestionAttempt.error_count)
          .filter(QuestionAttempt.session_id == session_id)
          .order_by(QuestionAttempt.completed_at)
          .all()
    )
    flags = [(ec or 0) > 0 for (ec,) in rows]
    return _intra_from_history(flags, emotion)


def _intra_from_history(error_flags: list[bool], emotion: str = "engaged") -> int:
    """
    Pure deterministic fold of the session's pass/fail history into a level.

    Two anti-oscillation mechanisms (target: desirable difficulty, ~25-30% errors):
      - EMA: each question nudges the error-rate estimate by _EMA_ALPHA instead
        of yanking it by 1/window — no cliff when old results "fall out".
      - Hysteresis: a dead zone between _UP_T and _DOWN_T plus _CONFIRM
        consecutive out-of-band readings before any move; levels change one
        step at a time. A single lucky/unlucky question can never flip a level.

    Emotion only scales the controller's GAIN (never the question type):
    frustrated eases sooner (lower threshold, single confirmation), bored ramps
    sooner; confused/engaged stay neutral — confusion is handled by
    scaffolding, not by easier work.
    """
    up_t, down_t = _UP_T, _DOWN_T
    up_confirm = down_confirm = _CONFIRM
    if emotion == "frustrated":
        down_t, down_confirm = 0.32, 1
    elif emotion == "bored":
        up_t, up_confirm = 0.30, 1

    level, ema = 2, _EMA_SEED
    up_streak = down_streak = 0
    for erred in error_flags:
        ema = _EMA_ALPHA * (1.0 if erred else 0.0) + (1 - _EMA_ALPHA) * ema
        if ema < up_t:
            up_streak, down_streak = up_streak + 1, 0
        elif ema > down_t:
            down_streak, up_streak = down_streak + 1, 0
        else:
            up_streak = down_streak = 0
        if up_streak >= up_confirm:
            level, up_streak = min(3, level + 1), 0
        elif down_streak >= down_confirm:
            level, down_streak = max(1, level - 1), 0
    return level


def _generate_with_fallback(
    operation: str,
    emotion: str,
    mastery_map: dict,
    concept_mastery: dict[str, float] | None = None,
    intra_difficulty: int | None = None,
    db: Session | None = None,
    user_id: str | None = None,
    exclude_qid: str | None = None,
    plan: "Plan | None" = None,
    session_id: str | None = None,
) -> dict:
    """The single exit every served question goes through. A remediation plan
    gets a targeted item (authored content first, then a tagged pool row — never
    a live model call); if none can show the misconception the student gets the
    normal practice question. Every served item is then recorded with its
    misconception tags (misconception_model.record_served; no-op when off)."""
    q = None
    target = plan.target_misconception if plan else None
    if target:
        q = _targeted_question(operation, emotion, mastery_map, intra_difficulty, target,
                               db, user_id, exclude_qid)
        if q is None:
            logger.info("remediation target unmet: %s on %s — serving practice", target, operation)
            plan = Plan(operation, "practice", shadow={"operation": operation, "misconception": target,
                                                       "unmet": True})
    if q is None:
        q = _generate_untracked(operation, emotion, mastery_map, concept_mastery, intra_difficulty,
                                db, user_id, exclude_qid, plan)
    if db is not None and user_id:
        remediate = q.get("purpose") == "remediate"
        misconception_model.record_served(
            db, user_id, q, session_id=session_id, purpose=q.get("purpose"),
            target=q.get("target_misconception") if remediate else None,
            shadow=plan.shadow if plan else None)
    return q


def _targeted_question(operation: str, emotion: str, mastery_map: dict, intra_difficulty: int | None,
                       target: str, db: Session | None, user_id: str | None,
                       exclude_qid: str | None) -> dict | None:
    """An item of the type this student plays on `operation` that shows `target`,
    or None. Payload carries purpose='remediate' and target_misconception."""
    op_m  = mastery_map.get(operation, {})
    level = played_level(mastery_map, operation)
    qtype = _TYPE_BY_LEVEL.get(level, "fill_blank")
    q = None
    if mc.authored_target_exists(operation, qtype, target):
        try:
            q = generate_question(operation, emotion, level, intra_difficulty,
                                  variant_seed=op_m.get("attempts", 0) + _variant_offset(user_id),
                                  target_misconception=target, static_only=True)
        except Exception as e:   # noqa: BLE001
            logger.warning("targeted static build failed for %s/%s: %s", operation, target, e)
            q = None
    if (q is None or q.get("target_misconception") != target) and db is not None \
            and qtype in question_pool.POOLED_TYPES:
        q = question_pool.serve(db, user_id, operation, qtype, intra_difficulty,
                                exclude_qid=exclude_qid, misconception=target)
    if q is None or q.get("target_misconception") != target:
        return None
    q["intra_difficulty"] = intra_difficulty
    q["purpose"] = "remediate"
    return q


def _generate_untracked(
    operation: str,
    emotion: str,
    mastery_map: dict,
    concept_mastery: dict[str, float] | None = None,
    intra_difficulty: int | None = None,
    db: Session | None = None,
    user_id: str | None = None,
    exclude_qid: str | None = None,
    plan: "Plan | None" = None,
) -> dict:
    """
    Generate question with type determined by mastery level (competence axis) and
    within-type difficulty from intra_difficulty (state axis / ZPD controller).
    Pooled AI types are served from question_pool first (class-shared, excluding
    questions this student attempted); an empty pool falls back to live
    generation. generate_question handles retries and static fallback internally.
    """
    op_m          = mastery_map.get(operation, {})
    # The question TYPE follows the student's chosen active level (<= the earned ceiling),
    # not the ceiling itself — so unlocking a harder type does not force them into it.
    # Never attempted: the curriculum's entry level (transfer probe or fill_blank).
    # A review is always ordering on a mastered op.
    active_level  = plan.force_level if plan and plan.force_level else played_level(mastery_map, operation)
    purpose       = plan.purpose if plan else "practice"

    qtype = _TYPE_BY_LEVEL.get(active_level, "fill_blank")
    if db is not None and user_id is not None and qtype in question_pool.POOLED_TYPES:
        q = question_pool.serve(db, user_id, operation, qtype, intra_difficulty, exclude_qid=exclude_qid)
        if q is not None:
            q["intra_difficulty"] = intra_difficulty
            q["purpose"] = purpose
            return q
        logger.warning("question_pool empty for (%s, %s, intra=%s) — live generation",
                       operation, qtype, intra_difficulty)
    try:
        # attempts count drives deterministic variant rotation (blank sets / static
        # bugs), offset per student so set order is counterbalanced across a class
        q = generate_question(operation, emotion, active_level, intra_difficulty,
                              variant_seed=op_m.get("attempts", 0) + _variant_offset(user_id))
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
    # Tag the within-type difficulty used + why it was served, echoed back for telemetry
    q["intra_difficulty"] = intra_difficulty
    q["purpose"] = purpose
    return q


def _calc_xp(operation: str, error_count: int) -> int:
    level = next(lv for lv, ops in LEVEL_OPS.items() if operation in ops)
    base  = {1: 80, 2: 120, 3: 160}[level]
    return max(round(base * 0.3), base - error_count * 20)
