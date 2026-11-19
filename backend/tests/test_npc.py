"""Teach Quinn (services/npc_agent.py): what Quinn knows is code state, and
only execution decides whether an explanation taught Quinn anything.
The model is faked throughout — these tests cost nothing."""
import random
import uuid
from types import SimpleNamespace

import pytest

from app.config import settings
from app.models import Mastery, MisconceptionEvent, NpcCase, NpcEvent, User
from app.services import item_quality, npc_agent as npc, pseudo_exec as px
from app.services import misconceptions as mc
from app.services.static_questions import TEMPLATES

OPS = list(TEMPLATES)


# ── fakes ──────────────────────────────────────────────────────────────────────

class _FakeClient:
    """messages.create returns the queued replies in order (an Exception is raised)."""

    def __init__(self, *replies):
        self.replies = list(replies)
        self.calls = []
        self.messages = self

    def create(self, **kw):
        self.calls.append(kw)
        r = self.replies.pop(0) if self.replies else "Okay!"
        if isinstance(r, Exception):
            raise r
        return SimpleNamespace(content=[SimpleNamespace(type="text", text=r)], stop_reason="end_turn",
                               usage=SimpleNamespace(input_tokens=10, output_tokens=5))


@pytest.fixture()
def fake(monkeypatch):
    client = _FakeClient()
    monkeypatch.setattr(npc, "_client", lambda: client)
    return client


@pytest.fixture()
def user(db):
    u = User(id=str(uuid.uuid4()), email=f"{uuid.uuid4().hex[:8]}@t.io", username="s", password_hash="x")
    db.add(u)
    db.commit()
    return u


def _learned(db, uid, *ops):
    for op in ops:
        db.add(Mastery(user_id=uid, module_id="singly", operation=op, type_unlocked=3,
                       active_type_level=3, best_perfect_type=2))
    db.commit()


def _case(db, uid, op, held, seed=0):
    """A case with chosen content (start_case draws at random)."""
    rng = random.Random(seed)
    case = NpcCase(user_id=uid, operation=op, held_initial=list(held), held=list(held),
                   program=npc.program_for(op, held), changed=[], choices=npc.choices_for(rng, op, held),
                   tried=[], tests=[], coach={}, policy="test", status="open", n_wrong=0,
                   npc_version=npc.NPC_VERSION)
    db.add(case)
    db.commit()
    return case


def _break(db, case):
    """Run the simplest board that makes Quinn's code fail."""
    b = npc.simplest_failing(case.operation, case.program)
    npc.run_test(db, case, npc.board_dict(b))
    return b


def _choice(case, mid):
    return next(c["id"] for c in case.choices if c["mid"] == mid)


# ── the board space ────────────────────────────────────────────────────────────

@pytest.mark.parametrize("op", OPS)
def test_the_template_is_right_on_every_board_a_student_can_build(op):
    tmpl = TEMPLATES[op]["pseudocode"]
    bad = [b for b in npc.probe_boards(op) if not px.judge(op, tmpl, b).correct]
    assert not bad, f"{op}: board spec allows boards the template gets wrong: {bad[:2]}"


@pytest.mark.parametrize("op", OPS)
def test_hidden_tests_are_boards_the_student_could_have_built(op):
    for b in item_quality.boards(op):
        assert npc.parse_board(op, npc.board_dict(b)) == b


@pytest.mark.parametrize("op", OPS)
def test_every_misconception_can_be_shown_by_a_buildable_board(op):
    for m in mc.applicable(op):
        assert npc.simplest_failing(op, npc.program_for(op, [m.id])) is not None, (op, m.id)


@pytest.mark.parametrize("raw, msg", [
    ({"values": [10]}, "2 to 6"),                                   # removeAtTail needs 2+
    ({"values": [10, 10]}, "different values"),
    ({"values": [10, 200]}, "1 to 99"),
    ({"values": "10,20"}, "list of numbers"),
])
def test_boards_outside_the_precondition_are_refused(raw, msg):
    with pytest.raises(npc.BoardError, match=msg):
        npc.parse_board("removeAtTail", raw)


