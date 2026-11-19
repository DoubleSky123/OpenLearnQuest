"""Drive update_mastery the way a real student does (no shortcuts into the table)."""
import uuid
from datetime import datetime, timedelta

from app.models import GameSession, Mastery, QuestionAttempt, User
from app.services import curriculum
from app.services.game_master import (
    _TYPE_BY_LEVEL, get_mastery_map, level_state, plan_next, record_result, update_mastery,
)

TYPES = {1: "fill_blank", 2: "find_bug", 3: "ordering"}


def record(db, uid, op, module="singly"):
    return db.query(Mastery).filter(Mastery.user_id == uid, Mastery.operation == op,
                                    Mastery.module_id == module).first()


def current_type(db, uid, op, module="singly") -> str:
    m = get_mastery_map(db, uid, module).get(op)
    if not m:
        return TYPES[curriculum.entry_level(op, get_mastery_map(db, uid, module))]
    return TYPES[min(m["active_type_level"], m["type_unlocked"])]


def master_op(db, uid, op, module="singly", max_questions=8) -> int:
    """Perfect answers at whatever type is served, taking every Level Up offered,
    until the op is mastered. Returns how many questions that took."""
    for n in range(1, max_questions + 1):
        update_mastery(db, uid, module, op, passed=True, error_count=0,
                       question_type=current_type(db, uid, op, module))
        r = record(db, uid, op, module)
        if curriculum.op_mastered({"best_perfect_type": r.best_perfect_type}):
            return n
        if r.active_type_level < r.type_unlocked:      # student accepts the unlock
            r.active_type_level = r.type_unlocked
            db.commit()
    raise AssertionError(f"{op} not mastered after {max_questions} perfect questions")


class Student:
    """A student in a unit session, end to end: plan_next picks the question,
    record_result records the answer, every offered Level Up is taken. A fake
    clock spaces the attempts so their order is unambiguous."""

    def __init__(self, db, module="singly"):
        self.db, self.module = db, module
        self.uid = str(uuid.uuid4())
        db.add(User(id=self.uid, email=f"{self.uid[:8]}@t.io", username=self.uid[:8], password_hash="x"))
        self.session = GameSession(id=str(uuid.uuid4()), user_id=self.uid, module_id=module,
                                   mode="stress-free", game_mode_detail="stress-free")
        db.add(self.session)
        db.commit()
        self.clock = datetime(2026, 1, 1)

    def next_plan(self, pinned):
        return plan_next(self.db, self.uid, self.module, pinned, get_mastery_map(self.db, self.uid, self.module))

    def answer(self, pinned, errors=0, purpose=None):
        """Serve the next question of the unit `pinned` belongs to and answer it.
        Returns (operation, question type, purpose) of what was served."""
        plan = self.next_plan(pinned)
        mmap = get_mastery_map(self.db, self.uid, self.module)
        level = plan.force_level or level_state(mmap, plan.operation)[1]
        qtype = _TYPE_BY_LEVEL[level]
        qid = str(uuid.uuid4())
        record_result(self.db, self.uid, self.module, self.session.id, plan.operation,
                      passed=True, error_count=errors, time_ms=5000, question_id=qid,
                      question_number=1, question_type=qtype, purpose=purpose or plan.purpose)
        self.clock += timedelta(minutes=1)
        a = self.db.query(QuestionAttempt).filter(QuestionAttempt.question_id == qid).one()
        a.completed_at = self.clock
        r = record(self.db, self.uid, plan.operation, self.module)
        if r and r.active_type_level < r.type_unlocked:
            r.active_type_level = r.type_unlocked          # takes the Level Up
        self.db.commit()
        return plan.operation, qtype, plan.purpose


def master_units(db, uid, units=None, module="singly") -> int:
    """Master every op of each unit, primaries first. Returns questions used."""
    total = 0
    for u in units if units is not None else curriculum.UNITS:
        for op in [g[0] for g in u.groups] + [v for g in u.groups for v in g[1:]]:
            total += master_op(db, uid, op, module)
    return total
