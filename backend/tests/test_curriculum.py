"""
Curriculum contract (services/curriculum.py + game_master.update_mastery /
plan_next): progress is by IDEA (unit), mastery needs a perfect ORDERING pass,
a unit is blocked on its anchor then interleaved, a stuck student gets a
detour, mastered units come back as reviews that never change mastery.
"""
import uuid

from app.services import curriculum
from app.services.game_master import (
    ALL_OPS, get_mastery_map, level_state, mastery_summary, plan_next,
    played_level, select_next_operation, update_mastery,
)
from tests.mastery_helpers import Student, current_type, master_op, master_units, record

UID = lambda: str(uuid.uuid4())


def mm(db, uid):
    return get_mastery_map(db, uid, "singly")


def test_every_operation_is_taught_exactly_once():
    assert sorted(curriculum.ALL_UNIT_OPS) == sorted(ALL_OPS)
    for u in curriculum.UNITS:
        assert {o for g in u.groups for o in g} <= set(u.ops)


def test_mastery_needs_a_perfect_ordering_pass(db):
    uid = UID()
    update_mastery(db, uid, "singly", "insertAtHead", passed=True, error_count=0, question_type="fill_blank")
    assert not curriculum.op_mastered(mm(db, uid)["insertAtHead"])
    # first op of a unit: fill_blank -> find_bug -> ordering, three perfect questions
    assert master_op(db, UID(), "insertAtHead") == 3


def test_client_cannot_claim_a_harder_type_than_was_served(db):
    uid = UID()
    update_mastery(db, uid, "singly", "insertAtHead", passed=True, error_count=0, question_type="ordering")
    assert record(db, uid, "insertAtHead").best_perfect_type == 1   # served fill_blank
    assert played_level(mm(db, uid), "insertAtHead", "fill_blank") == 1


def test_a_variant_starts_as_a_transfer_probe(db):
    """insertIntoEmpty is insertAtHead with head == NULL: once insertAtHead is
    mastered, one clean ordering question shows the idea transferred. A primary
    (removeAtHead: a different idea) always starts scaffolded."""
    uid = UID()
    assert curriculum.entry_level("insertIntoEmpty", mm(db, uid)) == 1
    master_op(db, uid, "insertAtHead")
    assert current_type(db, uid, "insertIntoEmpty") == "ordering"
    assert level_state(mm(db, uid), "insertIntoEmpty") == (3, 3)
    assert master_op(db, uid, "insertIntoEmpty") == 1
    assert current_type(db, uid, "removeAtHead") == "fill_blank"
    # a probe never crosses units: unit 2 starts scaffolded
    assert current_type(db, uid, "insertAtTail") == "fill_blank"


def test_struggling_on_a_skipped_level_steps_down(db):
    uid = UID()
    master_op(db, uid, "insertAtHead")
    update_mastery(db, uid, "singly", "insertIntoEmpty", passed=True, error_count=3, question_type="ordering")
    r = record(db, uid, "insertIntoEmpty")
    assert (r.type_unlocked, r.active_type_level) == (3, 2)   # ceiling kept, Level Up offered
    update_mastery(db, uid, "singly", "insertIntoEmpty", passed=False, error_count=4, question_type="find_bug")
    assert record(db, uid, "insertIntoEmpty").active_type_level == 1


def test_one_slip_on_a_probe_is_not_a_step_down(db):
    uid = UID()
    master_op(db, uid, "insertAtHead")
    update_mastery(db, uid, "singly", "insertIntoEmpty", passed=True, error_count=1, question_type="ordering")
    assert record(db, uid, "insertIntoEmpty").active_type_level == 3


def test_an_earned_level_is_never_stepped_down(db):
    uid = UID()
    for t in ("fill_blank", "find_bug"):
        update_mastery(db, uid, "singly", "insertAtHead", passed=True, error_count=0, question_type=t)
        r = record(db, uid, "insertAtHead")
        r.active_type_level = r.type_unlocked
        db.commit()
    update_mastery(db, uid, "singly", "insertAtHead", passed=False, error_count=5, question_type="ordering")
    assert record(db, uid, "insertAtHead").active_type_level == 3   # passed find_bug cleanly: earned


def test_units_unlock_in_order(db):
    uid = UID()
    units = mastery_summary(mm(db, uid), "singly")["units"]
    assert [u["unlocked"] for u in units] == [True, False, False, False, False]
    master_units(db, uid, curriculum.UNITS[:1])
    units = mastery_summary(mm(db, uid), "singly")["units"]
    assert units[0]["mastered"] and units[1]["unlocked"] and not units[2]["unlocked"]


def test_every_op_is_required_and_a_variant_costs_one_question(db):
    uid = UID()
    master_op(db, uid, "insertAtHead")
    master_op(db, uid, "removeAtHead")
    assert not curriculum.unit_mastered(curriculum.UNITS[0], mm(db, uid))   # insertIntoEmpty still open
    assert master_op(db, uid, "insertIntoEmpty") == 1
    assert curriculum.unit_mastered(curriculum.UNITS[0], mm(db, uid))


