"""
/api/npc — "Teach Quinn", the elective where the student teaches an AI classmate.
All state and every decision are in services/npc_agent.py; this is the HTTP shell.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import get_current_user
from ..models.user import User
from ..services import npc_agent

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/npc", tags=["npc"])

GENERIC_ERROR = "Something went wrong — please try again in a moment."


class StartRequest(BaseModel):
    fresh: bool = False          # abandon the open case and draw a new one


class TestRequest(BaseModel):
    values: list = []
    value: int | None = None
    index: int | None = None
    l2: list | None = None
    cycle_to: int | None = None


class ExplainRequest(BaseModel):
    choice_id: str | None = None
    text: str | None = None


def _enabled():
    if not npc_agent.enabled():
        raise HTTPException(status_code=404, detail="Not available")


def _case(db: Session, user: User, case_id: str):
    case = npc_agent.get_case(db, user.id, case_id)
    if case is None:
        raise HTTPException(status_code=404, detail="No such case")
    return case


def _run(db: Session, case, fn):
    """BoardError is a message for the student (422); anything else is logged
    and the student sees GENERIC_ERROR — never the exception text."""
    try:
        last = fn()
    except npc_agent.BoardError as e:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(e))
    except HTTPException:
        raise
    except Exception:
        db.rollback()
        logger.exception("npc action failed (case %s)", getattr(case, "id", None))
        raise HTTPException(status_code=500, detail=GENERIC_ERROR)
    return npc_agent.state(db, case, last)


@router.get("/status")
def status():
    return {"enabled": npc_agent.enabled(), "npc": npc_agent.NPC_NAME}


@router.get("/case")
def current_case(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _enabled()
    case = npc_agent.current(db, current_user.id)
    ops, learned = npc_agent.eligible_ops(db, current_user.id)
    return {"case": npc_agent.state(db, case) if case else None, "learned": learned, "ops": ops}


@router.post("/case")
def start_case(body: StartRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _enabled()
    try:
        case = npc_agent.start_case(db, current_user.id, fresh=body.fresh)
    except Exception:
        db.rollback()
        logger.exception("npc start failed for %s", current_user.id)
        raise HTTPException(status_code=500, detail=GENERIC_ERROR)
    return npc_agent.state(db, case, {"kind": "start"})


@router.post("/case/{case_id}/test")
def run_test(case_id: str, body: TestRequest, current_user: User = Depends(get_current_user),
             db: Session = Depends(get_db)):
    _enabled()
    case = _case(db, current_user, case_id)
    return _run(db, case, lambda: npc_agent.run_test(db, case, body.model_dump()))


@router.post("/case/{case_id}/explain")
def explain(case_id: str, body: ExplainRequest, current_user: User = Depends(get_current_user),
            db: Session = Depends(get_db)):
    _enabled()
    case = _case(db, current_user, case_id)
    if not body.choice_id and not (body.text or "").strip():
        raise HTTPException(status_code=422, detail="Choose an explanation or write one")
    return _run(db, case, lambda: npc_agent.explain(db, case, choice_id=body.choice_id,
                                                     text=None if body.choice_id else body.text))


@router.post("/case/{case_id}/coach")
def coach(case_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _enabled()
    case = _case(db, current_user, case_id)
    return _run(db, case, lambda: npc_agent.coach(db, case))
