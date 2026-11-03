import json
import logging
import time

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from anthropic import APIStatusError
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..services.anthropic_client import get_client
from ..services import anthropic_client
from ..services import misconception_model, tutor_agent, tutor_memory, tutor_telemetry
from ..services.error_analyzer import analyze_error as _diagnose
from ..dependencies import get_current_user
from ..database import get_db
from ..models.user import User
from ..models.mistake import Mistake
from ..models.mastery import Mastery
from ..models.tutor_conversation import TutorConversation

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ai/tutor", tags=["tutor"])

_client = get_client("interactive")

# What a student sees when the tutor fails. The real error goes to the log, never
# to the chat (TutorChat shows it as "Tutor unavailable: <this>").
GENERIC_ERROR = "please try again in a moment."
# Appended when a stream dies after the student already saw part of the reply —
# that text can't be taken back, so close it honestly and store it as partial.
PARTIAL_TAIL = "\n\n(Sorry, I lost my connection for a second. Could you send that again?)"
RATE_NOTICE = (
    "You're sending messages very quickly. Give it a few seconds, "
    "try something on the board, then ask again."
)
# One tutor turn across the ReAct loop and its one retry. anthropic_client bounds
# each call (20 s, 1 retry); this bounds the sum, and each call gets at most the
# time that is left.
TURN_DEADLINE_S = 45.0
PER_CALL_TIMEOUT_S = 20.0


class _TurnDeadline(Exception):
    pass


# Error types (APIStatusError.type) that a second try can get past.
_TRANSIENT_TYPES = {"overloaded_error", "api_error", "rate_limit_error", "timeout_error"}


def _worth_retrying(e: Exception) -> bool:
    """A 4xx won't succeed on a second try (bad request, auth, no credit) — only
    overload, 5xx, 408/409/429, timeouts and dropped connections are transient.
    An error event in the middle of a stream arrives on the 200 response
    (status_code == 200), so it is judged by its error type instead."""
    if isinstance(e, APIStatusError):
        if e.type in _TRANSIENT_TYPES:
            return True
        return e.status_code >= 500 or e.status_code in (408, 409, 429)
    # a refusal is the same request declined again — not worth a second try
    return not isinstance(e, (_TurnDeadline, anthropic_client.RefusedError))


class TutorMessage(BaseModel):
    role: str   # "user" | "assistant"
    content: str


class TutorRequest(BaseModel):
    session_id: str | None = None   # links the conversation to the game session (memory)
    question_title: str
    operation: str
    # the question being worked on (q.id) — joins tutor_turns to question_attempts
    question_id: str | None = None
    your_answer: list[str] = []
    board_note: str | None = None   # "where the student is right now" (fill_blank/find_bug boards)
    # structured board focus (boardFocus.kind), e.g. find_bug: hunting the line vs choosing the fix
    board_phase: str | None = None
    correct_answer: list[str] = []
    error_count: int = 0
    # legacy client-held history — ignored when a persisted conversation exists
    # (the DB is authoritative; see tutor_memory.model_view)
    messages: list[TutorMessage] = []
    user_message: str
    error_diagnosis: dict | None = None
    question_type: str | None = None
    # "solving" = exercise still open (strict: no answer reveal).
    # "reviewing" = analysis card is up, so the answer is already on the student's
    # screen and the tutor may explain it outright. Unknown values fall back to
    # "solving" — a stale client can never accidentally unlock answer reveal.
    phase: str | None = None
    # the board's final hint (scaffold level 4) is on: the tutor may state the
    # answer for the current step. Honoured only with enough real mistakes
    # (tutor_agent.final_hint_allowed), never in "reviewing".
    final_hint: bool = False
    # {stepNo, answer} as shown on the FinalHintCard — recorded now, used by the guard later
    final_hint_step: dict | None = None
    # (no `model` field: the model is server config. Old clients that still send
    # one are fine — pydantic ignores unknown fields.)


def _board_mistakes(db: Session, user_id: str, question_id: str | None) -> int:
    """Board mistakes on this question as the server saw them: every wrong board
    try posts a Mistake row (AgenticSession). Question ids are per-serve uuids or
    pool ids a student is never served twice, so this is this attempt's count."""
    if not question_id:
        return 0
    return (db.query(Mistake)
            .filter(Mistake.user_id == user_id, Mistake.question_id == str(question_id),
                    Mistake.source == "agentic")
            .count())


