"""
Tutor memory system — persistence, working-memory view, episodic recall.

Three layers (storage is always verbatim; "forgetting" happens at read time):
  1. Verbatim transcripts  -> tutor_messages (append-only source of truth)
  2. Working-memory view   -> compact_summary + verbatim tail: what the model
     actually receives. Compaction compresses the VIEW, never the storage.
  3. Episodic memories     -> per-conversation summaries, retrieved by concept
     overlap with recency ordering + mastery fading (retrieval decay).

LLM calls here are non-critical: every failure degrades gracefully (no compact,
no summary) and never blocks the tutoring request itself.
"""
import json
import logging
import uuid
from datetime import datetime

from anthropic import Anthropic
from sqlalchemy.orm import Session

from ..config import settings
from ..database import SessionLocal
from ..models.concept_mastery import ConceptMastery
from ..models.tutor_conversation import TutorConversation, TutorMessage
from .concept_graph import CONCEPTS, concepts_for_op

logger = logging.getLogger(__name__)
_client = Anthropic(api_key=settings.anthropic_api_key)

_MODEL = "claude-haiku-4-5"

COMPACT_THRESHOLD = 20   # uncompacted messages that trigger a view compaction
KEEP_VERBATIM = 8        # most recent messages always sent verbatim
EPISODIC_LIMIT = 3       # max past-conversation summaries injected per first turn
MASTERY_FADE = 0.75      # concepts mastered beyond this stop being recalled


# ── Write path ─────────────────────────────────────────────────────────────────

def get_or_create_conversation(
    db: Session, user_id: str, session_id: str | None,
    question_title: str, operation: str,
) -> TutorConversation:
    query = db.query(TutorConversation).filter(
        TutorConversation.user_id == user_id,
        TutorConversation.question_title == question_title,
    )
    if session_id:
        query = query.filter(TutorConversation.session_id == session_id)
    else:
        query = query.filter(TutorConversation.session_id.is_(None))
    conv = query.first()
    if conv:
        return conv

    conv = TutorConversation(
        id=str(uuid.uuid4()), user_id=user_id, session_id=session_id,
        operation=operation, question_title=question_title, message_count=0,
    )
    db.add(conv)
    try:
        db.commit()
    except Exception:  # unique-constraint race: another request created it first
        db.rollback()
        conv = query.first()
        if conv is None:
            raise
    return conv


def append_message(db: Session, conv: TutorConversation, role: str, content: str) -> TutorMessage:
    msg = TutorMessage(
        id=str(uuid.uuid4()), conversation_id=conv.id, role=role, content=content,
    )
    db.add(msg)
    conv.message_count += 1
    conv.ended_at = datetime.utcnow()
    db.commit()
    return msg


# ── Working-memory view (what the model sees) ──────────────────────────────────

def _ordered_messages(db: Session, conv: TutorConversation) -> list[TutorMessage]:
    return (
        db.query(TutorMessage)
        .filter(TutorMessage.conversation_id == conv.id)
        .order_by(TutorMessage.created_at, TutorMessage.id)
        .all()
    )


def _uncompacted(msgs: list[TutorMessage], conv: TutorConversation) -> list[TutorMessage]:
    if not conv.compacted_through_id:
        return msgs
    for i, m in enumerate(msgs):
        if m.id == conv.compacted_through_id:
            return msgs[i + 1:]
    return msgs  # cut point vanished (shouldn't happen) — fail open, send everything


def _merge_consecutive(items: list[dict]) -> list[dict]:
    """Anthropic requires strictly alternating roles; merge same-role neighbours
    (can occur if a stream died between saving the user turn and the reply)."""
    out: list[dict] = []
    for it in items:
        if out and out[-1]["role"] == it["role"]:
            out[-1]["content"] += "\n" + it["content"]
        else:
            out.append(dict(it))
    return out


def model_view(db: Session, conv: TutorConversation) -> list[dict]:
    """History to send to Claude: compact recap (if any) + verbatim tail."""
    msgs = _ordered_messages(db, conv)
    tail = _uncompacted(msgs, conv)
    view: list[dict] = []
    if conv.compact_summary:
        view.append({
            "role": "user",
            "content": "[EARLIER IN THIS CONVERSATION — recap]\n" + conv.compact_summary,
        })
        view.append({"role": "assistant", "content": "Got it — continuing from that context."})
    view += [{"role": m.role, "content": m.content} for m in tail]
    return _merge_consecutive(view)


def visible_messages(db: Session, conv: TutorConversation) -> list[dict]:
    """Full verbatim history for the chat window (frontend filters PROACTIVE_INIT)."""
    return [{"role": m.role, "content": m.content} for m in _ordered_messages(db, conv)]


def maybe_compact(db: Session, conv: TutorConversation) -> None:
    """Compress the oldest uncompacted messages into a recap once the view grows
    past COMPACT_THRESHOLD, keeping the last KEEP_VERBATIM verbatim. Storage is
    untouched. Called after the reply is streamed, so latency is invisible."""
    msgs = _ordered_messages(db, conv)
    pending = _uncompacted(msgs, conv)
    if len(pending) <= COMPACT_THRESHOLD:
        return
    to_compact = pending[:-KEEP_VERBATIM]
    transcript = "\n".join(f"{m.role}: {m.content}" for m in to_compact)
    previous = f"\nPrevious recap (fold it in):\n{conv.compact_summary}\n" if conv.compact_summary else ""

    prompt = f"""Compress this tutoring-conversation excerpt into a recap of at most 120 words.
The recap REPLACES these messages in the tutor's context, so it must preserve:
1. progress — what the student now understands vs. still doesn't
2. misconceptions raised so far
3. hints or resources ALREADY GIVEN (so the tutor never repeats them)
{previous}
Excerpt:
{transcript}

Return only the recap text, no preamble."""
    try:
        recap = _call_model(prompt, max_tokens=250)
    except Exception as e:
        logger.warning("tutor_memory compact failed for conv %s: %s", conv.id, e)
        return
    conv.compact_summary = recap.strip()
    conv.compacted_through_id = to_compact[-1].id
    db.commit()
    logger.info("compacted conv %s through message %s", conv.id, to_compact[-1].id)


