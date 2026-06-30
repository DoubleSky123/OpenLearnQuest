"""
Emotion inference — two entry points:
  infer_from_behavior(signals)  — pure rule-based, instant (<1ms), no LLM
  infer_from_chat(messages)     — LLM-based text analysis via Claude API

Both return {emotion, confidence, action}.

Rule design rationale:
  frustrated > confused > bored > engaged  (priority order)
  Behavior rules are deterministic and debuggable.
  LLM is reserved for semantic understanding of free-text messages.
"""
import json
import logging
from anthropic import Anthropic
from ..config import settings

logger = logging.getLogger(__name__)

_client = Anthropic(api_key=settings.anthropic_api_key)

EMOTIONS = ("engaged", "confused", "frustrated", "bored")
ACTIONS  = ("none", "reduce_difficulty", "increase_difficulty", "show_hint", "encourage")

CHAT_PROMPT = """\
You are an emotion detection system. Analyse the student's messages in this tutoring conversation and classify their emotional state.

Student messages only:
{student_messages}

Classify as exactly one of: engaged, confused, frustrated, bored.
Confidence 0.0-1.0 based on how clear the signal is.

Examples of signals:
- "I don't get it at all", "why doesn't this work", multiple short frustrated replies -> frustrated
- "oh I see!", "that makes sense", engaged follow-up questions -> engaged
- "this is so easy", "I already know this" -> bored
- "wait what?", "I'm not sure about step 2" -> confused

Respond ONLY with valid JSON, no explanation:
{{"emotion": "<label>", "confidence": <0.0-1.0>, "action": "none"}}"""


def infer_from_behavior(signals: dict) -> dict:
    """
    Pure rule-based emotion detection from behavioral signals.
    No LLM call — returns in <1ms.

    signals keys:
      questions_done       int    — questions completed this session
      error_rate           float  — wrong attempts / total attempts (0-100)
      avg_time_s           float  — average seconds per question
      consecutive_errors   int    — errors in a row on current question
      resets               int    — assembly resets this session
      used_tutor           bool   — opened the AI tutor
      level                int    — current difficulty (1/2/3)
      initial_emotion      str    — self-reported emotion at session start
    """
    q_done     = signals.get("questions_done", 0)
    err_rate   = signals.get("error_rate", 0)       # 0–100
    avg_time   = signals.get("avg_time_s", 0)
    consec_err = signals.get("consecutive_errors", 0)
    resets     = signals.get("resets", 0)
    used_tutor = signals.get("used_tutor", False)
    level      = signals.get("level", 1)

    # Not enough data yet — reserve judgement
    if q_done < 2:
        return {"emotion": "engaged", "confidence": 0.4, "action": "none"}

    # ── frustrated (highest priority) ────────────────────────────────────────
    # Strong signal: stuck AND showing distress behaviours
    if consec_err >= 3 and (resets >= 2 or used_tutor):
        return {"emotion": "frustrated", "confidence": 0.90, "action": "encourage"}
    # Moderate: many consecutive errors alone
    if consec_err >= 5:
        return {"emotion": "frustrated", "confidence": 0.85, "action": "encourage"}
    # High error rate + slow = struggling, not just confused
    if err_rate > 60 and avg_time > 30:
        return {"emotion": "frustrated", "confidence": 0.75, "action": "reduce_difficulty"}

    # ── confused ─────────────────────────────────────────────────────────────
    # Errors + slow = not understanding the concept
    if consec_err >= 2 and avg_time > 25:
        confidence = min(0.85, 0.60 + consec_err * 0.05 + (avg_time - 25) * 0.005)
        return {"emotion": "confused", "confidence": round(confidence, 2), "action": "show_hint"}
    if err_rate > 40 and avg_time > 20:
        return {"emotion": "confused", "confidence": 0.70, "action": "show_hint"}
    # Frequent resets without progress = lost
    if resets >= 3:
        return {"emotion": "confused", "confidence": 0.65, "action": "show_hint"}

    # ── bored ─────────────────────────────────────────────────────────────────
    # Very fast + near-perfect = material too easy
    if avg_time < 8 and err_rate < 10:
        confidence = min(0.90, 0.70 + (8 - avg_time) * 0.025)
        return {"emotion": "bored", "confidence": round(confidence, 2), "action": "increase_difficulty"}
    # Fast + low errors on easy level
    if avg_time < 12 and err_rate < 15 and level == 1:
        return {"emotion": "bored", "confidence": 0.70, "action": "increase_difficulty"}

    # ── engaged (default) ────────────────────────────────────────────────────
    return {"emotion": "engaged", "confidence": 0.65, "action": "none"}


def infer_from_chat(messages: list[dict]) -> dict:
    """
    LLM-based emotion inference from tutor conversation text.
    Only student (user) messages are analysed. Last 6 turns.
    """
    student_msgs = [m["content"] for m in messages if m.get("role") == "user"]
    if not student_msgs:
        return {"emotion": "engaged", "confidence": 0.3, "action": "none"}

    prompt = CHAT_PROMPT.format(
        student_messages="\n".join(f"- {m}" for m in student_msgs[-6:])
    )
    try:
        return _call_claude_for_chat(prompt)
    except Exception as e:
        logger.warning("infer_from_chat failed: %s", e)
        return {"emotion": "engaged", "confidence": 0.3, "action": "none"}


def _call_claude_for_chat(prompt: str) -> dict:
    response = _client.messages.create(
        model="claude-haiku-4-5",
        max_tokens=150,
        messages=[{"role": "user", "content": prompt}],
    )
    raw = response.content[0].text.strip()
    start, end = raw.find("{"), raw.rfind("}") + 1
    if start == -1 or end == 0:
        raise ValueError(f"No JSON in response: {raw}")
    data = json.loads(raw[start:end])
    if data.get("emotion") not in EMOTIONS:
        data["emotion"] = "confused"
    if not isinstance(data.get("confidence"), (int, float)):
        data["confidence"] = 0.5
    data["confidence"] = max(0.0, min(1.0, float(data["confidence"])))
    if data.get("action") not in ACTIONS:
        data["action"] = "none"
    return data
