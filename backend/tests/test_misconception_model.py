"""
Misconception diagnosis and remediation (services/misconception_model.py,
game_master.plan_next 'remediate', targeted generation). Contract:
- one 3-way pick never activates a misconception; picks on two different questions do
- evidence is tagged server-side from the served item, counted once per question
- resolution needs clean answers on TARGETED items on two different operations
- MISCONCEPTION_MODE: off writes nothing; shadow diagnoses but serves as usual;
  ab splits students; on remediates everyone
- every authored (operation, type, misconception) target builds an item that shows it
"""
import random
import uuid

import pytest

from app.config import settings
from app.models import MisconceptionEvent, MisconceptionState, QuestionAttempt, ServedItem
from app.services import curriculum, misconception_model as mm, misconceptions as mc
from app.services.game_master import (
    Plan, _generate_with_fallback, _record_attempt, get_mastery_map, plan_next,
)
from app.services.question_spec import select_spec
from app.services.static_questions import (
    TEMPLATES, generate_fill_blank_question, generate_find_bug_question, generate_static_question,
)
from tests.mastery_helpers import Student, master_units


@pytest.fixture()
def mode(monkeypatch):
    def set_mode(m):
        monkeypatch.setattr(settings, "misconception_mode", m)
    set_mode("shadow")
    return set_mode


# ── the update rule ────────────────────────────────────────────────────────────

def test_one_pick_is_suspicion_not_a_diagnosis():
    d = mm.update(mm.Diagnosis(), "picked", question_id="q1", operation="removeAtTail")
    assert d.status == "suspected" and d.p < mm.ACTIVE_P


def test_picks_on_two_different_questions_activate():
    d = mm.update(mm.Diagnosis(), "picked", question_id="q1", operation="removeAtTail")
    d = mm.update(d, "picked", question_id="q2", operation="removeAtPosition")
    assert d.status == "active" and d.p >= mm.ACTIVE_P


def test_two_picks_on_the_same_question_are_not_two_items():
    d = mm.update(mm.Diagnosis(), "picked", question_id="q1")
    d = mm.update(d, "picked", question_id="q1")
    assert d.status == "suspected"


def test_avoiding_lowers_the_estimate():
    d = mm.update(mm.Diagnosis(p=0.5), "avoided")
    assert d.p < 0.5


def _active():
    d = mm.update(mm.Diagnosis(), "picked", question_id="q1", operation="removeAtTail")
    return mm.update(d, "picked", question_id="q2", operation="removeAtTail")


def test_resolution_needs_clean_targeted_answers_on_two_operations():
    d = mm.update(_active(), "avoided", operation="removeAtTail", targeted=True, clean=True)
    assert d.status == "active"
    d = mm.update(d, "avoided", operation="removeAtTail", targeted=True, clean=True)
    assert d.status == "active", "the same operation twice is not transfer"
    d = mm.update(d, "avoided", operation="insertAtPosition", targeted=True, clean=True)
    assert d.status == "resolved" and d.p <= mm.RESOLVED_P


def test_a_single_operation_misconception_resolves_on_two_clean_answers_there():
    d = mm.update(_active(), "avoided", operation="reverseList", targeted=True, clean=True, n_ops=1)
    assert d.status == "active"
    d = mm.update(d, "avoided", operation="reverseList", targeted=True, clean=True, n_ops=1)
    assert d.status == "resolved"


def test_an_untargeted_or_messy_answer_does_not_count_toward_resolution():
    d = mm.update(_active(), "avoided", operation="removeAtTail", targeted=False, clean=True)
    d = mm.update(d, "avoided", operation="insertAtPosition", targeted=True, clean=False)
    assert d.resolved_ops == []


def test_a_relapse_after_resolution_starts_over():
    d = mm.Diagnosis(p=0.05, status="resolved", resolved_ops=["a", "b"])
    d = mm.update(d, "picked", question_id="q9", operation="a")
    assert d.status == "suspected" and d.resolved_ops == []


