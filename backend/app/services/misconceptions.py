"""
Misconceptions — the shared foundation of misconception-driven question
selection and the teachable classmate (docs/designs/misconception-*.md).

A misconception is defined by what a student who holds it would WRITE: one
canonical mutant of the operation's template per operation it applies to.
An option (a filled blank, a wrong fix, an ordering distractor, a whole
assembled order) is tagged with misconception m when the program it produces
BEHAVES exactly like m's mutant on every harness board: same outcome, same
fault, same final list, same leaks and dangling nodes. Tagging is decided by
execution, never by a model. A wrong option that matches no mutant is simply
untagged — it is evidence for nothing, and a candidate for a new entry.

Templates are symbolic ({value}); so are mutants and everything compared here.
`belief` and `correction` are student-facing prose and must contain no code:
corrections are also the explanation choices offered when a student teaches
the classmate, so a code fragment there would hand over the fix.

Execution decides what a program DOES, not what the student BELIEVES. Two
beliefs can behave alike on every board (on insertIntoEmpty, only empty lists
exist, so many wrong ideas end in "the list is still empty"), and one belief
written two ways can behave differently (docs/diagnosis-check-2026-11-18). So
a teacher's label for an edit (data/misconception_labels.json, filled from the
review sheet by `misconception_labels_sheet.py import`) OVERRIDES execution,
and MISCONCEPTION_TAGS=reviewed drops every tag a teacher has not confirmed.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

from . import pseudo_exec as px
from .item_quality import boards


@dataclass(frozen=True)
class Mutant:
    kind: str                     # "replace" | "swap" | "delete"
    lines: tuple[int, ...]        # replace: (line,); swap: (i, j); delete: lines to drop
    code: str | None = None       # replace only: the new line (symbolic)


@dataclass(frozen=True, eq=False)
class Misconception:
    id: str
    unit: str                     # curriculum unit id where it is first met
    belief: str                   # what the student believes, in a novice's words
    correction: str               # the idea that fixes it, as a student would explain it
    tutor_note: str               # for the tutor context and the teacher's review
    # operation -> its mutants. The FIRST is canonical (what the classmate writes,
    # what a targeted item shows); the others are further forms of the same belief.
    mutants: dict[str, tuple[Mutant, ...]] = field(default_factory=dict)


def _r(line: int, code: str) -> tuple[Mutant, ...]:
    return (Mutant("replace", (line,), code),)


def _s(i: int, j: int) -> tuple[Mutant, ...]:
    return (Mutant("swap", (i, j)),)


def _d(*lines: int) -> tuple[Mutant, ...]:
    return (Mutant("delete", tuple(lines)),)


_WALK_FOR = "for (int i = 0; i < {bound}; i++) curr = {step};"

_ALL: tuple[Misconception, ...] = (
    # ── unit 1: change the front ───────────────────────────────────────────────
    Misconception(
        "move-before-link", "front",
        belief="Point head (or the node before) at the new node first, then connect the new node to the rest.",
        correction="Connect the new node to the rest of the list first; only then redirect the pointer that should reach it.",
        tutor_note="Redirects the existing pointer before the new node holds the successor, so the rest of the list is lost.",
        mutants={"insertAtHead": _s(1, 2), "insertAtPosition": _s(3, 4)}),
    Misconception(
        "unlinked-new-node", "front",
        belief="A brand-new node does not need to point anywhere before it goes into the list.",
        correction="Point the new node at the node that should come after it before you link it in.",
        tutor_note="Leaves newNode.next NULL, so everything after the insertion point is cut off.",
        mutants={"insertAtHead": _r(1, "newNode.next = NULL;"),
                 "insertAtPosition": _r(3, "newNode.next = NULL;")}),
    Misconception(
        "link-one-too-far", "front",
        belief="The new node should point past the node that is there now.",
        correction="The new node should point to the node that will come right after it, which is the one there now.",
        tutor_note="Links newNode to the successor's successor (head.next / curr.next.next), skipping a node.",
        mutants={"insertAtHead": _r(1, "newNode.next = head.next;"),
                 "insertAtPosition": _r(3, "newNode.next = curr.next.next;")}),
    Misconception(
        "alias-not-new", "front",
        belief="Assigning an existing node to the new pointer gives you a new node.",
        correction="Assigning a pointer only gives an existing node a second name; a new node has to be created.",
        tutor_note="newNode = head / curr instead of createNode: no node is created.",
        mutants={"insertAtHead": _r(0, "newNode = head;"),
                 "insertIntoEmpty": _r(0, "newNode = head;"),
                 "insertAtTail": _r(2, "newNode = curr;"),
                 "insertAtPosition": _r(2, "newNode = curr;")}),
    Misconception(
        "null-head-is-node", "front",
        belief="Even an empty list has a head node you can attach the new node to.",
        correction="In an empty list head is NULL, so there is no node to attach to; head itself has to point to the new node.",
        tutor_note="Treats head as a node in an empty list (writes .next of NULL).",
        mutants={"insertIntoEmpty": _r(1, "head.next = newNode;")}),
    Misconception(
        "free-wrong-node", "front",
        belief="Free the node your pointer is standing on now.",
        correction="Free the node you saved as the one being removed, not the one your pointer now stands on.",
        tutor_note="Frees head after head moved, or curr (the predecessor), instead of the removed node.",
        mutants={"removeAtHead": _r(2, "free(head);"),
                 "removeAtTail": _r(4, "free(curr);"),
                 "removeAtPosition": _r(4, "free(curr);")}),
    Misconception(
        "free-before-unlink", "front",
        belief="You can free a node first and fix the links around it afterwards.",
        correction="Take the node out of the list before freeing it; after it is freed you cannot read its next any more.",
        tutor_note="Frees a node and then reads its .next to relink the list (use after free).",
        mutants={"removeAtHead": _s(1, 2), "removeAtPosition": _s(3, 4)}),
    Misconception(
        "forget-free", "front",
        belief="Taking a node out of the list is enough; it does not need to be freed.",
        correction="A node you take out still occupies memory until you free it.",
        tutor_note="Unlinks the node correctly but never frees it (memory leak).",
        mutants={"removeAtHead": _d(2), "removeAtTail": _d(4), "removeAtPosition": _d(4)}),
    # ── unit 2: walk to the node before ────────────────────────────────────────
    Misconception(
        "start-past-head", "walk",
        belief="The walk can start at the second node, because head has already been looked at.",
        correction="Start the walk at head itself; starting one node later skips the first node.",
        # Not on the position ops: there `curr = head.next` + index-1 steps lands
        # exactly where index steps from head would — that IS stop-on-target.
        tutor_note="curr = head.next: skips the first node (and crashes on a one-node list).",
        mutants={"insertAtTail": _r(0, "curr = head.next;"),
                 "removeAtTail": _r(0, "curr = head.next;"),
                 "deleteEntireList": _r(0, "curr = head.next;"),
                 "reverseList": _r(1, "curr = head.next;")}),
    Misconception(
        "walk-off-end", "walk",
        belief="Keep walking until the traversal pointer becomes NULL.",
        correction="Stop while the pointer is still on a node; once it is NULL there is no node left to change.",
        tutor_note="Loop runs until curr is NULL, then dereferences curr.",
        mutants={"insertAtTail": _r(1, "while (curr != NULL) curr = curr.next;"),
                 "removeAtTail": _r(1, "while (curr != NULL) curr = curr.next;")}),
    Misconception(
        "stop-on-target", "walk",
        belief="Walk until you reach the node you want to change.",
        correction="Stop one node earlier: to change a link you have to stand on the node before it.",
        tutor_note="Lands ON the target instead of its predecessor (curr.next vs curr.next.next; index vs index-1).",
        mutants={"removeAtTail": _r(1, "while (curr.next != NULL) curr = curr.next;"),
                 "removeAtPosition": _r(1, _WALK_FOR.format(bound="index", step="curr.next")),
                 "insertAtPosition": _r(1, _WALK_FOR.format(bound="index", step="curr.next"))}),
    Misconception(
        "stop-too-early", "walk",
        belief="To be safe, stop a node or two before the place you change.",
        correction="Stop exactly on the node before the change; stopping earlier changes the wrong link.",
        tutor_note="Over-corrects the predecessor rule: curr.next.next on insertAtTail, index-2 on the position ops.",
        mutants={"insertAtTail": _r(1, "while (curr.next.next != NULL) curr = curr.next;"),
                 "insertAtPosition": _r(1, _WALK_FOR.format(bound="index-2", step="curr.next")),
                 "removeAtPosition": _r(1, _WALK_FOR.format(bound="index-2", step="curr.next"))}),
    Misconception(
        "double-step", "walk",
        belief="Each step of the walk can jump two nodes ahead.",
        correction="A walk moves one node per step; jumping two at a time skips nodes and can run past the end.",
        tutor_note="Advances curr by .next.next in an ordinary walk (fast-pointer habit).",
        mutants={"insertAtTail": _r(1, "while (curr.next != NULL) curr = curr.next.next;"),
                 "removeAtTail": _r(1, "while (curr.next.next != NULL) curr = curr.next.next;"),
                 "insertAtPosition": _r(1, _WALK_FOR.format(bound="index-1", step="curr.next.next")),
                 "removeAtPosition": _r(1, _WALK_FOR.format(bound="index-1", step="curr.next.next"))}),
    Misconception(
        "save-wrong-node", "walk",
        belief="The pointer you keep for later should be the node you are standing on.",
        correction="Keep a pointer to the node that is about to be removed or lost, which is the one after you.",
        tutor_note="temp = curr instead of curr.next: the predecessor is freed or the next node is lost.",
        mutants={"removeAtPosition": _r(2, "temp = curr;"),
                 "deleteEntireList": _r(1, "while (curr != NULL) { temp = curr; free(curr); curr = temp; }")}),
    Misconception(
        "move-pointer-not-link", "walk",
        belief="Moving your own pointer onto a node (or to NULL) changes the list.",
        correction="Moving your own pointer changes nothing in the list; you have to change a node's next.",
        tutor_note="curr = newNode / curr = NULL instead of writing curr.next.",
        mutants={"insertAtTail": _r(3, "curr = newNode;"),
                 "insertAtPosition": _r(4, "curr = newNode;"),
                 "removeAtTail": _r(3, "curr = NULL;")}),
    # ── unit 3: save next, then go ─────────────────────────────────────────────
    Misconception(
        "advance-after-free", "sweep",
        belief="After freeing the current node you can still follow its next to move on.",
        correction="Save the next node before freeing the current one; a freed node cannot be read.",
        tutor_note="free(curr) then curr = curr.next (use after free).",
        mutants={"deleteEntireList": _r(1, "while (curr != NULL) { free(curr); curr = curr.next; }")}),
    Misconception(
        "overwrite-before-save", "sweep",
        belief="Point the current node back at the previous one first, then remember where to go next.",
        correction="Remember the next node before you overwrite the current node's next; it is your only way forward.",
        tutor_note="Overwrites curr.next before saving it, so the walk cannot continue.",
        mutants={"reverseList": _r(2, "while (curr != NULL) { curr.next = prev; temp = curr.next; prev = curr; curr = temp; }")}),
    Misconception(
        "tail-not-null", "sweep",
        belief="When reversing, the old first node can keep pointing into the list.",
        correction="The old first node becomes the last node, so it has to end up pointing to NULL.",
        tutor_note="prev starts at head instead of NULL, so the reversed list loops back on itself.",
        mutants={"reverseList": _r(0, "prev = head;")}),
    Misconception(
        "wrong-result-pointer", "sweep",
        belief="When the loop ends, the pointer that was moving (or the placeholder node) is the result.",
        correction="Check which pointer really holds the finished list when the loop ends; it is not the one that ran off the end or the placeholder.",
        tutor_note="Keeps the wrong pointer: head = curr after reversing; return dummy / curr after merging.",
        mutants={"reverseList": _r(3, "head = curr;"),
                 "mergeSortedLists": _r(3, "return dummy;") + _r(3, "return curr;")}),
    # ── unit 4: two pointers at once ───────────────────────────────────────────
    Misconception(
        "guard-slow", "two_pointers",
        belief="It is enough to check that the slow pointer does not run off the end.",
        correction="The fast pointer moves two nodes at a time, so it is the fast one (and the node after it) that can hit NULL.",
        tutor_note="Guards slow instead of fast/fast.next, so fast.next.next dereferences NULL.",
        mutants={"detectCycle": _r(1, "while (slow != NULL && slow.next != NULL) { slow = slow.next; "
                                      "fast = fast.next.next; if (slow == fast) return true; }")}),
    Misconception(
        "meet-check-outside", "two_pointers",
        belief="Let the loop run to the end first, then see whether the two pointers met.",
        correction="Compare the two pointers after every step, inside the loop; with a cycle the loop never ends on its own.",
        tutor_note="No meeting check inside the loop: on a cyclic list it never stops.",
        mutants={"detectCycle": _r(1, "while (fast != NULL && fast.next != NULL) { slow = slow.next; fast = fast.next.next; }")}),
    Misconception(
        "drop-remainder", "two_pointers",
        belief="When one list runs out, the merge is basically finished; whatever is left needs no checking.",
        correction="When one list runs out, the rest of the other list still has to be attached, whichever list it is.",
        tutor_note="Drops the leftover nodes, or always attaches the same list's leftovers.",
        mutants={"mergeSortedLists": _d(2) + _r(2, "curr.next = l1;") + _r(2, "curr.next = l2;")}),
    # ── unit 5: put it together ────────────────────────────────────────────────
    Misconception(
        "missing-base-case", "compose",
        belief="Only an empty list is already sorted; a one-node list still needs splitting.",
        correction="A list with zero or one node is already sorted; that is where the recursion stops.",
        tutor_note="Base case misses the one-node list, so the recursion never bottoms out.",
        mutants={"sortList": _r(0, "if (head == NULL) return head;")}),
    Misconception(
        "no-cut", "compose",
        belief="Finding the middle is enough; the two halves can then be sorted separately.",
        correction="Cut the list at the middle so the halves really are two lists; otherwise the first half still runs into the second.",
        tutor_note="Finds the midpoint but never sets slow.next = NULL, so the recursion never shrinks.",
        mutants={"sortList": _r(3, "mid = slow.next;")}),
)

CATALOG: dict[str, Misconception] = {m.id: m for m in _ALL}


def get(mid: str) -> Misconception:
    return CATALOG[mid]


def applicable(operation: str) -> list[Misconception]:
    """Misconceptions with a mutant on this operation, in catalog order."""
    return [m for m in _ALL if operation in m.mutants]


def ops_for(mid: str) -> list[str]:
    return list(CATALOG[mid].mutants)


def _template(operation: str) -> list[str]:
    from .static_questions import TEMPLATES
    return list(TEMPLATES[operation]["pseudocode"])


def apply_mutant(lines: list[str], mut: Mutant) -> list[str]:
    out = list(lines)
    if mut.kind == "replace":
        out[mut.lines[0]] = mut.code
    elif mut.kind == "swap":
        i, j = mut.lines
        out[i], out[j] = out[j], out[i]
    elif mut.kind == "delete":
        for i in sorted(mut.lines, reverse=True):
            del out[i]
    else:
        raise ValueError(f"unknown mutant kind {mut.kind!r}")
    return out


def canonical(operation: str, mid: str) -> Mutant:
    return CATALOG[mid].mutants[operation][0]


def mutant_program(operation: str, mid: str, k: int = 0) -> list[str]:
    """Template with the k-th form of `mid` applied (0 = canonical)."""
    return apply_mutant(_template(operation), CATALOG[mid].mutants[operation][k])


# ── behaviour fingerprints ─────────────────────────────────────────────────────

def _board_result(operation: str, lines: list[str], inst: px.Instance) -> tuple:
    r = px.run(operation, lines, inst)
    if r.outcome != "ok":
        return (r.outcome, r.error)
    if operation == "detectCycle":
        return ("ok", r.returned)
    vals = tuple(r.values) if r.values is not None else None
    return ("ok", vals, r.cyclic, tuple(sorted(r.leaked)), r.dangling, r.unbalanced)


@lru_cache(maxsize=16384)
def fingerprint(operation: str, lines: tuple[str, ...]) -> tuple:
    """What the program does on every harness board. Boards are deterministic
    per operation, so equal fingerprints mean 'behaves identically on all of them'."""
    return tuple(_board_result(operation, list(lines), inst) for inst in boards(operation))


@lru_cache(maxsize=None)
def _mutant_prints(operation: str) -> tuple[tuple[str, tuple], ...]:
    return tuple((m.id, fingerprint(operation, tuple(mutant_program(operation, m.id, k))))
                 for m in applicable(operation) for k in range(len(m.mutants[operation])))


def classify_program(operation: str, lines: list[str]) -> frozenset[str]:
    """Misconceptions whose mutant behaves exactly like `lines` on every board."""
    fp = fingerprint(operation, tuple(lines))
    return frozenset(mid for mid, mfp in _mutant_prints(operation) if mfp == fp)


# ── teacher-confirmed labels (override execution) ──────────────────────────────

LABELS_PATH = Path(__file__).resolve().parent.parent / "data" / "misconception_labels.json"
TAG_SOURCES = ("execution", "reviewed")


def tag_source() -> str:
    """MISCONCEPTION_TAGS: 'execution' (default) tags by behaviour wherever no
    teacher label exists; 'reviewed' (for a study) keeps only confirmed labels."""
    from ..config import settings
    s = (settings.misconception_tags or "execution").strip().lower()
    return s if s in TAG_SOURCES else "execution"


def norm_code(code: str) -> str:
    """One spelling per edit: whitespace collapsed, no trailing semicolon."""
    return re.sub(r"\s+", " ", str(code)).strip().rstrip(";").strip()


def label_key(operation: str, line: int | None, code: str) -> tuple[str, int | None, str]:
    """A line edit is (operation, line, the line as it now reads); an ordering
    distractor is (operation, None, its text) — it can sit in any slot."""
    return (operation, line, norm_code(code))


def _load_labels(path: Path) -> dict[tuple, frozenset[str]]:
    if not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    out = {}
    for e in data.get("labels", []):
        mid = e.get("misconception")
        out[label_key(e["operation"], e.get("line"), e["code"])] = frozenset([mid] if mid else [])
    return out


_LABELS: dict[tuple, frozenset[str]] = _load_labels(LABELS_PATH)


def set_labels(labels: dict[tuple, frozenset[str]] | None = None) -> None:
    """Replace the label table (tests; None reloads the file) and drop cached tags."""
    global _LABELS
    _LABELS = _load_labels(LABELS_PATH) if labels is None else dict(labels)
    _authored.cache_clear()


def label_for(operation: str, line: int | None, code: str) -> frozenset[str] | None:
    """The teacher's label for this edit ({m} or empty = 'no misconception'), or
    None when no teacher has looked at it."""
    return _LABELS.get(label_key(operation, line, code))


def _decide(label: frozenset[str] | None, by_execution) -> frozenset[str]:
    if label is not None:
        return label
    return frozenset() if tag_source() == "reviewed" else by_execution()


def tag_blank(operation: str, steps: list[str], line: int, answer: str, option: str) -> frozenset[str]:
    """The misconceptions shown by filling `option` into the blank at `answer`'s
    first occurrence in steps[line] (the _BLANKS str.replace contract)."""
    lines = list(steps)
    lines[line] = steps[line].replace(answer, option, 1)
    return _decide(label_for(operation, line, lines[line]), lambda: classify_program(operation, lines))


def tag_line(operation: str, steps: list[str], line: int, code: str) -> frozenset[str]:
    """...by writing `code` as line `line` (a find_bug buggy line or wrong fix)."""
    lines = list(steps)
    lines[line] = code
    return _decide(label_for(operation, line, code), lambda: classify_program(operation, lines))


def tag_distractor(operation: str, steps: list[str], distractor: str) -> frozenset[str]:
    """...by an ordering distractor, wherever it is placed in place of a step."""
    def by_execution():
        out: set[str] = set()
        for i in range(len(steps)):
            ls = list(steps)
            ls[i] = distractor
            out |= classify_program(operation, ls)
        return frozenset(out)
    return _decide(label_for(operation, None, distractor), by_execution)


def classify_assembly(operation: str, lines: list[str]) -> frozenset[str]:
    """A whole ordering answer. A pure reordering of the template's steps is
    judged by execution (order misconceptions are about order: same steps,
    different sequence). An answer that uses a distractor is judged by that
    distractor's label when a teacher gave one."""
    template = {norm_code(s) for s in _template(operation)}
    extra = [s for s in lines if norm_code(s) not in template]
    if not extra:
        return classify_program(operation, lines)
    labels = [label_for(operation, None, s) for s in extra]
    if len(extra) == 1 and labels[0] is not None:
        return labels[0]
    if tag_source() == "reviewed":
        return frozenset()
    return classify_program(operation, lines)