def test_a_unit_is_blocked_on_its_anchor_then_interleaved(db):
    """First look at new code: the anchor alone until it passes fill_blank; then
    the ops in play take turns, each at its own level; the variant joins as soon
    as its primary is mastered."""
    st = Student(db)
    played = [st.answer("insertAtHead") for _ in range(7)]
    assert played == [
        ("insertAtHead", "fill_blank", "practice"),
        ("removeAtHead", "fill_blank", "practice"),     # anchor passed fill_blank -> interleave
        ("insertAtHead", "find_bug", "practice"),
        ("removeAtHead", "find_bug", "practice"),
        ("insertAtHead", "ordering", "practice"),       # insertAtHead mastered -> its variant joins
        ("insertIntoEmpty", "ordering", "practice"),    # never practised = next; one transfer question
        ("removeAtHead", "ordering", "practice"),       # unit 1 mastered
    ]
    assert curriculum.unit_mastered(curriculum.UNITS[0], mm(db, st.uid))


def test_four_ops_take_turns_and_none_repeats_while_another_is_in_play(db):
    """Unit 2: tail ops climb the ladder alternating; each position op joins as
    soon as its tail twin is mastered. Every op is served; no op twice in a row
    while another one is still in play."""
    st = Student(db)
    master_units(db, st.uid, curriculum.UNITS[:1])
    unit = curriculum.UNITS[1]
    played = []
    while not curriculum.unit_mastered(unit, mm(db, st.uid)):
        op, qtype, purpose = st.answer("insertAtTail")
        if purpose != "review":
            played.append(op)
        assert len(played) < 20
    assert set(played) == set(unit.ops)
    assert played.count("insertAtPosition") == played.count("removeAtPosition") == 1
    for a, b in zip(played, played[1:]):
        assert a != b or a == "removeAtPosition", played    # last one standing may repeat


def test_the_anchor_stays_alone_while_it_is_still_new(db):
    st = Student(db)
    assert st.answer("insertAtHead", errors=1) == ("insertAtHead", "fill_blank", "practice")
    assert st.answer("insertAtHead", errors=1)[0] == "insertAtHead"   # no clean fill_blank yet


def test_three_struggles_in_a_row_earn_a_detour_then_back(db):
    st = Student(db)
    for _ in range(3):
        st.answer("insertAtHead", errors=2)
    assert st.answer("insertAtHead") == ("removeAtHead", "fill_blank", "detour")
    assert st.answer("insertAtHead")[0] == "insertAtHead"            # back to the stuck op


def test_a_detour_never_starts_a_variant_before_its_primary_is_mastered(db):
    """Stuck on insertAtHead with removeAtHead already mastered: the only other
    unmastered op is insertIntoEmpty, whose primary is the stuck op. Serving it
    now would start it at fill_blank and spend its transfer probe."""
    st = Student(db)
    master_op(db, st.uid, "removeAtHead")
    for _ in range(3):
        st.answer("insertAtHead", errors=2)
    plan = st.next_plan("insertAtHead")
    assert (plan.operation, plan.purpose) == ("removeAtHead", "detour")
    assert curriculum.entry_level("insertIntoEmpty", mm(db, st.uid)) == 1


def test_a_detour_needs_another_op_in_the_unit(db):
    st = Student(db)
    master_units(db, st.uid, curriculum.UNITS[:4])
    for _ in range(3):
        st.answer("sortList", errors=2)
    assert st.next_plan("sortList").purpose != "detour"              # unit 5 has one op


def test_a_review_comes_every_fifth_unit_question_and_never_changes_mastery(db):
    st = Student(db)
    master_units(db, st.uid, curriculum.UNITS[:1])
    snap = lambda: {o: (r.best_perfect_type, r.attempts, r.consecutive_passes)
                    for o in curriculum.UNITS[0].ops if (r := record(db, st.uid, o))}
    before = snap()
    plays = [st.answer("insertAtTail") for _ in range(4)]
    assert all(p[2] == "practice" and p[0] in curriculum.UNITS[1].ops for p in plays)
    review = st.answer("insertAtTail", errors=3)                        # the 5th: a review, answered badly
    assert review[2] == "review" and review[0] in curriculum.UNITS[0].ops and review[1] == "ordering"
    assert snap() == before                                             # forgetting is measured, not punished
    assert st.answer("insertAtTail")[2] == "practice"                  # then back to unit 2
    # the op whose review went badly is the next one reviewed
    for _ in range(3):
        st.answer("insertAtTail")
    nxt = st.next_plan("insertAtTail")
    assert nxt.purpose == "review" and nxt.operation == review[0]


def test_reviews_rotate_through_mastered_ops(db):
    """A review doesn't touch mastery.last_seen; recency must come from the
    attempts, or the same op is reviewed every time."""
    st = Student(db)
    master_units(db, st.uid, curriculum.UNITS[:1])
    reviewed = []
    for _ in range(15):
        op, _, purpose = st.answer("insertAtTail")
        if purpose == "review":
            reviewed.append(op)
    assert len(reviewed) >= 2 and len(set(reviewed)) >= 2, reviewed


