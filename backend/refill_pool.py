"""Manual question-pool refill (decision D: script + serving self-heal, no cron).

Fills question_pool up to --target rows per (operation, type, intra) combo using
the same generate->validate loop as gen-check — NO static fallback, so a broken
prompt fails loudly instead of poisoning the pool.

Usage (from backend/, needs backend/.env for the Anthropic key):
  d:/openLearnquest/venv/Scripts/python.exe refill_pool.py --ops all
  d:/openLearnquest/venv/Scripts/python.exe refill_pool.py --ops reverseList,sortList --types find_bug --intra 2,3 --target 5
  d:/openLearnquest/venv/Scripts/python.exe refill_pool.py --ops reverseList --purge   # after editing TEMPLATES

--purge deletes the scoped rows first: pool payloads embed TEMPLATES content
(pseudocode, step_hints) at generation time, so editing an operation's template
leaves its pooled questions stale — purge + refill regenerates them.

Full run costs up to 12 ops x 2 types x 3 intras x target Haiku calls — scope it.

Misconception remediation (docs/designs/misconception-npc-implementation.md):
  refill_pool.py --tag-existing                  # FREE: tag rows by execution (misconception_id)
  refill_pool.py --rehash                        # FREE: recompute content_hash after its formula changed
  refill_pool.py --misconceptions gaps --ops all # stock the cells authored content can't target
  refill_pool.py --misconceptions stop-on-target,guard-slow --ops removeAtPosition,detectCycle
Targeted rows must pass R4 (they show the misconception when run). "gaps" = the
(operation, type, misconception) cells misconception_report.py lists as gaps.
"""
import argparse
import sys

from app.database import SessionLocal
from app.services.claude_service import OP_META
from app.services.question_pool import POOLED_TYPES, TARGET, count_tagged, refill_combo, refill_targeted, rehash_existing, tag_existing
from app.models import QuestionPool


def _targeted(db, ops: list[str], types: list[str], which: str, target: int) -> int:
    from app.services import misconceptions as mc
    ids = list(mc.CATALOG) if which in ("gaps", "all") else which.split(",")
    unknown = [m for m in ids if m not in mc.CATALOG]
    if unknown:
        print(f"Unknown misconceptions: {unknown}\nKnown: {list(mc.CATALOG)}")
        return 1
    cells = [(op, t, m) for m in ids for op in mc.CATALOG[m].mutants if op in ops for t in types
             if mc.canonical(op, m).kind == "replace"
             and (which != "gaps" or not mc.authored_target_exists(op, t, m))]
    print(f"targeted refill: {len(cells)} cell(s), target {target}/cell")
    print(f"{'operation':<18} {'type':<10} {'misconception':<24} result")
    print("-" * 72)
    under = 0
    for op, t, m in cells:
        before = count_tagged(db, op, t, m)
        if before >= target:
            print(f"{op:<18} {t:<10} {m:<24} full ({before})")
            continue
        added = refill_targeted(db, op, t, m, target=target)
        now = before + added
        flag = "" if now >= target else "  UNDERFILLED"
        under += now < target
        print(f"{op:<18} {t:<10} {m:<24} +{added} -> {now}/{target}{flag}")
    print("-" * 72)
    if under:
        print(f"{under} cell(s) underfilled — R4 rejections or dedup; re-run to top up")
    return 1 if under else 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ops", default="all", help="comma-separated operations, or 'all'")
    ap.add_argument("--types", default=",".join(POOLED_TYPES))
    ap.add_argument("--intra", default="1,2,3")
    ap.add_argument("--target", type=int, default=TARGET)
    ap.add_argument("--purge", action="store_true",
                    help="delete the scoped rows before refilling (use after TEMPLATES edits)")
    ap.add_argument("--tag-existing", action="store_true",
                    help="free: set misconception_id on untagged rows by execution, then exit")
    ap.add_argument("--rehash", action="store_true",
                    help="free: recompute content_hash on rows hashed by an older formula, then exit")
    ap.add_argument("--misconceptions", default=None,
                    help="'gaps', 'all' or comma-separated ids: stock rows that SHOW these (R4)")
    args = ap.parse_args()

    if args.rehash:
        db = SessionLocal()
        try:
            n, clashes = rehash_existing(db)
            print(f"rehashed {n} row(s)" + (f"; {clashes} would duplicate another row's identity "
                                             f"(left as is — purge and refill that op)" if clashes else ""))
            return 0
        finally:
            db.close()

    if args.tag_existing:
        db = SessionLocal()
        try:
            n = tag_existing(db)
            tagged = db.query(QuestionPool).filter(QuestionPool.misconception_id.isnot(None)).count()
            print(f"tagged {n} row(s); {tagged}/{db.query(QuestionPool).count()} pool rows carry a misconception")
            return 0
        finally:
            db.close()

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
        if args.misconceptions:
            return _targeted(db, ops, types, args.misconceptions, min(args.target, 2) if args.target == TARGET else args.target)
        if args.purge:
            purged = (db.query(QuestionPool)
                      .filter(QuestionPool.operation.in_(ops),
                              QuestionPool.question_type.in_(types),
                              QuestionPool.intra_difficulty.in_(intras))
                      .delete(synchronize_session=False))
            db.commit()
            print(f"purged {purged} stale row(s)")
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
