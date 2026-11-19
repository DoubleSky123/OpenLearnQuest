"""
The one place Anthropic clients are built, so every caller gets a timeout.

The SDK default is a 10-minute timeout: in a class of 30, one hung call holds a
worker thread while a student watches a spinner. Retries stay the SDK's own
(exponential backoff on 408/409/429/5xx and connection errors).

Profiles by who is waiting:
  interactive  a student is watching (tutor chat, chat emotion inference)
  generation   live question generation + pool refill
  background   compaction / episodic summaries, nobody waiting
"""
from functools import lru_cache

from anthropic import Anthropic

from ..config import settings

# purpose -> (timeout seconds, max_retries). For streams the timeout bounds the
# gap between chunks, not the whole reply — the tutor route adds a per-turn
# deadline on top (TURN_DEADLINE_S in routes/tutor.py).
PROFILES: dict[str, tuple[float, int]] = {
    "interactive": (20.0, 1),
    "generation":  (30.0, 2),
    "background":  (60.0, 2),
}


# ── The model, and what Claude Haiku 5.5 changed (from Haiku 4.5, 2026-10-27) ──
# - thinking is adaptive and ON by default; `effort` is the lever (default
#   medium) — `budget_tokens` 400s. Thinking counts toward max_tokens: every
#   caller adds THINKING_HEADROOM on top of the answer it expects.
# - temperature / top_p / top_k: any non-default value 400s. Steer by prompt.
# - assistant prefill 400s (messages must end with a user turn).
# - a response can START with thinking blocks: read the reply with text_of(),
#   never content[0].text. Pass thinking blocks back unmodified in a tool loop.
# - safety classifiers can decline (HTTP 200, stop_reason "refusal") and there
#   is no server-side fallback: text_of() raises RefusedError.
# - the same text is ~30% more tokens than on Haiku 4.5.
MODEL = "claude-haiku-5-5"

# effort by who is waiting: a student (fast, short), generation (quality —
# every item is still checked by the item harness), background summaries
EFFORT: dict[str, str] = {
    "interactive": "low",
    "generation":  "medium",
    "background":  "low",
}
THINKING_HEADROOM = 1024


class RefusedError(RuntimeError):
    """The model declined the request (stop_reason "refusal")."""


def text_of(message) -> str:
    """The reply text of a Messages response, whatever thinking blocks precede it."""
    if getattr(message, "stop_reason", None) == "refusal":
        details = getattr(message, "stop_details", None)
        raise RefusedError(f"model declined: {getattr(details, 'category', None)}")
    return "".join(getattr(b, "text", "") for b in message.content
                   if getattr(b, "type", None) == "text").strip()


def options(purpose: str) -> dict:
    """Request kwargs shared by every call of a purpose."""
    return {"model": MODEL, "output_config": {"effort": EFFORT[purpose]}}


@lru_cache(maxsize=None)
def get_client(purpose: str = "interactive") -> Anthropic:
    timeout, max_retries = PROFILES[purpose]
    return Anthropic(api_key=settings.anthropic_api_key, timeout=timeout, max_retries=max_retries)
