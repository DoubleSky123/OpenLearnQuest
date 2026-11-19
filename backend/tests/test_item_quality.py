"""
Item harness contract (app/services/item_quality.py, app/services/pseudo_exec.py).

Every authored question must be worth asking: it tests linked lists, has exactly
one right answer, and every wrong option fails for a linked-list reason when
RUN. `python item_report.py --all --ops <op>` prints what every option does.
"""
import random

import pytest

from app.services import item_quality as iq
from app.services import pseudo_exec as px
from app.services.question_registry import get_handler
from app.services.question_spec import select_spec
from app.services.static_questions import TEMPLATES, _BLANKS, _BUGS

ALL_OPS = list(TEMPLATES)


# ── the oracle itself ──────────────────────────────────────────────────────────

@pytest.mark.parametrize("op", ALL_OPS)
def test_every_template_is_a_correct_program(op):
    """The reference code must itself be right on every board — the old
    detectCycle checked slow == fast after the loop and never stopped on a
    list that really has a cycle; merge read a `.val` field Node doesn't have."""
    rep = px.check_program(op, TEMPLATES[op]["pseudocode"], list(iq.boards(op)))
    assert rep.correct, f"{op}: {rep.reason}"


def test_executor_outcomes():
    steps = TEMPLATES["removeAtHead"]["pseudocode"]
    b = list(iq.boards("removeAtHead"))
    assert px.check_program("removeAtHead", steps, b).correct
    # forgetting the free leaks the old head
    assert "leak" in px.check_program("removeAtHead", steps[:2], b).reason
    # freeing what head still points to leaves a dangling node in the list
    assert "freed" in px.check_program("removeAtHead", ["temp = head;", "free(temp);"], b).reason
    # unknown names are compile errors (ruled out by reading)
    assert px.check_program("removeAtHead", ["temp = head;", "head = head.val;", "free(temp);"], b).outcome == "compile_error"
    assert px.check_program("removeAtHead", ["temp = head;", "head = curr.next;", "free(temp);"], b).outcome == "compile_error"
    # NULL dereference is a runtime error (a linked-list mistake)
    assert px.check_program("removeAtTail", ["curr = head;", "while (curr != NULL) curr = curr.next;",
                                             "temp = curr.next;", "curr.next = NULL;", "free(temp);"],
                            list(iq.boards("removeAtTail"))).outcome == "runtime_error"


def test_sort_must_halve_not_peel():
    """Output alone can't tell merge sort from splitting off one node per call."""
    steps = list(TEMPLATES["sortList"]["pseudocode"])
    steps[1] = "slow = head; fast = NULL;"
    rep = px.check_program("sortList", steps, list(iq.boards("sortList")))
    assert not rep.correct and "halving" in rep.reason


# ── R1: the blank tests linked lists, not naming/vocabulary/reading ────────────

@pytest.mark.parametrize("line,answer,kind", [
    (0, "curr", "binder"),          # `___ = head` -> curr / temp / prev: any name works
    (2, "temp", "binder"),
    (3, "next", "field"),           # `curr.___` -> read off the Node class
    (4, "free", "function"),
    (0, "head", "semantic"),        # `curr = ___` -> where does traversal start?
    (3, "temp.next", "semantic"),
    (4, "temp", "semantic"),        # free(___): which node is being removed?
])
def test_slot_kind(line, answer, kind):
    steps = TEMPLATES["removeAtPosition"]["pseudocode"]
    assert iq.slot_kind(steps, line, answer) == kind


def test_the_screenshot_blank_is_rejected():
    """The teacher's example: `___ = head` with curr/temp/prev."""
    steps = TEMPLATES["removeAtPosition"]["pseudocode"]
    rep = iq.lint_blank("removeAtPosition", steps, 0, "curr", ["temp", "prev"])
    assert any("naming" in i for i in rep.issues), rep.issues


def test_an_alias_distractor_is_caught_as_also_correct():
    """temp == curr.next at that point, so curr.next.next IS temp.next."""
    steps = TEMPLATES["removeAtPosition"]["pseudocode"]
    rep = iq.lint_blank("removeAtPosition", steps, 3, "temp.next", ["curr.next.next", "temp"])
    assert any("ALSO correct" in i for i in rep.issues), rep.issues


# ── R1–R3 over every authored item ─────────────────────────────────────────────

@pytest.mark.parametrize("op", ALL_OPS)
def test_authored_items_pass_the_harness(op):
    failing = [f"{r.where}: {'; '.join(r.issues)}" for r in iq.lint_authored(op) if not r.ok]
    assert not failing, "\n".join(failing)


