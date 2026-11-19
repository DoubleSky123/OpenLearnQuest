"""
What a study that varies ONLY what the tutor knows needs (docs/designs/
study-misconception-tutor-gap-analysis.md):

A. Trustworthy labels — execution tags behaviour, not belief
   (docs/diagnosis-check-2026-11-18), so a teacher's label for an edit
   overrides execution, and MISCONCEPTION_TAGS=reviewed keeps only those.
B. One manipulated channel — MISCONCEPTION_CHANNELS splits tutor /
   remediation / feedback; a treated student's tutor gets [MISCONCEPTION
   EVIDENCE] on EVERY turn (this question's pick + the same belief on earlier
   questions); every turn records what was, or would have been, given.
"""
import json
import random

import pytest

from app.config import settings
from app.models import MisconceptionState, TutorTurn
from app.services import misconception_model as mm, misconceptions as mc
from app.services.question_spec import select_spec
from app.services.static_questions import TEMPLATES, generate_fill_blank_question
from tests.mastery_helpers import Student
from tests.test_misconception_model import _activate, _in_unit_two
from tests.test_tutor_harness import _body, _events, harness  # noqa: F401 — fixture


@pytest.fixture()
def labels():
    """Swap the teacher's label table for one test, then reload the real file."""
    def use(entries: dict, source: str = "execution"):
        mc.set_labels({mc.label_key(*k): frozenset([m] if m else []) for k, m in entries.items()})
        settings.misconception_tags = source
        mc.set_labels(mc._LABELS)   # clears the authored-tag cache for the new source
    yield use
    settings.misconception_tags = "execution"
    mc.set_labels()


@pytest.fixture()
def study(monkeypatch):
    def use(mode: str, channels: str = "tutor,remediation,feedback"):
        monkeypatch.setattr(settings, "misconception_mode", mode)
        monkeypatch.setattr(settings, "misconception_channels", channels)
    use("shadow")
    return use


T = {op: TEMPLATES[op]["pseudocode"] for op in TEMPLATES}


# ── A. teacher labels override execution ───────────────────────────────────────

def test_a_teacher_label_of_none_removes_a_behaviour_only_tag(labels):
    # head = NULL on insertIntoEmpty ends with an empty list, exactly like "no node
    # created", but the student DID create the node — the case that started this
    assert mc.tag_blank("insertIntoEmpty", T["insertIntoEmpty"], 1, "newNode", "NULL") == {"alias-not-new"}
    labels({("insertIntoEmpty", 1, "head = NULL;"): None})
    assert mc.tag_blank("insertIntoEmpty", T["insertIntoEmpty"], 1, "newNode", "NULL") == frozenset()


def test_a_teacher_label_adds_a_belief_execution_missed(labels):
    # the same belief as `newNode = curr`, written another way: it crashes instead
    tagged = mc.tag_blank("insertAtPosition", T["insertAtPosition"], 2, "createNode({value})", "curr.next")
    assert tagged == frozenset()
    labels({("insertAtPosition", 2, "newNode = curr.next"): "alias-not-new"})
    assert mc.tag_blank("insertAtPosition", T["insertAtPosition"], 2, "createNode({value})", "curr.next") \
        == {"alias-not-new"}


def test_one_edit_is_one_label_whatever_the_question_type(labels):
    """A label belongs to the edit (operation, line, the line as it now reads): the
    same line reached by a blank or chosen as a find_bug fix is the same belief."""
    labels({("insertIntoEmpty", 1, "head = NULL"): None})
    assert mc.tag_line("insertIntoEmpty", T["insertIntoEmpty"], 1, "head  =  NULL;") == frozenset()


def test_reviewed_mode_drops_every_unconfirmed_tag(labels):
    assert mc.tag_line("insertAtHead", T["insertAtHead"], 1, "newNode.next = head.next;") == {"link-one-too-far"}
    labels({}, source="reviewed")
    assert mc.tag_line("insertAtHead", T["insertAtHead"], 1, "newNode.next = head.next;") == frozenset()
    assert all(not w.tags for w in mc.authored_wrong_options("insertAtHead"))


def test_a_distractor_label_holds_wherever_the_distractor_is_placed(labels):
    labels({("insertIntoEmpty", None, "newNode.next = head;"): "null-head-is-node"}, source="reviewed")
    assert mc.tag_distractor("insertIntoEmpty", T["insertIntoEmpty"], "newNode.next = head;") == {"null-head-is-node"}
    steps = list(T["insertIntoEmpty"])
    assert mc.classify_assembly("insertIntoEmpty", [steps[0], "newNode.next = head;"]) == {"null-head-is-node"}


def test_a_pure_reordering_is_still_judged_by_execution_in_reviewed_mode(labels):
    labels({}, source="reviewed")
    s = T["insertAtHead"]
    assert mc.classify_assembly("insertAtHead", [s[0], s[2], s[1]]) == {"move-before-link"}


