"""
The teacher's misconception labels: a sheet out, labels back in.

Running code tells what a wrong option DOES; a teacher decides what the student
who chose it most likely BELIEVED (docs/diagnosis-check-2026-11-18). A label is
per edit — (operation, line, the line as it now reads), or an ordering
distractor's text — and lands in app/data/misconception_labels.json, which
overrides execution (misconceptions.label_for; MISCONCEPTION_TAGS=reviewed
keeps only labelled tags).

    cd backend
    # 1. BLIND: the 100 items of the offline check, no suggestions shown, so the
    #    teacher's labels can grade both automatic methods (execution vs the LLM)
    python misconception_labels_sheet.py blind ../docs/diagnosis-check-2026-11-18/results.json OUT.xlsx
    # 2. after the blind sheet is back: every authored edit not labelled yet,
    #    WITH the suggestions, to finish the table quickly
    python misconception_labels_sheet.py review OUT.xlsx [--results results.json]
    # 3. labels into the table (refuses to overwrite a different label unless --replace)
    python misconception_labels_sheet.py import FILLED.xlsx [--replace] [--dry-run]
    # 4. how the automatic methods did against the teacher (and two raters' agreement)
    python misconception_labels_sheet.py compare FILLED.xlsx results.json [SECOND_RATER.xlsx]

Free: no model calls.
"""
import argparse
import json
import sys
from collections import Counter
from datetime import date
from pathlib import Path

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.worksheet.datavalidation import DataValidation

from app.services import item_quality as iq
from app.services import misconceptions as mc
from app.services import pseudo_exec as px
from app.services.static_questions import TEMPLATES, _BLANKS

SPECIAL = ("none", "other", "unsure")
SURE = ("sure", "fairly sure", "unsure")
FONT = "Arial"


# ── the edits ─────────────────────────────────────────────────────────────────

def edit_of(w: mc.WrongOption) -> tuple[str, int | None, str]:
    """(operation, line, the line as it now reads); line None = ordering distractor."""
    steps = TEMPLATES[w.operation]["pseudocode"]
    if w.qtype == "fill_blank":
        answer = _BLANKS[w.operation][w.variant][w.line]["a"]
        return (w.operation, w.line, steps[w.line].replace(answer, w.option, 1))
    if w.qtype == "find_bug":
        return (w.operation, w.line, w.option)
    return (w.operation, None, w.option)


def student_pickable() -> list[mc.WrongOption]:
    return [w for op in TEMPLATES for w in mc.authored_wrong_options(op) if w.role != "bug"]


def _show(code: str) -> str:
    return code.replace("{value}", "v")


def _run(op: str, prog: list[str]) -> str:
    for inst in iq.boards(op):
        v = px.judge(op, prog, inst)
        if not v.correct:
            return v.reason
    return "works on every test list"


def consequence(edit: tuple) -> str:
    op, line, code = edit
    steps = list(TEMPLATES[op]["pseudocode"])
    if line is not None:
        prog = list(steps)
        prog[line] = code
        return _run(op, prog)
    parts = []
    for i in range(len(steps)):
        prog = list(steps)
        prog[i] = code
        parts.append(f"in place of line {i + 1}: {_run(op, prog)}")
    return "\n".join(parts)


def program_text(op: str) -> str:
    return "\n".join(f"{i + 1}: {_show(s)}" for i, s in enumerate(TEMPLATES[op]["pseudocode"]))


# ── writing a sheet ───────────────────────────────────────────────────────────

_HEAD = PatternFill("solid", fgColor="DDE7F3")
_FILL = PatternFill("solid", fgColor="FFF2CC")   # cells the rater fills in
_WRAP = Alignment(wrap_text=True, vertical="top")


def _font(ws):
    for row in ws.iter_rows():
        for c in row:
            c.font = Font(name=FONT, bold=c.font.bold, size=10)