# ── evidence from real served items ────────────────────────────────────────────

def _student(db):
    return Student(db)


def _remove_at_position_item(target="stop-on-target"):
    random.seed(7)
    spec = select_spec("removeAtPosition", "engaged", 1, 3, 0, target)   # all blanks shown
    return generate_fill_blank_question("removeAtPosition", spec)


def test_a_targeted_blank_offers_the_misconception_option(db):
    q = _remove_at_position_item()
    assert q["target_misconception"] == "stop-on-target"
    assert "stop-on-target" in mm.available(mm.item_tags(q))


def test_off_mode_writes_nothing(db, mode):
    mode("off")
    st = _student(db)
    q = _remove_at_position_item()
    mm.record_served(db, st.uid, q)
    assert db.query(ServedItem).count() == 0
    assert mm.record_pick(db, st.uid, q["id"], line=1, option="index") == []


def test_a_pick_is_tagged_from_the_served_item_and_counted_once(db, mode):
    st = _student(db)
    q = _remove_at_position_item()
    mm.record_served(db, st.uid, q)
    blank = next(b for b in q["blanks"] if b["line"] == 1)
    assert "index" in blank["options"]
    assert mm.record_pick(db, st.uid, q["id"], line=1, option="index") == ["stop-on-target"]
    assert mm.record_pick(db, st.uid, q["id"], line=1, option="index") == []      # same question
    row = db.query(MisconceptionState).filter_by(user_id=st.uid, misconception_id="stop-on-target").one()
    assert row.status == "suspected" and row.n_picked == 1


def test_a_pick_on_an_item_never_served_to_this_student_counts_for_nothing(db, mode):
    a, b = _student(db), _student(db)
    q = _remove_at_position_item()
    mm.record_served(db, a.uid, q)
    assert mm.record_pick(db, b.uid, q["id"], line=1, option="index") == []


def test_finishing_cleanly_records_avoided_for_everything_offered_and_not_picked(db, mode):
    st = _student(db)
    q = _remove_at_position_item()
    mm.record_served(db, st.uid, q)
    mm.record_pick(db, st.uid, q["id"], line=1, option="index")
    mm.record_outcome(db, st.uid, q["id"], passed=True, error_count=1)
    mm.record_outcome(db, st.uid, q["id"], passed=True, error_count=1)            # idempotent
    avoided = {e.misconception_id for e in db.query(MisconceptionEvent).filter_by(kind="avoided")}
    assert "stop-on-target" not in avoided
    assert avoided == mm.available(mm.item_tags(q)) - {"stop-on-target"}
    assert db.query(MisconceptionEvent).filter_by(kind="avoided").count() == len(avoided)


def test_an_old_client_pick_string_is_parsed():
    assert mm.parse_pick(["line 2: index"]) == (1, "index")
    assert mm.parse_pick(["a", "b"]) == (None, None)


def test_an_ordering_assembly_is_classified_as_a_whole(db, mode):
    st = _student(db)
    q = generate_static_question("insertAtHead", intra_level=2)
    q["question_type"] = "ordering"
    mm.record_served(db, st.uid, q)
    steps = q["pseudocode"]                      # instantiated
    wrong_order = [steps[0], steps[2], steps[1]] # head = newNode before linking
    assert mm.record_pick(db, st.uid, q["id"], assembly=wrong_order) == ["move-before-link"]


def test_feedback_runs_the_pick_on_the_board_the_student_saw(db, mode):
    st = _student(db)
    q = _remove_at_position_item()
    mm.record_served(db, st.uid, q)
    mm.record_pick(db, st.uid, q["id"], line=1, option="index")
    fb = mm.feedback_for(db, st.uid, q["id"])
    assert fb and fb[0]["misconception"] == "stop-on-target"
    assert fb[0]["consequence"] and fb[0]["belief"] and fb[0]["correction"]


# ── the HTTP route the client actually calls ───────────────────────────────────

