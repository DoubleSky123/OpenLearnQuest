"""Static generation paths for ALL 12 operations — the zero-AI side of the
question factory. gen-check covers the AI side; this covers everything else,
so 'does every session's question assemble correctly' is answered offline."""
import pytest

from app.services.claude_service import OP_META
from app.services.question_registry import get_handler
from app.services.question_spec import select_spec
from app.services.static_questions import _BLANKS, _BUGS, TEMPLATES
from app.services.ll_executor import validate_question

ALL_OPS = list(TEMPLATES)


@pytest.mark.parametrize("op", ALL_OPS)
def test_fill_blank_assembles_for_every_operation(op):
    spec = select_spec(op, "engaged", type_unlocked=1)
    q = get_handler("fill_blank").build_static(op, spec)
    assert q["pseudocode"] and q["blanks"]
    for b in q["blanks"]:
        # payload lines arrive PRE-BLANKED; the answer must be a substring of the
        # CANONICAL template line (the str.replace convention) and the payload
        # line must actually carry the hole
        canonical = TEMPLATES[op]["pseudocode"][b["line"]]
        assert b["answer"] in canonical, f"{op}: blank answer '{b['answer']}' not in canonical line"
        assert "___" in q["pseudocode"][b["line"]], f"{op}: payload line {b['line']} missing the blank"
        assert b["answer"] in b["options"]


@pytest.mark.parametrize("op", ALL_OPS)
def test_find_bug_static_assembles_for_every_operation(op):
    spec = select_spec(op, "engaged", type_unlocked=2)
    q = get_handler("find_bug").build_static(op, spec)
    assert 0 <= q["bug_line"] < len(q["pseudocode"])
    assert q["pseudocode"][q["bug_line"]] != TEMPLATES[op]["pseudocode"][q["bug_line"]], \
        f"{op}: bug line identical to the correct line"
    assert q["fix"] in q["options"]


@pytest.mark.parametrize("op", ALL_OPS)
def test_ordering_static_assembles_for_every_operation(op):
    spec = select_spec(op, "engaged", type_unlocked=3)
    q = get_handler("ordering").build_static(op, spec)
    assert q["pseudocode"] and q["correctOrder"]
    assert len(q["distractors"]) >= 1


@pytest.mark.parametrize("op", [o for o in ALL_OPS if o != "detectCycle"])
def test_goal_pattern_consistent_with_executor(op):
    # detectCycle's executor is a stub (returns nodes unchanged) — excluded
    spec = select_spec(op, "engaged", type_unlocked=1)
    q = get_handler("fill_blank").build_static(op, spec)
    ok, computed = validate_question(q)
    assert ok, f"{op}: claimed goalPattern {q.get('goalPattern')} != executor result {computed}"


def test_blanks_and_bugs_cover_all_operations():
    assert set(_BLANKS) == set(TEMPLATES), f"missing _BLANKS: {set(TEMPLATES) - set(_BLANKS)}"
    assert set(_BUGS) == set(TEMPLATES), f"missing _BUGS: {set(TEMPLATES) - set(_BUGS)}"
    assert set(OP_META) == set(TEMPLATES)


# ── startsEmpty: insertIntoEmpty must begin with NO nodes ────────────────────────
# The executor ignores any initial list for it, so a rendered 'Current state'
# with nodes contradicts the operation (user-reported bug).

@pytest.mark.parametrize("qtype,level", [("fill_blank", 1), ("find_bug", 2), ("ordering", 3)])
def test_insert_into_empty_static_has_no_initial_nodes(qtype, level):
    spec = select_spec("insertIntoEmpty", "engaged", type_unlocked=level)
    q = get_handler(qtype).build_static("insertIntoEmpty", spec)
    assert q["initialNodes"] == [], f"{qtype}: {q['initialNodes']}"
    assert q["goalPattern"] == [q["operationValue"]]


# ── merge/cycle/sort payload shape (user-reported display bugs) ─────────────────
# merge questions must carry BOTH input lists + the merged goal on every path;
# detectCycle must carry the cycle metadata; sortList must carry a real goal.