def test_the_shipped_label_file_is_well_formed():
    if not mc.LABELS_PATH.exists():
        pytest.skip("no teacher labels yet")
    data = json.loads(mc.LABELS_PATH.read_text(encoding="utf-8"))
    keys = set()
    for e in data["labels"]:
        op, line, code, mid = e["operation"], e.get("line"), e["code"], e.get("misconception")
        assert op in TEMPLATES, e
        assert mid is None or mid in mc.CATALOG, e
        assert e.get("rater"), f"who labelled it? {e}"
        if line is not None:
            assert 0 <= line < len(T[op]), e
            assert mc.norm_code(code) != mc.norm_code(T[op][line]), f"not an edit: {e}"
        k = mc.label_key(op, line, code)
        assert k not in keys, f"labelled twice: {k}"
        keys.add(k)


# ── B. channels ────────────────────────────────────────────────────────────────

def test_a_tutor_only_study_changes_nothing_but_the_tutor(db, study):
    study("on", "tutor")
    st = _in_unit_two(db)
    assert mm.targeting(st.uid, "tutor")
    assert not mm.targeting(st.uid, "remediation") and not mm.targeting(st.uid, "feedback")
    _activate(db, st.uid, "walk-off-end", ["insertAtTail"])
    plan = st.next_plan("insertAtTail")
    assert plan.purpose == "practice", "no remediation when only the tutor channel is on"
    assert plan.shadow == {"operation": "removeAtTail", "misconception": "walk-off-end"}


def test_untreated_students_get_no_channel(db, study):
    study("shadow")
    st = Student(db)
    assert not any(mm.targeting(st.uid, c) for c in mm.CHANNELS)
    with pytest.raises(ValueError):
        mm.targeting(st.uid, "everything")


# ── B. what the tutor is told ──────────────────────────────────────────────────

def _item(op="removeAtPosition", qid=None, target="stop-on-target"):
    random.seed(7)
    q = generate_fill_blank_question(op, select_spec(op, "engaged", 1, 3, 0, target))
    if qid:
        q["id"] = qid
    return q


def _pick(db, uid, q, line=1, option="index"):
    mm.record_served(db, uid, q)
    return mm.record_pick(db, uid, q["id"], line=line, option=option)


def test_the_evidence_names_this_questions_pick_and_the_same_belief_earlier(db, study):
    st = Student(db)
    earlier = _item(qid="earlier-1")
    assert _pick(db, st.uid, earlier) == ["stop-on-target"]
    now = _item(qid="now-1")
    assert _pick(db, st.uid, now) == ["stop-on-target"]

    items = mm.tutor_evidence(db, st.uid, "now-1", "removeAtPosition")
    assert [(i["id"], i["where"], i["earlier_questions"]) for i in items] == [("stop-on-target", "this_question", 1)]
    note = mm.tutor_note(items)
    assert mc.CATALOG["stop-on-target"].belief in note
    assert "line 2" in note and "1 earlier question(s) (removeAtPosition)" in note


def test_earlier_beliefs_that_apply_here_are_listed_resolved_ones_are_not(db, study):
    st = Student(db)
    _pick(db, st.uid, _item(qid="e1"))
    assert [i["where"] for i in mm.tutor_evidence(db, st.uid, "other", "removeAtTail")] == ["earlier"]
    assert mm.tutor_evidence(db, st.uid, "other", "reverseList") == [], "stop-on-target does not apply there"
    db.query(MisconceptionState).filter_by(user_id=st.uid).update({"status": "resolved"})
    db.commit()
    assert mm.tutor_evidence(db, st.uid, "other", "removeAtTail") == []


def test_the_note_carries_beliefs_never_corrections_or_the_template():
    """The correction is this exercise's answer in plain English; the solving
    rule forbids that, so it never reaches the prompt."""
    for m in mc.CATALOG.values():
        op = next(iter(m.mutants))
        note = mm.tutor_note([{"id": m.id, "where": "this_question", "line": 0, "option": "x",
                               "consequence": None, "earlier_questions": 2, "earlier_operations": [op]}])
        assert m.belief in note and m.correction not in note
        assert not any(step in note for step in T[op]), m.id


def _tutor_with_a_pick(harness, study, mode, channels="tutor"):
    study(mode, channels)
    q = _item(qid="q-now")
    _pick(harness.db, harness.user.id, q)
    return _body(harness, question_id="q-now", operation="removeAtPosition", question_type="fill_blank",
                 question_title="Remove at Position")


