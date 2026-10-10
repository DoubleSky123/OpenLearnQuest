"""Export the Memory City heap-interpreter fixtures (Phase 0).

Writes frontend/src/prototype/fixtures.json — the single source for both the
prototype's six items and the interpreter's Vitest suite (eng review D1/R5):

  parity    real generator output (fill_blank / find_bug / ordering) with its
            correct program; `goalPattern` comes from ll_executor and is the
            oracle the interpreter's final list must equal
  wrong     every wrong line the static content can put in front of a student
            (blank wrong options, bug lines, wrong fix options, distractors),
            each placed in a complete program so it can be executed
  prototype six predict-then-step items, two matched sets (A/B) with one item
            per operation, each with a machine-checkable prediction spec

Output is deterministic (fixed seeds, ids derived from content), and
tests/test_static_generation.py re-exports in memory and compares against the
committed file — re-run this script after editing TEMPLATES/_BLANKS/_BUGS.

Usage (from backend/):
  d:/openLearnquest/venv/Scripts/python.exe export_heap_fixtures.py
"""
import json
import pathlib
import random
import re
from types import SimpleNamespace

from app.services.static_questions import (
    TEMPLATES, _BLANKS, _BUGS,
    generate_fill_blank_question, generate_find_bug_question,
    generate_static_question, instantiate,
)

PHASE0_OPS = ["insertAtHead", "insertAtPosition", "removeAtPosition"]
FIXTURES_PATH = (pathlib.Path(__file__).resolve().parents[1]
                 / "frontend" / "src" / "prototype" / "fixtures.json")

_SEEDS = 60          # per (op, type, intra) — enough to hit every boundary position
_PER_COMBO = 3       # distinct (node count, index) shapes kept per (op, type, intra)


def _spec(intra: int, seed: int) -> SimpleNamespace:
    return SimpleNamespace(difficulty=1, intra_difficulty=intra, variant_seed=seed, emotion="engaged")


def _generate(op: str, qtype: str, intra: int, seed: int) -> dict:
    random.seed(f"{op}|{qtype}|{intra}|{seed}")
    if qtype == "fill_blank":
        return generate_fill_blank_question(op, _spec(intra, seed))
    if qtype == "find_bug":
        return generate_find_bug_question(op, _spec(intra, seed))
    return generate_static_question(op, intra_level=intra)


def _correct_program(q: dict) -> list[str]:
    """The fully correct program a generated question is asking for."""
    if q.get("question_type") == "fill_blank":
        prog = list(q["pseudocode"])
        for b in q["blanks"]:
            prog[b["line"]] = prog[b["line"]].replace("___", b["answer"], 1)
        return prog
    if q.get("question_type") == "find_bug":
        prog = list(q["pseudocode"])
        prog[q["bug_line"]] = q["fix"]
        return prog
    return [q["pseudocode"][i] for i in q["correctOrder"]]


def _inputs(q: dict) -> dict:
    return {
        "initialNodes": q["initialNodes"],
        "operationValue": q["operationValue"],
        "operationPosition": q["operationPosition"],
        "goalPattern": q["goalPattern"],
    }


def _boundaries(op: str, rows: list[dict]) -> set:
    """Generator boundary positions (static_questions._rand_position) still missing."""
    if op == "insertAtPosition":    # new node lands at 2..n
        want = {"low": lambda r: r["operationPosition"] == 2,
                "high": lambda r: r["operationPosition"] == len(r["initialNodes"])}
    elif op == "removeAtPosition":  # target is 1..n-1
        want = {"low": lambda r: r["operationPosition"] == 1,
                "high": lambda r: r["operationPosition"] == len(r["initialNodes"]) - 1}
    else:
        return set()
    return {name for name, hit in want.items() if not any(hit(r) for r in rows)}


def _parity() -> list[dict]:
    out = []
    for op in PHASE0_OPS:
        op_rows = []
        for qtype in ("fill_blank", "find_bug", "ordering"):
            for intra in (1, 2, 3):
                shapes = set()
                for seed in range(_SEEDS):
                    q = _generate(op, qtype, intra, seed)
                    shape = (len(q["initialNodes"]), q["operationPosition"])
                    if shape in shapes:
                        continue
                    shapes.add(shape)
                    op_rows.append({
                        "id": f"{op}-{qtype}-i{intra}-s{seed}",
                        "operation": op, "question_type": qtype,
                        "program": _correct_program(q), **_inputs(q),
                    })
                    if len(shapes) >= _PER_COMBO:
                        break
        missing = _boundaries(op, op_rows)
        if missing:
            raise RuntimeError(f"{op}: no fixture at boundary position(s) {sorted(missing)} — raise _SEEDS")
        out.extend(op_rows)
    return out


