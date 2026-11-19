"""
The researcher's tool for the classroom study (services/study.py).

    cd backend
    d:/openLearnquest/venv/Scripts/python.exe study_tool.py status
    d:/openLearnquest/venv/Scripts/python.exe study_tool.py withdraw student@example.edu
    d:/openLearnquest/venv/Scripts/python.exe study_tool.py export ../docs/study-export-2026-12-01

`export` writes CSV files for analysis, ONLY for students who consented (and
did not withdraw). Nobody is named: every student is a pseudonym (`pid`, a
keyed hash of the account id, stable across exports). No chat text is exported
(tutor_turns never stores it).

    participants.csv        one row per student: consent, background, design,
                            arm/sequence, pre-test band, test scores
    student_unit.csv        one row per student x unit — the analysis table:
                            the arm in that unit (per unit under a crossover),
                            test scores on the unit's items, practice, tutor
                            turns (and how many carried misconception evidence),
                            misconception recurrence (all repeats, and only
                            repeats on an item content the student had not seen)
    quiz_responses.csv      every test answer (item, picked misconception)
    practice_attempts.csv   every practice question answered
    misconception_events.csv  every pick / avoid (the recurrence data)
    tutor_turns.csv         every tutor turn: arm, whether evidence was sent,
                            tools, timing (no text)
    README.txt              what each column means

Read-only except `withdraw`. Free: no model calls.
"""
import argparse
import csv
import hashlib
import hmac
import json
import sys
from collections import defaultdict
from pathlib import Path

from app.config import settings
from app.database import SessionLocal
from app.models import (GameSession, MisconceptionEvent, Mistake, QuestionAttempt, QuizAttempt, QuizResponse,
                        ServedItem, StudyParticipant, TutorTurn, User)
from app.services import curriculum, quiz_bank, study

UNIT_OF = {op: u for u in curriculum.UNITS for op in u.ops}
UNIT_INDEX = {u.id: i for i, u in enumerate(curriculum.UNITS)}


def pid(user_id: str) -> str:
    return hmac.new(settings.secret_key.encode(), f"study:{user_id}".encode(), hashlib.sha256).hexdigest()[:12]


def unit_id(operation: str | None) -> str | None:
    u = UNIT_OF.get(operation or "")
    return u.id if u else None


def _write(path: Path, rows: list[dict], columns: list[str]) -> None:
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=columns, extrasaction="ignore")
        w.writeheader()
        for r in rows:
            w.writerow({k: (json.dumps(v) if isinstance(v, (list, dict)) else v) for k, v in r.items()})


def recurrence(events: list[MisconceptionEvent], first_seen: set[str]) -> dict:
    """Per (unit of the PICKED question): after a pick of m, was m picked again
    at the next opportunity? Also counted only where that next opportunity was an
    item content the student had not seen before (first_seen: question ids)."""
    seq = defaultdict(list)
    for e in sorted(events, key=lambda e: e.at):
        if e.kind in ("picked", "avoided"):
            seq[e.misconception_id].append(e)
    out = defaultdict(lambda: {"opportunities": 0, "again": 0, "opportunities_new_item": 0, "again_new_item": 0})
    for evs in seq.values():
        for prev, nxt in zip(evs, evs[1:]):
            if prev.kind != "picked":
                continue
            r = out[unit_id(prev.operation)]
            r["opportunities"] += 1
            r["again"] += nxt.kind == "picked"
            if nxt.question_id in first_seen:
                r["opportunities_new_item"] += 1
                r["again_new_item"] += nxt.kind == "picked"
    return out


def first_exposures(served: list[ServedItem], worked: set[str] | None = None) -> set[str]:
    """Question ids whose CONTENT (operation, type, variant) the student saw there
    for the first time. A repeat of the same authored item may be remembered,
    not reasoned — the recurrence measure can leave those out. worked: question
    ids the student actually answered or tried (a prefetched question that was
    never shown is in served_items too, and must not count as seen)."""
    seen, first = set(), set()
    for s in sorted(served, key=lambda s: s.served_at):
        if worked is not None and s.question_id not in worked:
            continue
        key = (s.operation, s.question_type, s.variant or s.question_id)
        if key not in seen:
            seen.add(key)
            first.add(s.question_id)
    return first