def test_position_merge_and_cycle_boards_are_checked():
    with pytest.raises(npc.BoardError, match="index"):
        npc.parse_board("removeAtPosition", {"values": [1, 2, 3], "index": 3})   # index ≤ len-1
    assert npc.parse_board("insertAtPosition", {"values": [1, 2], "value": 5, "index": 2}).index == 2
    with pytest.raises(npc.BoardError, match="sorted"):
        npc.parse_board("mergeSortedLists", {"values": [3, 1], "l2": []})
    with pytest.raises(npc.BoardError, match="links back"):
        npc.parse_board("detectCycle", {"values": [1, 2], "cycle_to": 2})
    assert npc.parse_board("detectCycle", {"values": [1, 2], "cycle_to": 0}).cycle_to == 0


# ── Quinn's program ────────────────────────────────────────────────────────────

@pytest.mark.parametrize("op", OPS)
def test_quinn_holding_one_misconception_writes_its_canonical_mutant(op):
    for m in mc.applicable(op):
        assert npc.program_for(op, [m.id]) == mc.mutant_program(op, m.id)
    assert npc.program_for(op, []) == TEMPLATES[op]["pseudocode"]


def test_two_misconceptions_come_apart_one_at_a_time():
    pairs = [(op, a, b) for op in OPS for a in mc.applicable(op) for b in mc.applicable(op)
             if npc.compatible(op, a.id, b.id)]
    assert pairs, "no operation lets Quinn hold two misconceptions"
    for op, a, b in pairs:
        both = npc.program_for(op, [a.id, b.id])
        assert npc.adjudicate(op, [a.id, b.id], npc.program_for(op, [b.id])) == ("fixed", a.id)
        assert npc.adjudicate(op, [a.id, b.id], npc.program_for(op, [a.id])) == ("fixed", b.id)
        assert npc.adjudicate(op, [a.id, b.id], TEMPLATES[op]["pseudocode"]) == ("overfix", None)
        assert npc.adjudicate(op, [a.id, b.id], both) == ("no_change", None)


def test_a_fixed_swap_highlights_both_lines():
    old = npc.program_for("removeAtHead", ["free-before-unlink"])
    assert npc.changed_lines(old, TEMPLATES["removeAtHead"]["pseudocode"]) == [1, 2]
    old = npc.program_for("removeAtTail", ["forget-free"])          # a deleted line comes back
    assert npc.changed_lines(old, TEMPLATES["removeAtTail"]["pseudocode"]) == [4]


def test_display_round_trips_the_payload():
    lines = TEMPLATES["insertAtHead"]["pseudocode"]
    shown = npc.display(lines)
    assert "newNode = createNode(value);" in shown
    assert [npc.undisplay(s) for s in shown] == lines
    assert npc.undisplay("if (l1.value <= l2.value) x = value;") == "if (l1.value <= l2.value) x = {value};"


def test_edits_use_the_original_line_numbers():
    lines = ["a;", "b;", "c;"]
    assert npc.apply_edits(lines, [{"action": "replace", "line": 2, "code": "B;"}]) == ["a;", "B;", "c;"]
    assert npc.apply_edits(lines, [{"action": "delete", "line": 1},
                                   {"action": "insert_after", "line": 3, "code": "d;"}]) == ["b;", "c;", "d;"]
    assert npc.apply_edits(lines, [{"action": "insert_after", "line": 0, "code": "z;"}])[0] == "z;"
    assert npc.apply_edits(lines, [{"action": "swap", "line": 1, "with": 3}]) == ["c;", "b;", "a;"]
    assert npc.apply_edits(lines, [{"action": "replace", "line": 9, "code": "x;"}]) is None
    assert npc.apply_edits(lines, [{"action": "rewrite_everything"}]) is None


# ── choices ────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("op", OPS)
def test_choices_hold_the_answer_and_no_second_answer(op):
    rng = random.Random(3)
    for m in mc.applicable(op):
        ch = npc.choices_for(rng, op, [m.id])
        mids = [c["mid"] for c in ch]
        assert len(mids) == npc.N_CHOICES == len(set(mids)) and m.id in mids
        assert not (set(mids) - {m.id}) & npc.related(m.id), (op, m.id, mids)
        distract = [d for d in mids if d != m.id]
        for i, d in enumerate(distract):
            assert not re_corrections_overlap(d, m.id)
            assert not set(distract[i + 1:]) & npc.related(d), f"near-synonym distractors {mids}"


def re_corrections_overlap(a: str, b: str) -> bool:
    return mc.CATALOG[a].correction == mc.CATALOG[b].correction


def test_related_explanations_are_never_offered_against_each_other():
    assert {"stop-too-early", "walk-off-end", "double-step"} <= npc.related("stop-on-target")
    assert "advance-after-free" in npc.related("free-before-unlink")


