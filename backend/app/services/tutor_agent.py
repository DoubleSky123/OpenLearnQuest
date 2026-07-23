"""
Socratic tutoring agent with ReAct (Reason + Act) loop.

Design principles:
- NEVER reveal the answer, even if the student asks directly or repeatedly.
- Guide with leading questions that help the student discover the mistake themselves.
- Use lookup_resource tool when student is stuck 2+ turns or error_count >= 2.
- Always stay encouraging and patient.
"""

from anthropic import Anthropic
from ..config import settings

_client = Anthropic(api_key=settings.anthropic_api_key)

TUTOR_SYSTEM_PROMPT = """You are a Socratic algorithm tutor. You give an honest verdict on what the student just said, ask ONE focused question about their actual mistake, and hand out one curated video when questioning isn't landing.

RESPONSE FORMAT — strictly enforced:
- Reply with AT MOST TWO sentences: (1) a VERDICT on the student's last answer, (2) ONE question.
- The verdict is MANDATORY whenever the student made a claim, guess, or attempt. Start with one of: "Right —", "Exactly —", "Close —", "Not quite —" so the student always knows if they are correct, wrong, or getting warm. Never respond to an answer with only another question.
- Be GENEROUS when judging: if the student's claim is essentially correct at the level of this exercise, open with "Right —" or "Exactly —". Do not nitpick technicalities or downgrade a correct insight to keep the conversation going — earned confirmation is the feedback they need.
  Example: "the old head node is lost / I lose the old head" is CORRECT (an unreachable node IS lost at this level) — never quibble that "the node is still in memory" or "head is just a reference". Judge the insight, not the phrasing.
- If the student asked a neutral question (nothing to judge), skip the verdict and reply with one guiding question.
- Never use bullet points or numbered lists.
- Exception: if you called lookup_resource, format as: verdict (if any) → the URL on its own line → one sentence telling them what to watch for → ONE question connecting the video to their current mistake.

ABSOLUTE RULES — zero exceptions:
1. NEVER state the full correct order or dictate the exact fix ("you need to set X before Y" / "the answer is ..." are forbidden).
2. Judging the STUDENT'S OWN words is required; revealing the ANSWER is forbidden. Know the difference: "Right — that node would be lost" is good feedback; "Correct, so the first step is newNode.next = head" is a violation because it hands over the solution.
3. If the student says "just tell me" or "I give up": give the verdict on their latest attempt, then call lookup_resource if you haven't used it yet; otherwise one warm sentence and one question.
4. VERDICT CALIBRATION: if you find yourself agreeing with the student's point, the verdict MUST be "Right —" or "Exactly —". Opening with "Not quite" and then restating their own insight in your words is FORBIDDEN — it teaches a correct student that they were wrong.

FOCUS — always anchor on the student's actual mistake:
- The context includes a deterministic error analysis naming the exact step / blank / line that is wrong. Your question MUST target that specific location or the pointer it affects — never a generic "what do you think happens?".
- Use the vocabulary of the exercise type given in the context (a blank, a buggy line, or a step order).
- If the student's message drifts away from their error, give your verdict on it, then steer back to the wrong step.

QUESTION STRATEGY — escalate concreteness, not difficulty:
- Question 1: what does the wrong line/blank/step in THEIR attempt do to memory?
- Question 2: what is lost or broken because it runs there?
- After that, prefer the video (below) over more questions.

WHEN TO USE lookup_resource (call it AT MOST ONCE per conversation):
- You have already asked 2 questions in this conversation and the student still hasn't got it — STOP quizzing and call it. Do not interrogate a stuck student endlessly.
- The student explicitly asks for a video, example, or resource.
- error_count >= 2 on their board.

TONE: warm, brief, honest. Praise no longer than two words ("Nice!", "Exactly!").

CONTEXT YOU WILL RECEIVE:
- The operation the student is implementing
- The exercise type (fill-in-the-blank, find-the-bug, or step ordering) — match its vocabulary
- Their current (wrong) attempt
- The reference solution (DO NOT reveal — use it to judge their claims and to know WHICH pointer to ask about)
- Error count and conversation history

Always respond in English. At most two sentences (plus optional URL on its own line). End with a question."""


# ── Concept resource library ──────────────────────────────────────────────────
# Organized by concept (not by operation) so the tool can match the student's
# specific difficulty rather than just the operation they're practicing.