def export(out: Path, include_unconsented: bool) -> int:
    out.mkdir(parents=True, exist_ok=True)
    db = SessionLocal()
    try:
        ps = db.query(StudyParticipant).all()
        if not include_unconsented:
            ps = [p for p in ps if p.consented]
        users = {p.user_id: p for p in ps}
        bank = quiz_bank.by_id()

        attempts = defaultdict(dict)                      # user -> kind -> QuizAttempt
        for a in db.query(QuizAttempt).filter(QuizAttempt.user_id.in_(users)).all():
            attempts[a.user_id][a.kind] = a
        responses = db.query(QuizResponse).filter(QuizResponse.user_id.in_(users)).all()
        kind_of = {a.id: (a.kind, a.form) for d in attempts.values() for a in d.values()}

        practice = (db.query(QuestionAttempt, GameSession.user_id)
                    .join(GameSession, GameSession.id == QuestionAttempt.session_id)
                    .filter(GameSession.user_id.in_(users)).all())
        events = db.query(MisconceptionEvent).filter(MisconceptionEvent.user_id.in_(users)).all()
        served = db.query(ServedItem).filter(ServedItem.user_id.in_(users)).all()
        turns = db.query(TutorTurn).filter(TutorTurn.user_id.in_(users)).all()

        # ── long tables ──
        q_rows = [{"pid": pid(r.user_id), "test": kind_of.get(r.attempt_id, ("?", "?"))[0],
                   "form": kind_of.get(r.attempt_id, ("?", "?"))[1], "item": r.item_id,
                   "group": bank.get(r.item_id, {}).get("group"), "operation": r.operation, "unit": r.unit,
                   "correct": int(r.correct), "misconception": r.misconception or "", "time_ms": r.time_ms,
                   "changes": r.changes, "answered_at": r.answered_at} for r in responses]
        _write(out / "quiz_responses.csv", q_rows, list(q_rows[0]) if q_rows else ["pid"])

        p_rows = [{"pid": pid(uid), "question_id": a.question_id, "operation": a.operation,
                   "unit": unit_id(a.operation), "question_type": a.question_type, "purpose": a.purpose,
                   "passed": int(bool(a.passed)), "error_count": a.error_count, "intra_difficulty": a.intra_difficulty,
                   "scaffold_level": a.scaffold_level, "emotion": a.emotion, "variant": a.variant,
                   "target_misconception": a.target_misconception, "time_ms": a.time_spent_ms,
                   "completed_at": a.completed_at} for a, uid in practice]
        _write(out / "practice_attempts.csv", p_rows, list(p_rows[0]) if p_rows else ["pid"])

        arm_at = {(s.user_id, s.question_id): s.arm for s in served}
        e_rows = [{"pid": pid(e.user_id), "misconception": e.misconception_id, "kind": e.kind,
                   "question_id": e.question_id, "operation": e.operation, "unit": unit_id(e.operation),
                   "question_type": e.question_type, "targeted": int(bool(e.targeted)), "p_after": e.p_after,
                   "arm_at_item": arm_at.get((e.user_id, e.question_id)), "at": e.at} for e in events]
        _write(out / "misconception_events.csv", e_rows, list(e_rows[0]) if e_rows else ["pid"])

        t_rows = []
        for t in turns:
            ctx = t.misconception_context or {}
            t_rows.append({"pid": pid(t.user_id), "question_id": t.question_id, "operation": t.operation,
                           "unit": unit_id(t.operation), "status": t.status, "phase": t.phase,
                           "proactive": int(bool(t.proactive)), "final_hint": int(bool(t.final_hint)),
                           "question_type": t.question_type, "board_phase": t.board_phase,
                           "arm": ctx.get("arm"), "evidence_sent": int(bool(ctx.get("sent"))),
                           "evidence_items": len(ctx.get("items") or []),
                           "tools": [c.get("name") for c in (t.tool_calls or [])],
                           "tutor_version": t.tutor_version, "ttft_ms": t.ttft_ms, "total_ms": t.total_ms,
                           "input_tokens": t.input_tokens, "output_tokens": t.output_tokens,
                           "started_at": t.started_at})
        _write(out / "tutor_turns.csv", t_rows, list(t_rows[0]) if t_rows else ["pid"])

        # ── participants ──
        part_rows = []
        for uid, p in users.items():
            row = {"pid": pid(uid), "consented": int(bool(p.consented)), "consent_version": p.consent_version,
                   "consent_at": p.consent_at, "withdrawn_at": p.withdrawn_at, "design": p.design,
                   "sequence": p.sequence, "stratum": p.stratum, "pre_score": p.pre_score, "pre_form": p.pre_form,
                   "assigned_at": p.assigned_at}
            for q in study.consent_doc().get("background", []):
                row[q["id"]] = (p.background or {}).get(q["id"], "")
            for kind in study.TESTS:
                a = attempts[uid].get(kind)
                row[f"{kind}_correct"] = a.n_correct if a and a.submitted_at else ""
                row[f"{kind}_n"] = a.n_items if a and a.submitted_at else ""
                row[f"{kind}_submitted_at"] = a.submitted_at if a else ""
            part_rows.append(row)
        _write(out / "participants.csv", part_rows, list(part_rows[0]) if part_rows else ["pid"])

        # ── student x unit ──
        quiz_by = defaultdict(lambda: [0, 0, 0])          # (user, kind, unit) -> correct, n, misconception picks
        for r in responses:
            kind = kind_of.get(r.attempt_id, ("?",))[0]
            if attempts[r.user_id].get(kind) is None or attempts[r.user_id][kind].submitted_at is None:
                continue
            c = quiz_by[(r.user_id, kind, r.unit)]
            c[0] += r.correct
            c[2] += r.misconception is not None
        for uid, d in attempts.items():                   # n = items of the unit on the form taken
            for kind, a in d.items():
                if a.submitted_at is None:
                    continue
                for e in a.items:
                    it = bank.get(e["item"])
                    if it:
                        quiz_by[(uid, kind, it["unit"])][1] += 1
        prac = defaultdict(lambda: [0, 0])
        for a, uid in practice:
            c = prac[(uid, unit_id(a.operation))]
            c[0] += 1
            c[1] += a.error_count or 0
        tut = defaultdict(lambda: [0, 0])
        for t in turns:
            if t.status in ("ok", "partial"):
                c = tut[(t.user_id, unit_id(t.operation))]
                c[0] += 1
                c[1] += bool((t.misconception_context or {}).get("sent"))
        by_user_events = defaultdict(list)
        for e in events:
            by_user_events[e.user_id].append(e)
        by_user_served = defaultdict(list)
        for s in served:
            by_user_served[s.user_id].append(s)
        worked = defaultdict(set)                      # shown AND answered or tried
        for a, uid in practice:
            worked[uid].add(a.question_id)
        for uid, qid in db.query(Mistake.user_id, Mistake.question_id).filter(Mistake.user_id.in_(users)).all():
            worked[uid].add(qid)

        su_rows = []
        for uid, p in users.items():
            rec = recurrence(by_user_events[uid], first_exposures(by_user_served[uid], worked[uid]))
            for unit in curriculum.UNITS:
                row = {"pid": pid(uid), "unit": unit.id, "unit_index": UNIT_INDEX[unit.id] + 1,
                       "design": p.design, "sequence": p.sequence, "stratum": p.stratum,
                       "arm": study.arm_for(db, uid, unit.ops[0]) or ""}
                for kind in study.TESTS:
                    c = quiz_by.get((uid, kind, unit.id))
                    row[f"{kind}_correct"], row[f"{kind}_n"], row[f"{kind}_misconception_picks"] = \
                        (c if c else ("", "", ""))
                row["practice_questions"], row["practice_errors"] = prac.get((uid, unit.id), (0, 0))
                row["tutor_turns"], row["tutor_turns_with_evidence"] = tut.get((uid, unit.id), (0, 0))
                r = rec.get(unit.id, {})
                for k in ("opportunities", "again", "opportunities_new_item", "again_new_item"):
                    row[f"recurrence_{k}"] = r.get(k, 0)
                su_rows.append(row)
        _write(out / "student_unit.csv", su_rows, list(su_rows[0]) if su_rows else ["pid"])

        (out / "README.txt").write_text(README, encoding="utf-8")
        print(f"exported {len(users)} students ({'all' if include_unconsented else 'consented only'}) to {out}")
        for f in sorted(out.glob("*.csv")):
            print(f"  {f.name}: {sum(1 for _ in f.open(encoding='utf-8')) - 1} rows")
        return 0
    finally:
        db.close()