def test_a_removal_gets_removal_distractors_before_insertion_ones():
    ch = npc.choices_for(random.Random(1), "removeAtHead", ["free-wrong-node"])
    insertion_only = {m for m in mc.CATALOG
                      if set(mc.CATALOG[m].mutants) <= {"insertAtHead", "insertIntoEmpty", "insertAtPosition"}}
    assert not {c["mid"] for c in ch} & insertion_only


# ── choosing a case ────────────────────────────────────────────────────────────

def test_a_student_who_learned_nothing_gets_unit_one(db, user):
    assert npc.eligible_ops(db, user.id) == (list(npc.FALLBACK_OPS), False)


def test_cases_come_only_from_learned_operations(db, user):
    _learned(db, user.id, "removeAtTail", "reverseList")
    ops, learned = npc.eligible_ops(db, user.id)
    assert learned and ops == ["removeAtTail", "reverseList"]
    for seed in range(30):
        op, held = npc.choose_case(random.Random(seed), ops, [], solved_before=3)
        assert op in ops and all(op in mc.CATALOG[m].mutants for m in held) and 1 <= len(held) <= 2


def test_recent_cases_are_not_repeated_when_avoidable():
    recent = [("removeAtHead", m.id) for m in mc.applicable("removeAtHead")[:2]]
    for seed in range(20):
        op, held = npc.choose_case(random.Random(seed), ["removeAtHead"], recent, 0)
        assert (op, held[0]) not in recent


def test_start_resumes_the_open_case_unless_fresh(db, user):
    a = npc.start_case(db, user.id, rng=random.Random(1))
    assert npc.start_case(db, user.id).id == a.id
    b = npc.start_case(db, user.id, fresh=True, rng=random.Random(2))
    assert b.id != a.id and db.get(NpcCase, a.id).status == "abandoned"
    assert db.query(NpcEvent).filter_by(case_id=b.id, kind="start").count() == 1


# ── teaching with the choice cards ─────────────────────────────────────────────

def test_explaining_needs_a_failing_test_first(db, user, fake):
    case = _case(db, user.id, "removeAtTail", ["stop-on-target"])
    with pytest.raises(npc.BoardError, match="first run a test"):
        npc.explain(db, case, choice_id=_choice(case, "stop-on-target"))
    npc.run_test(db, case, {"values": [10, 20, 30]})
    assert npc.state(db, case)["can_explain"]


def test_the_right_explanation_fixes_quinn_and_execution_agrees(db, user, fake, monkeypatch):
    monkeypatch.setattr(settings, "misconception_mode", "shadow")
    case = _case(db, user.id, "removeAtTail", ["stop-on-target"])
    _break(db, case)
    fake.replies = ["Oh! I should stop one node sooner. Thanks so much!"]
    last = npc.explain(db, case, choice_id=_choice(case, "stop-on-target"))
    assert last == {"kind": "explain", "verdict": "fixed", "solved": True}
    assert case.program == TEMPLATES["removeAtTail"]["pseudocode"] and case.changed == [1]
    st = npc.state(db, case)
    assert st["hidden"]["failing"] == 0 and all(t["result"]["passed"] for t in st["tests"])
    assert st["messages"][-2]["text"].startswith("Oh!")                    # the model's line passed the guard
    ev = db.query(MisconceptionEvent).filter_by(user_id=user.id, kind="taught").one()
    assert ev.misconception_id == "stop-on-target" and ev.question_id == f"npc:{case.id}"


def test_a_failing_diagnosis_write_never_undoes_quinns_fix(db, user, fake, monkeypatch):
    """record_taught rolls back when it fails; the case (and the event saying it
    was fixed) must already be committed by then."""
    from app.services import misconception_model
    monkeypatch.setattr(settings, "misconception_mode", "shadow")

    def boom(*a, **kw):
        raise RuntimeError("db hiccup")
    monkeypatch.setattr(misconception_model, "_apply", boom)
    case = _case(db, user.id, "removeAtTail", ["stop-on-target"])
    _break(db, case)
    assert npc.explain(db, case, choice_id=_choice(case, "stop-on-target"))["verdict"] == "fixed"
    db.expire_all()
    again = db.get(NpcCase, case.id)
    assert again.status == "solved" and again.held == []
    ev = db.query(NpcEvent).filter_by(case_id=case.id, kind="explain").one()
    assert ev.payload["verdict"] == "fixed"
    assert db.query(MisconceptionEvent).filter_by(user_id=user.id, kind="taught").count() == 0


