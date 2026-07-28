"""
Tutor-agent simulation harness for OpenLearnQuest.

Calls tutor_agent.chat() directly with synthetic student scenarios — no DB, no
server, no gameplay needed. Records lookup_resource tool calls via monkeypatch
and checks the hard rules from TUTOR_SYSTEM_PROMPT:

  FAIL (exit 1): empty reply / answer leaked verbatim / wrong-type vocabulary
  WARN (exit 0): tool-use expectation not met (tool timing is model discretion)

Run from backend/ with the project venv:
    d:/openLearnquest/venv/Scripts/python.exe ../.claude/skills/tutor-sim/tutor_sim.py [--scenario NAME] [--show-context]
"""
import argparse
import sys

sys.stdout.reconfigure(encoding="utf-8")  # Windows console defaults to cp1252; replies contain '→'
sys.path.insert(0, ".")  # expects cwd == backend/

import app.services.tutor_agent as ta

INSERT_AT_HEAD = {
    "correct": ["newNode = createNode(value);", "newNode.next = head;", "head = newNode;"],
    "wrong":   ["newNode = createNode(value);", "head = newNode;", "newNode.next = head;"],
}

SCENARIOS = {
    # First mistake, first message — expect one Socratic question, no tool yet.
    "fresh_error1": {
        "kwargs": dict(
            question_title="Insert at Head", operation="insertAtHead",
            your_answer=INSERT_AT_HEAD["wrong"], correct_answer=INSERT_AT_HEAD["correct"],
            error_count=1, messages=[], user_message="I don't get why this is wrong.",
            question_type="ordering",
        ),
        "expect_tool": False,
    },
    # error_count >= 2 — system prompt says the model should call lookup_resource.
    "stuck_error2": {
        "kwargs": dict(
            question_title="Insert at Head", operation="insertAtHead",
            your_answer=INSERT_AT_HEAD["wrong"], correct_answer=INSERT_AT_HEAD["correct"],
            error_count=2, messages=[], user_message="I tried again and it's still wrong, I'm stuck.",
            question_type="ordering",
        ),
        "expect_tool": True,
    },
    # fill_blank vocabulary — must not talk about "assembly" / placement order.
    # Also exercises board_note (the lifted board state: where the student is).
    "fill_blank_vocab": {
        "kwargs": dict(
            question_title="Insert at Head", operation="insertAtHead",
            your_answer=["newNode = createNode(value);", "___.next = head;", "head = newNode;"],
            correct_answer=["newNode = createNode(value);", "newNode.next = head;", "head = newNode;"],
            error_count=1, messages=[], user_message="Why is my second blank wrong?",
            question_type="fill_blank",
            board_note="Student is on the blank in step 2; last tried 'head' there — wrong.",
        ),
        "expect_tool": False,
        "forbidden": ["assembly", "order you placed"],
    },
    # Student demands the answer — reply must not contain a correct line verbatim.
    # New policy: on give-up the tutor should offer the video (if unused) instead.
    "give_up": {
        "kwargs": dict(
            question_title="Insert at Head", operation="insertAtHead",
            your_answer=INSERT_AT_HEAD["wrong"], correct_answer=INSERT_AT_HEAD["correct"],
            error_count=1, messages=[], user_message="Just tell me the correct order, I give up.",
            question_type="ordering",
        ),
        "expect_tool": True,
        "no_leak": True,
    },
    # Student makes a WRONG claim — reply must open with an explicit verdict.
    "verdict_wrong_claim": {
        "kwargs": dict(
            question_title="Insert at Head", operation="insertAtHead",
            your_answer=INSERT_AT_HEAD["wrong"], correct_answer=INSERT_AT_HEAD["correct"],
            error_count=1, messages=[],
            user_message="I think head = newNode has to come first, before newNode.next = head.",
            question_type="ordering",
        ),
        "expect_tool": False,
        "required_any": ["not quite", "close", "not exactly"],
        "no_leak": True,
    },
    # Student makes a CORRECT claim — reply must confirm it, not just ask again.
    "verdict_correct_claim": {
        "kwargs": dict(
            question_title="Insert at Head", operation="insertAtHead",
            your_answer=INSERT_AT_HEAD["wrong"], correct_answer=INSERT_AT_HEAD["correct"],
            error_count=1, messages=[],
            user_message="If I overwrite head first, the old head node is lost because nothing points to it anymore.",
            question_type="ordering",
        ),
        "expect_tool": False,
        "required_any": ["right", "exactly", "yes"],
    },
    # Tutor has already asked 2 questions and the student is still stuck →
    # policy says STOP quizzing and hand out the video.
    "third_turn_video": {
        "kwargs": dict(
            question_title="Insert at Head", operation="insertAtHead",
            your_answer=INSERT_AT_HEAD["wrong"], correct_answer=INSERT_AT_HEAD["correct"],
            error_count=1,
            messages=[
                {"role": "user", "content": "I don't get why this is wrong."},
                {"role": "assistant", "content": "What does head = newNode do to the old head in your first step?"},
                {"role": "user", "content": "I'm not sure... it changes head to the new node?"},
                {"role": "assistant", "content": "Close — it repoints head; what happens to the node head used to point to?"},
            ],
            user_message="I really don't know, I'm still confused.",
            question_type="ordering",
        ),
        "expect_tool": True,
    },
    # Tutor already asked 2 questions BUT the student is progressing (their last
    # answer is correct) — policy: momentum, NOT a video detour. Regression from
    # live testing: the model sent the video right after a "Right —" verdict.
    "no_video_when_progressing": {
        "kwargs": dict(
            question_title="Insert at Head", operation="insertAtHead",
            your_answer=INSERT_AT_HEAD["wrong"], correct_answer=INSERT_AT_HEAD["correct"],
            error_count=2,
            messages=[
                {"role": "user", "content": "I don't get why this is wrong."},
                {"role": "assistant", "content": "What does head = newNode do to the old head in your first step?"},
                {"role": "user", "content": "Hmm, it changes head to point at the new node?"},
                {"role": "assistant", "content": "Right — and what happens to the node head used to point to?"},
            ],
            user_message="Oh! The old head gets lost because nothing points to it anymore.",
            question_type="ordering",
        ),
        "expect_tool": False,
        "required_any": ["right", "exactly", "yes"],
    },
    # Cross-session history injection — the tutor should be able to reference it.
    "history_recall": {
        "kwargs": dict(
            question_title="Insert at Head", operation="insertAtHead",
            your_answer=INSERT_AT_HEAD["wrong"], correct_answer=INSERT_AT_HEAD["correct"],
            error_count=1, messages=[], user_message="Hmm, this looks wrong again.",
            question_type="ordering",
            student_history=(
                "Past performance on insertAtHead: 6 attempts total, 2 passes (33% pass rate), current streak: 0\n"
                "Recurring wrong answers (from mistake book, most recent first):\n"
                "  - newNode = createNode(value); → head = newNode; → newNode.next = head;"
            ),
        ),
        "expect_tool": False,
    },
}


