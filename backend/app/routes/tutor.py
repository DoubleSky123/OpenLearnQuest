from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from anthropic import Anthropic, APIError
from sqlalchemy.orm import Session
from ..services import tutor_agent, tutor_memory
from ..dependencies import get_current_user
from ..database import get_db
from ..models.user import User
from ..models.mistake import Mistake
from ..models.mastery import Mastery
from ..models.tutor_conversation import TutorConversation
from ..config import settings
import json

router = APIRouter(prefix="/api/ai/tutor", tags=["tutor"])

_client = Anthropic(api_key=settings.anthropic_api_key)


class TutorMessage(BaseModel):
    role: str   # "user" | "assistant"
    content: str


class TutorRequest(BaseModel):
    session_id: str | None = None   # links the conversation to the game session (memory)
    question_title: str
    operation: str
    your_answer: list[str] = []
    correct_answer: list[str] = []
    error_count: int = 0
    # legacy client-held history — ignored when a persisted conversation exists
    # (the DB is authoritative; see tutor_memory.model_view)
    messages: list[TutorMessage] = []
    user_message: str
    model: str | None = None
    error_diagnosis: dict | None = None
    question_type: str | None = None


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
    return "\n\n".join(p for p in parts if p)


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
    student_history = _fetch_history(db, current_user.id, body.question_title, body.operation)
    conv = tutor_memory.get_or_create_conversation(
        db, current_user.id, body.session_id, body.question_title, body.operation,
    )
    history = tutor_memory.model_view(db, conv)
    if not history and body.session_id is None and body.messages:
        # sessionless legacy caller — honour client-held history. With a session_id
        # the DB is strictly authoritative: empty history = first turn, which
        # (correctly) triggers the full [TUTOR CONTEXT] + [STUDENT HISTORY] block.
        history = [m.model_dump() for m in body.messages]
    tutor_memory.append_message(db, conv, "user", body.user_message)
    try:
        reply = tutor_agent.chat(
            question_title=body.question_title,
            operation=body.operation,
            your_answer=body.your_answer,
            correct_answer=body.correct_answer,
            error_count=body.error_count,
            messages=history,
            user_message=body.user_message,
            model=body.model,
            error_diagnosis=body.error_diagnosis,
            student_history=student_history,
            question_type=body.question_type,
        )
    except APIError as e:
        raise HTTPException(status_code=503, detail=f"Claude API error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Tutor unavailable: {str(e)}")

    tutor_memory.append_message(db, conv, "assistant", reply)
    tutor_memory.maybe_compact(db, conv)
    return TutorResponse(reply=reply, turn=len(history) // 2 + 1)


@router.post("/stream")
def tutor_chat_stream(
    body: TutorRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Streaming version with ReAct loop + cross-session history injection.

    Flow:
    1. Query past mistakes + mastery from DB (before streaming starts).
    2. Inject history into first-turn context block.
    3. Stream response. If Claude calls lookup_resource, execute it and stream the follow-up.
    """
    student_history = _fetch_history(db, current_user.id, body.question_title, body.operation)
    conv = tutor_memory.get_or_create_conversation(
        db, current_user.id, body.session_id, body.question_title, body.operation,
    )
    history = tutor_memory.model_view(db, conv)
    if not history and body.session_id is None and body.messages:
        # sessionless legacy caller — honour client-held history. With a session_id
        # the DB is strictly authoritative: empty history = first turn, which
        # (correctly) triggers the full [TUTOR CONTEXT] + [STUDENT HISTORY] block.
        history = [m.model_dump() for m in body.messages]
    tutor_memory.append_message(db, conv, "user", body.user_message)

    def generate():
        api_messages = tutor_agent.build_api_messages(
            body.question_title, body.operation,
            body.your_answer, body.correct_answer,
            body.error_count, history, body.user_message,
            body.error_diagnosis, student_history, body.question_type,
        )
        _model = body.model or "claude-haiku-4-5"
        full_text = ""

        try:
            for _ in range(3):  # max 3 iterations (1 tool call is the common case)
                with _client.messages.stream(
                    model=_model,
                    max_tokens=400,
                    temperature=0.3,   # keep in sync with tutor_agent.chat()
                    system=tutor_agent.TUTOR_SYSTEM_PROMPT,
                    messages=api_messages,
                    tools=tutor_agent._TOOLS,
                ) as stream:
                    for text in stream.text_stream:
                        full_text += text
                        yield f"data: {json.dumps({'token': text})}\n\n"
                    final = stream.get_final_message()

                if final.stop_reason == "end_turn":
                    break

                if final.stop_reason == "tool_use":
                    api_messages.append({"role": "assistant", "content": final.content})
                    tool_results = []
                    for block in final.content:
                        if block.type == "tool_use":
                            result = tutor_agent._execute_tool(block.name, block.input)
                            tool_results.append({
                                "type": "tool_result",
                                "tool_use_id": block.id,
                                "content": result,
                            })
                    api_messages.append({"role": "user", "content": tool_results})
                    continue

                break

        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

        # Persist the reply BEFORE [DONE] — the client's onDone may immediately
        # call infer-chat, which reads this conversation from the DB.
        if full_text.strip():
            try:
                tutor_memory.append_message(db, conv, "assistant", full_text)
            except Exception:
                db.rollback()

        yield "data: [DONE]\n\n"

        # After [DONE]: compaction is latency-invisible to the student.
        try:
            tutor_memory.maybe_compact(db, conv)
        except Exception:
            db.rollback()

    return StreamingResponse(generate(), media_type="text/event-stream")