README = """Study export (study_tool.py export). One pseudonym per student: pid.

participants.csv
  consented, consent_version, consent_at, withdrawn_at
  <background question ids>   the optional answers from the consent screen
  design          between | crossover
  sequence        between: targeted | control;  crossover: targeted-first | control-first
  stratum         pre-test band used for the balanced assignment: low (<50%), mid (50-79%), high (>=80%)
  pre_form        A | B. The post-test uses the other form; the delayed test uses this one.
  <test>_correct / <test>_n / <test>_submitted_at   for pre, post, delayed

student_unit.csv  (the analysis table: one row per student x unit)
  arm             the arm in this unit (between: the same in every unit; crossover: alternates)
  <test>_correct / <test>_n           test items of this unit, answered right / asked
  <test>_misconception_picks          test answers that are a misconception's program
  practice_questions / practice_errors
  tutor_turns                         completed tutor replies on this unit's operations
  tutor_turns_with_evidence           of those, how many carried [MISCONCEPTION EVIDENCE] (the dose)
  recurrence_opportunities / recurrence_again
      after a misconception was picked in practice, the next chance to show it again; was it picked again?
  recurrence_opportunities_new_item / recurrence_again_new_item
      the same, counting only next chances on an item content the student had not seen before
      (a repeated authored item may be remembered rather than reasoned)

quiz_responses.csv        every test answer: test, form, item, group (A/B parallel pair), correct, misconception
practice_attempts.csv     every practice question
misconception_events.csv  every picked / avoided misconception; arm_at_item = the arm when that item was served
tutor_turns.csv           every tutor turn: arm, evidence_sent, tools used, timing. No chat text.
"""


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("status", help="counts: consent, arms per band, tests submitted")
    w = sub.add_parser("withdraw", help="a student changed their mind: exclude them from every export")
    w.add_argument("email")
    e = sub.add_parser("export", help="write the CSV files (consented students only)")
    e.add_argument("out")
    e.add_argument("--include-unconsented", action="store_true",
                   help="also students who declined or never answered (only if your approval allows it)")
    args = ap.parse_args()

    if args.cmd == "status":
        db = SessionLocal()
        try:
            print(json.dumps(study.summary(db), indent=2, default=str))
        finally:
            db.close()
        return 0
    if args.cmd == "withdraw":
        db = SessionLocal()
        try:
            user = db.query(User).filter(User.email == args.email).first()
            if user is None or not study.withdraw(db, user.id):
                print("no study participant with that email")
                return 1
            print("withdrawn: excluded from exports from now on")
            return 0
        finally:
            db.close()
    return export(Path(args.out), args.include_unconsented)


if __name__ == "__main__":
    sys.exit(main())
