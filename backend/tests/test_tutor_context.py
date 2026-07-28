"""Tutor context assembly — the pipe that carries the student's mistake to the
LLM. Board state (fill_blank/find_bug) rides in via board_note; ordering rides
in via your_answer + positional error analysis."""
from app.services.tutor_agent import build_api_messages

ARGS = dict(
    question_title="Insert at Head", operation="insertAtHead",
    your_answer=["newNode = createNode(value);", "___.next = NULL;", "head = newNode;"],
    correct_answer=["newNode = createNode(value);", "newNode.next = NULL;", "head = newNode;"],
    error_count=1, user_message="help",
)


def test_board_note_in_first_turn_context():
    msgs = build_api_messages(**ARGS, messages=[],
                              board_note="Student is on the blank in step 2; last tried 'head' there — wrong.")
    assert "Where the student is RIGHT NOW" in msgs[0]["content"]
    assert "last tried 'head'" in msgs[0]["content"]


def test_board_note_in_context_refresh():
    history = [{"role": "user", "content": "hi"}, {"role": "assistant", "content": "Which step?"}]
    msgs = build_api_messages(**ARGS, messages=history,
                              board_note="Student is on the blank in step 2.")
    assert "Where the student is RIGHT NOW" in msgs[-1]["content"]


def test_no_board_note_no_leftover_marker():
    msgs = build_api_messages(**ARGS, messages=[], board_note=None)
    assert "RIGHT NOW" not in msgs[0]["content"]


def test_error_analysis_pinpoints_the_blank():
    msgs = build_api_messages(**ARGS, messages=[])
    # positional comparison of the reconstructed lines names the exact step
    assert "First error at step 2" in msgs[0]["content"]
