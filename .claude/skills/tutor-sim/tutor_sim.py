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
    "fill_blank_vocab": {
        "kwargs": dict(
            question_title="Insert at Head", operation="insertAtHead",
            your_answer=["newNode", "head.next", "newNode"],
            correct_answer=["newNode", "head", "newNode"],
            error_count=1, messages=[], user_message="Why is my second blank wrong?",
            question_type="fill_blank",
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


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--scenario", default="all", choices=["all", *SCENARIOS])
    parser.add_argument("--show-context", action="store_true",
                        help="print the built first-turn context block instead of calling the API")
    args = parser.parse_args()

    names = list(SCENARIOS) if args.scenario == "all" else [args.scenario]
    all_failures: list[str] = []
    for name in names:
        all_failures += run_scenario(name, args.show_context)

    if not args.show_context:
        print(f"{len(names)} scenario(s) run, {len(all_failures)} hard failure(s)")
    return 1 if all_failures else 0


if __name__ == "__main__":
    sys.exit(main())
