"""Question pool: content-hash dedup, class-shared serving with per-student
exclusion, times_served rotation, low-water self-heal trigger, and the
_generate_with_fallback pool-first path. All offline (generation is stubbed)."""
import uuid

import pytest

from app.models import GameSession, QuestionAttempt, QuestionPool, User
from app.services import question_pool
from app.services.game_master import _generate_with_fallback


def _mk_user(db, name=None):
    u = User(id=str(uuid.uuid4()), email=f"{uuid.uuid4().hex[:8]}@t.io",
             username=name or uuid.uuid4().hex[:8], password_hash="x")
    db.add(u)
    db.commit()
    return u


def _mk_q(op="reverseList", qtype="find_bug", tag="A"):
    return {
        "operation": op, "question_type": qtype, "title": "Reverse Linked List",
        "pseudocode": [f"line-{tag};", "other;"], "bug_line": 0,
        "distractors": [f"d-{tag};"], "difficulty": 3,
    }


def _seed_pool(db, n=3, intra=2, **kw):
    rows = []
    for i in range(n):
        rows.append(question_pool.insert_question(db, _mk_q(tag=str(i), **kw), intra))
    return rows


@pytest.fixture(autouse=True)
def _no_refill_threads(monkeypatch):
    """Self-heal spawns threads + hits the API; capture instead."""
    calls = []
    monkeypatch.setattr(question_pool, "_maybe_refill_async",
                        lambda *a: calls.append(a))
    yield calls


def test_insert_dedupes_on_content_hash(db):
    q = _mk_q()
    assert question_pool.insert_question(db, q, 2) is not None
    assert question_pool.insert_question(db, dict(q), 2) is None
    assert db.query(QuestionPool).count() == 1


def test_content_hash_ignores_build_randomness():
    a, b = _mk_q(), _mk_q()
    a["initialNodes"] = [{"id": 1, "value": 42}]
    b["initialNodes"] = [{"id": 1, "value": 7}]
    assert question_pool.content_hash(a) == question_pool.content_hash(b)


def test_serve_excludes_questions_this_student_attempted(db):
    rows = _seed_pool(db, n=2)
    user = _mk_user(db)
    sess = GameSession(id=str(uuid.uuid4()), user_id=user.id, module_id="singly", mode="stress-free")
    db.add(sess)
    db.add(QuestionAttempt(id=str(uuid.uuid4()), session_id=sess.id,
                           question_id=rows[0].id, operation="reverseList",
                           difficulty=3, passed=True))
    db.commit()
    q = question_pool.serve(db, user.id, "reverseList", "find_bug", 2)
    assert q["id"] == rows[1].id


def test_serve_is_class_shared_not_consumed(db):
    _seed_pool(db, n=1)
    u1, u2 = _mk_user(db), _mk_user(db)
    q1 = question_pool.serve(db, u1.id, "reverseList", "find_bug", 2)
    q2 = question_pool.serve(db, u2.id, "reverseList", "find_bug", 2)
    assert q1["id"] == q2["id"]
    assert db.query(QuestionPool).one().times_served == 2


def test_serve_prefers_least_served(db):
    rows = _seed_pool(db, n=2)
    rows[0].times_served = 5
    db.commit()
    q = question_pool.serve(db, _mk_user(db).id, "reverseList", "find_bug", 2)
    assert q["id"] == rows[1].id


def test_serve_returns_none_on_empty_and_wrong_intra(db):
    user = _mk_user(db)
    assert question_pool.serve(db, user.id, "reverseList", "find_bug", 2) is None
    _seed_pool(db, n=1, intra=1)
    assert question_pool.serve(db, user.id, "reverseList", "find_bug", 3) is None


def test_low_water_triggers_self_heal(db, _no_refill_threads):
    _seed_pool(db, n=question_pool.LOW_WATER)   # at the mark -> trigger
    question_pool.serve(db, _mk_user(db).id, "reverseList", "find_bug", 2)
    assert _no_refill_threads == [("reverseList", "find_bug", 2)]


def test_serve_tags_pool_variant(db):
    row = _seed_pool(db, n=1)[0]
    q = question_pool.serve(db, _mk_user(db).id, "reverseList", "find_bug", 2)
    assert q["variant"] == f"pool:{row.content_hash[:8]}"


def test_generate_with_fallback_serves_pool_first(db):
    _seed_pool(db, n=1)
    user = _mk_user(db)
    mastery_map = {"reverseList": {"type_unlocked": 2, "active_type_level": 2, "attempts": 0}}
    q = _generate_with_fallback("reverseList", "engaged", mastery_map,
                                intra_difficulty=2, db=db, user_id=user.id)
    assert q["variant"].startswith("pool:")
    assert q["intra_difficulty"] == 2


def test_generate_with_fallback_pool_empty_uses_static_path(db, monkeypatch):
    # live generation stubbed to fail -> static fallback proves the fall-through
    import app.services.game_master as gm
    monkeypatch.setattr(gm, "generate_question",
                        lambda *a, **k: (_ for _ in ()).throw(RuntimeError("api down")))
    user = _mk_user(db)
    mastery_map = {"reverseList": {"type_unlocked": 2, "active_type_level": 2, "attempts": 0}}
    q = _generate_with_fallback("reverseList", "engaged", mastery_map,
                                intra_difficulty=2, db=db, user_id=user.id)
    assert q["operation"] == "reverseList"      # static question still produced


def test_refill_combo_respects_target_and_dedup(db, monkeypatch):
    made = iter([_mk_q(tag="x"), _mk_q(tag="x"), _mk_q(tag="y"), _mk_q(tag="z")])
    monkeypatch.setattr(question_pool, "generate_validated",
                        lambda *a, **k: next(made))
    added = question_pool.refill_combo(db, "reverseList", "find_bug", 2, target=3)
    # duplicate 'x' burns one budget slot; budget (2x need = 6) is enough for 3
    assert added == 3
    assert db.query(QuestionPool).count() == 3
