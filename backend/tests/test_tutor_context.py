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


# ── video: nudge timing + the link itself are enforced in code ───────────────
from types import SimpleNamespace

import app.services.tutor_agent as ta

NUDGE = "CALL lookup_resource"


def _history(replies):
    out = []
    for i in range(replies):
        out += [{"role": "user", "content": f"student {i}"}, {"role": "assistant", "content": f"tutor {i}"}]
    return out


def test_video_nudge_waits_until_the_tutor_has_replied_twice():
    # 1 reply = only the proactive opener so far: no nudge yet (it used to fire here)
    assert NUDGE not in build_api_messages(**ARGS, messages=_history(1))[-1]["content"]
    assert NUDGE in build_api_messages(**ARGS, messages=_history(2))[-1]["content"]


def test_no_video_nudge_once_a_video_was_shared_or_when_reviewing():
    shared = _history(2) + [{"role": "user", "content": "?"},
                            {"role": "assistant", "content": "https://www.youtube.com/watch?v=abc"}]
    assert NUDGE not in build_api_messages(**ARGS, messages=shared)[-1]["content"]
    assert NUDGE not in build_api_messages(**ARGS, messages=_history(3), phase="reviewing")[-1]["content"]


TOOL_OUT = ("Resources for concept 'pointer_assignment' (share the URL in your reply):\n"
            "- Linked List Insertion: https://www.youtube.com/watch?v=5ao9KfGga3c\n  Focus tip: x")


def test_missing_video_link_is_appended():
    link = ta.missing_video_link("The first one is perfect for this.", [TOOL_OUT])
    assert "https://www.youtube.com/watch?v=5ao9KfGga3c" in link and "Linked List Insertion" in link
    assert ta.missing_video_link("Watch https://www.youtube.com/watch?v=5ao9KfGga3c", [TOOL_OUT]) == ""
    assert ta.missing_video_link("No video here.", []) == ""


def test_chat_appends_the_link_when_the_model_leaves_it_out(monkeypatch):
    replies = iter([
        SimpleNamespace(stop_reason="tool_use", content=[SimpleNamespace(
            type="tool_use", id="t1", name="lookup_resource", input={"concept": "pointer_assignment", "reason": "stuck"})]),
        SimpleNamespace(stop_reason="end_turn", content=[SimpleNamespace(type="text", text="The first one is perfect for this.")]),
    ])
    monkeypatch.setattr(ta, "_client", SimpleNamespace(messages=SimpleNamespace(create=lambda **kw: next(replies))))
    reply = ta.chat(**ARGS, messages=[])
    assert reply.startswith("The first one is perfect for this.")
    assert "https://www.youtube.com/watch?v=" in reply


# ── answer reveal: withheld while solving, the final hint lifts it for one step ─
def test_solving_turns_restate_the_withholding_principle():
    first = build_api_messages(**ARGS, messages=[])[0]["content"]
    later = build_api_messages(**ARGS, messages=_history(3))[-1]["content"]
    for msg in (first, later):
        assert "[PHASE] The exercise is still OPEN" in msg and "final hint" in msg
        assert "[FINAL HINT]" not in msg


def test_final_hint_lets_the_tutor_state_the_current_step():
    args = {**ARGS, "error_count": 3}
    first = build_api_messages(**args, messages=[], final_hint=True)[0]["content"]
    later = build_api_messages(**args, messages=_history(3), final_hint=True)[-1]["content"]
    for msg in (first, later):
        assert "[FINAL HINT]" in msg and "[PHASE] The exercise is still OPEN" not in msg
    assert "DO NOT reveal" not in first
    assert ta.system_prompt_for("solving", True) is ta._FINAL_HINT_PROMPT


def test_final_hint_needs_real_mistakes_and_an_open_exercise():
    assert ta.final_hint_allowed("solving", True, ta.FINAL_HINT_MIN_ERRORS)
    assert ta.final_hint_allowed(None, True, 5)
    assert not ta.final_hint_allowed("solving", True, ta.FINAL_HINT_MIN_ERRORS - 1)   # client can't skip ahead
    assert not ta.final_hint_allowed("solving", False, 9)
    assert not ta.final_hint_allowed("reviewing", True, 9)
    assert ta.system_prompt_for("reviewing", True) is ta._REVIEWING_PROMPT
    assert ta.system_prompt_for("solving", False) is ta._SOLVING_PROMPT


def test_saying_i_dont_know_in_chat_never_unlocks_the_answer():
    # a student who only types "I don't know" makes no board mistakes; even if a
    # client asked for the final hint, the server refuses it below the threshold
    stuck_chat = []
    for _ in range(6):
        stuck_chat += [{"role": "user", "content": "I don't know"}, {"role": "assistant", "content": "What happens to head?"}]
    allowed = ta.final_hint_allowed("solving", True, 2)
    msg = build_api_messages(**{**ARGS, "error_count": 2}, messages=stuck_chat, final_hint=allowed)[-1]["content"]
    assert not allowed
    assert "[FINAL HINT]" not in msg and "ON THE BOARD" in msg   # the tutor is told only board tries count