def run_scenario(name: str, show_context: bool) -> list[str]:
    """Run one scenario; return a list of hard-failure descriptions (empty = ok)."""
    sc = SCENARIOS[name]
    kwargs = sc["kwargs"]

    if show_context:
        msgs = ta.build_api_messages(**{**kwargs, "error_diagnosis": None,
                                        "student_history": kwargs.get("student_history", "")})
        print(f"--- context for '{name}' ---\n{msgs[0]['content']}\n--- end context ---\n")
        return []

    tool_calls: list[tuple[str, dict]] = []
    orig = ta._execute_tool

    def recording_execute(tool_name: str, input_data: dict) -> str:
        tool_calls.append((tool_name, input_data))
        return orig(tool_name, input_data)

    ta._execute_tool = recording_execute
    try:
        reply = ta.chat(**kwargs)
    finally:
        ta._execute_tool = orig

    failures: list[str] = []
    warnings: list[str] = []

    if not reply.strip():
        failures.append("empty reply")
    if sc.get("no_leak"):
        student_lines = set(kwargs["your_answer"])
        for line in kwargs["correct_answer"]:
            if line not in student_lines and line in reply:
                failures.append(f"answer leak: reply contains correct line '{line}'")
    for word in sc.get("forbidden", []):
        if word.lower() in reply.lower():
            failures.append(f"vocabulary: reply uses '{word}' on a {kwargs['question_type']} question")
    req = sc.get("required_any", [])
    if req and not any(w.lower() in reply.lower() for w in req):
        failures.append(f"verdict/feedback missing: expected one of {req} in the reply")
    if sc["expect_tool"] and not tool_calls:
        warnings.append("expected lookup_resource, model did not call it (discretion — verify prompt if persistent)")
    if not sc["expect_tool"] and tool_calls:
        warnings.append(f"unexpected tool call: {tool_calls}")

    status = "FAIL" if failures else "pass"
    print(f"[{status}] {name}")
    print(f"    student: {kwargs['user_message']}")
    print(f"    tutor:   {reply}")
    if tool_calls:
        print(f"    tools:   {[(n, i.get('concept')) for n, i in tool_calls]}")
    for f in failures:
        print(f"    FAIL: {f}")
    for w in warnings:
        print(f"    warn: {w}")
    print()
    return failures


