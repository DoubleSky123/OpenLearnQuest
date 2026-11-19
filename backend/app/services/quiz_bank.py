"""
The study's tests (pre / post / delayed): "which program does this correctly?"

No item is written by hand or by a model. Each one is built from the
misconception catalog:
    correct option = the operation's TEMPLATES program
    wrong options  = the canonical mutants of 1-3 misconceptions that apply to it
so picking a wrong option IS evidence for exactly that misconception, by
construction. Execution checks this (classify_program finds it).

Each item shows one board (the starting list and the inputs). On that board the
correct program works and every wrong option visibly fails, so a student who
traces it never finds two "working" programs. Forms A and B test the same
(operation, misconceptions) groups on parallel boards: same shape, other values.

The bank is app/data/study/quiz_items.json, written by `python build_quiz_bank.py`
(which also writes a teacher review sheet) and checked by tests/test_quiz_bank.py.
What a student is shown never includes which option is right, nor its
misconception (client_item).
"""
from __future__ import annotations

import hashlib
import json
import random
from functools import lru_cache
from pathlib import Path

from . import curriculum
from . import misconceptions as mc
from . import pseudo_exec as px
from .item_quality import boards as harness_boards
from .static_questions import TEMPLATES, _subst

BANK_PATH = Path(__file__).resolve().parent.parent / "data" / "study" / "quiz_items.json"
FORMS = ("A", "B")
PER_ITEM = 3              # misconceptions (wrong options) per item, at most

# What the program has to do, in the student's words. {value}/{index} come from the board.
PROMPTS = {
    "insertAtHead":     "Insert {value} at the front of the list.",
    "removeAtHead":     "Remove the first node of the list.",
    "insertIntoEmpty":  "The list is empty (head is NULL). Insert {value}.",
    "insertAtTail":     "Insert {value} at the end of the list.",
    "removeAtTail":     "Remove the last node of the list.",
    "insertAtPosition": "Insert {value} so that it ends up at index {index}.",
    "removeAtPosition": "Remove the node at index {index}.",
    "deleteEntireList": "Free every node of the list and leave head = NULL.",
    "reverseList":      "Reverse the list.",
    "detectCycle":      "Return true if the list has a cycle, false if it does not.",
    "mergeSortedLists": "Merge the sorted lists l1 and l2 into one sorted list and return it.",
    "sortList":         "Sort the list (merge sort; merge(a, b) merges two sorted lists).",
}
QUESTION = "Which program does this correctly?"


# ── building ───────────────────────────────────────────────────────────────────

