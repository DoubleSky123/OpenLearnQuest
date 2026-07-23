"""Scaffold clamp + closed-loop intervention telemetry — the two guarantees
that make question_attempts/emotion_logs trustworthy for analysis (and for a
future ablation arm)."""
import uuid
from datetime import datetime

from app.models import EmotionLog, GameSession, User
from app.services.game_master import clamp_scaffold, record_result


# ── clamp_scaffold: server never trusts client-computed scaffold levels ─────────

def test_clamp_respects_error_driven_cap():
    # cap = errors + max emotion baseline (2), ceiling 4  (mirrors useScaffold.js)
    assert clamp_scaffold(4, error_count=0) == 2     # impossible without errors
    assert clamp_scaffold(3, error_count=1) == 3     # legitimate
    assert clamp_scaffold(9, error_count=5) == 4     # absolute ceiling
    assert clamp_scaffold(-2, error_count=0) == 0    # floor
    assert clamp_scaffold(None, error_count=3) is None
    assert clamp_scaffold(1, error_count=0) == 1     # honest values pass through


def _seed_session(db):
    user = User(id=str(uuid.uuid4()), email=f"{uuid.uuid4().hex[:8]}@example.com",
                username=uuid.uuid4().hex[:8], password_hash="x")
    sess = GameSession(id=str(uuid.uuid4()), user_id=user.id, module_id="singly", mode="stress-free")
    db.add_all([user, sess])
    db.commit()
    return user, sess


def _record(db, user, sess, scaffold_level=None, passed=True, error_count=0):
    return record_result(
        db=db, user_id=user.id, module_id="singly", session_id=sess.id,
        operation="insertAtHead", passed=passed, error_count=error_count,
        time_ms=10000, question_id="q1", question_number=1,
        intra_difficulty=2, scaffold_level=scaffold_level, emotion="engaged",
    )


def test_record_result_clamps_scaffold(db):
    from app.models import QuestionAttempt
    user, sess = _seed_session(db)
    _record(db, user, sess, scaffold_level=4, error_count=0)   # dishonest client
    attempt = db.query(QuestionAttempt).filter(QuestionAttempt.session_id == sess.id).first()
    assert attempt.scaffold_level == 2


# ── closed loop: interventions learn their outcome ──────────────────────────────

def _intervention(db, user, sess, action="show_hint"):
    log = EmotionLog(id=str(uuid.uuid4()), user_id=user.id, session_id=sess.id,
                     timestamp=datetime.utcnow(), source="behavioral",
                     emotion="frustrated", confidence=0.9, signals={}, action_taken=action)
    db.add(log)
    db.commit()
    return log


def test_intervention_outcome_written_back(db):
    user, sess = _seed_session(db)
    log = _intervention(db, user, sess)
    assert log.outcome is None                       # open loop before recording
    _record(db, user, sess, passed=True, error_count=1)
    db.refresh(log)
    assert log.outcome == {"question_id": "q1", "operation": "insertAtHead",
                           "passed": True, "error_count": 1}


def test_noop_actions_are_not_closed(db):
    user, sess = _seed_session(db)
    log = _intervention(db, user, sess, action="none")
    _record(db, user, sess)
    db.refresh(log)
    assert log.outcome is None                       # 'none' is not an intervention


def test_outcome_written_once_not_overwritten(db):
    user, sess = _seed_session(db)
    log = _intervention(db, user, sess)
    _record(db, user, sess, passed=True, error_count=1)
    _record(db, user, sess, passed=True, error_count=0)   # next question
    db.refresh(log)
    assert log.outcome["error_count"] == 1           # still the FIRST question's outcome
