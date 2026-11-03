"""
Misconception diagnosis / remediation evaluation (read-only).

Reads served_items + misconception_events + misconception_state and reports
whether misconception-driven remediation does anything:

  1. Coverage        shown items, how many offered a tagged option, events by kind

Items count only once the student worked on them (an attempt or a board
mistake): the client prefetches the next question, sometimes more than once,
and a prefetch it replaced was served but never seen.
  2. Prevalence      per misconception: students suspected / active / resolved
  3. Recurrence      P(picked again | picked at the previous opportunity), by A/B arm
  4. Resolution      opportunities from first pick to resolution
  5. Remediation     targeted items served, unmet targets, shadow plans that WOULD have run

Run:
    cd backend
    d:/openLearnquest/venv/Scripts/python.exe -m app.analytics.misconception_eval
    d:/openLearnquest/venv/Scripts/python.exe -m app.analytics.misconception_eval --email <student-email>
"""
from __future__ import annotations

import argparse
import sys
from collections import Counter, defaultdict

from ..database import SessionLocal
from ..models import GameSession, Mistake, QuestionAttempt
from ..models.misconception import MisconceptionEvent, MisconceptionState, ServedItem
from ..models.user import User
from ..services import misconceptions as mc


def _rule(title: str) -> None:
    print(f"\n{'=' * 4} {title} {'=' * 4}")


def _pct(a: int, b: int) -> str:
    return f"{a}/{b} ({100 * a / b:.0f}%)" if b else f"{a}/0"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--email", default=None, help="restrict to one student")
    args = ap.parse_args()

    db = SessionLocal()
    try:
        uid = None
        if args.email:
            u = db.query(User).filter(User.email == args.email).first()
            if not u:
                print(f"no user {args.email}")
                return 1
            uid = u.id

        def q(model):
            base = db.query(model)
            return base.filter(model.user_id == uid) if uid else base

        served = q(ServedItem).all()
        worked = set(db.query(GameSession.user_id, QuestionAttempt.question_id)
                     .join(QuestionAttempt, QuestionAttempt.session_id == GameSession.id).all())
        worked |= set(db.query(Mistake.user_id, Mistake.question_id).all())
        items = [i for i in served if (i.user_id, i.question_id) in worked]
        events = q(MisconceptionEvent).order_by(MisconceptionEvent.at).all()
        states = q(MisconceptionState).all()
        arm_of = {i.user_id: i.arm for i in served if i.arm}

        _rule("1. Coverage")
        offered = sum(1 for i in items if any(
            ms for ln in (i.tags or {}).get("lines", {}).values() for ms in (ln.get("options") or {}).values())
            or (i.tags or {}).get("bug") or any((i.tags or {}).get("distractors", {}).values()))
        print(f"shown items: {len(items)}   offering a tagged option: {_pct(offered, len(items))}   "
              f"(served {len(served)}; {len(served) - len(items)} prefetched and never shown)")
        print("events:", dict(Counter(e.kind for e in events)))

        _rule("2. Prevalence (students per status)")
        by_m = defaultdict(Counter)
        for s in states:
            by_m[s.misconception_id][s.status] += 1
        if not by_m:
            print("(no diagnosis yet)")
        for mid in mc.CATALOG:
            if mid in by_m:
                c = by_m[mid]
                print(f"  {mid:24} suspected={c['suspected']:<3} active={c['active']:<3} resolved={c['resolved']}")

        _rule("3. Recurrence: P(picked | picked at the previous opportunity)")
        seq = defaultdict(list)                      # (user, m) -> kinds in order
        for e in events:
            if e.kind in ("picked", "avoided"):
                seq[(e.user_id, e.misconception_id)].append(e.kind)
        rec = defaultdict(lambda: [0, 0])            # arm -> [again, after_pick]
        for (user, _), kinds in seq.items():
            for prev, nxt in zip(kinds, kinds[1:]):
                if prev == "picked":
                    r = rec[arm_of.get(user, "-")]
                    r[1] += 1
                    r[0] += nxt == "picked"
        if not rec:
            print("(no repeated opportunities yet)")
        for a, (again, n) in sorted(rec.items()):
            print(f"  arm {a:9} {_pct(again, n)}")

        _rule("4. Resolution: opportunities from first pick to resolved")
        to_res = []
        for s in states:
            if s.status != "resolved":
                continue
            kinds = [e for e in events if e.user_id == s.user_id and e.misconception_id == s.misconception_id
                     and e.kind in ("picked", "avoided")]
            first = next((i for i, e in enumerate(kinds) if e.kind == "picked"), None)
            if first is not None:
                to_res.append(len(kinds) - first)
        print(f"resolved: {len(to_res)}" + (f"   median opportunities: {sorted(to_res)[len(to_res) // 2]}" if to_res else ""))

        _rule("5. Remediation")
        targeted = [i for i in items if i.purpose == "remediate"]
        shadow = [i for i in items if i.shadow_plan and not i.shadow_plan.get("unmet")]
        unmet = [i for i in items if i.shadow_plan and i.shadow_plan.get("unmet")]
        print(f"targeted items served: {len(targeted)}   by misconception: "
              f"{dict(Counter(i.target_misconception for i in targeted))}")
        print(f"shadow plans (remediation that WOULD have run): {len(shadow)}   "
              f"{dict(Counter(i.shadow_plan.get('misconception') for i in shadow))}")
        print(f"unmet targets (fell back to practice): {len(unmet)}   "
              f"{dict(Counter((i.operation, i.shadow_plan.get('misconception')) for i in unmet))}")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
