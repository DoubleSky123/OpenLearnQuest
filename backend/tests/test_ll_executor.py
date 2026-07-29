"""ll_executor is the truth oracle for every question — these tests pin its
semantics for all 12 operations (assertions on the traversed `values`)."""
from app.services.ll_executor import execute_operation, validate_question


def chain(*values):
    """Build a well-formed node list [{id, value, next}] from values."""
    nodes = [{"id": i + 1, "value": v, "next": i + 2} for i, v in enumerate(values)]
    if nodes:
        nodes[-1]["next"] = None
    return nodes


def run(op, values, value=None, position=None):
    return execute_operation(op, chain(*values), operation_value=value, operation_position=position)["values"]


# ── Level 1 ─────────────────────────────────────────────────────────────────────

def test_insert_at_head():
    assert run("insertAtHead", [1, 2], value=9) == [9, 1, 2]

def test_insert_at_head_empty():
    assert run("insertAtHead", [], value=9) == [9]

def test_insert_at_tail():
    assert run("insertAtTail", [1, 2], value=9) == [1, 2, 9]

def test_remove_at_head():
    assert run("removeAtHead", [1, 2, 3]) == [2, 3]

def test_remove_at_tail():
    assert run("removeAtTail", [1, 2, 3]) == [1, 2]

def test_remove_at_tail_single_node():
    assert run("removeAtTail", [7]) == []

# ── Level 2 ─────────────────────────────────────────────────────────────────────

def test_insert_into_empty():
    assert run("insertIntoEmpty", [], value=5) == [5]

def test_delete_entire_list():
    assert run("deleteEntireList", [1, 2, 3]) == []

def test_insert_at_position():
    # position walks to the predecessor: pos 2 on [1,2,3] inserts after index 1
    assert run("insertAtPosition", [1, 2, 3], value=9, position=2) == [1, 2, 9, 3]

def test_insert_at_position_out_of_range_is_noop():
    assert run("insertAtPosition", [1, 2], value=9, position=99) == [1, 2]

def test_remove_at_position():
    # position is the 0-indexed target (matches on-screen node labels)
    assert run("removeAtPosition", [1, 2, 3], position=2) == [1, 2]

def test_remove_at_position_index_one():
    assert run("removeAtPosition", [1, 2, 3], position=1) == [1, 3]

# ── Level 3 ─────────────────────────────────────────────────────────────────────

def test_reverse_list():
    assert run("reverseList", [1, 2, 3]) == [3, 2, 1]

def test_reverse_empty():
    assert run("reverseList", []) == []

def test_merge_sorted_lists():
    out = execute_operation("mergeSortedLists", [], operation_value={"l1Values": [1, 3], "l2Values": [2, 4]})
    assert out["values"] == [1, 2, 3, 4]

def test_sort_list():
    assert run("sortList", [3, 1, 2]) == [1, 2, 3]

def test_detect_cycle_keeps_nodes():
    assert run("detectCycle", [1, 2, 3]) == [1, 2, 3]

# ── validate_question consistency check ─────────────────────────────────────────

def test_validate_question_consistent():
    ok, computed = validate_question({
        "operation": "insertAtHead", "initialNodes": chain(1, 2),
        "operationValue": 9, "goalPattern": [9, 1, 2],
    })
    assert ok and computed == [9, 1, 2]

def test_validate_question_inconsistent():
    ok, computed = validate_question({
        "operation": "insertAtHead", "initialNodes": chain(1, 2),
        "operationValue": 9, "goalPattern": [1, 2, 9],   # wrong claim
    })
    assert not ok and computed == [9, 1, 2]
