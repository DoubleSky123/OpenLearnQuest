from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..dependencies import get_current_user, get_db
from ..models.user import User
from ..models.emotion_log import EmotionLog
from ..models.tutor_conversation import TutorConversation, TutorMessage
from ..services import emotion_agent, tutor_memory
import uuid
from datetime import datetime

router = APIRouter(prefix="/api/emotion", tags=["emotion"])


class BehaviorSignals(BaseModel):
    session_id: str | None = None
    questions_done: int = 0
    error_rate: float = 0.0       # 0-100 %
    avg_time_s: float = 0.0
    consecutive_errors: int = 0
    resets: int = 0
    used_tutor: bool = False
    level: int = 1
    initial_emotion: str = "ok"   # self-reported at session start


class ChatMessages(BaseModel):
    session_id: str | None = None
    question_title: str | None = None   # with session_id, selects the persisted conversation
    messages: list[dict] = []           # legacy fallback when no persisted conversation exists


class EmotionResult(BaseModel):
    emotion: str
    confidence: float
    action: str


@router.post("/infer-behavior", response_model=EmotionResult)
def infer_behavior(
    body: BehaviorSignals,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = emotion_agent.infer_from_behavior(body.model_dump())
    _save_log(db, current_user.id, body.session_id, "behavioral", result, body.model_dump())
    return result


@router.post("/infer-chat", response_model=EmotionResult)
def infer_chat(
    body: ChatMessages,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Prefer the persisted conversation (DB is authoritative) — the label becomes
    # traceable to the exact stored messages it was inferred from.
    messages = body.messages
    signals: dict = {"message_count": len(messages)}
    if body.session_id and body.question_title:
        conv = (
            db.query(TutorConversation)
            .filter(
                TutorConversation.user_id == current_user.id,
                TutorConversation.session_id == body.session_id,
                TutorConversation.question_title == body.question_title,
            )
            .first()
        )
        if conv and conv.message_count > 0:
            stored = tutor_memory.visible_messages(db, conv)
            if stored:
                messages = stored
                last = db.query(TutorMessage).filter(
                    TutorMessage.conversation_id == conv.id
                ).order_by(TutorMessage.created_at.desc(), TutorMessage.id.desc()).first()
                signals = {
                    "message_count": len(stored),
                    "conversation_id": conv.id,
                    "last_message_id": last.id if last else None,
                }

    result = emotion_agent.infer_from_chat(messages)
    _save_log(db, current_user.id, body.session_id, "tutor_chat", result, signals)
    return result


@router.post("/log-self-report")
def log_self_report(
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Log the student's self-reported emotion at session start."""
    valid = {"engaged", "confused", "frustrated", "bored"}
    emotion = body.get("emotion", "engaged") if body.get("emotion") in valid else "engaged"
    _save_log(
        db, current_user.id, body.get("session_id"),
        "self_report",
        {"emotion": emotion, "confidence": 1.0, "action": "none"},
        {"raw": body.get("emotion")},
    )
    return {"ok": True}


def _save_log(db: Session, user_id: str, session_id: str | None, source: str, result: dict, signals: dict):
    log = EmotionLog(
        id=str(uuid.uuid4()),
        user_id=user_id,
        session_id=session_id,
        timestamp=datetime.utcnow(),
        source=source,
        emotion=result["emotion"],
        confidence=result["confidence"],
        signals=signals,
        action_taken=result.get("action", "none"),
    )
    db.add(log)
    db.commit()
