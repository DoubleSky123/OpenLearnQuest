"""The classroom study (services/study.py, routes/study.py, study_tool.py).

consent -> pre-test -> stored, stratified assignment -> practice -> post /
delayed. Tests are judged on the server, the client never sees the answer, a
student who declines plays normally and is never exported.
"""
import csv
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user
from app.main import app
from app.models import GameSession, QuizAttempt, QuizResponse, ServedItem, StudyParticipant, User
from app.services import curriculum, misconception_model as mm, quiz_bank as qb, study


@pytest.fixture()
def on(monkeypatch):
    monkeypatch.setattr(settings, "study_enabled", True)
    monkeypatch.setattr(settings, "study_tests", "pre")
    monkeypatch.setattr(settings, "study_design", "between")
    monkeypatch.setattr(settings, "misconception_mode", "ab")

    def set_(**kw):
        for k, v in kw.items():
            monkeypatch.setattr(settings, k, v)
    return set_


def _user(db, n=0, admin=False):
    u = User(email=f"s{n}@example.com", username=f"student{n}", password_hash="x", is_admin=admin)
    db.add(u)
    db.commit()
    return u


@pytest.fixture()
def http(db):
    who = {"user": _user(db, 99)}
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: who["user"]
    yield SimpleNamespace(db=db, client=TestClient(app), who=who)
    app.dependency_overrides.clear()


def _take(db, user, kind, right=None):
    """Answer every item of `kind`: the first `right` items correctly (all if None)."""
    a = study.start_test(db, user, kind)
    view = study.view(db, a)
    for k, it in enumerate(view["items"]):
        item = qb.by_id()[it["id"]]
        good = right is None or k < right
        pick = next(o["id"] for o in item["options"] if o["correct"] == good)
        study.answer(db, user, kind, it["id"], pick, 1000)
    study.submit(db, user, kind)
    return a


# ── off: nothing changes ───────────────────────────────────────────────────────

def test_off_the_study_is_invisible(http):
    assert http.client.get("/api/study/status").json() == {"enabled": False, "step": None}
    assert http.client.post("/api/study/consent", json={"agreed": True}).status_code == 404
    assert not study.blocks_practice(http.db, http.who["user"])


# ── consent ────────────────────────────────────────────────────────────────────

def test_consent_comes_first_and_practice_waits(http, on):
    step = http.client.get("/api/study/status").json()["step"]
    assert step["step"] == "consent" and step["consent"]["paragraphs"]
    r = http.client.post("/api/gm/session/start", json={"module_id": "singly", "mode": "stress-free"})
    assert r.status_code == 409


def test_declining_means_normal_play_no_tests_no_arm(http, on):
    r = http.client.post("/api/study/consent", json={"agreed": False})
    assert r.json()["step"] is None
    u = http.who["user"]
    assert not study.blocks_practice(http.db, u)
    assert mm.arm(u.id, db=http.db, operation="insertAtHead") is None
    assert not mm.targeting(u.id, "tutor", db=http.db, operation="insertAtHead")
    assert http.client.post("/api/study/test/pre/start").status_code == 409


def test_agreeing_leads_to_the_pretest_and_keeps_only_listed_background(http, on):
    r = http.client.post("/api/study/consent", json={
        "agreed": True, "background": {"programming_experience": "Less than 6 months",
                                       "linked_lists_before": "maybe?", "email": "x@y"}})
    assert r.json()["step"] == {"step": "test", "kind": "pre"}
    p = study.participant(http.db, http.who["user"].id)
    assert p.background == {"programming_experience": "Less than 6 months"}
    assert p.pre_form in ("A", "B")


def test_a_new_consent_version_asks_again(db, on, monkeypatch):
    u = _user(db)
    study.record_consent(db, u.id, True)
    assert study.next_step(db, u)["step"] == "test"
    monkeypatch.setattr(study, "consent_version", lambda: "v2")
    assert study.next_step(db, u)["step"] == "consent"


# ── the tests ──────────────────────────────────────────────────────────────────

def test_the_pretest_never_shows_answers_and_is_judged_on_the_server(http, on):
    http.client.post("/api/study/consent", json={"agreed": True})
    view = http.client.post("/api/study/test/pre/start").json()
    assert view["n_items"] == len(view["items"]) == len(qb.form_items("A"))
    for it in view["items"]:
        assert set(it) == {"id", "prompt", "question", "setup", "options"}
        assert all(set(o) == {"id", "lines"} for o in it["options"])
    item = qb.by_id()[view["items"][0]["id"]]
    wrong = next(o for o in item["options"] if not o["correct"])
    r = http.client.post("/api/study/test/pre/answer",
                         json={"item_id": item["id"], "option_id": wrong["id"], "time_ms": 4000, "correct": True})
    assert r.status_code == 200
    resp = http.db.query(QuizResponse).one()
    assert resp.correct is False and resp.misconception == wrong["misconception"]   # the client's "correct" is ignored


