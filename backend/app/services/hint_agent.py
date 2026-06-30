"""
Hint Agent — generates inline contextual hints using Claude API.

Unlike the Socratic tutor (conversational, multi-turn), the Hint Agent
produces standalone one-sentence pointer hints that appear in the game UI
when a student makes repeated errors. It receives the question state and
current emotion from the Game Master and tailors the hint accordingly.

Agent input:
  - operation: which linked list operation
  - pseudocode: the available code blocks
  - wrong_assembly: what the student assembled wrong
  - correct_order: the correct sequence (DO NOT reveal directly)
  - error_count: how many mistakes on this question
  - emotion: current detected emotion

Agent output:
  - hint: one guiding sentence (Socratic, not the answer)
"""

from anthropic import Anthropic
from ..config import settings

_client = Anthropic(api_key=settings.anthropic_api_key)

HINT_SYSTEM = """\
You are a hint generator for a linked list coding puzzle game.
A student is dragging code blocks into the correct order and keeps making mistakes.

Your job: generate ONE short hint (max 20 words) that guides them toward the
right insight WITHOUT revealing the correct order.

Rules:
- Never say "first do X then Y" — that reveals the answer
- Ask a question or point at a single pointer relationship to think about
- Match tone to emotion:
    frustrated/confused → warm and specific ("What does `head = newNode` do to the original head?")
    engaged             → brief and sharp ("Which pointer would get lost first?")
    bored               → terse challenge ("Spot the missing edge case.")
- Respond with ONLY the hint sentence, nothing else."""


def generate_hint(
    operation: str,
    pseudocode: list[str],
    wrong_assembly: list[str],
    error_count: int,
    emotion: str = "engaged",
) -> str:
    """
    Called by Game Master when student has >= 2 errors on a question.
    Returns a single guiding sentence.
    """
    steps_str  = "\n".join(f"  [{i}] {s}" for i, s in enumerate(pseudocode))
    wrong_str  = " → ".join(wrong_assembly) if wrong_assembly else "(nothing assembled yet)"

    user_msg = f"""Operation: {operation}
Available code blocks:
{steps_str}

Student's wrong attempt: {wrong_str}
Number of errors so far: {error_count}
Student emotion: {emotion}

Generate ONE hint sentence."""

    try:
        response = _client.messages.create(
            model="claude-haiku-4-5",
            max_tokens=100,
            system=HINT_SYSTEM,
            messages=[{"role": "user", "content": user_msg}],
        )
        return response.content[0].text.strip().strip('"')
    except Exception:
        return "Think about which pointer would be lost if you ran this step first."
