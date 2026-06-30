"""One-off script: clear all test data for a given user email."""
import sys
from app.database import SessionLocal
from app.models.user import User
from app.models.mastery import Mastery
from app.models.concept_mastery import ConceptMastery
from app.models.game_session import GameSession
from app.models.question_attempt import QuestionAttempt
from app.models.emotion_log import EmotionLog
from app.models.mistake import Mistake

EMAIL = "shi.kun@northeastern.edu"
DRY_RUN = "--apply" not in sys.argv

db = SessionLocal()
try:
    user = db.query(User).filter(User.email == EMAIL).first()
    if not user:
        print(f"User '{EMAIL}' not found.")
        sys.exit(1)

    uid = user.id
    sessions = db.query(GameSession).filter(GameSession.user_id == uid).all()
    sids = [s.id for s in sessions]

    qa_count = db.query(QuestionAttempt).filter(QuestionAttempt.session_id.in_(sids)).count() if sids else 0

    print(f"User: id={uid}, username={user.username}, xp={user.xp}")
    print(f"  GameSession:     {len(sids)}")
    print(f"  QuestionAttempt: {qa_count}")
    print(f"  Mastery:         {db.query(Mastery).filter(Mastery.user_id == uid).count()}")
    print(f"  ConceptMastery:  {db.query(ConceptMastery).filter(ConceptMastery.user_id == uid).count()}")
    print(f"  EmotionLog:      {db.query(EmotionLog).filter(EmotionLog.user_id == uid).count()}")
    print(f"  Mistake:         {db.query(Mistake).filter(Mistake.user_id == uid).count()}")

    if DRY_RUN:
        print("\nDry run — pass --apply to actually delete.")
        sys.exit(0)

    # Delete in FK-safe order (children before parents)
    if sids:
        db.query(QuestionAttempt).filter(QuestionAttempt.session_id.in_(sids)).delete(synchronize_session=False)
        db.query(EmotionLog).filter(EmotionLog.session_id.in_(sids)).delete(synchronize_session=False)
    db.query(EmotionLog).filter(EmotionLog.user_id == uid).delete(synchronize_session=False)
    db.query(GameSession).filter(GameSession.user_id == uid).delete(synchronize_session=False)
    db.query(Mastery).filter(Mastery.user_id == uid).delete(synchronize_session=False)
    db.query(ConceptMastery).filter(ConceptMastery.user_id == uid).delete(synchronize_session=False)
    db.query(Mistake).filter(Mistake.user_id == uid).delete(synchronize_session=False)

    # Reset XP on the user record
    user.xp = 0
    db.commit()
    print("\nDone. All test data cleared, XP reset to 0.")
finally:
    db.close()
