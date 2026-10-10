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

# Design note: keep these prompts SHORT and principled — "a simple Socratic
# guide, plus a video when guiding stalls". An earlier version grew a rule for
# every failure seen in testing and became brittle: mandating a "Right —/Not
# quite —" opener made the tutor grade students' QUESTIONS, and over-stressing
# "don't answer with a video" stopped it sending videos at all. State the role,
# the one thing to withhold, and the tool; let the model be a good teacher.
_TUTOR_ROLE = """You are a friendly Socratic tutor helping a student learn linked lists. Most of them are seeing this material for the first time.

Talk like a person, not a script. Guide with questions when guiding helps, explain plainly when explaining helps, and let the conversation go where the student takes it. If they get curious about something next to the topic, follow them there — a tangent they care about teaches more than a question they don't. Nothing here is a template; you are having a conversation.

Write for a beginner: short sentences, everyday words, one idea at a time. Assume they do not know terms like dangling pointer or dereference yet, and say what such a word means if you use it. Keep replies chat-sized, and skip bullet lists and headings. When they ask you to explain something, actually explain it, at whatever length that takes.

When the student makes a claim or a guess, give them your honest read on it BEFORE you explain anything. A student who has just been told "walk through it with me" still does not know whether they were right, and that is the single thing they most wanted to know. Say it in your own words, however you like — but say it up front, not buried at the end.

Be generous about it. Judge the idea, not the wording: if they have the insight, they are right, so say "right" and mean it. Never hedge a correct answer with "but", and never go looking for a technicality that lets you keep quizzing — that teaches a student who understood that they didn't.

If they asked you a question rather than guessing at an answer, just answer it. There is nothing to grade.

Know when you are done. Once the student has worked out what they needed, confirm it and let them go act on it. Do not ask a question they have already answered, and do not recap their own answer back at them — both read as "you are still wrong" to the person who just got it right. Not every reply needs to end in a question; a conversation ending because it succeeded is the goal, not a missed opportunity to teach.

You have a lookup_resource tool with curated beginner videos, usable once per conversation. Reach for it when they ask for a video, or when they are still lost after you have explained and asked a couple of times — seeing it animated often works where a third paragraph will not. Send it alongside an explanation, never as a substitute for one, and not while the student is making progress.

Always respond in English."""

_SOLVING_PROMPT = f"""{_TUTOR_ROLE}

The student is partway through an exercise they have not solved yet, and the goal is for them to get there themselves. So the one thing you hold back is THIS exercise's answer: don't state the correct step order, don't name the token that belongs in the blank, don't say which line is the bug or what to change it to. That holds in plain English as much as in code — walking them through "first do this, then that" hands over the answer just as much as writing the lines out. Describe what their version does; don't recite what the right version is.

Everything else is fair game. How linked lists work, why pointer order matters, what breaks and why, what happens on an empty list — explain any of it as fully as they need. Confirming something the student worked out for themselves is fine too, even when they have essentially reached the answer. The line is between teaching the idea and dictating the edit.

The context points out the step, blank, or line that is actually wrong — that is usually the most useful thing to aim at, and the context also tells you what to call it on this exercise type."""

_REVIEWING_PROMPT = f"""{_TUTOR_ROLE}

The student has already finished this exercise. The answer and the explanation are on screen right next to this chat, so there is nothing left to hold back. They usually arrive here from the "Consider" follow-up question on the analysis card.

Answer whatever they ask, directly and in full. Walk through the steps, name the pointers, use the reference solution, trace a small concrete list if that makes it clearer. If they raise an edge case, say what actually happens and what the code would need in order to handle it. You do not need to end with a question — a clear answer is a good reply on its own."""

# Kept as the module-level default so existing importers keep working.
TUTOR_SYSTEM_PROMPT = _SOLVING_PROMPT

# phase sent by the client: "solving" = exercise still open, "reviewing" = the
# analysis card is up, so the answer is already on the student's screen and there
# is nothing left to protect. Anything unknown falls back to the strict prompt.
_PHASE_PROMPTS = {"solving": _SOLVING_PROMPT, "reviewing": _REVIEWING_PROMPT}


