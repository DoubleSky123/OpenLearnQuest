"""
Item harness report — the teacher-readable review of every question we can serve.

    cd backend
    d:/openLearnquest/venv/Scripts/python.exe item_report.py                 # failures only
    d:/openLearnquest/venv/Scripts/python.exe item_report.py --all --ops removeAtPosition
    d:/openLearnquest/venv/Scripts/python.exe item_report.py --pool          # also audit question_pool rows (read-only)

For each item it prints what every option actually DOES when run (crashes /
builds the wrong list / leaks a node / is correct), so a reviewer can judge the
distractors without tracing code by hand. Free: no model calls. --pool reads
the database but never writes.
"""
import argparse
import sys

from app.services import item_quality as iq
from app.services.static_questions import TEMPLATES


def _print(rep: iq.ItemReport, show_options: bool) -> None:
    mark = "OK  " if rep.ok else "FAIL"
    print(f"{mark} {rep.where}")
    for issue in rep.issues:
        print(f"       ! {issue}")
    if show_options or not rep.ok:
        for o in rep.options:
            tag = "correct" if o.correct else o.outcome
            print(f"         {o.option!r:60.60s} -> {tag}: {o.consequence}")


def _audit_pool(ops: list[str], show_all: bool) -> int:
    from app.database import SessionLocal
    from app.models.question_pool import QuestionPool
    bad = 0
    with SessionLocal() as db:
        rows = db.query(QuestionPool).filter(QuestionPool.operation.in_(ops)).all()
        for row in rows:
            q = row.payload or {}
            op = row.operation
            steps = TEMPLATES[op]["pseudocode"]
            if row.question_type == "find_bug":
                sym = lambda s: iq.symbolic(s, q.get("operationValue"))
                fix = sym(q.get("fix", ""))
                wrong = [sym(o) for o in q.get("options", []) if sym(o) != fix]
                buggy = sym(q["pseudocode"][q["bug_line"]])
                rep = iq.lint_bug(op, steps, q["bug_line"], buggy, fix, wrong,
                                  where=f"pool {row.id[:8]} {op} find_bug")
                reps = [rep]
            elif row.question_type == "ordering":
                reps = [iq.lint_ordering_distractor(op, steps, iq.symbolic(d, q.get("operationValue")),
                                                    where=f"pool {row.id[:8]} {op} ordering")
                        for d in q.get("distractors", [])]
            else:
                continue
            for rep in reps:
                if not rep.ok:
                    bad += 1
                if show_all or not rep.ok:
                    _print(rep, show_all)
        print(f"\npool rows audited: {len(rows)}")
    return bad


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--ops", default="all", help="comma-separated operations (default all)")
    ap.add_argument("--all", action="store_true", help="print passing items too, with every option's consequence")
    ap.add_argument("--pool", action="store_true", help="also audit question_pool rows (read-only)")
    args = ap.parse_args()
    ops = list(TEMPLATES) if args.ops == "all" else args.ops.split(",")

    total = failed = 0
    for op in ops:
        for rep in iq.lint_authored(op):
            total += 1
            failed += not rep.ok
            if args.all or not rep.ok:
                _print(rep, args.all)
    print(f"\nauthored items: {total}, failing: {failed}")
    if args.pool:
        failed += _audit_pool(ops, args.all)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