def _base(op: str, *, nodes: int, ok=lambda q: True, nth: int = 0) -> dict:
    """The nth ordering question (deterministic seeds) with `nodes` nodes that satisfies ok()."""
    intra = {2: 1, 3: 2, 4: 3}[nodes]
    for seed in range(_SEEDS):
        q = _generate(op, "ordering", intra, seed)
        if len(q["initialNodes"]) == nodes and ok(q):
            if nth == 0:
                return q
            nth -= 1
    raise RuntimeError(f"{op}: no base question with {nodes} nodes")


def _literal(lines: list[str], base: dict) -> list[str]:
    """Substitute the base question's payload into symbolic TEMPLATES-style lines.
    Seeded: ops without a payload get a random filler value from instantiate()."""
    random.seed("literal|" + "|".join(lines))
    return instantiate({"pseudocode": list(lines), **_inputs(base)})["pseudocode"]


def _wrong() -> list[dict]:
    out = []
    for op in PHASE0_OPS:
        tmpl = TEMPLATES[op]["pseudocode"]
        # 4 nodes and an index strictly inside the list, so the traversal loop
        # actually iterates and loop/tail bugs change the result: at index 1 the
        # loop never runs, and removing the tail makes temp.next NULL — free(NULL)
        # and friends then hide the bug behind a correct-looking list.
        last_ok = {"removeAtPosition": 2}.get(op, 1)   # highest allowed index = n - last_ok
        base = _base(op, nodes=4, ok=lambda q: q["operationPosition"] is None
                     or 2 <= q["operationPosition"] <= len(q["initialNodes"]) - last_ok)
        seen: set[tuple] = set()

        def add(kind: str, line: int, program_sym: list[str]):
            program = _literal(program_sym, base)
            if tuple(program) in seen or program == _literal(tmpl, base):
                return
            seen.add(tuple(program))
            out.append({
                "id": f"{op}-wrong-{len(seen)}", "operation": op, "kind": kind,
                "line": line, "text": program[line], "program": program, **_inputs(base),
            })

        for blank_set in _BLANKS[op]:
            for i, (step, b) in enumerate(zip(tmpl, blank_set)):
                for w in b["w"]:
                    prog = list(tmpl)
                    prog[i] = step.replace(b["a"], w, 1)
                    add("blank", i, prog)
        for bug in _BUGS[op]:
            for text, kind in [(bug["buggy"], "bug")] + [(o, "bug_option") for o in bug["options"] if o != bug["fix"]]:
                prog = list(tmpl)
                prog[bug["line"]] = text
                add(kind, bug["line"], prog)
        for d in TEMPLATES[op]["distractors"]:
            add("distractor_start", 0, [d] + list(tmpl))
            add("distractor_end", len(tmpl), list(tmpl) + [d])
    return out


# Prediction prompts (student-facing, English like the rest of the app).
_P_TARGET = "After line {n} runs, which building does {ref} point to? Click it."
_P_LEAKED = "When the program ends, which buildings are leaked — nothing points to them and they were never freed? Click all of them (or none)."
_P_OUTCOME = "What happens when this program runs?"


def _item(item_id: str, set_name: str, base: dict, order_or_lines, predict: dict, note: str) -> dict:
    op = base["operation"]
    tmpl = TEMPLATES[op]["pseudocode"]
    lines = [tmpl[i] for i in order_or_lines] if all(isinstance(x, int) for x in order_or_lines) else order_or_lines
    return {
        "id": item_id, "set": set_name, "operation": op, "title": TEMPLATES[op]["title"],
        "program": _literal(lines, base), "correctProgram": _literal(tmpl, base),
        "predict": predict, "note": note, **_inputs(base),
    }


