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

TUTOR_SYSTEM_PROMPT = """You are a Socratic algorithm tutor. Your only tool is questions — plus one resource lookup tool when students are genuinely stuck.

RESPONSE FORMAT — strictly enforced:
- Reply with EXACTLY ONE sentence. One question, or one short observation followed by one question.
- Never write two sentences. Never use bullet points or numbered lists.
- If you feel the urge to explain more, stop — ask instead.
- Exception: if you called lookup_resource, include the URL on its own line, then ONE question.

ABSOLUTE RULES — zero exceptions:
1. NEVER state, confirm, or imply the correct order of steps. Not directly, not indirectly.
2. NEVER say things like "you need to set X before Y" or "the issue is at step N" — these reveal the answer.
3. If the student says "just tell me" or "I give up" — respond with ONE warm sentence and ONE question.
4. Never confirm that a specific step is correct. Treat all student guesses as hypotheses to examine.

QUESTION STRATEGY — pick the lowest-level question the student hasn't answered yet:
- Turn 1–2: Ask what a single line or token in their current attempt does to memory.
- Turn 3–4: Ask what would be lost or broken if that line/value were wrong or ran at the wrong moment.
- Turn 5+: Ask about the exact pointer that the wrong line/value affects.
- Use the vocabulary of the exercise type given in the context (a blank, a buggy line, or a step order).

WHEN TO USE lookup_resource:
- When error_count >= 2 AND you haven't suggested a resource yet in this conversation.
- When the student explicitly asks for a video, example, or resource.
- When the student has been stuck on the same concept for 3+ exchanges with no progress.
- Call it AT MOST ONCE per conversation — do not call it repeatedly.

TONE: One casual sentence. Warm but brief. No praise longer than two words ("Nice!", "Good.").

CONTEXT YOU WILL RECEIVE:
- The operation the student is implementing
- The exercise type (fill-in-the-blank, find-the-bug, or step ordering) — match its vocabulary
- Their current (wrong) attempt
- The reference solution (DO NOT reveal — use only to know WHICH pointer to ask about)
- Error count and conversation history

Always respond in English. One sentence (plus optional URL on its own line). End with a question mark."""


# ── Concept resource library ──────────────────────────────────────────────────
# Organized by concept (not by operation) so the tool can match the student's
# specific difficulty rather than just the operation they're practicing.

CONCEPT_RESOURCE_LIBRARY: dict[str, list[dict]] = {
    "pointer_assignment": [
        {
            "title": "Linked List Operations (NeetCode)",
            "url": "https://www.youtube.com/watch?v=Wf4QhpdVFQo",
            "focus": "Pay attention to pointer reassignment order — which pointer must be saved first?",
        },
        {
            "title": "Linked List Basics (NeetCode)",
            "url": "https://www.youtube.com/watch?v=5qZ2GwSgqm4",
            "focus": "The 'lost node' section shows what happens when you overwrite a pointer too early",
        },
    ],
    "traversal": [
        {
            "title": "Linked List Operations (NeetCode)",
            "url": "https://www.youtube.com/watch?v=Wf4QhpdVFQo",
            "focus": "Watch the traversal section — focus on the while-loop stop condition",
        },
        {
            "title": "Remove Node (NeetCode)",
            "url": "https://www.youtube.com/watch?v=JI71sxtHTng",
            "focus": "How to stop one node before the target when traversing",
        },
    ],
    "memory_management": [
        {
            "title": "Remove Node (NeetCode)",
            "url": "https://www.youtube.com/watch?v=JI71sxtHTng",
            "focus": "How to properly null-out pointers and avoid dangling references",
        },
        {
            "title": "Delete Entire List",
            "url": "https://www.youtube.com/watch?v=5qZ2GwSgqm4",
            "focus": "Setting head = null and freeing memory — what order matters?",
        },
    ],
    "node_creation": [
        {
            "title": "Linked List Operations (NeetCode)",
            "url": "https://www.youtube.com/watch?v=Wf4QhpdVFQo",
            "focus": "Node creation and initialization — what fields does a new node need?",
        },
    ],
    "list_structure": [
        {
            "title": "Reverse Linked List (NeetCode)",
            "url": "https://www.youtube.com/watch?v=G0_I-ZF0S38",
            "focus": "The three-pointer technique for restructuring list pointers",
        },
        {
            "title": "Merge Two Sorted Lists (NeetCode)",
            "url": "https://www.youtube.com/watch?v=XIdigk956u0",
            "focus": "Dummy node technique and how to build the result list step by step",
        },
        {
            "title": "Detect Cycle (NeetCode)",
            "url": "https://www.youtube.com/watch?v=gBTe7lFR3vc",
            "focus": "Fast/slow pointer pattern — why does the math guarantee they meet?",
        },
        {
            "title": "Sort Linked List (NeetCode)",
            "url": "https://www.youtube.com/watch?v=TGveA1oFhrc",
            "focus": "Merge sort on a linked list — splitting and merging phases",
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
[END CONTEXT]

Note: You have a lookup_resource tool. Use it if error_count >= 2 and you haven't used it yet."""


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
        context_refresh = (
            f"[Context refresh — errors: {error_count}, "
            f"current attempt: {' → '.join(your_answer) if your_answer else 'nothing'}\n"
            f"Updated error analysis:\n{fresh_analysis}]\n"
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
