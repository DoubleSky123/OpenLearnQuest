"""
The classroom study (STUDY_ENABLED). Off by default: then nothing here runs.

    consent ──► pre-test ──► assignment ──► practice ──► post-test ──► delayed test
     (once per        (form A or B,     (stored, stratified       (STUDY_TESTS opens them;
      consent version) balanced)         by the pre-test score)    post = the other form)

- A student who declines plays the game exactly as normal: no tests, no
  assignment (so the tutor is the control one), and no data in the export.
- The assignment is made ONCE, when the pre-test is submitted, and stored
  (study_participants). Within each pre-test band the arm with fewer students
  gets the next one; a tie is a coin flip — so the arms stay balanced on prior
  knowledge. Nothing is recomputed from a hash.
- `between`: one arm for the whole course. `crossover`: the arm alternates by
  unit (curriculum.UNITS order); targeted-first students are treated in units
  1, 3, 5, control-first students in units 2 and 4.
- Tests are judged on the server (quiz_bank.judge). The client never sees which
  option is right; there is no feedback, tutor or hint during a test.
- Practice waits while a test is due (blocks_practice): the pre-test must come
  before any practice (it decides the assignment), and post / delayed before
  more practice once opened.
"""
from __future__ import annotations

import json
import logging
import random
from collections import Counter
from datetime import datetime
from functools import lru_cache
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..config import settings
from ..models.study import QuizAttempt, QuizResponse, StudyParticipant
from . import curriculum
from . import quiz_bank

logger = logging.getLogger(__name__)

TESTS = ("pre", "post", "delayed")
# pre-test proportion correct -> band (lower bounds). Fixed before the study:
# a median split would need everyone's score first.
STRATA = (("high", 0.8), ("mid", 0.5), ("low", 0.0))
ARMS = {"between": ("targeted", "control"), "crossover": ("targeted-first", "control-first")}
CONSENT_PATH = Path(__file__).resolve().parent.parent / "data" / "study" / "consent.json"
_rng = random.SystemRandom()


class StudyError(Exception):
    """A request the study flow does not allow right now (the route says 409)."""


def enabled() -> bool:
    return bool(settings.study_enabled)


def tests_open() -> list[str]:
    return [t for t in TESTS if t in (settings.study_tests or "pre").split(",")]


@lru_cache(maxsize=1)
def consent_doc() -> dict:
    return json.loads(CONSENT_PATH.read_text(encoding="utf-8"))


def consent_version() -> str:
    return str(consent_doc()["version"])


# ── participants ───────────────────────────────────────────────────────────────

def participant(db: Session, user_id: str) -> StudyParticipant | None:
    return db.query(StudyParticipant).filter(StudyParticipant.user_id == user_id).first()


def _ensure(db: Session, user_id: str) -> StudyParticipant:
    p = participant(db, user_id)
    if p is not None:
        return p
    p = StudyParticipant(user_id=user_id)
    db.add(p)
    try:
        db.flush()
    except IntegrityError:          # a second tab created it first (nothing else is pending)
        db.rollback()
        p = participant(db, user_id)
    return p


def _clean_background(answers: dict | None) -> dict:
    """Only the questions the consent form asks, only their listed answers."""
    allowed = {q["id"]: set(q["options"]) for q in consent_doc().get("background", [])}
    return {k: v for k, v in (answers or {}).items() if k in allowed and v in allowed[k]}


def _balanced_form(db: Session) -> str:
    """Pre-test form: the one fewer consented students started on (ties: a coin)."""
    used = Counter(f for (f,) in db.query(StudyParticipant.pre_form)
                   .filter(StudyParticipant.pre_form.isnot(None)).all())
    a, b = used.get("A", 0), used.get("B", 0)
    return "A" if a < b else "B" if b < a else _rng.choice(quiz_bank.FORMS)


def record_consent(db: Session, user_id: str, agreed: bool, background: dict | None = None) -> StudyParticipant:
    p = _ensure(db, user_id)
    p.consent_version, p.consented, p.consent_at = consent_version(), bool(agreed), datetime.utcnow()
    p.background = _clean_background(background) if agreed else None
    if agreed:
        p.withdrawn_at = None
        if p.pre_form is None:
            p.pre_form = _balanced_form(db)
    db.commit()
    return p


