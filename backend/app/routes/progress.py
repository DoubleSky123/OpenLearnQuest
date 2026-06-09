from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..schemas.progress import XPUpdate, MistakeCreate, MistakeOut, SessionCreate, SessionOut, AttemptCreate
from ..models.user import User
from ..models.game_session import GameSession
from ..models.question_attempt import QuestionAttempt
from ..models.mistake import Mistake
from ..dependencies import get_current_user
from datetime import datetime

router = APIRouter(prefix="/api/progress", tags=["progress"])


# XP
@router.get("/xp")
def get_xp(current_user: User = Depends(get_current_user)):
    return {"xp": current_user.xp}


@router.post("/xp")
def add_xp(body: XPUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    current_user.xp += body.amount
    db.commit()
    return {"xp": current_user.xp}


# Sessions
@router.post("/sessions", response_model=SessionOut)
def create_session(body: SessionCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    session = GameSession(user_id=current_user.id, module_id=body.module_id, mode=body.mode)
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


@router.patch("/sessions/{session_id}/complete", response_model=SessionOut)
def complete_session(session_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    session = db.query(GameSession).filter(GameSession.id == session_id, GameSession.user_id == current_user.id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    session.completed_at = datetime.utcnow()
    db.commit()
    db.refresh(session)
    return session


# Question Attempts
@router.post("/sessions/{session_id}/attempts")
def record_attempt(
    session_id: str,
    body: AttemptCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = db.query(GameSession).filter(GameSession.id == session_id, GameSession.user_id == current_user.id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    attempt = QuestionAttempt(session_id=session_id, **body.model_dump())
    db.add(attempt)
    if body.passed and body.xp_gained > 0:
        current_user.xp += body.xp_gained
    db.commit()
    return {"ok": True, "xp": current_user.xp}


# Mistakes
@router.get("/mistakes", response_model=list[MistakeOut])
def get_mistakes(
    source: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Mistake).filter(Mistake.user_id == current_user.id)
    if source:
        q = q.filter(Mistake.source == source)
    return q.order_by(Mistake.created_at.desc()).all()


@router.post("/mistakes", response_model=MistakeOut)
def add_mistake(body: MistakeCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    mistake = Mistake(user_id=current_user.id, **body.model_dump())
    db.add(mistake)
    db.commit()
    db.refresh(mistake)
    return mistake


@router.delete("/mistakes")
def clear_mistakes(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    db.query(Mistake).filter(Mistake.user_id == current_user.id).delete()
    db.commit()
    return {"ok": True}


# Stats
@router.get("/stats")
def get_stats(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    total_attempts = (
        db.query(QuestionAttempt)
        .join(GameSession)
        .filter(GameSession.user_id == current_user.id)
        .count()
    )
    passed_attempts = (
        db.query(QuestionAttempt)
        .join(GameSession)
        .filter(GameSession.user_id == current_user.id, QuestionAttempt.passed == True)
        .count()
    )
    total_mistakes = db.query(Mistake).filter(Mistake.user_id == current_user.id).count()
    sessions_by_mode = (
        db.query(GameSession.mode, GameSession.module_id)
        .filter(GameSession.user_id == current_user.id, GameSession.completed_at.isnot(None))
        .all()
    )
    return {
        "xp": current_user.xp,
        "total_attempts": total_attempts,
        "passed_attempts": passed_attempts,
        "accuracy": round(passed_attempts / total_attempts * 100) if total_attempts else 0,
        "total_mistakes": total_mistakes,
        "completed_sessions": len(sessions_by_mode),
    }