def test_a_wrong_explanation_changes_nothing_and_cannot_be_reused(db, user, fake):
    case = _case(db, user.id, "removeAtTail", ["stop-on-target"])
    _break(db, case)
    before = list(case.program)
    wrong = next(c["id"] for c in case.choices if c["mid"] != "stop-on-target")
    assert npc.explain(db, case, choice_id=wrong)["verdict"] == "unchanged"
    assert case.program == before and case.n_wrong == 1
    with pytest.raises(npc.BoardError, match="already"):
        npc.explain(db, case, choice_id=wrong)
    assert [c["state"] for c in npc.state(db, case)["choices"] if c["id"] == wrong] == ["tried"]


def test_a_misconception_that_another_one_hides_is_never_paired_with_it():
    # standing ON the last node, temp is NULL: forgetting free(temp) changes nothing anyone can see
    assert not npc.compatible("removeAtTail", "stop-on-target", "forget-free")
    assert npc.compatible("removeAtTail", "stop-on-target", "free-wrong-node")


def test_with_two_misconceptions_only_the_explained_one_is_fixed(db, user, fake):
    case = _case(db, user.id, "removeAtTail", ["stop-on-target", "free-wrong-node"])
    _break(db, case)
    assert npc.explain(db, case, choice_id=_choice(case, "free-wrong-node"))["verdict"] == "fixed"
    assert case.held == ["stop-on-target"] and case.status == "open"
    assert case.program == npc.program_for("removeAtTail", ["stop-on-target"])
    assert npc.state(db, case)["hidden"]["failing"] > 0


def test_quinn_reveals_what_it_was_thinking_only_after_two_wrong_tries(db, user, fake):
    case = _case(db, user.id, "removeAtTail", ["stop-on-target"])
    _break(db, case)
    wrong = [c["id"] for c in case.choices if c["mid"] != "stop-on-target"]
    npc.explain(db, case, choice_id=wrong[0])
    assert "WHAT YOU WERE THINKING" not in fake.calls[-1]["messages"][0]["content"]
    npc.explain(db, case, choice_id=wrong[1])
    assert mc.CATALOG["stop-on-target"].belief in fake.calls[-1]["messages"][0]["content"]


# ── Quinn's voice: the guard ───────────────────────────────────────────────────

def test_a_reply_with_code_is_regenerated_then_replaced(db, user, fake):
    case = _case(db, user.id, "removeAtTail", ["stop-on-target"])
    _break(db, case)
    fake.replies = ["Use curr.next.next instead!", "Write while (curr.next != NULL) ..."]
    npc.explain(db, case, choice_id=_choice(case, "stop-on-target"))
    ev = db.query(NpcEvent).filter_by(case_id=case.id, kind="explain").one()
    assert ev.payload["voice"]["guard_rejections"] == 2 and ev.payload["voice"]["source"] == "fallback"
    assert ev.payload["npc"].startswith("It passes everything now")
    assert len(fake.calls) == 2


@pytest.mark.parametrize("text, ok", [
    ("Oh, I see — I was stopping on the last node itself!", True),
    ("I should write head = head.next first.", False),
    ("Maybe free(temp) goes last?", False),
    ("So curr.next is the one to change?", False),
    ("That's index - 1 steps then.", False),
    ("Hmm; I wasn't expecting a crash.", True),
])
def test_the_guard_reads_code_not_words(text, ok):
    assert npc.voice_ok("removeAtTail", text) is ok


def test_the_template_itself_never_gets_through():
    assert not npc.voice_ok("removeAtTail", "Like temp   = curr.next; you mean?")


def test_a_failed_model_call_falls_back_and_a_rate_limited_one_skips_the_model(fake):
    fake.replies = [RuntimeError("overloaded")]
    text, meta = npc.voice("removeAtTail", "facts", "ask", "FALLBACK")
    assert (text, meta["source"], meta["error"]) == ("FALLBACK", "fallback", "RuntimeError")
    n = len(fake.calls)
    text, meta = npc.voice("removeAtTail", "facts", "ask", "FALLBACK", allowed=False)
    assert text == "FALLBACK" and meta["source"] == "rate_limited" and len(fake.calls) == n


# ── free text (phase 5): execution adjudicates the translated edit ─────────────

