"""Alias-equivalence rule in _find_bug_validate: renames of the correct line are
rejected, but real bugs must NOT be rejected just because a stale alias chain
textually connects them (reassignment kills aliases)."""
import json

import pytest

from app.services.question_registry import _find_bug_validate
from app.services.claude_service import OP_META


def _payload(op: str, bug_line: int, buggy: str, wrong=None) -> str:
    return json.dumps({
        "bug_line": bug_line,
        "buggy_line": buggy,
        "wrong_options": wrong or ["head = NULL;", "temp = NULL;"],
        "bug_explanation": "wrong pointer target",
        "hint": "think about which node each name refers to",
    })


def _validate(op: str, bug_line: int, buggy: str, wrong=None) -> dict:
    return _find_bug_validate(_payload(op, bug_line, buggy, wrong), op, OP_META[op])


# removeAtHead template: ["temp = head;", "head = head.next;", "free(temp);"]

def test_rename_via_live_alias_is_rejected():
    # At line 1 the alias temp == head is live: 'head = temp.next' is a rename.
    with pytest.raises(ValueError, match="equivalent"):
        _validate("removeAtHead", 1, "head = temp.next;")


def test_real_bug_after_alias_killed_is_accepted():
    # At line 2, 'head = head.next' (line 1) has killed the temp->head alias:
    # free(head.next) frees the wrong node — a REAL bug, must validate.
    q = _validate("removeAtHead", 2, "free(head.next);",
                  wrong=["free(head);", "free(NULL);"])
    assert q["bug_line"] == 2


def test_self_referential_assignment_yields_no_alias():
    # 'head = head.next' aliases nothing: free(head) at line 2 is a real bug.
    q = _validate("removeAtHead", 2, "free(head);",
                  wrong=["free(head.next);", "free(NULL);"])
    assert q["bug_line"] == 2


def test_identical_line_still_rejected():
    with pytest.raises(ValueError, match="identical"):
        _validate("removeAtHead", 1, "head = head.next;")