def withdraw(db: Session, user_id: str) -> bool:
    """Staff action ("I changed my mind"): excluded from the export from now on."""
    p = participant(db, user_id)
    if p is None:
        return False
    p.consented, p.withdrawn_at = False, datetime.utcnow()
    db.commit()
    return True


def form_for(p: StudyParticipant, kind: str) -> str:
    """Pre and delayed on the student's own form, post on the other one."""
    if kind == "post":
        return "B" if p.pre_form == "A" else "A"
    return p.pre_form


# ── where the student is ───────────────────────────────────────────────────────

def attempt(db: Session, user_id: str, kind: str) -> QuizAttempt | None:
    return db.query(QuizAttempt).filter(QuizAttempt.user_id == user_id, QuizAttempt.kind == kind).first()


def public_consent() -> dict:
    doc = consent_doc()
    return {k: doc[k] for k in ("version", "title", "paragraphs", "agree", "decline", "background") if k in doc}


def next_step(db: Session, user) -> dict | None:
    """What the student has to do before playing: consent, or a test. None = play."""
    if not enabled() or getattr(user, "is_admin", False):
        return None
    p = participant(db, user.id)
    if p is None or p.consented is None or p.consent_version != consent_version():
        return {"step": "consent", "consent": public_consent()}
    if not p.consented:
        return None
    for kind in tests_open():
        a = attempt(db, user.id, kind)
        if a is None or a.submitted_at is None:
            return {"step": "test", "kind": kind}
    return None


def blocks_practice(db: Session, user) -> bool:
    return next_step(db, user) is not None


# ── tests ──────────────────────────────────────────────────────────────────────

def _due(db: Session, user, kind: str) -> StudyParticipant:
    step = next_step(db, user)
    if not step or step.get("kind") != kind:
        raise StudyError(f"the {kind}-test is not the next step")
    return participant(db, user.id)


def start_test(db: Session, user, kind: str) -> QuizAttempt:
    """This student's attempt at `kind` (created on first call; resumable)."""
    a = attempt(db, user.id, kind)
    if a is not None:
        return a
    p = _due(db, user, kind)
    items = quiz_bank.form_items(form_for(p, kind))
    if not items:
        raise StudyError("no test bank (run build_quiz_bank.py)")
    a = QuizAttempt(user_id=user.id, kind=kind, form=form_for(p, kind), n_items=len(items),
                    items=[{"item": it["id"], "order": quiz_bank.option_order(user.id, it)} for it in items],
                    bank_built=quiz_bank.built())
    db.add(a)
    try:
        db.commit()
    except IntegrityError:          # double click: the other request created it
        db.rollback()
        return attempt(db, user.id, kind)
    return a


def view(db: Session, a: QuizAttempt) -> dict:
    bank = quiz_bank.by_id()
    answers = {r.item_id: r.option_id for r in
               db.query(QuizResponse).filter(QuizResponse.attempt_id == a.id).all()}
    return {"kind": a.kind, "submitted": a.submitted_at is not None, "n_items": a.n_items,
            "items": [quiz_bank.client_item(bank[e["item"]], e["order"]) for e in a.items if e["item"] in bank],
            "answers": answers}


def answer(db: Session, user, kind: str, item_id: str, option_id: str, time_ms: int | None) -> None:
    a = attempt(db, user.id, kind)
    if a is None or a.submitted_at is not None:
        raise StudyError("no open test")
    if item_id not in {e["item"] for e in a.items}:
        raise StudyError("not an item of this test")
    item = quiz_bank.by_id().get(item_id)
    try:
        correct, mid = quiz_bank.judge(item, option_id)
    except (StopIteration, TypeError):
        raise StudyError("not an option of this item")
    time_ms = max(0, min(int(time_ms), 3_600_000)) if time_ms is not None else None
    for _ in range(2):              # a double click: one insert wins, the other becomes an update
        r = (db.query(QuizResponse)
             .filter(QuizResponse.attempt_id == a.id, QuizResponse.item_id == item_id).first())
        if r is None:
            db.add(QuizResponse(attempt_id=a.id, user_id=user.id, item_id=item_id,
                                operation=item["operation"], unit=item["unit"], option_id=option_id,
                                correct=correct, misconception=mid, time_ms=time_ms))
        elif r.option_id != option_id:
            r.option_id, r.correct, r.misconception = option_id, correct, mid
            r.changes += 1
            r.time_ms = (r.time_ms or 0) + (time_ms or 0)
            r.answered_at = datetime.utcnow()
        try:
            db.commit()
            return
        except IntegrityError:
            db.rollback()
    raise StudyError("could not save the answer")