def test_no_review_without_an_earlier_mastered_unit(db):
    st = Student(db)
    assert all(st.answer("insertAtHead", errors=1)[2] != "review" for _ in range(8))


def test_a_client_cannot_skip_mastery_by_calling_practice_a_review(db):
    st = Student(db)
    st.answer("insertAtHead", purpose="review")       # not mastered: counts as practice
    assert record(db, st.uid, "insertAtHead").attempts == 1


def test_the_whole_course(db):
    """A perfect student: each primary climbs fill_blank -> find_bug -> ordering,
    each variant is one transfer question, plus a review every 5th question once
    an earlier unit is mastered. All 12 operations are covered."""
    st = Student(db)
    per_unit = []
    for u in curriculum.UNITS:
        n = reviews = 0
        while not curriculum.unit_mastered(u, mm(db, st.uid)):
            _, _, purpose = st.answer(u.ops[0])
            n += 1
            reviews += purpose == "review"
        per_unit.append((n - reviews, reviews))
    assert [p for p, _ in per_unit] == [7, 8, 6, 6, 3]
    assert per_unit[0][1] == 0 and all(r >= 1 for _, r in per_unit[1:4])
    assert all(curriculum.op_mastered(mm(db, st.uid).get(o)) for o in ALL_OPS)


def test_a_test_account_sees_every_unit_unlocked_with_real_progress(db, monkeypatch):
    """UNLOCK_ALL_UNITS_FOR opens every unit for the listed accounts only;
    nothing is marked mastered, so each unit still starts at its anchor."""
    from app.config import settings
    tester, student = Student(db), Student(db)
    monkeypatch.setattr(type(settings), "unlock_all_emails",
                        property(lambda self: {f"{tester.uid[:8]}@t.io"}))
    units = mastery_summary(mm(db, tester.uid), "singly")["units"]
    assert all(u["unlocked"] for u in units) and not any(u["mastered"] for u in units)
    assert tester.answer("sortList") == ("sortList", "fill_blank", "practice")
    assert [u["unlocked"] for u in mastery_summary(mm(db, student.uid), "singly")["units"]] == \
           [True, False, False, False, False]


def test_a_locked_unit_cannot_be_reached_by_sending_its_op(db):
    """The unit path hides locked units, but the pin and the recorded operation
    are client values: the server serves inside unlocked units only and never
    credits an attempt on a locked unit's op."""
    from app.services.game_master import _record_attempt, start_session
    st = Student(db)
    assert st.next_plan("reverseList") is None                       # unit 3, locked
    out = start_session(db, st.uid, "singly", "stress-free", operation="reverseList")
    assert out["operation"] in curriculum.UNITS[0].ops
    _record_attempt(db, st.uid, "singly", st.session.id, "reverseList", True, 0, 3000, UID(),
                    2, 0, "engaged", None, "fill_blank", None)
    assert record(db, st.uid, "reverseList") is None                 # recorded, not credited
    assert st.answer("insertAtHead")[0] == "insertAtHead"            # unit 1 untouched


def test_a_look_alike_email_does_not_inherit_the_test_account(db, monkeypatch):
    """Registration keeps an email's case, so 'Shi.Kun@…' is a different account
    from 'shi.kun@…'. The allowlist must match the stored address exactly."""
    from app.config import settings
    from app.models import User
    real, twin = Student(db), Student(db)
    addr = db.get(User, real.uid).email
    db.get(User, twin.uid).email = addr.upper()
    db.commit()
    monkeypatch.setattr(type(settings), "unlock_all_emails", property(lambda self: {addr}))
    assert mm(db, real.uid).unlock_all is True
    assert mm(db, twin.uid).unlock_all is False


def test_a_result_sent_twice_is_recorded_once(db):
    """/session/next re-sends a result whose /session/record landed but whose reply
    was lost. Counting it twice would turn one clean answer into two."""
    from app.models import QuestionAttempt
    from app.services.game_master import _record_attempt
    st = Student(db)
    qid = UID()
    for _ in range(2):
        _record_attempt(db, st.uid, "singly", st.session.id, "insertAtHead", True, 0, 3000, qid,
                        2, 0, "engaged", None, "fill_blank", None)
    assert db.query(QuestionAttempt).filter_by(question_id=qid).count() == 1
    r = record(db, st.uid, "insertAtHead")
    assert (r.attempts, r.consecutive_passes) == (1, 1)


def test_unpinned_sessions_are_not_planned(db):
    assert plan_next(db, UID(), "singly", None, {}) is None
    assert plan_next(db, UID(), "singly", "nonsense", {}) is None


def test_adaptive_pick_stays_inside_unlocked_units(db):
    uid = UID()
    for _ in range(5):
        assert select_next_operation(mm(db, uid), "bored") in curriculum.UNITS[0].ops
