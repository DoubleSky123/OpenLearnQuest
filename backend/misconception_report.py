"""
Misconception report — which authored wrong options show which misconception.

    cd backend
    d:/openLearnquest/venv/Scripts/python.exe misconception_report.py              # coverage + gaps
    d:/openLearnquest/venv/Scripts/python.exe misconception_report.py --all        # every wrong option
    d:/openLearnquest/venv/Scripts/python.exe misconception_report.py --ops removeAtTail

Tags are decided by execution (services/misconceptions.py): an option shows
misconception m when its program behaves exactly like m's canonical mutant on
every harness board. Untagged wrong options are listed as candidates for new
catalog entries. "Gaps" are (operation, question type, misconception) cells
with no authored item to target the misconception, the cells AI generation has
to fill. Free: no model calls, no database.
"""
import argparse
import sys
from collections import defaultdict

from app.services import misconceptions as mc
from app.services.static_questions import TEMPLATES

TYPES = ("fill_blank", "find_bug", "ordering")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--ops", default="all", help="comma-separated operations (default all)")
    ap.add_argument("--all", action="store_true", help="list every wrong option with its tag")
    args = ap.parse_args()
    ops = list(TEMPLATES) if args.ops == "all" else args.ops.split(",")

    total = tagged = 0
    by_type = defaultdict(lambda: [0, 0])
    untagged: list[mc.WrongOption] = []
    targetable: dict[tuple[str, str, str], int] = defaultdict(int)
    for op in ops:
        if args.all:
            print(f"\n== {op}")
        for w in mc.authored_wrong_options(op):
            total += 1
            by_type[w.qtype][0] += 1
            if w.tags:
                tagged += 1
                by_type[w.qtype][1] += 1
                for m in w.tags:
                    targetable[(op, w.qtype, m)] += 1
            else:
                untagged.append(w)
            if args.all:
                tag = ", ".join(sorted(w.tags)) or "-"
                print(f"  {w.qtype:10} {w.where:26} {w.option[:58]!r:62} {tag}")

    def pct(a, b):
        return f"{a}/{b} ({100 * a // b if b else 0}%)"

    print(f"\nwrong options tagged: {pct(tagged, total)}  (tags from: {mc.tag_source()})")
    for t in TYPES:
        n, k = by_type[t]
        print(f"  {t:10} {pct(k, n)}")
    from misconception_labels_sheet import edit_of
    edits = {edit_of(w) for op in ops for w in mc.authored_wrong_options(op) if w.role != "bug"}
    print(f"student-pickable edits a teacher has labelled: {pct(sum(mc.label_for(*e) is not None for e in edits), len(edits))}"
          "  (misconception_labels_sheet.py)")

    print("\nmisconceptions: authored items that can target each one")
    for m in mc.CATALOG.values():
        cells = []
        for op in m.mutants:
            if op not in ops:
                continue
            counts = [f"{t[:4]}={targetable[(op, t, m.id)]}" for t in TYPES]
            cells.append(f"{op}({' '.join(counts)})")
        if cells:
            print(f"  {m.id:22} {'; '.join(cells)}")

    gaps = [(op, t, m.id) for m in mc.CATALOG.values() for op in m.mutants if op in ops
            for t in ("find_bug", "ordering")
            if targetable[(op, t, m.id)] == 0
            and not (t == "ordering" and mc.canonical(op, m.id).kind == "swap")]   # any ordering item tests a swap
    print(f"\ngaps (no authored find_bug/ordering item for the misconception): {len(gaps)}")
    for op, t, m in gaps:
        print(f"  {op:18} {t:9} {m}")

    print(f"\nuntagged wrong options: {len(untagged)} (candidates for new catalog entries)")
    if not args.all:
        for w in untagged[:40]:
            print(f"  {w.operation:18} {w.qtype:10} {w.where:26} {w.option[:60]!r}")
        if len(untagged) > 40:
            print(f"  ... {len(untagged) - 40} more (use --all)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