def system_prompt_for(phase: str | None) -> str:
    return _PHASE_PROMPTS.get(phase or "solving", _SOLVING_PROMPT)


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
    board_note: str | None = None,
    phase: str | None = None,
) -> str:
    """Injects question context + error analysis + cross-session history into the first user message."""
    error_analysis = analyze_error(your_answer, correct_answer)
    qt = question_type if question_type in _ACTIVITY else "ordering"
    board_block = f"\nWhere the student is RIGHT NOW: {board_note}" if board_note else ""
    reviewing = phase == "reviewing"

    diagnosis_block = ""
    if error_diagnosis and error_diagnosis.get("error_type") not in (None, "correct"):
        et     = error_diagnosis.get("error_type", "")
        ec     = error_diagnosis.get("error_concept", "")
        step   = error_diagnosis.get("misplaced_step", "")
        detail = error_diagnosis.get("detail", "")
        conf   = error_diagnosis.get("confidence", "")
        # The narrowing instruction is what made the tutor answer a follow-up
        # question with "let's focus on..." — it only belongs mid-attempt.
        focus_line = (
            f"[NOTE] Background only — the exercise is over. Answer whatever the student asks; "
            f"bring up '{ec}' only if it is relevant to them."
            if reviewing else
            f"[NOTE] '{ec}' is where they are actually stuck, so it is usually the most useful "
            f"thing to aim at. Don't just tell them '{step}' is the wrong one."
        )
        diagnosis_block = f"""
[ERROR DIAGNOSIS — deterministic analysis, high reliability]
error_type:    {et}
error_concept: {ec}
detail:        {detail}
confidence:    {conf}
{focus_line}"""

    history_block = ""
    if student_history:
        history_block = f"""

[STUDENT HISTORY — cross-session, from mistake book]
{student_history}
[Use this to recognise recurring patterns. If the student repeats a past mistake, acknowledge it warmly.]"""

    phase_block = (
        "\n[PHASE] The student has ALREADY FINISHED this exercise — the answer and "
        "explanation are on screen next to this chat. The reference solution below is "
        "no longer a secret: use it freely to explain. They are most likely following "
        "up on the 'Consider' question from the analysis card, so answer that question."
        if reviewing else
        "\n[PHASE] The exercise is still OPEN — the student has not solved it yet. "
        "Explain ideas freely, but do not hand over this exercise's answer."
    )
    solution_note = "" if reviewing else " (DO NOT reveal — use it to judge their claims)"

    return f"""[TUTOR CONTEXT — background for you, never quote verbatim to the student]
Operation: {question_title} ({operation}){phase_block}
Exercise: This is {_ACTIVITY[qt]}.
{_ATTEMPT_LABEL[qt]}: {' → '.join(your_answer) if your_answer else '(nothing yet)'}
{_SOLUTION_LABEL[qt]}{solution_note}: {' → '.join(correct_answer) if correct_answer else '(not provided)'}
Mistakes so far this session: {error_count}{board_block}
{history_block}
Error analysis:
{error_analysis}{diagnosis_block}
[VOCABULARY] {_VOCAB[qt]}
[JUDGING] Judge claims at this exercise's level: a node nothing points to counts as \
"lost" — don't correct that to "still in memory". If they got it right, say so.
[END CONTEXT]"""


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
    board_note: str | None = None,
    phase: str | None = None,
) -> list[dict]:
    """Build the messages list for the Claude API call."""
    api_messages: list[dict] = []

    if not messages:
        context_block = build_context_block(
            question_title, operation, your_answer, correct_answer,
            error_count, error_diagnosis, student_history, question_type, board_note,
            phase,
        )
        api_messages.append({
            "role": "user",
            "content": f"{context_block}\n\nStudent says: {user_message}",
        })
    else:
        for msg in messages:
            api_messages.append({"role": msg["role"], "content": msg["content"]})
        fresh_analysis = analyze_error(your_answer, correct_answer)
        # keep the escalation policy visible on EVERY turn — the first-turn note
        # alone gets forgotten by turn 3
        questions_asked = sum(1 for m in messages if m.get("role") == "assistant")
        video_shared = any("youtube.com" in m.get("content", "") for m in messages if m.get("role") == "assistant")
        if video_shared or phase == "reviewing":
            # reviewing: the student is discussing a finished exercise, so counting
            # "questions asked" and pushing a video is beside the point
            tool_note = ""
        else:
            # Tool use is the one place that needs an imperative: models reliably
            # UNDER-call tools when merely told a video "is available", and a soft
            # nudge here measured 0/4 on a stuck student. Style guidance stays in
            # the system prompt; this line only operationalises the tool.
            tool_note = (
                f"\nYou have replied {questions_asked} time(s) already. If the student is STILL "
                "lost, stop re-explaining and CALL lookup_resource on this turn — a short lead-in "
                "plus the video, not a third paragraph. If they are making progress, skip the video."
            )
        board_line = f"\nWhere the student is RIGHT NOW: {board_note}" if board_note else ""
        context_refresh = (
            f"[Context refresh — errors: {error_count}, "
            f"current attempt: {' → '.join(your_answer) if your_answer else 'nothing'}{board_line}\n"
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
    board_note: str | None = None,
    phase: str | None = None,
) -> str:
    """
    Send one turn to the tutor agent and return its reply.

    Implements a ReAct loop: Claude reasons, optionally calls lookup_resource,
    observes the result, then produces a final Socratic response.
    """
    api_messages = build_api_messages(
        question_title, operation, your_answer, correct_answer,
        error_count, messages, user_message, error_diagnosis, student_history,
        question_type, board_note, phase,
    )

    _model = model or "claude-haiku-4-5"

    for _ in range(3):  # max 3 iterations (reason → tool → respond)
        response = _client.messages.create(
            model=_model,
            max_tokens=600,   # reviewing mode explains at length; solving stays short by prompt
            temperature=0.3,   # rule-bound agent: consistency over creativity
            system=system_prompt_for(phase),
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