def _start_sheet(wb: Workbook, blind: bool, n: int) -> None:
    ws = wb.active
    ws.title = "Start here"
    rows = [
        ("Misconception labels", None),
        ("", None),
        ("Your name or initials:", "RATER"),
        ("", None),
        ("What this is", f"{n} wrong answers a student can choose in our linked-list game. For each one, "
                         "decide which belief most likely made a student choose it."),
        ("How to label", "Go to the sheet 'Items'. In the yellow column 'Your label', pick ONE label from the "
                         "dropdown. The labels for each operation are explained in the sheet 'Beliefs' "
                         "(filter it by operation)."),
        ("Judge the belief, not the result",
         "Two different beliefs can end in the same wrong list, and one belief can be written in two "
         "ways. Pick the belief a student most likely held when choosing this line, not the one whose "
         "result looks the same."),
        ("Special labels", "none = a mistake, but none of the listed beliefs explains it (e.g. a guess or a typo-"
                           "like slip).   other = a real belief that is not on the list: describe it in 'Note'.   "
                           "unsure = you cannot tell."),
        ("How sure", "Optional: sure / fairly sure / unsure."),
        ("Lines", "Line numbers start at 1. 'v' stands for the value being inserted."),
    ]
    if blind:
        rows.append(("Why no suggestions are shown",
                     "Your labels are the reference for comparing two automatic methods (running the code, and "
                     "asking an AI). Please label without looking anything up in the code or in earlier notes."))
    for r, (a, b) in enumerate(rows, start=1):
        ws.cell(r, 1, a)
        if b == "RATER":
            ws.cell(r, 2).fill = _FILL
        elif b:
            ws.cell(r, 2, b)
    ws["A1"].font = Font(name=FONT, bold=True, size=14)
    ws.column_dimensions["A"].width = 30
    ws.column_dimensions["B"].width = 100
    for r in range(4, len(rows) + 1):
        ws.cell(r, 1).font = Font(name=FONT, bold=True)
        ws.cell(r, 2).alignment = _WRAP
    _font(ws)
    ws["A1"].font = Font(name=FONT, bold=True, size=14)


def _beliefs_sheet(wb: Workbook) -> None:
    ws = wb.create_sheet("Beliefs")
    ws.append(["Operation", "Label", "What the student believes", "The correct idea"])
    for op in TEMPLATES:
        for m in mc.applicable(op):
            ws.append([op, m.id, m.belief, m.correction])
    for c in ws[1]:
        c.font, c.fill = Font(name=FONT, bold=True), _HEAD
    for col, w in zip("ABCD", (20, 24, 70, 70)):
        ws.column_dimensions[col].width = w
    for row in ws.iter_rows(min_row=2):
        for c in row:
            c.alignment = _WRAP
    ws.auto_filter.ref = ws.dimensions
    ws.freeze_panes = "A2"
    _font(ws)


def write_sheet(edits: list[tuple], out: Path, *, blind: bool, suggest: dict | None = None) -> None:
    """edits: (operation, line, code) keys; suggest: key -> {"running the code": ..., "AI": ...}."""
    wb = Workbook()
    _start_sheet(wb, blind, len(edits))
    ws = wb.create_sheet("Items", 1)
    cols = ["Item", "Operation", "Correct program", "Line changed", "The student's line",
            "What happens when it runs"]
    extra = [] if blind else ["Suggestion: running the code", "Suggestion: AI"]
    cols += extra + ["Your label", "How sure", "Note", "key"]
    ws.append(cols)
    label_col = len(cols) - 3
    validations: dict[str, DataValidation] = {}
    for i, e in enumerate(sorted(edits, key=lambda k: (list(TEMPLATES).index(k[0]),
                                                        -1 if k[1] is None else k[1], k[2])), start=1):
        op, line, code = e
        row = [i, op, program_text(op),
               "an extra step, used in place of a correct one" if line is None else line + 1,
               _show(code), consequence(e)]
        if not blind:
            s = (suggest or {}).get(e, {})
            row += [s.get("running the code", ""), s.get("AI", "")]
        row += ["", "", "", json.dumps([op, line, code])]
        ws.append(row)
        r = ws.max_row
        if op not in validations:
            choices = ",".join([m.id for m in mc.applicable(op)] + list(SPECIAL))
            dv = DataValidation(type="list", formula1=f'"{choices}"', allow_blank=True)
            dv.error, dv.errorTitle = "Pick a label from the list (or other / none / unsure).", "Label"
            ws.add_data_validation(dv)
            validations[op] = dv
        validations[op].add(ws.cell(r, label_col))
    sure = DataValidation(type="list", formula1=f'"{",".join(SURE)}"', allow_blank=True)
    ws.add_data_validation(sure)
    sure.add(f"{ws.cell(2, label_col + 1).coordinate}:{ws.cell(max(ws.max_row, 2), label_col + 1).coordinate}")

    widths = [6, 16, 46, 12, 34, 40] + [18] * len(extra) + [22, 12, 30, 10]
    for c, w in enumerate(widths, start=1):
        ws.column_dimensions[ws.cell(1, c).column_letter].width = w
    for c in ws[1]:
        c.font, c.fill, c.alignment = Font(name=FONT, bold=True), _HEAD, _WRAP
    for row in ws.iter_rows(min_row=2):
        for c in row:
            c.alignment = _WRAP
        for c in row[label_col - 1:label_col + 2]:
            c.fill = _FILL
    ws.column_dimensions[ws.cell(1, len(cols)).column_letter].hidden = True
    ws.freeze_panes = "C2"
    ws.auto_filter.ref = f"A1:{ws.cell(ws.max_row, len(cols) - 1).coordinate}"
    _font(ws)
    for c in ws[1]:
        c.font = Font(name=FONT, bold=True, size=10)
    _beliefs_sheet(wb)
    out.parent.mkdir(parents=True, exist_ok=True)
    wb.save(out)