# Beginner-level fundamentals only — professor feedback: LeetCode problem
# walkthroughs are too hard for students still learning the basic operations.
CONCEPT_RESOURCE_LIBRARY: dict[str, list[dict]] = {
    "pointer_assignment": [
        {
            "title": "Insert a Node in a Linked List — Animations (Study Algorithms)",
            "url": "https://www.youtube.com/watch?v=5ao9KfGga3c",
            "focus": "Watch the order the pointers are re-wired when inserting — which pointer must be saved before it gets overwritten?",
        },
        {
            "title": "Linked Lists Explained Visually",
            "url": "https://www.youtube.com/watch?v=PsTvZ_htHT8",
            "focus": "How each node points to the next — and what gets lost when you overwrite a pointer too early",
        },
    ],
    "traversal": [
        {
            "title": "Learn Linked Lists in 13 minutes",
            "url": "https://www.youtube.com/watch?v=N6dOwBde7-M",
            "focus": "The traversal part — how the loop walks node by node and exactly when it stops",
        },
        {
            "title": "Insert a Node in a Linked List — Animations (Study Algorithms)",
            "url": "https://www.youtube.com/watch?v=5ao9KfGga3c",
            "focus": "Finding the right position before inserting — why you stop one node BEFORE the target",
        },
    ],
    "memory_management": [
        {
            "title": "Learn Linked Lists in 13 minutes",
            "url": "https://www.youtube.com/watch?v=N6dOwBde7-M",
            "focus": "The deletion part — reconnect the neighbours before dropping a node so nothing dangles",
        },
        {
            "title": "Linked Lists Explained Visually",
            "url": "https://www.youtube.com/watch?v=PsTvZ_htHT8",
            "focus": "What a node in memory really is — and what 'losing' a node means",
        },
    ],
    "node_creation": [
        {
            "title": "Learn Linked Lists in 13 minutes",
            "url": "https://www.youtube.com/watch?v=N6dOwBde7-M",
            "focus": "Creating a node — which fields it needs (value + next) before you link it in",
        },
        {
            "title": "Insert a Node in a Linked List — Animations (Study Algorithms)",
            "url": "https://www.youtube.com/watch?v=5ao9KfGga3c",
            "focus": "Create the node FIRST, then wire it in — watch the animation of both steps",
        },
    ],
    "list_structure": [
        {
            "title": "Linked Lists Explained Visually",
            "url": "https://www.youtube.com/watch?v=PsTvZ_htHT8",
            "focus": "The overall shape of a singly linked list — head, the chain of next pointers, and null at the end",
        },
        {
            "title": "Learn Linked Lists in 13 minutes",
            "url": "https://www.youtube.com/watch?v=N6dOwBde7-M",
            "focus": "Bigger operations (reverse, merge) reuse the same pointer moves you've already practised",
        },
    ],
}

# ── Tool schema ───────────────────────────────────────────────────────────────

_TOOLS = [
    {
        "name": "lookup_resource",
        "description": (
            "Look up curated learning resources for the student based on their specific "
            "concept difficulty. Call this when the student is stuck and needs a concrete "
            "reference beyond Socratic questions. Returns 1-2 relevant video resources with "
            "URLs and specific focus tips."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "concept": {
                    "type": "string",
                    "enum": [
                        "pointer_assignment",
                        "traversal",
                        "memory_management",
                        "node_creation",
                        "list_structure",
                    ],
                    "description": "The concept the student is struggling with",
                },
                "reason": {
                    "type": "string",
                    "description": "One sentence: why this resource is needed right now",
                },
            },
            "required": ["concept", "reason"],
        },
    }
]


def _execute_tool(name: str, input_data: dict) -> str:
    """Execute a tool call and return the result as a string."""
    if name == "lookup_resource":
        concept = input_data.get("concept", "pointer_assignment")
        resources = CONCEPT_RESOURCE_LIBRARY.get(
            concept, CONCEPT_RESOURCE_LIBRARY["pointer_assignment"]
        )
        lines = [f"Resources for concept '{concept}' (share the URL in your reply):"]
        for r in resources[:2]:
            lines.append(f"- {r['title']}: {r['url']}")
            lines.append(f"  Focus tip: {r['focus']}")
        return "\n".join(lines)
    return f"Unknown tool: {name}"


# ── Error analysis (text version for context block) ───────────────────────────

