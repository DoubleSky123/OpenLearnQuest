"""
Misconception catalog contract (services/misconceptions.py): every entry is a
real linked-list error that a student could write, misconceptions are told
apart by what the program DOES, and the authored content is tagged by
execution.
"""
import re

import pytest

from app.services import curriculum, misconceptions as mc
from app.services import pseudo_exec as px
from app.services.item_quality import boards
from app.services.static_questions import TEMPLATES

PAIRS = [(m.id, op) for m in mc.CATALOG.values() for op in m.mutants]
FORMS = [(m.id, op, k) for m in mc.CATALOG.values() for op, muts in m.mutants.items() for k in range(len(muts))]


def test_catalog_ids_and_units():
    unit_ids = {u.id for u in curriculum.UNITS}
    assert len(mc.CATALOG) == len(mc._ALL), "duplicate misconception id"
    for m in mc.CATALOG.values():
        assert re.fullmatch(r"[a-z]+(-[a-z]+)*", m.id), m.id
        assert m.unit in unit_ids, (m.id, m.unit)
        assert m.mutants, m.id


def test_student_facing_text_has_no_code():
    """belief/correction are shown to students and offered as the classmate's
    explanation choices: a code fragment would hand over the fix."""
    code = re.compile(r"[={}]|\.next|\.value|\w\(|\b(curr|temp|prev|newNode|head|slow|fast|dummy)\.")
    for m in mc.CATALOG.values():
        for text in (m.belief, m.correction):
            assert not code.search(text), (m.id, text)


@pytest.mark.parametrize("mid,op,k", FORMS)
def test_every_mutant_is_a_runnable_wrong_program(mid, op, k):
    mut = mc.CATALOG[mid].mutants[op][k]
    n = len(TEMPLATES[op]["pseudocode"])
    assert all(0 <= i < n for i in mut.lines), (mid, op, mut)
    lines = mc.mutant_program(op, mid, k)
    rep = px.check_program(op, lines, list(boards(op)))
    assert not rep.correct, f"{mid}[{k}] on {op} is a correct program"
    assert rep.outcome != "compile_error", f"{mid}[{k}] on {op} is a typo, not a misconception: {rep.reason}"


@pytest.mark.parametrize("op", sorted(TEMPLATES))
def test_misconceptions_on_one_operation_behave_differently(op):
    """Two misconceptions with identical behaviour could never be told apart
    from a student's answer — that would make diagnosis a coin flip."""
    owner: dict[tuple, str] = {}
    for m in mc.applicable(op):
        for k in range(len(m.mutants[op])):
            fp = mc.fingerprint(op, tuple(mc.mutant_program(op, m.id, k)))
            assert owner.get(fp, m.id) == m.id, f"{m.id} and {owner[fp]} are indistinguishable on {op}"
            owner[fp] = m.id


@pytest.mark.parametrize("op", sorted(TEMPLATES))
def test_the_correct_program_shows_no_misconception(op):
    assert mc.classify_program(op, TEMPLATES[op]["pseudocode"]) == frozenset()


@pytest.mark.parametrize("mid,op,k", FORMS)
def test_a_mutant_is_classified_as_itself(mid, op, k):
    assert mc.classify_program(op, mc.mutant_program(op, mid, k)) == {mid}


@pytest.mark.parametrize("op,code,mid", [
    ("removeAtTail", "while (curr.next != NULL) curr = curr.next;", "stop-on-target"),
    ("insertAtPosition", "for (int i = 0; i < index; i++) curr = curr.next;", "stop-on-target"),
    ("insertAtTail", "while (curr != NULL) curr = curr.next;", "walk-off-end"),
    ("removeAtHead", "free(head);", "free-wrong-node"),
    ("removeAtTail", "free(curr);", "free-wrong-node"),
    ("insertAtHead", "newNode = head;", "alias-not-new"),
    ("mergeSortedLists", "return dummy;", "wrong-result-pointer"),
    ("detectCycle", "while (fast != NULL && fast.next != NULL) { slow = slow.next; fast = fast.next.next; }",
     "meet-check-outside"),
])
def test_authored_distractors_are_tagged_by_execution(op, code, mid):
    assert mid in mc.tag_distractor(op, TEMPLATES[op]["pseudocode"], code)


def test_a_surface_variant_with_the_same_behaviour_gets_the_same_tag():
    """Tagging is behavioural, not textual: `curr.next` as a condition is
    `curr.next != NULL`."""
    steps = TEMPLATES["removeAtTail"]["pseudocode"]
    assert mc.tag_line("removeAtTail", steps, 1, "while (curr.next) curr = curr.next;") == {"stop-on-target"}


def test_blank_tagging_follows_the_first_occurrence_contract():
    steps = TEMPLATES["removeAtPosition"]["pseudocode"]
    assert mc.tag_blank("removeAtPosition", steps, 1, "index-1", "index") == {"stop-on-target"}
    assert mc.tag_blank("removeAtPosition", steps, 1, "index-1", "index-1") == frozenset()