# ── reading a filled sheet ────────────────────────────────────────────────────

def read_sheet(path: Path) -> tuple[str, dict[tuple, dict]]:
    wb = load_workbook(path, data_only=True)
    rater = str(wb["Start here"]["B3"].value or "").strip()
    ws = wb["Items"]
    head = [c.value for c in ws[1]]
    ix = {h: i for i, h in enumerate(head)}
    out = {}
    for row in ws.iter_rows(min_row=2, values_only=True):
        if not row or row[ix["key"]] is None:
            continue
        op, line, code = json.loads(row[ix["key"]])
        out[(op, line, code)] = {"label": str(row[ix["Your label"]] or "").strip(),
                                 "sure": str(row[ix["How sure"]] or "").strip(),
                                 "note": str(row[ix["Note"]] or "").strip()}
    return rater, out


# ── commands ──────────────────────────────────────────────────────────────────

def _sampled(results: Path) -> list[tuple[dict, tuple]]:
    """Each row of the offline check with its edit key."""
    by = {(w.operation, w.qtype, w.where, w.option): w for w in student_pickable()}
    rows = json.loads(results.read_text(encoding="utf-8"))
    return [(r, edit_of(by[(r["operation"], r["qtype"], r["where"], r["option"])])) for r in rows]


def cmd_blind(a) -> int:
    edits = sorted({k for _, k in _sampled(Path(a.results))}, key=str)
    write_sheet(edits, Path(a.out), blind=True)
    print(f"{len(edits)} distinct edits (from the sampled items) -> {a.out}")
    return 0


def cmd_review(a) -> int:
    suggest: dict[tuple, dict] = {}
    for w in student_pickable():
        k = edit_of(w)
        if mc.label_for(*k) is not None:
            continue
        s = suggest.setdefault(k, {"running the code": set(), "AI": set()})
        s["running the code"] |= set(w.tags)
    if a.results:
        for r, k in _sampled(Path(a.results)):
            if k in suggest and not str(r["llm"]).startswith(("ERROR", "INVALID")):
                suggest[k]["AI"].add(r["llm"])
    flat = {k: {n: ", ".join(sorted(v)) or "-" for n, v in s.items()} for k, s in suggest.items()}
    for s in flat.values():
        if not a.results:
            s["AI"] = ""
    write_sheet(list(flat), Path(a.out), blind=False, suggest=flat)
    print(f"{len(flat)} unlabelled authored edits -> {a.out}")
    return 0


def cmd_import(a) -> int:
    rater, rows = read_sheet(Path(a.sheet))
    if not rater:
        print("the sheet has no rater name ('Start here', cell B3)")
        return 1
    data = (json.loads(mc.LABELS_PATH.read_text(encoding="utf-8")) if mc.LABELS_PATH.exists()
            else {"about": "Teacher-confirmed misconception labels per edit; they override execution "
                           "(app/services/misconceptions.py). Written by misconception_labels_sheet.py import.",
                  "labels": []})
    have = {mc.label_key(e["operation"], e.get("line"), e["code"]): e for e in data["labels"]}
    added = replaced = conflicts = 0
    skipped = Counter()
    for (op, line, code), v in rows.items():
        lab = v["label"]
        if lab in ("", "other", "unsure"):
            skipped[lab or "blank"] += 1
            continue
        if lab != "none" and lab not in mc.CATALOG:
            print(f"unknown label {lab!r} for {op} line {line}: {code}")
            skipped["unknown"] += 1
            continue
        entry = {"operation": op, "line": line, "code": code,
                 "misconception": None if lab == "none" else lab, "rater": rater,
                 "sure": v["sure"] or None, "note": v["note"] or None,
                 "source": Path(a.sheet).name, "at": date.today().isoformat()}
        k = mc.label_key(op, line, code)
        old = have.get(k)
        if old and old.get("misconception") != entry["misconception"] and not a.replace:
            print(f"conflict, kept {old['misconception']!r} by {old['rater']}: {op} line {line}: {code} "
                  f"(this sheet: {entry['misconception']!r})")
            conflicts += 1
            continue
        replaced += bool(old)
        added += not old
        have[k] = entry
    data["labels"] = sorted(have.values(), key=lambda e: (e["operation"], -1 if e["line"] is None else e["line"],
                                                         e["code"]))
    print(f"rater {rater}: {added} new, {replaced} updated, {conflicts} conflicts, skipped {dict(skipped)}")
    if a.dry_run:
        print("dry run: nothing written")
        return 0
    mc.LABELS_PATH.parent.mkdir(parents=True, exist_ok=True)
    mc.LABELS_PATH.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"written: {mc.LABELS_PATH}")
    return 0