@pytest.mark.parametrize("op", ALL_OPS)
def test_every_bug_shows_on_some_board(op):
    """A find-the-bug item whose bug never changes what a student can see is a
    trick question. (Served boards are then picked so the bug is visible.)"""
    steps = TEMPLATES[op]["pseudocode"]
    served = [b for b in iq.boards(op) if len(b.values) >= 2 or TEMPLATES[op].get("startsEmpty")
              or op == "mergeSortedLists"]
    for bug in _BUGS[op]:
        lines = list(steps)
        lines[bug["line"]] = bug["buggy"]
        assert any(iq.wrong_on_board(op, lines, b) for b in served), (op, bug["buggy"])


@pytest.mark.parametrize("op", ALL_OPS)
def test_crux_steps_are_blankable(op):
    crux = TEMPLATES[op].get("crux")
    assert crux, f"{op}: no crux steps"
    for si, bset in enumerate(_BLANKS[op]):
        assert any(bset[i] is not None for i in crux), (op, si)


# ── ordering: valid orders are computed ────────────────────────────────────────

def test_valid_orders_are_computed_not_listed():
    """createNode can go anywhere before it is linked; the hand-listed table
    missed legal orders on 7 operations (students marked wrong for right work)."""
    assert sorted(iq.template_valid_orders("insertAtPosition")) == sorted([
        (0, 1, 2, 3, 4), (0, 2, 1, 3, 4), (2, 0, 1, 3, 4)])
    assert (1, 0, 2, 3) in iq.template_valid_orders("reverseList")   # prev/curr init order is free
    # a step after an unconditional return never runs — not a valid order
    assert iq.template_valid_orders("sortList") == ((0, 1, 2, 3, 4),)


@pytest.mark.parametrize("op", ALL_OPS)
def test_ordering_payload_carries_every_valid_order(op):
    spec = select_spec(op, "engaged", type_unlocked=3, intra_difficulty=2)
    q = get_handler("ordering").build_static(op, spec)
    assert sorted(map(tuple, q["validOrders"])) == sorted(iq.template_valid_orders(op))
    assert tuple(q["correctOrder"]) in {tuple(o) for o in q["validOrders"]}


# ── serve time: the board the student sees ─────────────────────────────────────

@pytest.mark.parametrize("op", ALL_OPS)
def test_served_fill_blank_distractors_fail_on_the_shown_board(op):
    random.seed(7)
    steps = TEMPLATES[op]["pseudocode"]
    for seed in range(4):
        spec = select_spec(op, "engaged", type_unlocked=1, intra_difficulty=3, variant_seed=seed)
        q = get_handler("fill_blank").build_static(op, spec)
        assert q["blanks"], (op, seed)
        board = iq.board_of(op, q["initialNodes"], q["operationValue"], q["operationPosition"], q)
        for b in q["blanks"]:
            sym = lambda s: iq.symbolic(s, q["operationValue"])
            blanked = sym(q["pseudocode"][b["line"]])
            for opt in b["options"]:
                lines = list(steps)
                lines[b["line"]] = blanked.replace("___", sym(opt), 1)
                wrong = iq.wrong_on_board(op, lines, board)
                assert wrong == (opt != b["answer"]), (op, seed, b["line"], opt)


@pytest.mark.parametrize("op", ALL_OPS)
def test_served_find_bug_is_visible_on_the_shown_board(op):
    random.seed(11)
    for seed in range(3):
        for intra in (1, 2, 3):
            spec = select_spec(op, "engaged", type_unlocked=2, intra_difficulty=intra, variant_seed=seed)
            q = get_handler("find_bug").build_static(op, spec)
            board = iq.board_of(op, q["initialNodes"], q["operationValue"], q["operationPosition"], q)
            sym = lambda s: iq.symbolic(s, q["operationValue"])
            assert iq.wrong_on_board(op, [sym(s) for s in q["pseudocode"]], board), (op, seed, intra)


# ── the interpreter never crashes its caller ───────────────────────────────────

def test_a_value_of_the_wrong_kind_is_a_runtime_error_not_a_crash():
    """A pointer used as a for-counter (or merging non-numbers) is a wrong
    program. It must fail like one: an uncaught TypeError in serve-time
    sanitising used to turn one bad pool row into a 500 for the whole class."""
    inst = px.Instance((10, 20, 30))
    r = px.run("reverseList", ["for (i = head; i != NULL; i++) curr = head;"], inst)
    assert r.outcome == "runtime_error"


def test_oversized_programs_are_refused_before_they_are_read():
    """Clients send board lines; reading must stay cheap on any input
    (tokenising used to be quadratic in the line length)."""
    import time
    inst = px.Instance((10, 20, 30))
    t0 = time.perf_counter()
    assert px.run("removeAtTail", ["curr = head;" * 100_000], inst).outcome == "compile_error"
    assert px.run("removeAtTail", ["curr = head;"] * (px.MAX_LINES + 1), inst).outcome == "compile_error"
    assert time.perf_counter() - t0 < 1.0   # gstack-timing-ok: a 1.2 MB line was ~20 s before the cap