@pytest.mark.parametrize("qtype,level", [("fill_blank", 1), ("find_bug", 2), ("ordering", 3)])
def test_merge_static_carries_both_lists_and_goal(qtype, level):
    spec = select_spec("mergeSortedLists", "engaged", type_unlocked=level)
    q = get_handler(qtype).build_static("mergeSortedLists", spec)
    assert q["l1Values"] and q["l2Values"]
    assert q["goalPattern"] == sorted(q["l1Values"] + q["l2Values"])
    assert [n["value"] for n in q["initialNodes"]] == q["l1Values"]


def test_merge_ai_find_bug_carries_both_lists_and_goal():
    import json
    payload = json.dumps({
        "bug_line": 3, "buggy_line": "return dummy;",
        "wrong_options": ["return curr;", "return l1;"],
        "bug_explanation": "returns the placeholder anchor", "hint": "where does the merged list start?",
    })
    q = get_handler("find_bug").validate(payload, "mergeSortedLists", OP_META["mergeSortedLists"])
    assert q["l1Values"] and q["l2Values"]
    assert q["goalPattern"] == sorted(q["l1Values"] + q["l2Values"])


@pytest.mark.parametrize("qtype,level", [("fill_blank", 1), ("find_bug", 2), ("ordering", 3)])
def test_detect_cycle_static_carries_cycle_metadata(qtype, level):
    spec = select_spec("detectCycle", "engaged", type_unlocked=level)
    q = get_handler(qtype).build_static("detectCycle", spec)
    assert q["cycleTo"] == 1


def test_detect_cycle_ai_find_bug_carries_cycle_and_goal():
    import json
    payload = json.dumps({
        "bug_line": 2, "buggy_line": "if (slow == fast) return false;",
        "wrong_options": ["if (slow != fast) return true;", "if (fast == NULL) return true;"],
        "bug_explanation": "inverts the answer", "hint": "what does the pointers meeting prove?",
    })
    q = get_handler("find_bug").validate(payload, "detectCycle", OP_META["detectCycle"])
    assert q["cycleTo"] == 1
    assert q["goalPattern"] == [n["value"] for n in q["initialNodes"]]


def test_sort_list_ai_find_bug_has_sorted_goal():
    import json
    payload = json.dumps({
        "bug_line": 4, "buggy_line": "return merge(sortList(head), sortList(head));",
        "wrong_options": ["return merge(sortList(mid), sortList(mid));", "return sortList(merge(head, mid));"],
        "bug_explanation": "sorts the first half twice", "hint": "what happened to the second half?",
    })
    q = get_handler("find_bug").validate(payload, "sortList", OP_META["sortList"])
    assert q["goalPattern"] == sorted(n["value"] for n in q["initialNodes"])


def test_insert_into_empty_ai_validate_has_no_initial_nodes():
    import json
    payload = json.dumps({
        "bug_line": 2, "buggy_line": "head = NULL;",
        "wrong_options": ["head = newNode.next;", "newNode = head;"],
        "bug_explanation": "discards the new node", "hint": "who should head point to?",
    })
    q = get_handler("find_bug").validate(payload, "insertIntoEmpty", OP_META["insertIntoEmpty"])
    assert q["initialNodes"] == []
    assert q["goalPattern"] == [q["operationValue"]]


def test_heap_fixtures_match_current_templates():
    """frontend/src/prototype/fixtures.json is generated from TEMPLATES/_BLANKS/_BUGS
    (export_heap_fixtures.py) and is both the Memory City prototype's content and
    the heap interpreter's test oracle. Re-export in memory with the same seeds:
    any difference means content changed without re-running the export."""
    import random

    import export_heap_fixtures as ehf

    state = random.getstate()   # the export reseeds the global RNG
    try:
        expected = ehf.render(ehf.build_fixtures())
    finally:
        random.setstate(state)
    assert ehf.FIXTURES_PATH.read_text(encoding="utf-8") == expected, (
        "fixtures.json is stale — from backend/ run: "
        "d:/openLearnquest/venv/Scripts/python.exe export_heap_fixtures.py")
