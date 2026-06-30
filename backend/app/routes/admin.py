from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from datetime import datetime
from ..dependencies import get_current_user, get_db
from ..models.user import User
from ..models.emotion_log import EmotionLog
from ..models.game_session import GameSession
from ..models.question_attempt import QuestionAttempt

router = APIRouter(prefix="/api/admin", tags=["admin"])


def require_admin(current_user: User = Depends(get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


class StudentSummary(BaseModel):
    id: str
    username: str
    email: str
    xp: int
    created_at: datetime
    total_sessions: int
    total_questions: int
    emotion_distribution: dict   # {emotion: count}
    last_active: datetime | None

    model_config = {"from_attributes": True}


class EmotionLogOut(BaseModel):
    id: str
    timestamp: datetime
    source: str
    emotion: str
    confidence: float
    signals: dict | None
    action_taken: str | None

    model_config = {"from_attributes": True}


@router.get("/users", response_model=list[StudentSummary])
def list_students(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    students = db.query(User).filter(User.is_admin == False).all()  # noqa
    result = []
    for s in students:
        sessions = db.query(GameSession).filter(GameSession.user_id == s.id).all()
        session_ids = [sess.id for sess in sessions]

        total_q = 0
        last_active = None
        if session_ids:
            total_q = db.query(QuestionAttempt).filter(
                QuestionAttempt.session_id.in_(session_ids)
            ).count()
            last_session = max(sessions, key=lambda x: x.started_at)
            last_active = last_session.started_at

        logs = db.query(EmotionLog).filter(EmotionLog.user_id == s.id).all()
        dist: dict = {}
        for log in logs:
            dist[log.emotion] = dist.get(log.emotion, 0) + 1

        result.append(StudentSummary(
            id=s.id,
            username=s.username,
            email=s.email,
            xp=s.xp,
            created_at=s.created_at,
            total_sessions=len(sessions),
            total_questions=total_q,
            emotion_distribution=dist,
            last_active=last_active,
        ))
    return result


@router.get("/users/{user_id}/emotion-timeline", response_model=list[EmotionLogOut])
def emotion_timeline(
    user_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    logs = (
        db.query(EmotionLog)
        .filter(EmotionLog.user_id == user_id)
        .order_by(EmotionLog.timestamp.asc())
        .all()
    )
    return logs


@router.get("/overview")
def overview(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    total_students = db.query(User).filter(User.is_admin == False).count()  # noqa
    total_sessions = db.query(GameSession).count()
    total_attempts = db.query(QuestionAttempt).count()

    emotion_counts = (
        db.query(EmotionLog.emotion, func.count(EmotionLog.id))
        .group_by(EmotionLog.emotion)
        .all()
    )
    source_counts = (
        db.query(EmotionLog.source, func.count(EmotionLog.id))
        .group_by(EmotionLog.source)
        .all()
    )

    return {
        "total_students": total_students,
        "total_sessions": total_sessions,
        "total_attempts": total_attempts,
        "emotion_distribution": {e: c for e, c in emotion_counts},
        "detection_sources": {s: c for s, c in source_counts},
    }