def chunks(items: list, size: int = PER_ITEM) -> list[list]:
    """Split into the fewest groups of at most `size`, as even as possible
    (7 -> 3+2+2, 4 -> 2+2): every item then has 3-4 options."""
    if not items:
        return []
    n = -(-len(items) // size)
    base, extra = divmod(len(items), n)
    out, i = [], 0
    for k in range(n):
        step = base + (1 if k < extra else 0)
        out.append(items[i:i + step])
        i += step
    return out


def result(operation: str, lines: list[str], inst: px.Instance) -> tuple:
    return mc._board_result(operation, lines, inst)


def exposed(operation: str, wrong: list[str], inst: px.Instance) -> bool:
    """`wrong` does something different from the correct program on this board."""
    return result(operation, wrong, inst) != result(operation, TEMPLATES[operation]["pseudocode"], inst)


def _shape(inst: px.Instance) -> tuple:
    """Everything about a board but its values (sortable: None -> -1)."""
    def n(x):
        return -1 if x is None else x
    return (len(inst.values), n(inst.index), n(inst.cycle_to), -1 if inst.l2 is None else len(inst.l2),
            inst.value is None)


def _readable(inst: px.Instance) -> tuple:
    """Prefer 3-4 node lists, an index in the middle, a cycle that is a real loop."""
    n = len(inst.values)
    return (abs(n - 4) if n else 0, 0 if inst.cycle_to is None else -1, inst.index or 0)


def _candidates(operation: str, form: str) -> list[px.Instance]:
    found = px.instances(operation, TEMPLATES[operation], seed=f"quiz-{form}:{operation}")
    return sorted(found, key=_readable)


def _prefer_like(sets: list[tuple], like: tuple | None) -> list[tuple]:
    if like is None:
        return sets
    shape = sorted(_shape(b) for b in like)
    same = [s for s in sets if sorted(_shape(b) for b in s) == shape and not set(s) & set(like)]
    return same or [s for s in sets if not set(s) & set(like)] or sets


def choose_boards(operation: str, wrongs: list[list[str]], form: str,
                  like: tuple | None = None) -> tuple[px.Instance, ...]:
    """The boards the item shows: one on which every wrong program fails, or —
    when no single board can (detectCycle: one bug shows only without a cycle,
    another only with one) — two, each wrong program failing on at least one.
    Form B takes the same shapes as form A (`like`) when it can."""
    cands = _candidates(operation, form)
    ok = {b: [exposed(operation, w, b) for w in wrongs] for b in cands}
    single = [(b,) for b in cands if all(ok[b])]
    if single:
        return _prefer_like(single, like)[0]
    pairs = [(a, b) for i, a in enumerate(cands) for b in cands[i + 1:]
             if (a.value, a.index) == (b.value, b.index)     # one prompt, one program text
             and all(x or y for x, y in zip(ok[a], ok[b]))]
    if not pairs:
        raise ValueError(f"no board or pair of boards exposes every option of {operation}")
    return _prefer_like(pairs, like)[0]


def _display(operation: str, lines: list[str], inst: px.Instance) -> list[str]:
    value = str(inst.value) if inst.value is not None else "0"
    return [_subst(line, value, "index") for line in lines]


def _list_text(name: str, values: tuple[int, ...], cycle_to: int | None = None) -> str:
    if not values:
        return f"{name} = NULL"
    chain = " → ".join(str(v) for v in values)
    end = f" → (back to {values[cycle_to]})" if cycle_to is not None else " → NULL"
    return f"{name} → {chain}{end}"


def _one_setup(operation: str, inst: px.Instance) -> list[str]:
    if operation == "mergeSortedLists":
        return [_list_text("l1", inst.values), _list_text("l2", inst.l2 or ())]
    out = [_list_text("head", inst.values, inst.cycle_to)]
    if inst.cycle_to is not None:
        out.append(f"(the last node's next points back to the node holding {inst.values[inst.cycle_to]})")
    if inst.index is not None:          # the programs say `index` (it stays symbolic, as in practice)
        out.append(f"index = {inst.index}   (indices start at 0)")
    return out


def setup_text(operation: str, insts: tuple[px.Instance, ...]) -> list[str]:
    """The board(s) in words, as the student reads them."""
    if len(insts) == 1:
        return _one_setup(operation, insts[0])
    out = []
    for k, inst in enumerate(insts, start=1):
        lines = _one_setup(operation, inst)
        out.append(f"List {k}: {lines[0]}")
        out += lines[1:]
    return out


def _prompt(operation: str, insts: tuple[px.Instance, ...]) -> str:
    text = PROMPTS[operation].format(value=insts[0].value, index=insts[0].index)
    return text + (" It has to work on both lists." if len(insts) > 1 else "")


def _option_id(item_id: str, k: int) -> str:
    # not "the first one is right": ids say nothing about the answer
    return hashlib.sha256(f"quiz-option:{item_id}:{k}".encode()).hexdigest()[:8]


# No line highlighting: the correct program differs from every wrong one, so
# "the lines where options differ" marks it the most — a cue a test-wise student
# could answer from without reading. The programs are 2-5 lines.

def build() -> list[dict]:
    """The whole bank, deterministically. Raises if an item can't be built."""
    items = []
    for u_index, unit in enumerate(curriculum.UNITS):
        for op in unit.ops:
            mids = [m.id for m in mc.applicable(op)]
            for g, group in enumerate(chunks(mids), start=1):
                wrongs = [mc.mutant_program(op, m) for m in group]
                boards_a = None
                for form in FORMS:
                    insts = choose_boards(op, wrongs, form, like=boards_a)
                    boards_a = boards_a or insts
                    item_id = f"{op}-{g}-{form}"
                    progs = [list(TEMPLATES[op]["pseudocode"])] + wrongs
                    options = []
                    for k, (code, mid) in enumerate(zip(progs, [None] + group)):
                        options.append({
                            "id": _option_id(item_id, k), "code": code,
                            "lines": _display(op, code, insts[0]),
                            "correct": mid is None, "misconception": mid,
                        })
                    items.append({
                        "id": item_id, "group": f"{op}-{g}", "form": form, "operation": op,
                        "unit": unit.id, "unit_index": u_index, "prompt": _prompt(op, insts),
                        "question": QUESTION, "setup": setup_text(op, insts),
                        "boards": [b.to_json() for b in insts], "options": options,
                    })
    return items


# ── checking (tests/test_quiz_bank.py runs this on the shipped file) ───────────

def verify(item: dict) -> list[str]:
    """Why this item is not fit to serve ([] = fine). Decided by execution."""
    op, issues = item["operation"], []
    insts = [px.Instance.from_json(b) for b in item["boards"]]
    if not 1 <= len(insts) <= 2:
        return [f"{len(insts)} boards"]
    inst = insts[0]
    template = list(TEMPLATES[op]["pseudocode"])
    correct = [o for o in item["options"] if o["correct"]]
    if len(correct) != 1:
        return [f"{len(correct)} options marked correct"]
    if correct[0]["code"] != template:
        issues.append("the correct option is not the current template (rebuild the bank)")
    if correct[0]["misconception"] is not None:
        issues.append("the correct option carries a misconception")
    if len({tuple(o["code"]) for o in item["options"]}) != len(item["options"]):
        issues.append("two options are the same program")
    if len({o["id"] for o in item["options"]}) != len(item["options"]):
        issues.append("two options share an id")
    if any(result(op, template, b)[0] != "ok" for b in insts):
        issues.append("the correct program does not run on the board")
    if len(insts) == 2 and (insts[0].value, insts[0].index) != (insts[1].value, insts[1].index):
        issues.append("two boards with different inputs: the prompt and the program show only one")
    for o in item["options"]:
        if o["correct"]:
            continue
        m = o["misconception"]
        if m not in mc.CATALOG or op not in mc.CATALOG[m].mutants:
            issues.append(f"{m!r} is not a misconception of {op}")
            continue
        if o["code"] != mc.mutant_program(op, m):
            issues.append(f"{m}: the option is not its canonical mutant (rebuild the bank)")
        if m not in mc.classify_program(op, o["code"]):
            issues.append(f"{m}: execution does not recognise the option as {m}")
        if not any(exposed(op, o["code"], b) for b in insts):
            issues.append(f"{m}: works on the item's board(s), so two options look right")
        if o["lines"] != _display(op, o["code"], inst):
            issues.append(f"{m}: the shown lines are not the program")
    if correct and correct[0]["lines"] != _display(op, template, inst):
        issues.append("the shown correct lines are not the program")
    if not px.check_program(op, template, list(harness_boards(op))).correct:
        issues.append("the template itself fails the harness")
    return issues


# ── serving ────────────────────────────────────────────────────────────────────

@lru_cache(maxsize=1)
def _doc() -> dict:
    if not BANK_PATH.exists():
        return {}
    return json.loads(BANK_PATH.read_text(encoding="utf-8"))


def load() -> tuple[dict, ...]:
    return tuple(_doc().get("items", ()))


def built() -> str | None:
    """When the served bank was built (stored on every attempt)."""
    return _doc().get("built")


def reload() -> None:
    _doc.cache_clear()


def by_id() -> dict[str, dict]:
    return {it["id"]: it for it in load()}


def form_items(form: str) -> list[dict]:
    """A form's items in teaching order (unit, then operation, then group)."""
    return [it for it in load() if it["form"] == form]


def option_order(user_id: str, item: dict) -> list[str]:
    """This student's (stable) display order of the item's options."""
    ids = [o["id"] for o in item["options"]]
    random.Random(f"quiz-order:{user_id}:{item['id']}").shuffle(ids)
    return ids


def client_item(item: dict, order: list[str]) -> dict:
    """What the student is shown: never which option is right, nor what it means."""
    opts = {o["id"]: o for o in item["options"]}
    return {
        "id": item["id"], "prompt": item["prompt"], "question": item["question"],
        "setup": item["setup"],
        "options": [{"id": oid, "lines": opts[oid]["lines"]} for oid in order],
    }


def judge(item: dict, option_id: str) -> tuple[bool, str | None]:
    """(correct, the misconception the pick shows). KeyError: not an option of this item."""
    o = next(o for o in item["options"] if o["id"] == option_id)
    return o["correct"], o["misconception"]
