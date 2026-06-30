"""
AI question generation — dispatches to question_registry based on mastery spec.
"""
import logging

from anthropic import Anthropic

from ..config import settings
from .question_spec import select_spec
from .question_registry import get_handler

logger = logging.getLogger(__name__)

_client = Anthropic(api_key=settings.anthropic_api_key)

MAX_RETRIES = 3

OP_META: dict[str, dict] = {
    "insertAtHead":     {"title": "Insert at Head",         "needsValue": True,  "needsPosition": False, "minNodes": 1},
    "insertAtTail":     {"title": "Insert at Tail",         "needsValue": True,  "needsPosition": False, "minNodes": 1},
    "removeAtHead":     {"title": "Remove at Head",         "needsValue": False, "needsPosition": False, "minNodes": 2},
    "removeAtTail":     {"title": "Remove Last Node",       "needsValue": False, "needsPosition": False, "minNodes": 2},
    "insertIntoEmpty":  {"title": "Insert into Empty List", "needsValue": True,  "needsPosition": False, "minNodes": 0},
    "deleteEntireList": {"title": "Delete Entire List",     "needsValue": False, "needsPosition": False, "minNodes": 2},
    "insertAtPosition": {"title": "Insert at Position",     "needsValue": True,  "needsPosition": True,  "minNodes": 2},
    "removeAtPosition": {"title": "Remove at Position",     "needsValue": False, "needsPosition": True,  "minNodes": 3},
    "reverseList":      {"title": "Reverse Linked List",    "needsValue": False, "needsPosition": False, "minNodes": 2},
    "mergeSortedLists": {"title": "Merge Two Sorted Lists", "needsValue": False, "needsPosition": False, "minNodes": 0, "isMerge": True},
    "detectCycle":      {"title": "Linked List Cycle",      "needsValue": False, "needsPosition": False, "minNodes": 3},
    "sortList":         {"title": "Sort Linked List",       "needsValue": False, "needsPosition": False, "minNodes": 3},
}


def _call_model(prompt: str) -> str:
    msg = _client.messages.create(
        model="claude-haiku-4-5",
        max_tokens=1200,
        messages=[{"role": "user", "content": prompt}],
    )
    return msg.content[0].text


def run_generation_test(operation: str, n: int = 10, emotion: str = "engaged") -> dict:
    """Generate N questions and report pass rate. Used by /api/gm/test-generation."""
    results = []
    for i in range(n):
        try:
            q = generate_question(operation, emotion, type_unlocked=2)
            results.append({
                "attempt": i + 1, "status": "pass",
                "question_type": q.get("question_type"),
                "difficulty": q.get("difficulty"),
                "pseudocode_steps": len(q.get("pseudocode", [])),
            })
        except Exception as e:
            results.append({"attempt": i + 1, "status": "fail", "error": str(e)})
    passes = sum(1 for r in results if r["status"] == "pass")
    return {
        "operation": operation, "emotion": emotion, "model": "claude-haiku-4-5",
        "total": n, "passes": passes, "pass_rate": f"{passes / n * 100:.0f}%",
        "results": results,
    }


def generate_question(
    operation: str,
    emotion: str = "engaged",
    type_unlocked: int = 1,
    intra_difficulty: int | None = None,
) -> dict:
    """
    Generate a question whose type is chosen based on the student's unlocked level.
    intra_difficulty (state axis) sets the within-type difficulty. Falls back to
    static on repeated failures.
    """
    meta = OP_META.get(operation)
    if not meta:
        raise ValueError(f"Unknown operation: {operation}")

    spec    = select_spec(operation, emotion, type_unlocked, intra_difficulty)
    handler = get_handler(spec.type)

    # fill_blank is a structured beginner exercise — static is more reliable than AI here
    if spec.type == "fill_blank":
        q = handler.build_static(operation, spec)
        q["difficulty"]    = spec.difficulty
        q["question_type"] = spec.type
        return q

    last_error = ""
    for attempt in range(1, MAX_RETRIES + 1):
        prompt = handler.build_prompt(operation, meta, spec)
        if last_error:
            prompt += f"\n\nPrevious attempt failed: {last_error}\nReturn valid JSON only."
        raw = _call_model(prompt)
        try:
            q = handler.validate(raw, operation, meta)
            q["difficulty"]    = spec.difficulty
            q["question_type"] = spec.type
            return q
        except Exception as e:
            last_error = str(e)
            logger.warning("generate_question attempt %d/%d failed: %s", attempt, MAX_RETRIES, last_error)

    logger.warning("All retries failed for '%s' (%s), using static fallback", operation, spec.type)
    fallback = handler.build_static(operation, spec)
    fallback["difficulty"]    = spec.difficulty
    fallback["question_type"] = spec.type
    return fallback
