"""
Question-generation regression check for OpenLearnQuest.

Runs the real pipeline (build_prompt -> Claude Haiku -> validate) for each
operation x AI question type, WITHOUT the silent static fallback that
generate_question() applies — so genuine failures are visible, and the
number of retries each question needed is reported.

Run from backend/ with the project venv:
    d:/openLearnquest/venv/Scripts/python.exe ../.claude/skills/gen-check/gen_check.py [--ops a,b] [--types find_bug,ordering] [--intra 2]

Exit code 0 = every combo validated within MAX_RETRIES; 1 = at least one FAIL.
"""
import argparse
import sys
import time

sys.path.insert(0, ".")  # expects cwd == backend/

from app.services.claude_service import OP_META, MAX_RETRIES, _call_model
from app.services.question_registry import get_handler
from app.services.question_spec import select_spec

# type -> the type_unlocked level that select_spec maps to it
AI_TYPES = {"find_bug": 2, "ordering": 3}


def check_one(operation: str, qtype: str, intra: int) -> dict:
    """Return {"attempts": n} on success or {"error": last_error} on total failure."""
    spec = select_spec(operation, "engaged", AI_TYPES[qtype], intra)
    handler = get_handler(qtype)
    meta = OP_META[operation]
    last_error = ""
    for attempt in range(1, MAX_RETRIES + 1):
        prompt = handler.build_prompt(operation, meta, spec)
        if last_error:
            prompt += f"\n\nPrevious attempt failed: {last_error}\nReturn valid JSON only."
        raw = _call_model(prompt)
        try:
            handler.validate(raw, operation, meta)
            return {"attempts": attempt}
        except Exception as e:  # noqa: BLE001 — validator errors are strings by design
            last_error = str(e)
    return {"error": last_error}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ops", default="all", help="comma-separated operations, or 'all'")
    parser.add_argument("--types", default="find_bug,ordering", help="comma-separated AI types")
    parser.add_argument("--intra", type=int, default=2, choices=[1, 2, 3], help="within-type difficulty")
    args = parser.parse_args()

    ops = list(OP_META) if args.ops == "all" else args.ops.split(",")
    types = args.types.split(",")

    unknown = [o for o in ops if o not in OP_META]
    if unknown:
        print(f"Unknown operations: {unknown}\nKnown: {list(OP_META)}")
        return 2
    bad_types = [t for t in types if t not in AI_TYPES]
    if bad_types:
        print(f"Unknown/non-AI types: {bad_types} (choose from {list(AI_TYPES)})")
        return 2

    print(f"gen-check: {len(ops)} op(s) x {types}, intra={args.intra}, "
          f"model calls: {len(ops) * len(types)}..{len(ops) * len(types) * MAX_RETRIES}\n")
    print(f"{'operation':<18} {'type':<10} result")
    print("-" * 48)

    failures = []
    t0 = time.time()
    for op in ops:
        for qtype in types:
            r = check_one(op, qtype, args.intra)
            if "attempts" in r:
                note = "" if r["attempts"] == 1 else f"  (needed {r['attempts']} attempts)"
                print(f"{op:<18} {qtype:<10} pass{note}")
            else:
                failures.append((op, qtype, r["error"]))
                print(f"{op:<18} {qtype:<10} FAIL")

    print("-" * 48)
    print(f"{len(ops) * len(types) - len(failures)}/{len(ops) * len(types)} passed "
          f"in {time.time() - t0:.0f}s")
    for op, qtype, err in failures:
        print(f"\nFAIL {op}/{qtype}: last validator error:\n  {err}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