def authored_for(operation: str, qtype: str, mid: str, role: str | None = None) -> list["WrongOption"]:
    """Authored wrong options of one question type that show `mid` (optionally of one role)."""
    return [w for w in authored_wrong_options(operation)
            if w.qtype == qtype and mid in w.tags and (role is None or w.role == role)]


def authored_target_exists(operation: str, qtype: str, mid: str) -> bool:
    """Can an authored item of this type target `mid` on this operation?
    Any ordering item tests an order (swap) misconception."""
    if mid not in CATALOG or operation not in CATALOG[mid].mutants:
        return False
    if qtype == "ordering" and canonical(operation, mid).kind == "swap":
        return True
    return bool(authored_for(operation, qtype, mid))


# ── the authored content, tagged ───────────────────────────────────────────────

@dataclass(frozen=True)
class WrongOption:
    operation: str
    qtype: str                 # fill_blank | find_bug | ordering
    role: str                  # blank | bug | fix | distractor
    variant: int | None        # blank-set / bug-variant index (None for distractors)
    line: int | None
    option: str
    tags: frozenset[str]

    @property
    def where(self) -> str:
        if self.qtype == "fill_blank":
            return f"blanks[{self.variant}] line {self.line}"
        if self.qtype == "find_bug":
            return f"bugs[{self.variant}] {self.role} (line {self.line})"
        return "distractor"