def test_a_targeted_explanation_in_words_fixes_quinn(db, user, fake, monkeypatch):
    case = _case(db, user.id, "removeAtTail", ["stop-on-target"])
    _break(db, case)
    edit = [{"action": "replace", "line": 2, "code": "while (curr.next.next != NULL) curr = curr.next;"}]
    monkeypatch.setattr(npc, "translate", lambda op, prog, text: (edit, {"ok": True}))
    assert npc.explain(db, case, text="stop on the second to last node")["verdict"] == "fixed"
    assert case.status == "solved"


def test_an_equivalent_but_different_fix_is_accepted_and_tidied(db, user, fake, monkeypatch):
    case = _case(db, user.id, "removeAtTail", ["stop-on-target"])
    _break(db, case)
    edit = [{"action": "replace", "line": 2,
             "code": "while (curr.next != NULL && curr.next.next != NULL) curr = curr.next;"}]
    monkeypatch.setattr(npc, "translate", lambda op, prog, text: (edit, {"ok": True}))
    assert npc.explain(db, case, text="stop one before")["verdict"] == "fixed"
    assert case.program == TEMPLATES["removeAtTail"]["pseudocode"]


@pytest.mark.parametrize("edits, verdict", [
    ([], "not_understood"),                                                     # "just fix it"
    (None, "not_understood"),                                                   # the model failed
    ([{"action": "replace", "line": 5, "code": "free(curr);"}], "wrong"),       # breaks something new
    ([{"action": "replace", "line": 1, "code": "curr = head;"}], "no_change"),
])
def test_vague_wrong_or_empty_explanations_teach_nothing(db, user, fake, monkeypatch, edits, verdict):
    case = _case(db, user.id, "removeAtTail", ["stop-on-target"])
    _break(db, case)
    before = list(case.program)
    monkeypatch.setattr(npc, "translate", lambda op, prog, text: (edits, {"ok": edits is not None}))
    assert npc.explain(db, case, text="fix it")["verdict"] == verdict
    assert case.program == before and case.held == ["stop-on-target"]


def test_fixing_both_bugs_from_one_explanation_is_refused(db, user, fake, monkeypatch):
    case = _case(db, user.id, "removeAtTail", ["stop-on-target", "free-wrong-node"])
    _break(db, case)
    full = TEMPLATES["removeAtTail"]["pseudocode"]
    edits = [{"action": "replace", "line": 2, "code": full[1]},
             {"action": "replace", "line": 5, "code": full[4]}]
    monkeypatch.setattr(npc, "translate", lambda op, prog, text: (edits, {"ok": True}))
    assert npc.explain(db, case, text="stop earlier and free temp")["verdict"] == "overfix"
    assert sorted(case.held) == ["free-wrong-node", "stop-on-target"]


def test_translate_reads_the_models_json(fake):
    fake.replies = ['Sure: {"edits": [{"action": "delete", "line": 3}]}']
    edits, meta = npc.translate("removeAtTail", TEMPLATES["removeAtTail"]["pseudocode"], "x")
    assert edits == [{"action": "delete", "line": 3}] and meta["ok"]
    fake.replies = ["no json here"]
    assert npc.translate("removeAtTail", TEMPLATES["removeAtTail"]["pseudocode"], "x")[0] is None


# ── the coach ──────────────────────────────────────────────────────────────────

def test_the_coach_first_says_how_to_think_then_what_to_try(db, user):
    case = _case(db, user.id, "insertAtTail", ["start-past-head"])       # only a 1-node list shows it
    npc.coach(db, case)
    npc.coach(db, case)
    hints = [e.payload["hint"] for e in db.query(NpcEvent).filter_by(case_id=case.id, kind="coach").order_by(NpcEvent.at)]
    assert "predict" in hints[0] and hints[1] == "Try a list of 1 node."


def test_the_coach_points_at_the_line_once_a_test_fails(db, user):
    case = _case(db, user.id, "removeAtTail", ["stop-on-target"])
    _break(db, case)
    npc.coach(db, case)
    npc.coach(db, case)
    last = db.query(NpcEvent).filter_by(case_id=case.id, kind="coach").order_by(NpcEvent.at.desc()).first()
    assert "line 2" in last.payload["hint"]


def test_line_hints_follow_shifted_lines():
    # forget-free deletes the last line; nothing before it moves
    assert "after line 4" in npc.line_hint("removeAtTail", ["forget-free"], "forget-free")
    assert "lines 2 and 3" in npc.line_hint("insertAtHead", ["move-before-link"], "move-before-link")


