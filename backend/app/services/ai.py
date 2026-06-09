import anthropic
from ..config import settings


def get_hint(
    question_title: str,
    operation: str,
    your_answer: list[str],
    correct_answer: list[str],
    error_count: int,
    emotion: str = "ok",
) -> str:
    if not settings.anthropic_api_key:
        return _fallback_hint(question_title, your_answer, correct_answer)

    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    tone_map = {
        "stressed": "Be extra encouraging and gentle. Break the explanation into very small steps.",
        "bored": "Be concise and add an interesting insight about why this matters in real systems.",
        "ok": "Be clear and educational.",
    }

    prompt = f"""A student is learning linked list operations. They answered a question incorrectly.

Question: {question_title}
Operation: {operation}
Student's answer (code blocks in wrong order): {' → '.join(your_answer)}
Correct answer: {' → '.join(correct_answer)}
Number of attempts so far: {error_count}

{tone_map.get(emotion, tone_map['ok'])}

Give a short, targeted hint (2-4 sentences) explaining WHY their ordering was wrong and what mental model to use.
Do NOT give away the full solution. Focus on the key pointer logic they missed."""

    message = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=256,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text


def get_pet_message(operation: str, event: str, emotion: str = "ok") -> str:
    if not settings.anthropic_api_key:
        return _fallback_pet_message(event)

    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    event_map = {
        "wrong": "The student just answered incorrectly.",
        "success": "The student just completed the question correctly!",
        "step_correct": "The student got one step right in a multi-step problem.",
    }

    tone_map = {
        "stressed": "Be very warm, reassuring, and use simple language.",
        "bored": "Be playful and add a fun fact or challenge.",
        "ok": "Be friendly and encouraging.",
    }

    prompt = f"""You are a friendly pet companion in a coding learning game.
{event_map.get(event, '')}
The student is working on: {operation}
Student's current emotion: {emotion}
{tone_map.get(emotion, '')}

Write one short, character-appropriate pet message (1-2 sentences, casual tone, no jargon)."""

    message = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=80,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text


def _fallback_hint(title: str, your_answer: list[str], correct_answer: list[str]) -> str:
    return f"Check the order of your pointer assignments in '{title}'. Make sure you save references before overwriting them."


def _fallback_pet_message(event: str) -> str:
    messages = {
        "wrong": "Almost there! Check your pointer order.",
        "success": "Amazing work! You nailed it!",
        "step_correct": "Nice! Keep going!",
    }
    return messages.get(event, "You got this!")