def _prototype() -> list[dict]:
    t = {op: TEMPLATES[op]["pseudocode"] for op in PHASE0_OPS}
    # Index below the tail: the swapped splice must have successors to leak, and
    # the off-by-one walk must stay inside the list.
    inside = lambda q: q["operationPosition"] < len(q["initialNodes"])
    head_a = _base("insertAtHead", nodes=3)
    head_b = _base("insertAtHead", nodes=3, nth=1)
    pos_a = _base("insertAtPosition", nodes=3, ok=inside)
    pos_b = _base("insertAtPosition", nodes=4, ok=inside)
    rem_a = _base("removeAtPosition", nodes=4)
    rem_b = _base("removeAtPosition", nodes=4, ok=lambda q: q["operationPosition"] == 2)

    off_by_one = list(t["insertAtPosition"])
    off_by_one[1] = "for (int i = 0; i < index; i++) curr = curr.next;"
    head_bug = list(t["insertAtHead"])
    head_bug[1] = "newNode.next = head.next;"
    temp_bug = list(t["removeAtPosition"])
    temp_bug[2] = "temp = curr;"

    items = [
        # Set A — target / leaked / outcome
        _item("A1", "A", head_a, [0, 2, 1],
              {"kind": "target", "line": 2, "var": "newNode", "field": "next",
               "prompt": _P_TARGET.format(n=3, ref="newNode.next")},
              "head moves before the new node is linked: newNode.next = head now reads the NEW head, a self-loop; the old list leaks"),
        _item("A2", "A", pos_a, [0, 1, 2, 4, 3],
              {"kind": "leaked", "prompt": _P_LEAKED},
              "curr.next is overwritten before the successor is saved: newNode points at itself and every node after curr leaks"),
        _item("A3", "A", rem_a, [0, 1, 2, 4, 3],
              {"kind": "outcome", "prompt": _P_OUTCOME},
              "free(temp) runs before the bypass, so curr.next = temp.next reads a freed node — use after free"),
        # Set B — leaked / target / outcome
        _item("B1", "B", head_b, head_bug,
              {"kind": "leaked", "prompt": _P_LEAKED},
              "head.next skips the original head, which nothing references any more"),
        _item("B2", "B", pos_b, off_by_one,
              {"kind": "target", "line": 1, "var": "curr", "field": None,
               "prompt": _P_TARGET.format(n=2, ref="curr")},
              "i < index walks one node too far, so the new node is spliced in one position late"),
        _item("B3", "B", rem_b, temp_bug,
              {"kind": "outcome", "prompt": _P_OUTCOME},
              "temp = curr makes the bypass a no-op and frees the predecessor; nothing dereferences it afterwards, so it runs to completion — with a dangling link left in the list"),
    ]
    # Each participant sees set A in one view and set B in the other (eng review
    # R12): no list may appear twice, or the second view starts with a head start.
    lists = [tuple(n["value"] for n in it["initialNodes"]) for it in items]
    if len(set(lists)) != len(lists):
        raise RuntimeError(f"prototype items reuse an initial list: {lists}")
    return items


_NOT_LOCALS = {"for", "int", "while", "if", "else", "return", "NULL", "createNode", "free", "i", "index"}


def _declared(op: str) -> list[str]:
    """Pointer locals an operation declares = the ones its correct TEMPLATES
    program uses. The interpreter rejects any other name as undeclared, so a
    `curr` distractor in insertAtHead reads 'curr isn't declared here'."""
    names: set[str] = set()
    for line in TEMPLATES[op]["pseudocode"]:
        code = re.sub(r"\{\w+\}", "", re.sub(r"\.\w+", "", line))   # drop fields + placeholders
        names |= {w for w in re.findall(r"[A-Za-z_]\w*", code) if w not in _NOT_LOCALS}
    return sorted(names)


def build_fixtures() -> dict:
    return {
        "schema": 1,
        "generatedBy": "backend/export_heap_fixtures.py — do not edit by hand; re-run after editing TEMPLATES/_BLANKS/_BUGS",
        "operations": PHASE0_OPS,
        "declared": {op: _declared(op) for op in PHASE0_OPS},
        "parity": _parity(),
        "wrong": _wrong(),
        "prototype": _prototype(),
    }


def render(fixtures: dict) -> str:
    return json.dumps(fixtures, ensure_ascii=False, indent=1) + "\n"


def main() -> int:
    fixtures = build_fixtures()
    FIXTURES_PATH.parent.mkdir(parents=True, exist_ok=True)
    FIXTURES_PATH.write_text(render(fixtures), encoding="utf-8", newline="\n")
    print(f"wrote {FIXTURES_PATH} — {len(fixtures['parity'])} parity, "
          f"{len(fixtures['wrong'])} wrong, {len(fixtures['prototype'])} prototype")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
