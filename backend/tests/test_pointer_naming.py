"""The traversal pointer is spelled `curr` everywhere a student can see code.

`node` used to be the name in TEMPLATES while the hint animation labelled its
cursor `curr` — students saw two names for one pointer. These tests lock the
convention on both sides: the static content, and the guard that stops Haiku
from reintroducing the old name into the question pool.

English prose is exempt — "the last node" is the noun, not the variable — so
every assertion here looks at CODE fields only.
"""
import json
import re

import pytest

from app.services.claude_service import OP_META
from app.services.question_pool import content_hash
from app.services.question_registry import (
    _find_bug_validate,
    _sll_reject_reason,
    get_handler,
)
from app.services.question_spec import select_spec
from app.services.static_questions import TEMPLATES, _BLANKS, _BUGS

BARE_NODE = re.compile(r'\bnode\b')


def _code_fields():
    """Yield (label, code_string) for every student-visible code string."""
    for op, t in TEMPLATES.items():
        for i, step in enumerate(t["pseudocode"]):
            yield f"{op}.pseudocode[{i}]", step
        for i, d in enumerate(t["distractors"]):
            yield f"{op}.distractors[{i}]", d
    for op, sets in _BLANKS.items():
        for si, s in enumerate(sets):
            for i, bd in enumerate(s):
                yield f"{op}._BLANKS[{si}][{i}].a", bd["a"]
                for wi, w in enumerate(bd["w"]):
                    yield f"{op}._BLANKS[{si}][{i}].w[{wi}]", w
    for op, variants in _BUGS.items():
        for vi, v in enumerate(variants):
            yield f"{op}._BUGS[{vi}].buggy", v["buggy"]
            yield f"{op}._BUGS[{vi}].fix", v["fix"]
            for oi, o in enumerate(v["options"]):
                yield f"{op}._BUGS[{vi}].options[{oi}]", o


def test_no_static_code_names_the_pointer_node():
    offenders = [(label, code) for label, code in _code_fields()
                 if BARE_NODE.search(code)]
    assert not offenders, f"traversal pointer must be 'curr': {offenders}"


def test_newnode_survives_the_convention():
    """Guard against an over-broad rename: createNode/newNode are not the pointer."""
    assert "newNode = createNode({value});" in TEMPLATES["insertAtHead"]["pseudocode"]
    assert _sll_reject_reason("newNode = createNode({value});", "insertAtHead") is None


@pytest.mark.parametrize("code", [
    "node = head;",
    "while (node.next != NULL) node = node.next;",
    "cur = head;",
    "current = current.next;",
    "for (int i = 0; i < position-1; i++) curr = curr.next;",
    "for (int i = 0; i < pos-1; i++) curr = curr.next;",
])
def test_guard_rejects_old_names(code):
    assert _sll_reject_reason(code, "insertAtTail") is not None


@pytest.mark.parametrize("op", ["insertAtPosition", "removeAtPosition"])
@pytest.mark.parametrize("qtype,level", [("find_bug", 2), ("ordering", 3)])
def test_traversal_step_keeps_index_symbolic(op, qtype, level):
    """`index-1` IS the off-by-one rule. Rendering `3-1` lets the student compute
    2 and skip the rule, so the index literal must never be substituted in."""
    spec = select_spec(op, "engaged", type_unlocked=level, intra_difficulty=3)
    q = get_handler(qtype).build_static(op, spec)
    traversal = q["pseudocode"][1]
    assert "index-1" in traversal, traversal
    assert f"{q['operationPosition']}-1" not in traversal, traversal


def test_index_literal_never_leaks_into_fill_blank():
    """fill_blank may blank out `index-1` itself, so the check is that the
    SUBSTITUTED form never appears — not that the digit is absent, since other
    blanks legitimately offer small integers (set D blanks the loop's `i = 0`)."""
    for op in ("insertAtPosition", "removeAtPosition"):
        for seed in range(4):
            spec = select_spec(op, "engaged", type_unlocked=1,
                               intra_difficulty=3, variant_seed=seed)
            q = get_handler("fill_blank").build_static(op, spec)
            pos = q["operationPosition"]
            texts = list(q["pseudocode"])
            for b in q["blanks"]:
                texts += [b["answer"], *b["options"]]
            for t in texts:
                assert f"{pos}-1" not in t, (op, seed, t)
                assert f"{pos}-2" not in t, (op, seed, t)


def test_createnode_shows_the_actual_payload():
    """The prompt already told the student to insert 35 — the code should say 35,
    not an abstract `value` they have to bind by hand."""
    spec = select_spec("insertAtHead", "engaged", type_unlocked=2, intra_difficulty=2)
    q = get_handler("find_bug").build_static("insertAtHead", spec)
    assert f"createNode({q['operationValue']});" in "\n".join(q["pseudocode"])
    assert "{value}" not in "\n".join(q["pseudocode"])
    assert "createNode(value)" not in "\n".join(q["pseudocode"])


def test_value_blank_offers_the_index_as_the_wrong_answer():
    """The pedagogical point of this blank is value-vs-index confusion, so the
    answer must be the payload literal and a wrong option the index literal."""
    spec = select_spec("insertAtPosition", "engaged", type_unlocked=1,
                       intra_difficulty=3, variant_seed=2)
    q = get_handler("fill_blank").build_static("insertAtPosition", spec)
    value_blanks = [b for b in q["blanks"] if b["answer"] == str(q["operationValue"])]
    assert value_blanks, q["blanks"]
    assert str(q["operationPosition"]) in value_blanks[0]["options"]


def test_value_less_ops_still_literalise_borrowed_distractors():
    """removeAtTail borrows `newNode = createNode({value});` as a distractor. If
    it stayed symbolic while every other line held a number, it would be the
    obvious odd one out — a free elimination."""
    spec = select_spec("removeAtTail", "engaged", type_unlocked=3, intra_difficulty=3)
    q = get_handler("ordering").build_static("removeAtTail", spec)
    borrowed = [d for d in q["distractors"] if "createNode" in d]
    assert borrowed, q["distractors"]
    for d in borrowed:
        assert re.search(r"createNode\(\d+\)", d), d


def test_payload_literal_does_not_defeat_pool_dedup():
    """content_hash is the pedagogical identity. The payload literal is re-rolled
    every build, so two rows holding the SAME bug must still collide."""
    a = {"operation": "insertAtHead", "question_type": "find_bug",
         "pseudocode": ["newNode = createNode(35);", "newNode.next = head.next;"]}
    b = {"operation": "insertAtHead", "question_type": "find_bug",
         "pseudocode": ["newNode = createNode(72);", "newNode.next = head.next;"]}
    assert content_hash(a, 2) == content_hash(b, 2)

    # ...but a genuinely different bug must NOT collide
    c = {"operation": "insertAtHead", "question_type": "find_bug",
         "pseudocode": ["newNode = createNode(35);", "newNode.next = NULL;"]}
    assert content_hash(a, 2) != content_hash(c, 2)


def test_find_bug_validator_rejects_ai_using_node():
    """End-to-end: a model that answers with `node` burns a retry, not a bad row."""
    payload = json.dumps({
        "bug_line": 3, "buggy_line": "node.next = node.next;",
        "wrong_options": ["node.next = NULL;", "newNode.next = curr;"],
        "bug_explanation": "self-assignment links nothing",
        "hint": "which pointer links the new node?",
    })
    with pytest.raises(ValueError, match="must be 'curr'"):
        _find_bug_validate(payload, "insertAtTail", OP_META["insertAtTail"])
