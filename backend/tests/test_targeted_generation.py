"""
Targeted generation, offline: R4 (a targeted item must SHOW its misconception
when run), the targeted prompts, and the misconception-tagged question pool.
No model calls — validators are fed hand-written model output.
"""
import json
import random
import uuid

import pytest

from app.models import QuestionPool, User
from app.services import misconceptions as mc, question_pool
from app.services.claude_service import OP_META
from app.services.question_registry import (
    _find_bug_prompt, _find_bug_validate, _ordering_prompt, _ordering_validate,
)
from app.services.question_spec import select_spec
from app.services.static_questions import generate_find_bug_question


def _meta(op, target=None):
    return {**OP_META[op], **({"target_misconception": target} if target else {})}


def _bug_raw(buggy, wrong, line=1):
    return json.dumps({"bug_line": line, "buggy_line": buggy, "wrong_options": wrong,
                       "bug_explanation": "x", "hint": "y"})


STOP_ON_TARGET = "while (curr.next != NULL) curr = curr.next;"
WRONG_FIXES = ["while (curr != NULL) curr = curr.next;",
               "while (curr.next.next != NULL) curr = curr.next.next;"]


def test_r4_accepts_a_bug_that_behaves_like_the_target():
    random.seed(1)
    q = _find_bug_validate(_bug_raw(STOP_ON_TARGET, WRONG_FIXES), "removeAtTail",
                           _meta("removeAtTail", "stop-on-target"))
    assert q["bug_line"] == 1


def test_r4_accepts_another_surface_form_of_the_same_belief():
    random.seed(1)
    _find_bug_validate(_bug_raw("while (curr.next) curr = curr.next;", WRONG_FIXES), "removeAtTail",
                       _meta("removeAtTail", "stop-on-target"))


def test_r4_rejects_a_real_bug_that_shows_a_different_misconception():
    random.seed(1)
    with pytest.raises(ValueError, match="targeted misconception"):
        _find_bug_validate(_bug_raw(STOP_ON_TARGET, WRONG_FIXES), "removeAtTail",
                           _meta("removeAtTail", "walk-off-end"))


def test_untargeted_validation_is_unchanged():
    random.seed(1)
    _find_bug_validate(_bug_raw(STOP_ON_TARGET, WRONG_FIXES), "removeAtTail", _meta("removeAtTail"))


def test_r4_on_ordering_needs_one_distractor_with_the_belief():
    random.seed(1)
    raw = json.dumps({"distractors": [STOP_ON_TARGET, "temp = head;"], "hint": "h"})
    _ordering_validate(raw, "removeAtTail", _meta("removeAtTail", "stop-on-target"))
    with pytest.raises(ValueError, match="targeted misconception"):
        _ordering_validate(raw, "removeAtTail", _meta("removeAtTail", "start-past-head"))


def test_the_targeted_bug_prompt_aims_at_the_misconceptions_line():
    spec = select_spec("removeAtTail", "engaged", 2, 2, 0, "stop-on-target")
    p = _find_bug_prompt("removeAtTail", OP_META["removeAtTail"], spec)
    assert "Line 1 (0-based)" in p
    assert mc.get("stop-on-target").belief in p and STOP_ON_TARGET in p
    assert "Reference example of this subtlety level" not in p


def test_the_targeted_ordering_prompt_names_the_belief():
    spec = select_spec("removeAtTail", "engaged", 3, 2, 0, "stop-on-target")
    p = _ordering_prompt("removeAtTail", OP_META["removeAtTail"], spec)
    assert mc.get("stop-on-target").belief in p and STOP_ON_TARGET in p


# ── the tagged pool ────────────────────────────────────────────────────────────

def _user(db):
    u = User(id=str(uuid.uuid4()), email=f"{uuid.uuid4().hex[:8]}@t.io", username=uuid.uuid4().hex[:8],
             password_hash="x")
    db.add(u)
    db.commit()
    return u


