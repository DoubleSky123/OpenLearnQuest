"""
tutor_turns writes + the per-student rate limit.

Telemetry must never break a reply: every write here catches, rolls back and
logs. The rate limit counts what is already stored (tutor_messages), so it holds
across uvicorn workers with no extra infrastructure; check-then-insert can race
by a message or two, which is fine for a soft limit.
"""
import logging
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from ..models.tutor_conversation import TutorConversation, TutorMessage
from ..models.tutor_turn import TutorTurn

logger = logging.getLogger(__name__)

PROACTIVE_PREFIX = "[PROACTIVE_INIT]"
RATE_LIMIT_MESSAGES = 6     # student messages ...
RATE_LIMIT_WINDOW_S = 60    # ... per this many seconds
# Proactive pushes (one per question, at the 2nd board mistake) are free up to this
# many per window. The prefix is plain text a client can type, so an unlimited
# exemption would be a way around the limit; nobody finishes questions this fast.
PROACTIVE_FREE = 2


def is_proactive(user_message: str) -> bool:
    return user_message.startswith(PROACTIVE_PREFIX)


def over_rate_limit(db: Session, user_id: str, now: datetime | None = None,
                    proactive: bool = False) -> bool:
    since = (now or datetime.utcnow()) - timedelta(seconds=RATE_LIMIT_WINDOW_S)
    recent = (
        db.query(TutorMessage)
        .join(TutorConversation, TutorMessage.conversation_id == TutorConversation.id)
        .filter(
            TutorConversation.user_id == user_id,
            TutorMessage.role == "user",
            TutorMessage.created_at >= since,
        )
    )
    pushes = recent.filter(TutorMessage.content.startswith(PROACTIVE_PREFIX)).count()
    if proactive and pushes < PROACTIVE_FREE:
        return False
    plain = recent.filter(~TutorMessage.content.startswith(PROACTIVE_PREFIX)).count()
    return plain + max(0, pushes - PROACTIVE_FREE) >= RATE_LIMIT_MESSAGES


def start_turn(db: Session, user_id: str, conv: TutorConversation, fields: dict,
               status: str = "started") -> TutorTurn | None:
    try:
        turn = TutorTurn(user_id=user_id, conversation_id=conv.id, status=status, **fields)
        if status != "started":
            turn.ended_at = datetime.utcnow()
        db.add(turn)
        db.commit()
        return turn
    except Exception as e:
        db.rollback()
        logger.warning("tutor_turns insert failed: %s", e)
        return None


def finish_turn(db: Session, turn: TutorTurn | None, **fields) -> None:
    if turn is None:
        return
    try:
        for k, v in fields.items():
            setattr(turn, k, v)
        turn.ended_at = datetime.utcnow()
        db.commit()
    except Exception as e:
        db.rollback()
        logger.warning("tutor_turns update failed for %s: %s", turn.id, e)
