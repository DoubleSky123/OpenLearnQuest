"""Manual question-pool refill (decision D: script + serving self-heal, no cron).

Fills question_pool up to --target rows per (operation, type, intra) combo using
the same generate->validate loop as gen-check — NO static fallback, so a broken
prompt fails loudly instead of poisoning the pool.

Usage (from backend/, needs backend/.env for the Anthropic key):
  d:/openLearnquest/venv/Scripts/python.exe refill_pool.py --ops all
  d:/openLearnquest/venv/Scripts/python.exe refill_pool.py --ops reverseList,sortList --types find_bug --intra 2,3 --target 5

Full run costs up to 12 ops x 2 types x 3 intras x target Haiku calls — scope it.
"""
import argparse
import sys

from app.database import SessionLocal
from app.services.claude_service import OP_META
from app.services.question_pool import POOLED_TYPES, TARGET, refill_combo
from app.models import QuestionPool


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ops", default="all", help="comma-separated operations, or 'all'")
    ap.add_argument("--types", default=",".join(POOLED_TYPES))
    ap.add_argument("--intra", default="1,2,3")
    ap.add_argument("--target", type=int, default=TARGET)
    args = ap.parse_args()

    ops = list(OP_META) if args.ops == "all" else args.ops.split(",")
    unknown = [o for o in ops if o not in OP_META]
    if unknown:
        print(f"Unknown operations: {unknown}\nKnown: {list(OP_META)}")
        return 1
    types = [t for t in args.types.split(",") if t]
    bad = [t for t in types if t not in POOLED_TYPES]
    if bad:
        print(f"Non-pooled types: {bad} (choose from {list(POOLED_TYPES)})")
        return 1
    intras = [int(i) for i in args.intra.split(",")]

    db = SessionLocal()
    failures = []
    try:
        print(f"refill: {len(ops)} op(s) x {types} x intra {intras}, target {args.target}/combo")
        print(f"{'operation':<18} {'type':<10} {'intra':<6} result")
        print("-" * 56)
        for op in ops:
            for qtype in types:
                for intra in intras:
                    before = db.query(QuestionPool).filter(
                        QuestionPool.operation == op,
                        QuestionPool.question_type == qtype,
                        QuestionPool.intra_difficulty == intra,
                    ).count()
                    if before >= args.target:
                        print(f"{op:<18} {qtype:<10} {intra:<6} full ({before})")
                        continue
                    added = refill_combo(db, op, qtype, intra, target=args.target)
                    now = before + added
                    status = f"+{added} -> {now}/{args.target}"
                    if now < args.target:
                        status += "  UNDERFILLED"
                        failures.append((op, qtype, intra, now))
                    print(f"{op:<18} {qtype:<10} {intra:<6} {status}")
        print("-" * 56)
        total = db.query(QuestionPool).count()
        print(f"pool now holds {total} question(s)")
        if failures:
            print(f"{len(failures)} combo(s) underfilled (generation/dedup budget exhausted) — re-run to top up")
            return 1
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