def _tagged_find_bug(op="removeAtTail", target="stop-on-target"):
    random.seed(3)
    q = generate_find_bug_question(op, select_spec(op, "engaged", 2, 2, 0, target))
    q["difficulty"] = 2
    return q


def test_insert_tags_the_row_by_execution(db):
    row = question_pool.insert_question(db, _tagged_find_bug(), 2)
    assert row.misconception_id == "stop-on-target"


def test_targeted_serving_returns_only_rows_that_show_it(db, monkeypatch):
    monkeypatch.setattr(question_pool, "_maybe_refill_async", lambda *a: None)
    question_pool.insert_question(db, _tagged_find_bug(), 2)
    u = _user(db)
    assert question_pool.count_tagged(db, "removeAtTail", "find_bug", "stop-on-target") == 1
    q = question_pool.serve(db, u.id, "removeAtTail", "find_bug", 3, misconception="stop-on-target")
    assert q is not None and q["target_misconception"] == "stop-on-target"     # any tier
    assert question_pool.serve(db, u.id, "removeAtTail", "find_bug", 2, misconception="walk-off-end") is None


def test_tag_existing_backfills_untagged_rows(db):
    row = question_pool.insert_question(db, _tagged_find_bug(), 2)
    row.misconception_id = None
    db.commit()
    assert question_pool.tag_existing(db) == 1
    assert db.query(QuestionPool).one().misconception_id == "stop-on-target"


def test_a_row_the_student_already_did_is_no_longer_a_target(db, monkeypatch):
    """The remediation planner asks can_serve_targeted; it must agree with serve(),
    or a student who used up the tagged rows gets a remediation planned every
    question that can never be served (and 'never twice in a row' never trips,
    because each one falls back to practice)."""
    from app.models import GameSession, QuestionAttempt
    monkeypatch.setattr(question_pool, "_maybe_refill_async", lambda *a: None)
    row = question_pool.insert_question(db, _tagged_find_bug(), 2)
    u = _user(db)
    assert question_pool.can_serve_targeted(db, u.id, "removeAtTail", "find_bug", "stop-on-target")
    sess = GameSession(user_id=u.id, module_id="singly", mode="challenge")
    db.add(sess)
    db.commit()
    db.add(QuestionAttempt(session_id=sess.id, question_id=row.id, difficulty=2, passed=True, error_count=0))
    db.commit()
    assert question_pool.count_tagged(db, "removeAtTail", "find_bug", "stop-on-target") == 1
    assert not question_pool.can_serve_targeted(db, u.id, "removeAtTail", "find_bug", "stop-on-target")
    assert question_pool.serve(db, u.id, "removeAtTail", "find_bug", 2, misconception="stop-on-target") is None


_NOT_ONE_LINE = sorted((op, m.id) for m in mc.CATALOG.values() for op in m.mutants
                       if mc.canonical(op, m.id).kind != "replace")


def test_a_target_without_a_one_line_form_never_reaches_the_model(monkeypatch):
    """A swap or delete can't be written as a buggy line or a distractor, so R4
    would reject every attempt: no model call, authored content or nothing."""
    from app.services import claude_service
    from app.services.question_registry import ai_can_target
    assert _NOT_ONE_LINE, "the catalog has swap / delete forms"
    calls = []
    monkeypatch.setattr(claude_service, "_call_model", lambda prompt: calls.append(prompt) or "{}")
    for op, mid in _NOT_ONE_LINE:
        assert not ai_can_target(op, mid)
        for level in (2, 3):
            q = claude_service.generate_question(op, type_unlocked=level, intra_difficulty=2,
                                                 target_misconception=mid)
            assert q["target_misconception"] in (None, mid)
            if q["target_misconception"] == mid:
                assert mc.authored_target_exists(op, q["question_type"], mid)
        with pytest.raises(RuntimeError, match="no one-line form"):
            question_pool.generate_validated(op, "find_bug", 2, target_misconception=mid)
    assert calls == []
