"""Recording is race-free (TODOS: "Make attempt recording atomic", "Make evidence
writes race-free" — both needed before MISCONCEPTION_MODE=ab, since mastery and
misconception recurrence are what the study measures).

The test database has one connection, so a race is simulated by letting the
second request get past the "already recorded?" check, exactly as it would if
it ran while the first had not committed yet; the unique index then decides.
"""
import random

import pytest

from app.config import settings
from app.models import EmotionLog, Mastery, MisconceptionEvent, MisconceptionState, QuestionAttempt
from app.services import game_master as gm, misconception_model as mm
from app.services.question_spec import select_spec
from app.services.static_questions import generate_fill_blank_question
from tests.test_telemetry_integrity import _intervention, _record, _seed_session


def _mastery(db, user):
    return db.query(Mastery).filter_by(user_id=user.id, operation="insertAtHead").one()


# ── attempts: one per (session, question), all or nothing ──────────────────────

def test_a_resend_that_got_past_the_check_returns_the_first_attempt(db, monkeypatch):
    user, sess = _seed_session(db)
    _record(db, user, sess)
    real = gm._attempt_of
    calls = []

    def stale_then_real(*a):             # the resend checked before the first one committed
        calls.append(a)
        return None if len(calls) == 1 else real(*a)

    monkeypatch.setattr(gm, "_attempt_of", stale_then_real)
    out = _record(db, user, sess)
    assert db.query(QuestionAttempt).count() == 1
    m = _mastery(db, user)
    assert m.attempts == 1 and m.consecutive_passes == 1   # one clean answer counts once
    assert out["xp_gained"] > 0                          # the reply is the first attempt's


def test_a_failure_halfway_leaves_nothing_so_the_resend_records_it_in_full(db, monkeypatch):
    user, sess = _seed_session(db)
    log = _intervention(db, user, sess)

    def broken(*a, **kw):
        raise RuntimeError("database went away")

    monkeypatch.setattr(gm, "update_mastery", broken)
    with pytest.raises(RuntimeError):
        _record(db, user, sess, error_count=1)
    assert db.query(QuestionAttempt).count() == 0       # used to stay, and the resend then skipped mastery
    db.refresh(log)
    assert log.outcome is None                          # nor half the intervention telemetry

    monkeypatch.undo()
    _record(db, user, sess, error_count=1)               # the /next resend
    assert db.query(QuestionAttempt).count() == 1
    assert _mastery(db, user).attempts == 1
    db.refresh(log)
    assert log.outcome["error_count"] == 1


# ── misconception evidence: counted once, never lost ──────────────────────────

@pytest.fixture()
def shadow(monkeypatch):
    monkeypatch.setattr(settings, "misconception_mode", "shadow")


def _item(op="removeAtPosition", target="stop-on-target"):
    random.seed(7)
    return generate_fill_blank_question(op, select_spec(op, "engaged", 1, 3, 0, target))


def _state(db, uid, mid="stop-on-target"):
    return db.query(MisconceptionState).filter_by(user_id=uid, misconception_id=mid).one()


def test_a_second_pick_that_got_past_the_check_is_not_counted_twice(db, shadow, monkeypatch):
    user, _ = _seed_session(db)
    q = _item()
    mm.record_served(db, user.id, q)
    assert mm.record_pick(db, user.id, q["id"], line=1, option="index") == ["stop-on-target"]
    monkeypatch.setattr(mm, "_has_event", lambda *a: False)   # it looked before the first committed
    assert mm.record_pick(db, user.id, q["id"], line=1, option="index") == []
    assert db.query(MisconceptionEvent).filter_by(kind="picked").count() == 1
    assert _state(db, user.id).n_picked == 1


def test_two_first_picks_share_one_state_row_and_both_count(db, shadow, monkeypatch):
    """Another question's pick created the row between this request's lookup and
    its insert: the insert yields, and this pick is added to that row (it used to
    collide on the unique key and the whole pick was dropped)."""
    user, _ = _seed_session(db)
    db.add(MisconceptionState(user_id=user.id, misconception_id="stop-on-target", p_hold=0.5, n_picked=1,
                              n_avoided=0, picked_items=["other-question"], picked_ops=["removeAtTail"],
                              resolved_ops=[], status="suspected"))
    db.commit()
    q = _item()
    mm.record_served(db, user.id, q)
    real, calls = mm._state_query, []

    class _NotYet:
        def first(self):
            return None

    def lookup(*a):
        calls.append(a)
        return _NotYet() if len(calls) == 1 else real(*a)

    monkeypatch.setattr(mm, "_state_query", lookup)
    assert mm.record_pick(db, user.id, q["id"], line=1, option="index") == ["stop-on-target"]
    assert db.query(MisconceptionState).filter_by(user_id=user.id).count() == 1
    row = _state(db, user.id)
    assert row.n_picked == 2 and set(row.picked_items) == {"other-question", q["id"]}
    assert row.status == "active"                       # two different questions: the rule still works


def test_finishing_twice_at_once_writes_avoided_once(db, shadow, monkeypatch):
    user, _ = _seed_session(db)
    q = _item()
    mm.record_served(db, user.id, q)
    mm.record_outcome(db, user.id, q["id"], passed=True, error_count=0)
    before = {s.misconception_id: s.n_avoided for s in db.query(MisconceptionState).filter_by(user_id=user.id)}
    n = db.query(MisconceptionEvent).filter_by(kind="avoided").count()
    assert n == len(mm.available(mm.item_tags(q))) > 0
    monkeypatch.setattr(mm, "_has_event", lambda *a: False)
    mm.record_outcome(db, user.id, q["id"], passed=True, error_count=0)
    assert db.query(MisconceptionEvent).filter_by(kind="avoided").count() == n
    after = {s.misconception_id: s.n_avoided for s in db.query(MisconceptionState).filter_by(user_id=user.id)}
    assert after == before


def test_a_resend_repairs_a_lost_misconception_outcome(db, shadow, monkeypatch):
    """The attempt commits first, the misconception outcome after it; if that
    second write was lost, the /next resend writes it (idempotent per question)."""
    user, sess = _seed_session(db)
    q = _item("insertAtHead", None)
    mm.record_served(db, user.id, q)
    offered = mm.available(mm.item_tags(q))
    assert offered
    monkeypatch.setattr(mm, "record_outcome", lambda *a, **kw: None)
    _record(db, user, sess, question_id=q["id"])
    assert db.query(MisconceptionEvent).count() == 0
    monkeypatch.undo()
    monkeypatch.setattr(settings, "misconception_mode", "shadow")
    _record(db, user, sess, question_id=q["id"])
    assert db.query(QuestionAttempt).count() == 1 and _mastery(db, user).attempts == 1
    assert {e.misconception_id for e in db.query(MisconceptionEvent).filter_by(kind="avoided")} == offered
    _record(db, user, sess, question_id=q["id"])           # and again: still once
    assert db.query(MisconceptionEvent).filter_by(kind="avoided").count() == len(offered)


def test_one_evidence_row_per_question_is_enforced_by_the_database(db):
    """The backstop itself (uq_misconception_events_once)."""
    from sqlalchemy.exc import IntegrityError
    user, _ = _seed_session(db)
    for _ in range(2):
        db.add(MisconceptionEvent(user_id=user.id, misconception_id="stop-on-target", kind="picked",
                                  question_id="q1"))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()