def _conversation_config(operation: str, qtype: str, errors: int) -> dict:
    """Build chat() kwargs for ANY operation/type from the real backend templates."""
    from app.services.static_questions import TEMPLATES, _BUGS
    tmpl = TEMPLATES[operation]
    correct = [tmpl["pseudocode"][i] for i in tmpl["correctOrder"]]

    if qtype == "ordering":
        # find a swap that is GENUINELY wrong — some templates accept multiple
        # valid orders (validOrders), and a naive swap can land on one of them
        valid_line_orders = [
            [tmpl["pseudocode"][i] for i in order]
            for order in (tmpl.get("validOrders") or [tmpl["correctOrder"]])
        ]
        wrong = None
        for i in range(len(correct) - 2, -1, -1):
            cand = list(correct)
            cand[i], cand[i + 1] = cand[i + 1], cand[i]
            if cand not in valid_line_orders:
                wrong = cand
                break
        assert wrong is not None, f"no invalid swap found for {operation}"
        your_answer, board_note = wrong, None
    elif qtype == "fill_blank":
        your_answer = list(correct)
        # blank out a token in step 2 (or 1) — mirrors the reconstructed board lines
        j = 1 if len(your_answer) > 1 else 0
        your_answer[j] = "___" + your_answer[j][your_answer[j].find(" "):] if " " in your_answer[j] else "___"
        board_note = f"Student is on the blank in step {j + 1}."
    else:  # find_bug
        bug = _BUGS[operation]
        your_answer = list(correct)
        your_answer[bug["line"]] = bug["buggy"]
        board_note = "Student is looking for the buggy line."

    return dict(
        question_title=tmpl["title"], operation=operation,
        your_answer=your_answer, correct_answer=correct,
        error_count=errors, messages=[], question_type=qtype,
        board_note=board_note,
    )


def auto_conversation(turns: int, persona: str, operation: str = "insertAtHead",
                      qtype: str = "ordering", errors: int = 1) -> None:
    """Watch a full conversation unfold: Haiku plays the student for N turns.
    Costs ~2 calls per turn (student + tutor). Prints the transcript; no checks."""
    from anthropic import Anthropic
    from app.config import settings
    client = Anthropic(api_key=settings.anthropic_api_key)

    base = _conversation_config(operation, qtype, errors)
    history: list[dict] = []
    student_msg = "I don't get why this is wrong."
    tool_calls: list = []

    orig = ta._execute_tool
    def recording_execute(tool_name, input_data):
        tool_calls.append(input_data.get("concept"))
        return orig(tool_name, input_data)
    ta._execute_tool = recording_execute

    print(f"=== auto conversation: {turns} turns, student persona: {persona} ===")
    print(f"(operation: {base['operation']}, type: {base['question_type']}, "
          f"error_count: {base['error_count']}, board_note: {base.get('board_note')})\n")
    try:
        for i in range(turns):
            print(f"  student: {student_msg}")
            reply = ta.chat(**{**base, "messages": history, "user_message": student_msg})
            print(f"  tutor:   {reply}")
            if tool_calls:
                print(f"           [lookup_resource called: {tool_calls[-1]}]")
                tool_calls.clear()
            print()
            history += [{"role": "user", "content": student_msg},
                        {"role": "assistant", "content": reply}]
            if i == turns - 1:
                break
            # Haiku plays the student for the next turn
            sim = client.messages.create(
                model="claude-haiku-4-5", max_tokens=120,
                messages=[{"role": "user", "content":
                    f"You are role-playing a student in a linked-list tutoring session. "
                    f"Persona: {persona}. Your (wrong) attempt was: "
                    f"{' then '.join(base['your_answer'])}. Below is the conversation so far. "
                    f"Reply with ONLY the student's next short message (1-2 sentences, casual, "
                    f"stay in character, do not solve it instantly).\n\n"
                    + "\n".join(f"{m['role']}: {m['content']}" for m in history)}],
            )
            student_msg = sim.content[0].text.strip()
    finally:
        ta._execute_tool = orig
    print(f"=== transcript complete: {len(history) // 2} exchanges ===")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--scenario", default="all", choices=["all", *SCENARIOS])
    parser.add_argument("--show-context", action="store_true",
                        help="print the built first-turn context block instead of calling the API")
    parser.add_argument("--auto-student", type=int, metavar="N", default=0,
                        help="watch a live N-turn conversation (Haiku plays the student)")
    parser.add_argument("--persona", default="a confused beginner who understands slowly and sometimes guesses wrong",
                        help="student persona for --auto-student")
    parser.add_argument("--op", default="insertAtHead", help="operation for --auto-student")
    parser.add_argument("--qtype", default="ordering", choices=["ordering", "fill_blank", "find_bug"],
                        help="question type for --auto-student")
    parser.add_argument("--errors", type=int, default=1, help="board error_count for --auto-student")
    args = parser.parse_args()

    if args.auto_student > 0:
        auto_conversation(args.auto_student, args.persona, args.op, args.qtype, args.errors)
        return 0

    names = list(SCENARIOS) if args.scenario == "all" else [args.scenario]
    all_failures: list[str] = []
    for name in names:
        all_failures += run_scenario(name, args.show_context)

    if not args.show_context:
        print(f"{len(names)} scenario(s) run, {len(all_failures)} hard failure(s)")
    return 1 if all_failures else 0


if __name__ == "__main__":
    sys.exit(main())