def kappa(pairs: list[tuple[str, str]]) -> float | None:
    """Cohen's kappa for two raters' single labels."""
    n = len(pairs)
    if not n:
        return None
    po = sum(a == b for a, b in pairs) / n
    ca, cb = Counter(a for a, _ in pairs), Counter(b for _, b in pairs)
    pe = sum(ca[k] * cb[k] for k in set(ca) | set(cb)) / (n * n)
    return None if pe == 1 else (po - pe) / (1 - pe)


def _pct(a: int, b: int) -> str:
    return f"{a}/{b} ({100 * a / b:.0f}%)" if b else "0/0"


def cmd_compare(a) -> int:
    rater, teacher = read_sheet(Path(a.sheet))
    lines = [f"# Automatic methods against the teacher ({rater or 'unnamed rater'})", "",
             "Counted per sampled item of the offline check (an edit can appear in more than one item). "
             "Items the teacher marked other / unsure / left blank are left out.", ""]
    rows = []
    for r, k in _sampled(Path(a.results)):
        t = teacher.get(k, {}).get("label", "")
        if t in ("", "other", "unsure"):
            continue
        t = "none" if t == "none" else t
        ex = set(r["exec_tags"])
        rows.append({"qtype": r["qtype"], "teacher": t, "llm": r["llm"],
                     "exec_ok": (t == "none" and not ex) or t in ex, "llm_ok": r["llm"] == t})
    lines += ["| Question type | Items | Running the code agrees | The AI agrees |", "|---|---|---|---|"]
    for qt in ("fill_blank", "find_bug", "ordering", None):
        sub = [x for x in rows if qt is None or x["qtype"] == qt]
        lines.append(f"| {qt or 'all'} | {len(sub)} | {_pct(sum(x['exec_ok'] for x in sub), len(sub))} | "
                     f"{_pct(sum(x['llm_ok'] for x in sub), len(sub))} |")
    k = kappa([(x["teacher"], x["llm"]) for x in rows])
    lines += ["", f"Cohen's kappa, AI vs teacher: {k:.2f}" if k is not None else "", ""]
    if a.second:
        rater2, other = read_sheet(Path(a.second))
        both = [(teacher[e]["label"], other[e]["label"]) for e in teacher
                if e in other and teacher[e]["label"] not in ("", "unsure") and other[e]["label"] not in ("", "unsure")]
        k2 = kappa(both)
        lines.append(f"Two raters ({rater} vs {rater2}), {len(both)} edits: agreement "
                     f"{_pct(sum(x == y for x, y in both), len(both))}"
                     + (f", Cohen's kappa {k2:.2f}" if k2 is not None else ""))
    text = "\n".join(lines)
    print(text)
    out = Path(a.sheet).with_suffix(".compare.md")
    out.write_text(text + "\n", encoding="utf-8")
    print(f"\nwritten: {out}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("blind")
    b.add_argument("results")
    b.add_argument("out")
    r = sub.add_parser("review")
    r.add_argument("out")
    r.add_argument("--results")
    i = sub.add_parser("import")
    i.add_argument("sheet")
    i.add_argument("--replace", action="store_true")
    i.add_argument("--dry-run", action="store_true")
    c = sub.add_parser("compare")
    c.add_argument("sheet")
    c.add_argument("results")
    c.add_argument("second", nargs="?")
    a = ap.parse_args()
    return {"blind": cmd_blind, "review": cmd_review, "import": cmd_import, "compare": cmd_compare}[a.cmd](a)


if __name__ == "__main__":
    sys.exit(main())
