"""
/api/study — the classroom study (services/study.py). Every route takes the
student from the token (get_current_user); with STUDY_ENABLED off, status says
so and the rest is 404.
"""
import logging
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import get_current_user
from ..models.user import User
from ..services import study
from .admin import require_admin

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/study", tags=["study"])

Kind = Literal["pre", "post", "delayed"]


class ConsentRequest(BaseModel):
    agreed: bool
    background: dict[str, str] = Field(default_factory=dict, max_length=10)


class AnswerRequest(BaseModel):
    item_id: str = Field(max_length=80)
    option_id: str = Field(max_length=32)
    time_ms: int | None = Field(default=None, ge=0)


def _on():
    if not study.enabled():
        raise HTTPException(status_code=404, detail="Not available")


def _run(db: Session, fn):
    """StudyError is a message we wrote (409); anything else is logged and generic."""
    try:
        return fn()
    except study.StudyError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail=str(e))
    except HTTPException:
        raise
    except Exception:
        db.rollback()
        logger.exception("study request failed")
        raise HTTPException(status_code=500, detail="Something went wrong — please try again in a moment.")


@router.get("/status")
def status(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """What the student must do before playing: {"step": None} = play."""
    if not study.enabled():
        return {"enabled": False, "step": None}
    return {"enabled": True, "step": study.next_step(db, current_user)}


@router.post("/consent")
def consent(body: ConsentRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _on()
    _run(db, lambda: study.record_consent(db, current_user.id, body.agreed, body.background))
    return {"step": study.next_step(db, current_user)}


@router.post("/test/{kind}/start")
def start_test(kind: Kind, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _on()
    return _run(db, lambda: study.view(db, study.start_test(db, current_user, kind)))


@router.post("/test/{kind}/answer")
def answer(kind: Kind, body: AnswerRequest, current_user: User = Depends(get_current_user),
           db: Session = Depends(get_db)):
    _on()
    _run(db, lambda: study.answer(db, current_user, kind, body.item_id, body.option_id, body.time_ms))
    return {"saved": True}


@router.post("/test/{kind}/submit")
def submit(kind: Kind, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _on()
    _run(db, lambda: study.submit(db, current_user, kind))
    return {"step": study.next_step(db, current_user)}


@router.get("/admin/summary")
def admin_summary(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Counts only (consent, arms per band, tests submitted) — no student data."""
    return study.summary(db)