def test_the_mistakes_route_feeds_the_diagnosis(db, mode):
    from fastapi.testclient import TestClient
    from app.database import get_db
    from app.dependencies import get_current_user
    from app.main import app
    from app.models import Mistake, User

    st = _student(db)
    user = db.query(User).filter_by(id=st.uid).one()
    q = _remove_at_position_item()
    mm.record_served(db, st.uid, q)
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: user
    try:
        body = {"question_id": q["id"], "source": "agentic", "title": q["title"],
                "your_answer": ["line 2: index"], "correct_answer": ["index-1"], "explanation": "h",
                "pick_line": 1, "pick_option": "index"}
        r = TestClient(app).post("/api/progress/mistakes", json=body)
        assert r.status_code == 200, r.text
        # an old client without the pick fields still counts (parsed from your_answer)
        q2 = _remove_at_position_item()
        mm.record_served(db, st.uid, q2)
        old = {**body, "question_id": q2["id"]}
        old.pop("pick_line"), old.pop("pick_option")
        assert TestClient(app).post("/api/progress/mistakes", json=old).status_code == 200
    finally:
        app.dependency_overrides.clear()
    assert db.query(Mistake).count() == 2                        # the mistake book is unchanged
    row = db.query(MisconceptionState).filter_by(user_id=st.uid, misconception_id="stop-on-target").one()
    assert row.status == "active" and row.n_picked == 2         # two different questions


# ── planner ────────────────────────────────────────────────────────────────────

def _activate(db, uid, mid, picked_ops):
    db.add(MisconceptionState(user_id=uid, misconception_id=mid, p_hold=0.8, n_picked=2, n_avoided=0,
                              picked_items=["x", "y"], picked_ops=picked_ops, resolved_ops=[], status="active"))
    db.commit()


def _in_unit_two(db):
    st = Student(db)
    master_units(db, st.uid, curriculum.UNITS[:1])
    return st


def test_on_mode_remediates_an_active_misconception_on_an_op_in_play(db, mode):
    mode("on")
    st = _in_unit_two(db)
    _activate(db, st.uid, "walk-off-end", ["insertAtTail"])
    plan = st.next_plan("insertAtTail")
    assert plan.purpose == "remediate" and plan.target_misconception == "walk-off-end"
    assert plan.operation == "removeAtTail", "prefers the op where it was NOT shown (transfer)"


def test_shadow_mode_only_logs_the_remediation(db, mode):
    mode("shadow")
    st = _in_unit_two(db)
    _activate(db, st.uid, "walk-off-end", ["insertAtTail"])
    plan = st.next_plan("insertAtTail")
    assert plan.purpose == "practice"
    assert plan.shadow == {"operation": "removeAtTail", "misconception": "walk-off-end"}


def test_ab_mode_splits_students_by_a_stable_hash(db, mode):
    mode("ab")
    seen = {}
    for _ in range(12):
        st = _in_unit_two(db)
        _activate(db, st.uid, "walk-off-end", ["insertAtTail"])
        seen[mm.arm(st.uid)] = st.next_plan("insertAtTail").purpose
    assert seen == {"targeted": "remediate", "control": "practice"}


def test_no_remediation_twice_in_a_row(db, mode):
    from app.services.game_master import record_result
    mode("on")
    st = _in_unit_two(db)
    _activate(db, st.uid, "walk-off-end", ["insertAtTail"])
    plan = st.next_plan("insertAtTail")
    assert plan.purpose == "remediate"
    mmap = get_mastery_map(db, st.uid, "singly")
    q = _generate_with_fallback(plan.operation, "engaged", mmap, None, 2, db=db, user_id=st.uid,
                                plan=plan, session_id=st.session.id)
    record_result(db, st.uid, "singly", st.session.id, plan.operation, passed=True, error_count=1,
                  time_ms=4000, question_id=q["id"], question_number=1,
                  question_type=q["question_type"], purpose=q["purpose"])
    a = db.query(QuestionAttempt).filter_by(question_id=q["id"]).one()
    assert a.purpose == "remediate" and a.target_misconception == "walk-off-end"
    assert st.next_plan("insertAtTail").purpose != "remediate"