def _final_hint(db: Session, user_id: str, body: "TutorRequest") -> bool:
    """The client claims the final hint; the server checks the mistakes behind it
    (never trust client-computed counts — a claim above what was posted is capped)."""
    if not body.final_hint:
        return False
    errors = min(body.error_count, _board_mistakes(db, user_id, body.question_id))
    return tutor_agent.final_hint_allowed(body.phase, body.final_hint, errors)


class TutorResponse(BaseModel):
    reply: str
    turn: int


def _fetch_history(db: Session, user_id: str, question_title: str, operation: str) -> str:
    """Cross-session context for the first turn: mistake-book stats + episodic
    memories from past tutor conversations (retrieved with decay)."""
    past_mistakes = (
        db.query(Mistake)
        .filter(Mistake.user_id == user_id, Mistake.title == question_title)
        .order_by(Mistake.created_at.desc())
        .limit(5)
        .all()
    )
    mastery = (
        db.query(Mastery)
        .filter(Mastery.user_id == user_id, Mastery.operation == operation)
        .first()
    )
    parts = [tutor_agent.format_student_history(past_mistakes, mastery, operation)]
    episodic = tutor_memory.episodic_block(db, user_id, operation)
    if episodic:
        parts.append(episodic)
    if misconception_model.targeting(user_id):
        parts.append(misconception_model.tutor_block(db, user_id, operation))
    return "\n\n".join(p for p in parts if p)


def _auto_diagnosis(body: "TutorRequest") -> dict | None:
    """Server-side structured error diagnosis when the client didn't supply one.
    (The client always sent null — this makes [ERROR DIAGNOSIS] actually fire.)"""
    if body.error_diagnosis is not None:
        return body.error_diagnosis
    if not body.your_answer or not body.correct_answer:
        return None
    diag = _diagnose(body.operation, body.your_answer, body.correct_answer)
    return diag if diag.get("error_type") not in (None, "correct") else None


def _turn_fields(body: "TutorRequest", final_hint: bool) -> dict:
    """The tutor_turns columns known before the model is called."""
    return dict(
        session_id=body.session_id,
        question_id=body.question_id,
        phase=body.phase if body.phase in ("solving", "reviewing") else "solving",
        final_hint=final_hint,
        final_hint_step=body.final_hint_step,
        proactive=tutor_telemetry.is_proactive(body.user_message),
        question_type=body.question_type,
        operation=body.operation,
        your_answer=body.your_answer,
        correct_answer=body.correct_answer,
        board_note=body.board_note,
        board_phase=body.board_phase,
        error_count_claimed=body.error_count,
        tutor_version=tutor_agent.TUTOR_VERSION,
        arm=tutor_agent.ARM,
        model=tutor_agent.TUTOR_MODEL,
    )


def _rate_limited(db: Session, user_id: str, body: "TutorRequest") -> bool:
    return tutor_telemetry.over_rate_limit(
        db, user_id, proactive=tutor_telemetry.is_proactive(body.user_message))


def _sse(obj) -> str:
    return f"data: {json.dumps(obj)}\n\n"


def _elapsed_ms(t0: float) -> int:
    return int((time.monotonic() - t0) * 1000)