def test_a_treated_students_tutor_gets_the_evidence_on_every_turn(harness, study):
    body = _tutor_with_a_pick(harness, study, "on")
    fake = harness.use({"tokens": ["Where does the loop stop?"]}, {"tokens": ["And then?"]})
    harness.client.post("/api/ai/tutor/stream", json=body)
    harness.client.post("/api/ai/tutor/stream", json={**body, "user_message": "still lost"})
    first, second = (c["messages"][-1]["content"] for c in fake.calls)
    belief = mc.CATALOG["stop-on-target"].belief
    assert "[MISCONCEPTION EVIDENCE" in first and belief in first
    assert "[Context refresh" in second and belief in second, "the refresh carries it too"
    assert second.rstrip().endswith("still lost")
    assert second.index("[MISCONCEPTION EVIDENCE") < second.index("[PHASE]"), "the phase note stays last"
    for t in harness.db.query(TutorTurn).all():
        assert t.misconception_context["sent"] is True
        assert t.misconception_context["items"][0]["id"] == "stop-on-target"


def test_a_control_students_tutor_gets_nothing_but_the_dose_is_recorded(harness, study):
    body = _tutor_with_a_pick(harness, study, "shadow")
    fake = harness.use({"tokens": ["Where does the loop stop?"]})
    harness.client.post("/api/ai/tutor/stream", json=body)
    assert "MISCONCEPTION" not in fake.calls[0]["messages"][-1]["content"]
    ctx = harness.db.query(TutorTurn).one().misconception_context
    assert ctx["sent"] is False and ctx["arm"] == "shadow"
    assert [i["id"] for i in ctx["items"]] == ["stop-on-target"], "what it WOULD have been told"


def test_a_tutor_channel_study_sends_nothing_from_the_other_channels(harness, study):
    body = _tutor_with_a_pick(harness, study, "on", channels="remediation,feedback")
    fake = harness.use({"tokens": ["ok"]})
    harness.client.post("/api/ai/tutor/stream", json=body)
    assert "MISCONCEPTION" not in fake.calls[0]["messages"][-1]["content"]


def test_off_mode_records_no_misconception_context(harness, study):
    study("off")
    fake = harness.use({"tokens": ["ok"]})
    harness.client.post("/api/ai/tutor/stream", json=_body(harness))
    assert "MISCONCEPTION" not in fake.calls[0]["messages"][-1]["content"]
    assert harness.db.query(TutorTurn).one().misconception_context is None


# ── QUESTION_SOURCE=authored: every option a student can pick is labelable ─────

def _played_at(level):
    return {op: {"type_unlocked": 3, "active_type_level": level, "attempts": 0} for op in TEMPLATES}


@pytest.mark.parametrize("level,qtype", [(2, "find_bug"), (3, "ordering")])
def test_authored_source_serves_every_op_without_the_pool_or_the_model(db, monkeypatch, level, qtype):
    from app.services import claude_service, game_master as gm, question_pool
    from tests.mastery_helpers import Student

    def forbidden(*a, **kw):
        raise AssertionError("pool or model used under QUESTION_SOURCE=authored")

    monkeypatch.setattr(settings, "question_source", "authored")
    monkeypatch.setattr(question_pool, "serve", forbidden)
    monkeypatch.setattr(claude_service, "_call_model", forbidden)
    uid = Student(db).uid
    for op in TEMPLATES:
        q = gm._generate_untracked(op, "engaged", _played_at(level), intra_difficulty=2, db=db, user_id=uid)
        assert q["question_type"] == qtype, op
        assert not str(q.get("variant") or "").startswith("pool:"), op


def test_the_default_source_still_serves_the_pool(db, monkeypatch):
    from app.services import game_master as gm, question_pool
    from tests.mastery_helpers import Student
    row = {"id": "pool-row", "operation": "reverseList", "question_type": "find_bug"}
    monkeypatch.setattr(question_pool, "serve", lambda *a, **kw: dict(row))
    q = gm._generate_untracked("reverseList", "engaged", _played_at(2), intra_difficulty=2,
                               db=db, user_id=Student(db).uid)
    assert q["id"] == "pool-row"


def test_authored_source_never_counts_a_pool_row_as_a_remediation_target(db, monkeypatch):
    from app.services import question_pool
    monkeypatch.setattr(mc, "authored_target_exists", lambda *a: False)
    monkeypatch.setattr(question_pool, "can_serve_targeted", lambda *a: True)
    assert mm.can_target(db, "u", "removeAtPosition", "find_bug", "stop-on-target")
    monkeypatch.setattr(settings, "question_source", "authored")
    assert not mm.can_target(db, "u", "removeAtPosition", "find_bug", "stop-on-target")


def test_a_mistyped_question_source_refuses_to_start():
    from pydantic import ValidationError
    from app.config import Settings
    with pytest.raises(ValidationError):
        Settings(question_source="authord", _env_file=None)
    assert Settings(question_source=" Authored ", _env_file=None).authored_only