def test_answers_are_checked_against_the_students_own_test(http, on):
    http.client.post("/api/study/consent", json={"agreed": True})
    view = http.client.post("/api/study/test/pre/start").json()
    mine = {it["id"] for it in view["items"]}
    other = next(it["id"] for it in qb.load() if it["id"] not in mine)
    assert http.client.post("/api/study/test/pre/answer",
                            json={"item_id": other, "option_id": "x"}).status_code == 409
    assert http.client.post("/api/study/test/pre/answer",
                            json={"item_id": view["items"][0]["id"], "option_id": "nope"}).status_code == 409


def test_a_test_resumes_and_a_changed_answer_is_counted(db, on):
    u = _user(db)
    study.record_consent(db, u.id, True)
    a1 = study.start_test(db, u, "pre")
    item = qb.by_id()[a1.items[0]["item"]]
    first, second = item["options"][0]["id"], item["options"][1]["id"]
    study.answer(db, u, "pre", item["id"], first, 1000)
    a2 = study.start_test(db, u, "pre")
    assert a2.id == a1.id and study.view(db, a2)["answers"] == {item["id"]: first}
    study.answer(db, u, "pre", item["id"], second, 500)
    r = db.query(QuizResponse).one()
    assert r.option_id == second and r.changes == 1 and r.time_ms == 1500


def test_submitting_the_pretest_assigns_once_and_opens_practice(db, on):
    u = _user(db)
    study.record_consent(db, u.id, True)
    _take(db, u, "pre", right=10)
    p = study.participant(db, u.id)
    a = study.attempt(db, u.id, "pre")
    assert a.n_correct == 10 and p.pre_score == pytest.approx(10 / a.n_items, abs=1e-4)   # stored to 4 places
    assert p.sequence in ("targeted", "control") and p.stratum == study.stratum_of(p.pre_score)
    assert study.next_step(db, u) is None and not study.blocks_practice(db, u)
    seq = p.sequence
    study.submit(db, u, "pre")                                   # idempotent
    assert study.participant(db, u.id).sequence == seq
    with pytest.raises(study.StudyError):
        study.answer(db, u, "pre", a.items[0]["item"], "x", 1)  # closed


def test_post_uses_the_other_form_and_delayed_the_first(db, on):
    u = _user(db)
    study.record_consent(db, u.id, True)
    pre = _take(db, u, "pre")
    on(study_tests="pre,post")
    assert study.next_step(db, u) == {"step": "test", "kind": "post"}
    assert study.blocks_practice(db, u)
    post = _take(db, u, "post")
    on(study_tests="pre,post,delayed")
    delayed = _take(db, u, "delayed")
    assert pre.form != post.form and delayed.form == pre.form
    assert study.next_step(db, u) is None


def test_a_test_can_not_be_started_out_of_turn(db, on):
    u = _user(db)
    study.record_consent(db, u.id, True)
    on(study_tests="pre,post")
    with pytest.raises(study.StudyError):
        study.start_test(db, u, "post")                          # pre comes first


# ── assignment ─────────────────────────────────────────────────────────────────

def test_assignment_is_balanced_within_each_pretest_band(db, on):
    scores = [0.1, 0.2, 0.3, 0.6, 0.7, 0.9, 0.95, 0.4, 0.55, 0.85, 0.15, 0.65, 1.0, 0.0, 0.75, 0.82, 0.45]
    for k, s in enumerate(scores * 2):
        u = _user(db, k)
        p = study._ensure(db, u.id)
        p.consented = True
        study.assign(db, p, s)
        db.commit()
    for band, _ in study.STRATA:
        arms = [p.sequence for p in db.query(StudyParticipant).filter_by(stratum=band)]
        assert abs(arms.count("targeted") - arms.count("control")) <= 1, band
    ps = db.query(StudyParticipant).all()
    assert all(p.assign_detail and "counts_before" in p.assign_detail for p in ps)


def test_pretest_forms_are_balanced_too(db, on):
    forms = [study.record_consent(db, _user(db, k).id, True).pre_form for k in range(10)]
    assert forms.count("A") == forms.count("B") == 5


def test_crossover_alternates_the_arm_by_unit(db, on):
    on(study_design="crossover")
    u = _user(db)
    p = study._ensure(db, u.id)
    p.consented = True
    study.assign(db, p, 0.5)
    db.commit()
    arms = [study.arm_for(db, u.id, unit.ops[0]) for unit in curriculum.UNITS]
    assert p.sequence in ("targeted-first", "control-first")
    first = "targeted" if p.sequence == "targeted-first" else "control"
    other = "control" if first == "targeted" else "targeted"
    assert arms == [first, other, first, other, first]
    # the tutor channel follows the unit
    for unit, arm in zip(curriculum.UNITS, arms):
        assert mm.targeting(u.id, "tutor", db=db, operation=unit.ops[-1]) == (arm == "targeted")