# ── Episodic layer (write: summarise on question completion) ───────────────────

def summarize_pending(session_id: str, operation: str, passed: bool) -> None:
    """Background task (own DB session): summarise unsummarised conversations for
    this (session, operation) after the question attempt is recorded."""
    db = SessionLocal()
    try:
        convs = (
            db.query(TutorConversation)
            .filter(
                TutorConversation.session_id == session_id,
                TutorConversation.operation == operation,
                TutorConversation.summary.is_(None),
                TutorConversation.message_count > 0,
            )
            .all()
        )
        for conv in convs:
            _summarize_conversation(db, conv, resolved=passed)
    except Exception as e:
        logger.warning("summarize_pending failed for session %s/%s: %s", session_id, operation, e)
    finally:
        db.close()


def _summarize_conversation(db: Session, conv: TutorConversation, resolved: bool) -> None:
    msgs = _ordered_messages(db, conv)
    real_student_msgs = [
        m for m in msgs if m.role == "user" and not m.content.startswith("[PROACTIVE_INIT]")
    ]
    if not real_student_msgs:
        # proactive push the student never engaged with — nothing worth remembering.
        # "" is the sentinel for "summarised, empty" so it is never retried.
        conv.summary = ""
        conv.resolved = resolved
        db.commit()
        return

    base = conv.compact_summary or ""
    tail = _uncompacted(msgs, conv)
    transcript = "\n".join(f"{m.role}: {m.content}" for m in tail)
    concept_names = ", ".join(CONCEPTS.keys())

    prompt = f"""Summarise this tutoring conversation for a long-term student-memory system.
Operation being practised: {conv.operation}
{f"Recap of earlier part: {base}" if base else ""}
Conversation:
{transcript}

Return ONLY JSON, no markdown fences:
{{"summary": "<1-2 sentences: what the student misunderstood and how far they got>",
 "concepts": [<subset of: {concept_names}>],
 "misconception": "<one short phrase naming the specific misconception, or null>"}}"""
    try:
        raw = _call_model(prompt, max_tokens=300)
        data = json.loads(raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```"))
        concepts = [c for c in data.get("concepts", []) if c in CONCEPTS]
        conv.summary = str(data.get("summary", "")).strip()
        conv.key_struggles = {"concepts": concepts, "misconception": data.get("misconception")}
    except Exception as e:
        logger.warning("tutor_memory summary failed for conv %s: %s", conv.id, e)
        return  # stays unsummarised; retried on the next attempt for this operation
    conv.resolved = resolved
    conv.ended_at = conv.ended_at or datetime.utcnow()
    db.commit()


# ── Episodic layer (read: retrieval with decay) ────────────────────────────────

def episodic_block(db: Session, user_id: str, operation: str) -> str:
    """Past-struggle summaries relevant to `operation`, for [STUDENT HISTORY].

    Retrieval decay (the read path IS the forgetting mechanism):
      - concept overlap with the current operation (via the concept graph)
      - mastery fading: skip memories whose concepts are all mastered now
      - unresolved struggles first, then recency; hard cap EPISODIC_LIMIT
    """
    target = set(concepts_for_op(operation))
    if not target:
        return ""

    candidates = (
        db.query(TutorConversation)
        .filter(
            TutorConversation.user_id == user_id,
            TutorConversation.summary.isnot(None),
            TutorConversation.summary != "",
        )
        .order_by(TutorConversation.ended_at.desc())
        .limit(30)
        .all()
    )
    if not candidates:
        return ""

    mastery = {
        r.concept: r.mastery
        for r in db.query(ConceptMastery).filter(ConceptMastery.user_id == user_id).all()
    }

    picked = []
    for c in candidates:
        concepts = set((c.key_struggles or {}).get("concepts", []))
        if not concepts & target:
            continue
        if concepts and all(mastery.get(x, 0.0) >= MASTERY_FADE for x in concepts):
            continue  # student has mastered these since — let the memory fade
        picked.append(c)

    # unresolved first (False sorts before True/None), recency preserved within groups
    picked.sort(key=lambda c: c.resolved is not False)
    picked = picked[:EPISODIC_LIMIT]
    if not picked:
        return ""

    lines = [
        f"- {c.operation} ({_age(c.ended_at)}, {'resolved' if c.resolved else 'unresolved'}): {c.summary}"
        for c in picked
    ]
    return (
        "[PAST TUTOR CONVERSATIONS — this student's earlier struggles on related concepts]\n"
        + "\n".join(lines)
        + "\n[If the current difficulty echoes one of these, gently connect it — "
        "e.g. 'we saw something similar on X, what was lost there?']"
    )


def _age(dt: datetime | None) -> str:
    if dt is None:
        return "earlier"
    days = (datetime.utcnow() - dt).days
    if days <= 0:
        return "today"
    if days == 1:
        return "yesterday"
    return f"{days} days ago"


# ── Shared LLM helper ──────────────────────────────────────────────────────────

def _call_model(prompt: str, max_tokens: int = 300) -> str:
    msg = _client.messages.create(
        model=_MODEL,
        max_tokens=max_tokens,
        messages=[{"role": "user", "content": prompt}],
    )
    return msg.content[0].text
