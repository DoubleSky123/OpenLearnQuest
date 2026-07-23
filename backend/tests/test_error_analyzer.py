"""error_analyzer: deterministic diagnosis that feeds the tutor and telemetry."""
from app.services.error_analyzer import analyze_error

CORRECT = ["newNode = createNode(value);", "newNode.next = head;", "head = newNode;"]


def test_correct_assembly():
    r = analyze_error("insertAtHead", CORRECT, CORRECT)
    assert r["error_type"] == "correct"


def test_wrong_order_detected():
    swapped = [CORRECT[0], CORRECT[2], CORRECT[1]]
    r = analyze_error("insertAtHead", swapped, CORRECT)
    assert r["error_type"] == "wrong_order"
    assert r["first_wrong_pos"] == 1
    assert r["error_concept"] in ("node_creation", "pointer_assignment")


def test_distractor_used_detected():
    with_distractor = [CORRECT[0], "free(temp);", CORRECT[2]]
    r = analyze_error("insertAtHead", with_distractor, CORRECT, distractors=["free(temp);"])
    assert r["error_type"] == "distractor_used"
    assert r["misplaced_step"] == "free(temp);"


def test_empty_answer_is_missing_steps():
    r = analyze_error("insertAtHead", [], CORRECT)
    assert r["error_type"] == "missing_steps"
    assert r["error_concept"]           # always maps to a concept