def test_the_served_item_records_the_arm_of_its_unit(db, on, monkeypatch):
    on(study_design="crossover")
    u = _user(db)
    p = study._ensure(db, u.id)
    p.consented, p.sequence, p.design = True, "targeted-first", "crossover"
    db.commit()
    mm.record_served(db, u.id, {"id": "q-unit1", "operation": "insertAtHead", "question_type": "fill_blank"})
    mm.record_served(db, u.id, {"id": "q-unit2", "operation": "removeAtTail", "question_type": "fill_blank"})
    arms = {s.question_id: s.arm for s in db.query(ServedItem)}
    assert arms == {"q-unit1": "targeted", "q-unit2": "control"}


def test_in_a_study_the_arm_needs_the_database(on):
    with pytest.raises(ValueError):
        mm.arm("someone", operation="insertAtHead")


# ── the researcher's side ──────────────────────────────────────────────────────

def test_the_summary_is_admin_only(http, on):
    assert http.client.get("/api/study/admin/summary").status_code == 403
    http.who["user"] = _user(http.db, 7, admin=True)
    body = http.client.get("/api/study/admin/summary").json()
    assert body["enabled"] and body["bank_items"] == len(qb.load())


def test_export_has_consented_students_only_and_no_names(db, on, monkeypatch, tmp_path):
    import study_tool
    yes, no = _user(db, 1), _user(db, 2)
    study.record_consent(db, yes.id, True, {"linked_lists_before": "Yes"})
    study.record_consent(db, no.id, False)
    _take(db, yes, "pre", right=5)
    monkeypatch.setattr(study_tool, "SessionLocal", lambda: db)
    monkeypatch.setattr(db, "close", lambda: None)            # the export closes its session; this one is shared
    assert study_tool.export(tmp_path, include_unconsented=False) == 0
    text = "".join(f.read_text(encoding="utf-8") for f in tmp_path.glob("*.csv"))
    for secret in (yes.id, no.id, yes.email, no.email, yes.username):
        assert secret not in text
    parts = list(csv.DictReader((tmp_path / "participants.csv").open(encoding="utf-8")))
    assert len(parts) == 1 and parts[0]["pid"] == study_tool.pid(yes.id)
    assert parts[0]["pre_correct"] == "5" and parts[0]["linked_lists_before"] == "Yes"
    su = list(csv.DictReader((tmp_path / "student_unit.csv").open(encoding="utf-8")))
    assert [r["unit"] for r in su] == [u.id for u in curriculum.UNITS]
    assert sum(int(r["pre_n"]) for r in su) == study.attempt(db, yes.id, "pre").n_items
    assert sum(int(r["pre_correct"]) for r in su) == 5
    assert all(r["arm"] == study.participant(db, yes.id).sequence for r in su)
    responses = list(csv.DictReader((tmp_path / "quiz_responses.csv").open(encoding="utf-8")))
    assert len(responses) == study.attempt(db, yes.id, "pre").n_items


def test_a_withdrawn_student_leaves_the_export(db, on, monkeypatch, tmp_path):
    import study_tool
    u = _user(db, 3)
    study.record_consent(db, u.id, True)
    assert study.withdraw(db, u.id)
    monkeypatch.setattr(study_tool, "SessionLocal", lambda: db)
    monkeypatch.setattr(db, "close", lambda: None)            # the export closes its session; this one is shared
    study_tool.export(tmp_path, include_unconsented=False)
    assert list(csv.DictReader((tmp_path / "participants.csv").open(encoding="utf-8"))) == []


def test_a_prefetched_question_never_shown_is_not_a_first_exposure():
    import study_tool
    from datetime import datetime, timedelta
    t0 = datetime(2026, 1, 1)

    def served(qid, k):
        return SimpleNamespace(question_id=qid, served_at=t0 + timedelta(minutes=k),
                               operation="removeAtTail", question_type="find_bug", variant="bug1-s2")
    rows = [served("prefetched", 0), served("shown", 1)]          # same content, the first never shown
    assert study_tool.first_exposures(rows, worked={"shown"}) == {"shown"}
    assert study_tool.first_exposures(rows) == {"prefetched"}       # what counting every served row would say


def test_recurrence_can_leave_out_repeated_items():
    import study_tool
    from datetime import datetime, timedelta
    t0 = datetime(2026, 1, 1)

    def ev(kind, qid, k):
        return SimpleNamespace(kind=kind, question_id=qid, misconception_id="stop-on-target",
                               operation="removeAtPosition", at=t0 + timedelta(minutes=k))
    events = [ev("picked", "q1", 0), ev("picked", "q2", 1), ev("avoided", "q3", 2)]
    rec = study_tool.recurrence(events, first_seen={"q1", "q3"})["walk"]
    # q1 -> q2: picked again, but q2 repeated an item already seen; q2 -> q3: avoided, new item
    assert rec == {"opportunities": 2, "again": 1, "opportunities_new_item": 1, "again_new_item": 0}
