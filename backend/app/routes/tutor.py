from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from anthropic import Anthropic, APIError
from sqlalchemy.orm import Session
from ..services import tutor_agent
from ..dependencies import get_current_user
from ..database import get_db
from ..models.user import User
from ..models.mistake import Mistake
from ..models.mastery import Mastery
from ..config import settings
import json

router = APIRouter(prefix="/api/ai/tutor", tags=["tutor"])

_client = Anthropic(api_key=settings.anthropic_api_key)


class TutorMessage(BaseModel):
    role: str   # "user" | "assistant"
    content: str


class TutorRequest(BaseModel):
    question_title: str
    operation: str
    your_answer: list[str] = []
    correct_answer: list[str] = []
    error_count: int = 0
    messages: list[TutorMessage] = []
    user_message: str
    model: str | None = None
    error_diagnosis: dict | None = None
    question_type: str | None = None


class TutorResponse(BaseModel):
    reply: str
    turn: int


def _fetch_history(db: Session, user_id: str, question_title: str, operation: str) -> str:
    """Query past mistakes + mastery and format as a history string for context injection."""
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
    return tutor_agent.format_student_history(past_mistakes, mastery, operation)


@router.post("", response_model=TutorResponse)
def tutor_chat(
    body: TutorRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    student_history = _fetch_history(db, current_user.id, body.question_title, body.operation)
    try:
        reply = tutor_agent.chat(
            question_title=body.question_title,
            operation=body.operation,
            your_answer=body.your_answer,
            correct_answer=body.correct_answer,
            error_count=body.error_count,
            messages=[m.model_dump() for m in body.messages],
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

    return TutorResponse(reply=reply, turn=len(body.messages) // 2 + 1)


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

    def generate():
        history = [m.model_dump() for m in body.messages]
        api_messages = tutor_agent.build_api_messages(
            body.question_title, body.operation,
            body.your_answer, body.correct_answer,
            body.error_count, history, body.user_message,
            body.error_diagnosis, student_history, body.question_type,
        )
        _model = body.model or "claude-haiku-4-5"

        try:
            for _ in range(3):  # max 3 iterations (1 tool call is the common case)
                with _client.messages.stream(
                    model=_model,
                    max_tokens=400,
                    system=tutor_agent.TUTOR_SYSTEM_PROMPT,
                    messages=api_messages,
                    tools=tutor_agent._TOOLS,
                ) as stream:
                    for text in stream.text_stream:
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

        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