@router.get("/history")
def tutor_history(
    session_id: str,
    question_title: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Restore the chat window: verbatim messages for this (session, question)."""
    conv = (
        db.query(TutorConversation)
        .filter(
            TutorConversation.user_id == current_user.id,
            TutorConversation.session_id == session_id,
            TutorConversation.question_title == question_title,
        )
        .first()
    )
    if not conv:
        return {"conversation_id": None, "messages": []}
    return {"conversation_id": conv.id, "messages": tutor_memory.visible_messages(db, conv)}


@router.post("", response_model=TutorResponse)
def tutor_chat(
    body: TutorRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Non-streaming tutor (legacy — the app uses /stream)."""
    conv = tutor_memory.get_or_create_conversation(
        db, current_user.id, body.session_id, body.question_title, body.operation,
    )
    final_hint = _final_hint(db, current_user.id, body)
    if _rate_limited(db, current_user.id, body):
        tutor_telemetry.start_turn(db, current_user.id, conv, _turn_fields(body, final_hint), status="rate_limited")
        raise HTTPException(status_code=429, detail=RATE_NOTICE)

    student_history = _fetch_history(db, current_user.id, body.question_title, body.operation)
    history = tutor_memory.model_view(db, conv)
    if not history and body.session_id is None and body.messages:
        # sessionless legacy caller — honour client-held history. With a session_id
        # the DB is strictly authoritative: empty history = first turn, which
        # (correctly) triggers the full [TUTOR CONTEXT] + [STUDENT HISTORY] block.
        history = [m.model_dump() for m in body.messages]
    diagnosis = _auto_diagnosis(body)
    turn = tutor_telemetry.start_turn(
        db, current_user.id, conv, {**_turn_fields(body, final_hint), "diagnosis": diagnosis},
    )
    tutor_memory.append_message(db, conv, "user", body.user_message)
    t0 = time.monotonic()
    try:
        reply = tutor_agent.chat(
            question_title=body.question_title,
            operation=body.operation,
            your_answer=body.your_answer,
            correct_answer=body.correct_answer,
            error_count=body.error_count,
            messages=history,
            user_message=body.user_message,
            error_diagnosis=diagnosis,
            student_history=student_history,
            question_type=body.question_type,
            board_note=body.board_note,
            phase=body.phase,
            final_hint=final_hint,
        )
    except Exception:
        logger.exception("tutor chat failed (conversation %s)", conv.id)
        tutor_telemetry.finish_turn(db, turn, status="error", total_ms=_elapsed_ms(t0))
        raise HTTPException(status_code=503, detail=GENERIC_ERROR)

    msg = tutor_memory.append_message(db, conv, "assistant", reply)
    tutor_telemetry.finish_turn(db, turn, status="ok", message_id=msg.id, total_ms=_elapsed_ms(t0))
    tutor_memory.maybe_compact(db, conv)
    return TutorResponse(reply=reply, turn=len(history) // 2 + 1)


def _stream_react(api_messages: list[dict], system: str, deadline: float, st: dict, t0: float):
    """One attempt at the turn: the ReAct loop (max 3 model calls; one tool call is
    the common case), yielding SSE token events. Text, usage and tool calls land in
    `st` so the caller can retry, close a partial reply, and write telemetry."""
    for _ in range(3):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise _TurnDeadline()
        with _client.messages.stream(
            **tutor_agent.request_kwargs(system, api_messages),
            timeout=min(PER_CALL_TIMEOUT_S, remaining),
        ) as stream:
            for text in stream.text_stream:
                if st["ttft_ms"] is None:
                    st["ttft_ms"] = _elapsed_ms(t0)
                st["text"] += text
                st["sent"] = True
                yield _sse({"token": text})
            final = stream.get_final_message()

        st["input_tokens"] += final.usage.input_tokens
        st["output_tokens"] += final.usage.output_tokens
        if final.stop_reason == "refusal":
            raise anthropic_client.RefusedError("tutor turn declined")
        if final.stop_reason != "tool_use":
            return
        # final.content keeps any thinking blocks: they go back unmodified with the tool results

        api_messages.append({"role": "assistant", "content": final.content})
        tool_results = []
        for block in final.content:
            if block.type == "tool_use":
                st["tool_calls"].append({"name": block.name, "concept": (block.input or {}).get("concept")})
                result = tutor_agent._execute_tool(block.name, block.input)
                st["tool_outputs"].append(result)
                tool_results.append({"type": "tool_result", "tool_use_id": block.id, "content": result})
        api_messages.append({"role": "user", "content": tool_results})


@router.post("/stream")
def tutor_chat_stream(
    body: TutorRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Streaming version with ReAct loop + cross-session history injection.

    Flow:
    1. Rate limit (proactive pushes exempt), then query past mistakes + mastery.
    2. Inject history into first-turn context block.
    3. Stream response. If Claude calls lookup_resource, execute it and stream the follow-up.
    4. A failure before any text reached the student retries the whole turn once;
       after text was shown, the reply is closed with PARTIAL_TAIL instead.
    """
    conv = tutor_memory.get_or_create_conversation(
        db, current_user.id, body.session_id, body.question_title, body.operation,
    )
    final_hint = _final_hint(db, current_user.id, body)

    if _rate_limited(db, current_user.id, body):
        # not stored as a message: the student's text never reached the tutor
        tutor_telemetry.start_turn(db, current_user.id, conv, _turn_fields(body, final_hint), status="rate_limited")

        def notice():
            yield _sse({"notice": RATE_NOTICE})
            yield "data: [DONE]\n\n"
        return StreamingResponse(notice(), media_type="text/event-stream")

    student_history = _fetch_history(db, current_user.id, body.question_title, body.operation)
    history = tutor_memory.model_view(db, conv)
    if not history and body.session_id is None and body.messages:
        # sessionless legacy caller — honour client-held history. With a session_id
        # the DB is strictly authoritative: empty history = first turn, which
        # (correctly) triggers the full [TUTOR CONTEXT] + [STUDENT HISTORY] block.
        history = [m.model_dump() for m in body.messages]
    diagnosis = _auto_diagnosis(body)
    turn = tutor_telemetry.start_turn(
        db, current_user.id, conv, {**_turn_fields(body, final_hint), "diagnosis": diagnosis},
    )
    tutor_memory.append_message(db, conv, "user", body.user_message)

    def generate():
        base_messages = tutor_agent.build_api_messages(
            body.question_title, body.operation,
            body.your_answer, body.correct_answer,
            body.error_count, history, body.user_message,
            diagnosis, student_history, body.question_type,
            body.board_note, body.phase, final_hint,
        )
        system = tutor_agent.system_prompt_for(body.phase, final_hint)
        t0 = time.monotonic()
        deadline = t0 + TURN_DEADLINE_S
        st = {"text": "", "sent": False, "ttft_ms": None, "input_tokens": 0, "output_tokens": 0,
              "tool_calls": [], "tool_outputs": []}
        # "cancelled" survives only if the client disconnects mid-stream (GeneratorExit)
        outcome = {"status": "cancelled", "message_id": None}

        try:
            for attempt in range(2):
                try:
                    yield from _stream_react(list(base_messages), system, deadline, st, t0)
                    outcome["status"] = "ok"
                    break
                except Exception as e:  # API errors, timeouts, mid-stream overload, deadline
                    logger.warning("tutor stream attempt %d failed (conversation %s): %r", attempt + 1, conv.id, e)
                    if st["sent"]:
                        st["text"] += PARTIAL_TAIL
                        yield _sse({"token": PARTIAL_TAIL})
                        outcome["status"] = "partial"
                        break
                    if attempt == 0 and _worth_retrying(e) and time.monotonic() < deadline:
                        st["tool_calls"], st["tool_outputs"] = [], []
                        continue
                    yield _sse({"error": GENERIC_ERROR})
                    outcome["status"] = "error"
                    break

            if outcome["status"] == "ok":
                # a fetched video must reach the student even if the reply forgot its link
                link = tutor_agent.missing_video_link(st["text"], st["tool_outputs"])
                if link:
                    st["text"] += link
                    yield _sse({"token": link})

            # Persist the reply BEFORE [DONE] — the client's onDone may immediately
            # call infer-chat, which reads this conversation from the DB.
            if st["text"].strip():
                try:
                    outcome["message_id"] = tutor_memory.append_message(db, conv, "assistant", st["text"]).id
                except Exception:
                    db.rollback()

            yield "data: [DONE]\n\n"

            # After [DONE]: compaction is latency-invisible to the student.
            try:
                tutor_memory.maybe_compact(db, conv)
            except Exception:
                db.rollback()
        finally:
            tutor_telemetry.finish_turn(
                db, turn,
                status=outcome["status"],
                message_id=outcome["message_id"],
                input_tokens=st["input_tokens"],
                output_tokens=st["output_tokens"],
                ttft_ms=st["ttft_ms"],
                ttfv_ms=st["ttft_ms"],   # nothing is buffered yet, so first seen == first generated
                total_ms=_elapsed_ms(t0),
                tool_calls=st["tool_calls"],
            )

    return StreamingResponse(generate(), media_type="text/event-stream")
