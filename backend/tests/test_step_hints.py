"""Step-hint content integrity — one table serves all three question types,
so every operation must have exactly one hint per pseudocode line."""
from app.services.static_questions import CONSIDER, TEMPLATES, step_hints_for


def test_every_operation_has_full_step_hint_coverage():
    for op, tmpl in TEMPLATES.items():
        hints = tmpl.get("step_hints")
        assert hints, f"{op} has no step_hints"
        assert len(hints) == len(tmpl["pseudocode"]), (
            f"{op}: {len(hints)} hints for {len(tmpl['pseudocode'])} pseudocode lines"
        )


def test_step_hints_are_socratic_not_answers():
    for op, tmpl in TEMPLATES.items():
        for i, hint in enumerate(tmpl["step_hints"]):
            assert len(hint) > 15, f"{op}[{i}] too short to be meaningful"
            # a hint must never restate the full line it belongs to
            assert tmpl["pseudocode"][i] not in hint, f"{op}[{i}] reveals its own line"


def test_helper_returns_parallel_array():
    assert step_hints_for("insertAtHead") == TEMPLATES["insertAtHead"]["step_hints"]
    assert step_hints_for("nonexistent") == []


def test_question_payload_carries_step_hints():
    from app.services.claude_service import generate_question
    q = generate_question("insertAtHead", type_unlocked=1)   # static path, no API call
    assert q["step_hints"] == TEMPLATES["insertAtHead"]["step_hints"]
    assert len(q["step_hints"]) == len(q["pseudocode"])