# ── HTTP ───────────────────────────────────────────────────────────────────────

def _http(db, user):
    from fastapi.testclient import TestClient
    from app.database import get_db
    from app.dependencies import get_current_user
    from app.main import app
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: user
    return TestClient(app), app


def test_the_elective_is_off_unless_enabled(db, user, monkeypatch):
    monkeypatch.setattr(settings, "npc_enabled", False)
    client, app = _http(db, user)
    try:
        assert client.get("/api/npc/status").json()["enabled"] is False
        assert client.post("/api/npc/case", json={}).status_code == 404
    finally:
        app.dependency_overrides.clear()


def test_a_whole_case_over_http(db, user, fake, monkeypatch):
    monkeypatch.setattr(settings, "npc_enabled", True)
    client, app = _http(db, user)
    try:
        st = client.post("/api/npc/case", json={}).json()
        assert st["status"] == "open" and st["operation"] in npc.FALLBACK_OPS and st["code"]
        assert "held" not in st and all(set(c) == {"id", "text", "state"} for c in st["choices"])
        case = db.get(NpcCase, st["id"])
        b = npc.simplest_failing(case.operation, case.program)
        r = client.post(f"/api/npc/case/{st['id']}/test", json=npc.board_dict(b))
        assert r.status_code == 200 and r.json()["can_explain"]
        bad = client.post(f"/api/npc/case/{st['id']}/test", json={"values": list(range(1, 30))})
        assert bad.status_code == 422 and "nodes" in bad.json()["detail"]
        right = _choice(case, case.held[0])
        fake.replies = ["Got it, thanks!"]
        done = client.post(f"/api/npc/case/{st['id']}/explain", json={"choice_id": right}).json()
        if done["status"] == "solved":
            assert done["messages"][-1]["text"].endswith("Case solved!")
        assert client.get("/api/npc/case").json()["learned"] is False
    finally:
        app.dependency_overrides.clear()


def test_another_students_case_is_not_found(db, user, monkeypatch):
    monkeypatch.setattr(settings, "npc_enabled", True)
    other = User(id=str(uuid.uuid4()), email="o@t.io", username="o", password_hash="x")
    db.add(other)
    db.commit()
    case = _case(db, other.id, "removeAtHead", ["forget-free"])
    client, app = _http(db, user)
    try:
        assert client.post(f"/api/npc/case/{case.id}/coach").status_code == 404
    finally:
        app.dependency_overrides.clear()


# Value: protects=explain with no choice and blank text is a 422 that never reaches the model or logs an event; fails_when=route stops validating and sends "" to translate; why_new=HTTP tests only send a choice_id; seam=none; no_claim=free-text adjudication quality
def test_an_empty_explanation_is_rejected_before_the_model(db, user, fake, monkeypatch):
    monkeypatch.setattr(settings, "npc_enabled", True)
    case = _case(db, user.id, "removeAtHead", ["forget-free"])
    _break(db, case)
    before = db.query(NpcEvent).filter(NpcEvent.case_id == case.id, NpcEvent.kind == "explain").count()
    client, app = _http(db, user)
    try:
        for body in ({}, {"text": "   "}, {"choice_id": None, "text": ""}):
            r = client.post(f"/api/npc/case/{case.id}/explain", json=body)
            assert r.status_code == 422
    finally:
        app.dependency_overrides.clear()
    assert fake.calls == []
    assert db.query(NpcEvent).filter(NpcEvent.case_id == case.id, NpcEvent.kind == "explain").count() == before


# Value: protects=an unexpected NPC failure returns 500 GENERIC_ERROR, never the exception text; fails_when=_run leaks str(e) or lets the exception escape; why_new=only BoardError (422) is tested over HTTP; seam=none; no_claim=logging content
def test_an_unexpected_failure_shows_only_the_generic_error(db, user, monkeypatch):
    monkeypatch.setattr(settings, "npc_enabled", True)
    case = _case(db, user.id, "removeAtHead", ["forget-free"])

    def boom(*a, **k):
        raise RuntimeError("secret internal detail")

    monkeypatch.setattr(npc, "coach", boom)
    client, app = _http(db, user)
    try:
        r = client.post(f"/api/npc/case/{case.id}/coach")
    finally:
        app.dependency_overrides.clear()
    assert r.status_code == 500
    from app.routes import npc as npc_route
    assert r.json()["detail"] == npc_route.GENERIC_ERROR
    assert "secret" not in r.text