def submit(db: Session, user, kind: str) -> dict:
    """Close the test (idempotent). Unanswered items count as wrong. Submitting
    the pre-test makes the assignment."""
    a = attempt(db, user.id, kind)
    if a is None:
        raise StudyError("no test to submit")
    if a.submitted_at is None:
        a.n_correct = (db.query(QuizResponse)
                       .filter(QuizResponse.attempt_id == a.id, QuizResponse.correct.is_(True)).count())
        a.submitted_at = datetime.utcnow()
        if kind == "pre":
            assign(db, participant(db, user.id), a.n_correct / a.n_items if a.n_items else 0.0)
        db.commit()
    return {"submitted": True}


# ── assignment ─────────────────────────────────────────────────────────────────

def stratum_of(score: float) -> str:
    return next(name for name, lo in STRATA if score >= lo)


def assign(db: Session, p: StudyParticipant, score: float) -> StudyParticipant:
    """Stratified, balanced randomization; made once. The caller commits."""
    if p is None or p.sequence:
        return p
    if db.get_bind().dialect.name == "postgresql":
        # one assignment at a time, so two students finishing together can't both
        # see the same counts and land in the same arm
        db.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": 7_311_021})
    design = settings.study_design
    arms = ARMS[design]
    band = stratum_of(score)
    counts = {arm: db.query(StudyParticipant).filter(
        StudyParticipant.design == design, StudyParticipant.stratum == band,
        StudyParticipant.sequence == arm).count() for arm in arms}
    low = min(counts.values())
    behind = [arm for arm in arms if counts[arm] == low]
    choice = _rng.choice(behind)
    p.design, p.sequence, p.stratum, p.pre_score = design, choice, band, round(score, 4)
    p.assigned_at = datetime.utcnow()
    p.assign_detail = {"counts_before": counts, "random": len(behind) > 1}
    return p


def arm_for(db: Session, user_id: str, operation: str | None) -> str | None:
    """'targeted' / 'control' for this student on this operation's unit, or None
    (not in the study: no consent, declined, or not assigned yet)."""
    p = participant(db, user_id)
    if p is None or not p.consented or not p.sequence:
        return None
    if p.design == "between":
        return p.sequence
    unit = curriculum.unit_of(operation) if operation else None
    if unit is None:
        return None
    first_half = curriculum.UNITS.index(unit) % 2 == 0          # units 1, 3, 5
    return "targeted" if first_half == (p.sequence == "targeted-first") else "control"


# ── for the researcher ─────────────────────────────────────────────────────────

def summary(db: Session) -> dict:
    ps = db.query(StudyParticipant).all()
    done = Counter(a.kind for a in db.query(QuizAttempt).filter(QuizAttempt.submitted_at.isnot(None)).all())
    return {
        "enabled": enabled(), "design": settings.study_design, "tests_open": tests_open(),
        "consent_version": consent_version(), "consent_draft": bool(consent_doc().get("draft")),
        "bank_items": len(quiz_bank.load()),
        "participants": len(ps),
        "consented": sum(1 for p in ps if p.consented),
        "declined": sum(1 for p in ps if p.consented is False),
        "assigned": dict(Counter(p.sequence for p in ps if p.sequence and p.consented)),
        "by_stratum": {s: dict(Counter(p.sequence for p in ps if p.stratum == s and p.consented))
                       for s, _ in STRATA},
        "tests_submitted": dict(done),
    }