def analyze_error(your_answer: list[str], correct_answer: list[str]) -> str:
    """
    Compare student's assembly against the correct order step by step.
    Returns a plain-English diagnosis for the model to reason from.
    """
    if not your_answer:
        return "The student has not entered an answer yet."

    lines = []
    for i, expected in enumerate(correct_answer):
        if i >= len(your_answer):
            lines.append(f"  Step {i+1}: missing — expected '{expected}'")
        elif your_answer[i] != expected:
            lines.append(f"  Step {i+1}: got '{your_answer[i]}' — should be '{expected}'")
        else:
            lines.append(f"  Step {i+1}: '{expected}' [ok]")

    for i in range(len(correct_answer), len(your_answer)):
        lines.append(f"  Step {i+1}: extra block '{your_answer[i]}' (shouldn't be here)")

    first_wrong = next(
        (i for i, e in enumerate(correct_answer)
         if i >= len(your_answer) or your_answer[i] != e),
        None,
    )
    if first_wrong is None:
        summary = "Assembly matches correct order — no errors detected."
    else:
        expected_at = correct_answer[first_wrong]
        got_at = your_answer[first_wrong] if first_wrong < len(your_answer) else "(missing)"
        summary = (
            f"First error at step {first_wrong + 1}: "
            f"student put '{got_at}', correct is '{expected_at}'."
        )

    return summary + "\nStep breakdown:\n" + "\n".join(lines)


# ── Context block builder ─────────────────────────────────────────────────────

def format_student_history(past_mistakes: list, mastery: object | None, operation: str) -> str:
    """
    Format past mistakes and mastery data into a plain-English block for context injection.
    `past_mistakes` is a list of Mistake ORM objects (newest first, max 5).
    """
    parts = []

    if mastery and mastery.attempts > 0:
        pass_rate = round(mastery.passes / mastery.attempts * 100)
        parts.append(
            f"Past performance on {operation}: "
            f"{mastery.attempts} attempts total, {mastery.passes} passes ({pass_rate}% pass rate), "
            f"current streak: {mastery.consecutive_passes}"
        )
    elif mastery:
        parts.append(f"Past performance on {operation}: first attempt ever")

    # Only show mistakes that have actual answer content
    meaningful = [m for m in past_mistakes if m.your_answer]
    if meaningful:
        parts.append(f"Recurring wrong answers (from mistake book, most recent first):")
        seen: set[str] = set()
        for m in meaningful:
            key = " → ".join(m.your_answer)
            if key not in seen:
                seen.add(key)
                parts.append(f"  - {key}")
        if len(past_mistakes) > len(meaningful):
            parts.append(f"  (+ {len(past_mistakes) - len(meaningful)} attempts with no answer recorded)")

    return "\n".join(parts)


# Per question-type wording so the tutor speaks in terms of the actual exercise
# (a blank / a buggy line / a step order) instead of always "assembly".
_ACTIVITY = {
    "fill_blank": "a fill-in-the-blank exercise: the student chooses the correct token for each blank in the pseudocode",
    "find_bug":   "a find-the-bug exercise: the student must spot the one wrong line and choose its fix",
    "ordering":   "a step-ordering exercise: the student assembles pseudocode lines into the correct order",
}
_VOCAB = {
    "fill_blank": "Refer to 'the blank' or 'the value that belongs here' — do NOT say 'assembly' or 'the order you placed'.",
    "find_bug":   "Refer to 'the line' or 'this step' — do NOT say 'assembly' or 'the order you placed'.",
    "ordering":   "Refer to 'the step' and 'the order you placed them in'.",
}
_ATTEMPT_LABEL  = {"fill_blank": "Student's current attempt", "find_bug": "Student's current attempt", "ordering": "Student assembled"}
_SOLUTION_LABEL = {"fill_blank": "Reference tokens",          "find_bug": "Reference solution",         "ordering": "Correct order"}


def build_context_block(
    question_title: str,
    operation: str,
    your_answer: list[str],
    correct_answer: list[str],
    error_count: int,
    error_diagnosis: dict | None = None,
    student_history: str = "",
    question_type: str | None = None,
) -> str:
    """Injects question context + error analysis + cross-session history into the first user message."""
    error_analysis = analyze_error(your_answer, correct_answer)
    qt = question_type if question_type in _ACTIVITY else "ordering"

    diagnosis_block = ""
    if error_diagnosis and error_diagnosis.get("error_type") not in (None, "correct"):
        et     = error_diagnosis.get("error_type", "")
        ec     = error_diagnosis.get("error_concept", "")
        step   = error_diagnosis.get("misplaced_step", "")
        detail = error_diagnosis.get("detail", "")
        conf   = error_diagnosis.get("confidence", "")
        diagnosis_block = f"""
[ERROR DIAGNOSIS — deterministic analysis, high reliability]
error_type:    {et}
error_concept: {ec}
detail:        {detail}
confidence:    {conf}
[INSTRUCTION] Ask ONE Socratic question specifically about '{ec}'. \
Do NOT ask about other concepts. Do NOT reveal '{step}' is wrong directly."""

    history_block = ""
    if student_history:
        history_block = f"""

[STUDENT HISTORY — cross-session, from mistake book]
{student_history}
[Use this to recognise recurring patterns. If the student repeats a past mistake, acknowledge it warmly.]"""

    return f"""[TUTOR CONTEXT — use this to guide, never quote verbatim to student]
Operation: {question_title} ({operation})
Exercise: This is {_ACTIVITY[qt]}.
{_ATTEMPT_LABEL[qt]}: {' → '.join(your_answer) if your_answer else '(nothing yet)'}
{_SOLUTION_LABEL[qt]}: {' → '.join(correct_answer) if correct_answer else '(not provided)'}
Mistakes so far this session: {error_count}
{history_block}
Error analysis:
{error_analysis}{diagnosis_block}
[VOCABULARY] {_VOCAB[qt]}
[JUDGING] Judge the student's claims at THIS exercise's level of abstraction: an \
unreachable node counts as "lost" — do not correct that to "still in memory". \
If their conclusion is right, your reply MUST open with "Right —" or "Exactly —".
[END CONTEXT]

Note: You have a lookup_resource tool (once per conversation). Use it if error_count >= 2, or once you have already asked 2 questions and the student is still stuck."""