def test_a_misconception_of_no_op_in_this_unit_is_not_remediated_here(db, mode):
    mode("on")
    st = _in_unit_two(db)
    _activate(db, st.uid, "no-cut", ["sortList"])
    assert st.next_plan("insertAtTail").purpose != "remediate"


def test_a_remediation_plan_serves_a_targeted_item_and_records_it(db, mode):
    mode("on")
    st = _in_unit_two(db)
    mmap = get_mastery_map(db, st.uid, "singly")
    q = _generate_with_fallback("removeAtTail", "engaged", mmap, None, 2, db=db, user_id=st.uid,
                                plan=Plan("removeAtTail", "remediate", target_misconception="walk-off-end"))
    assert q["purpose"] == "remediate" and q["target_misconception"] == "walk-off-end"
    item = mm.served(db, st.uid, q["id"])
    assert item.target_misconception == "walk-off-end" and "walk-off-end" in mm.available(item.tags)


def test_an_unmet_target_falls_back_to_practice(db, mode):
    mode("on")
    st = _in_unit_two(db)
    mmap = get_mastery_map(db, st.uid, "singly")
    # guard-slow has no authored fill_blank and no pool rows
    q = _generate_with_fallback("detectCycle", "engaged", mmap, None, 2, db=db, user_id=st.uid,
                                plan=Plan("detectCycle", "remediate", target_misconception="guard-slow"))
    assert q["purpose"] == "practice" and not q.get("target_misconception")
    assert mm.served(db, st.uid, q["id"]).shadow_plan["unmet"] is True


def test_next_with_a_prefetched_question_serves_nothing(db, mode):
    """The client shows its prefetched question and calls /next only to record:
    a question generated there would be thrown away yet counted as served."""
    from app.services.game_master import next_question
    mode("shadow")
    st = _in_unit_two(db)
    before = db.query(ServedItem).count()
    out = next_question(db, st.uid, "singly", st.session.id, "insertAtTail", True, 0, 3000,
                        str(uuid.uuid4()), 1, planned_questions=5, pinned_operation="insertAtTail",
                        question_type="fill_blank", prefetched=True)
    assert out["question"] is None and out["operation"] and not out["session_complete"]
    assert db.query(ServedItem).count() == before
    assert db.query(QuestionAttempt).count() == 1                # the answer was still recorded


def test_the_server_only_accepts_remediate_for_an_item_it_targeted(db, mode):
    mode("on")
    st = _in_unit_two(db)
    qid = str(uuid.uuid4())
    a = _record_attempt(db, st.uid, "singly", st.session.id, "insertAtTail", True, 0, 1000, qid,
                        2, 0, "engaged", None, "fill_blank", "remediate")
    assert a.purpose == "practice" and a.target_misconception is None


# ── every authored target builds an item that shows it ────────────────────────

_BUILDERS = {
    "fill_blank": lambda op, m: generate_fill_blank_question(op, select_spec(op, "engaged", 1, 3, 0, m)),
    "find_bug":   lambda op, m: generate_find_bug_question(op, select_spec(op, "engaged", 2, 2, 0, m)),
    "ordering":   lambda op, m: {**generate_static_question(op, intra_level=3, target_misconception=m),
                                 "question_type": "ordering"},
}
_TARGETS = [(op, t, m.id) for m in mc.CATALOG.values() for op in m.mutants for t in _BUILDERS
            if mc.authored_target_exists(op, t, m.id)]


@pytest.mark.parametrize("op,qtype,mid", _TARGETS)
def test_targeted_authored_item_shows_the_misconception(op, qtype, mid):
    random.seed(f"{op}{qtype}{mid}")
    q = _BUILDERS[qtype](op, mid)
    assert q["target_misconception"] == mid, f"target unmet for {op}/{qtype}/{mid}"
    assert mid in mm.available(mm.item_tags(q))