def authored_wrong_options(operation: str) -> tuple[WrongOption, ...]:
    """Every wrong thing the authored content can show for one operation, tagged:
    blank distractors, each bug line and its wrong fixes, ordering distractors."""
    return _authored(operation, tag_source())


@lru_cache(maxsize=None)
def _authored(operation: str, source: str) -> tuple[WrongOption, ...]:
    from .static_questions import TEMPLATES, _BLANKS, _BUGS
    steps = TEMPLATES[operation]["pseudocode"]
    out: list[WrongOption] = []
    for si, bset in enumerate(_BLANKS.get(operation, [])):
        for line, bd in enumerate(bset):
            if bd is None:
                continue
            for w in bd["w"]:
                out.append(WrongOption(operation, "fill_blank", "blank", si, line, w,
                                       tag_blank(operation, steps, line, bd["a"], w)))
    for vi, bug in enumerate(_BUGS.get(operation, [])):
        line = bug["line"]
        out.append(WrongOption(operation, "find_bug", "bug", vi, line, bug["buggy"],
                               tag_line(operation, steps, line, bug["buggy"])))
        for o in bug["options"]:
            if o != bug["fix"]:
                out.append(WrongOption(operation, "find_bug", "fix", vi, line, o,
                                       tag_line(operation, steps, line, o)))
    for d in TEMPLATES[operation].get("distractors", []):
        out.append(WrongOption(operation, "ordering", "distractor", None, None, d,
                               tag_distractor(operation, steps, d)))
    return tuple(out)