# ── Message builder (shared by chat() and streaming route) ────────────────────

def build_api_messages(
    question_title: str,
    operation: str,
    your_answer: list[str],
    correct_answer: list[str],
    error_count: int,
    messages: list[dict],
    user_message: str,
    error_diagnosis: dict | None = None,
    student_history: str = "",
    question_type: str | None = None,
) -> list[dict]:
    """Build the messages list for the Claude API call."""
    api_messages: list[dict] = []

    if not messages:
        context_block = build_context_block(
            question_title, operation, your_answer, correct_answer,
            error_count, error_diagnosis, student_history, question_type,
        )
        api_messages.append({
            "role": "user",
            "content": f"{context_block}\n\nStudent says: {user_message}",
        })
    else:
        for msg in messages:
            api_messages.append({"role": msg["role"], "content": msg["content"]})
        fresh_analysis = analyze_error(your_answer, correct_answer)
        # keep the two-questions-then-video policy visible on EVERY turn — the
        # first-turn note alone gets forgotten by turn 3
        questions_asked = sum(1 for m in messages if m.get("role") == "assistant")
        video_shared = any("youtube.com" in m.get("content", "") for m in messages if m.get("role") == "assistant")
        tool_note = (
            "" if video_shared else
            f"\nQuestions you have asked so far: {questions_asked}. "
            "If that is 2 or more and the student is still stuck, STOP quizzing — call lookup_resource now."
        )
        context_refresh = (
            f"[Context refresh — errors: {error_count}, "
            f"current attempt: {' → '.join(your_answer) if your_answer else 'nothing'}\n"
            f"Updated error analysis:\n{fresh_analysis}{tool_note}]\n"
        )
        api_messages.append({"role": "user", "content": context_refresh + user_message})

    return api_messages


# ── ReAct chat loop ───────────────────────────────────────────────────────────

def chat(
    question_title: str,
    operation: str,
    your_answer: list[str],
    correct_answer: list[str],
    error_count: int,
    messages: list[dict],
    user_message: str,
    model: str | None = None,
    error_diagnosis: dict | None = None,
    student_history: str = "",
    question_type: str | None = None,
) -> str:
    """
    Send one turn to the tutor agent and return its reply.

    Implements a ReAct loop: Claude reasons, optionally calls lookup_resource,
    observes the result, then produces a final Socratic response.
    """
    api_messages = build_api_messages(
        question_title, operation, your_answer, correct_answer,
        error_count, messages, user_message, error_diagnosis, student_history, question_type,
    )

    _model = model or "claude-haiku-4-5"

    for _ in range(3):  # max 3 iterations (reason → tool → respond)
        response = _client.messages.create(
            model=_model,
            max_tokens=400,
            temperature=0.3,   # rule-bound agent: consistency over creativity
            system=TUTOR_SYSTEM_PROMPT,
            messages=api_messages,
            tools=_TOOLS,
        )

        if response.stop_reason == "end_turn":
            for block in response.content:
                if hasattr(block, "text"):
                    return block.text.strip()
            return ""

        if response.stop_reason == "tool_use":
            # Append assistant response (with tool_use blocks) to history
            api_messages.append({"role": "assistant", "content": response.content})

            # Execute each tool call and collect results
            tool_results = []
            for block in response.content:
                if block.type == "tool_use":
                    result = _execute_tool(block.name, block.input)
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": result,
                    })

            api_messages.append({"role": "user", "content": tool_results})
            continue

        break  # unexpected stop_reason

    return "What do you think happens to the pointer when that step runs?"
