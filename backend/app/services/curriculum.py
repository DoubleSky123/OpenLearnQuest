"""
The linked-list curriculum — how a CS teacher would sequence it.

Twelve operations are not twelve skills. They are a few reusable ideas, each
practised on one or more operations. The student progresses by IDEA (unit), the
operations are the contexts it is practised in:

  1 Change the front        insertAtHead · removeAtHead · insertIntoEmpty
  2 Walk to the node before insertAtTail · removeAtTail · insertAtPosition · removeAtPosition
  3 Save next, then go      deleteEntireList · reverseList
  4 Two pointers            detectCycle · mergeSortedLists
  5 Put it together         sortList (= unit 4's slow/fast + merge, plus recursion)

Rules (all derived from the mastery table — nothing new is stored here):
- An operation is MASTERED by a zero-error ORDERING pass: the student assembles
  the whole procedure themselves. fill_blank and find_bug are the scaffolding
  on the way there, not evidence of mastery (a 3-way blank can be guessed).
- Each `group` is (primary, *variants). The primary climbs the full ladder
  (fill_blank -> find_bug -> ordering). A variant is the same idea in another
  form (insertIntoEmpty = insertAtHead with head == NULL; position ops = tail
  ops with index-1): it joins once its primary is mastered and starts at
  `transfer_start` — one clean ordering question shows the idea transferred.
  A unit is mastered when ALL its ops are; units unlock in order.
- Block, then interleave: the unit's anchor (its first op) is practised alone
  until it passes fill_blank cleanly — a first look at new code wants the
  completion problem undisturbed. After that every op IN PLAY (`active_ops`)
  takes turns, least recently practised first, each at its own level: with two
  ops that is plain alternation; with more, every op comes round before any
  repeats, and a newly joined variant (never practised) goes next. Mixing is
  what forces "which stop condition / which pointer, for THIS one?" every time.
- A student who struggles (2+ errors or a fail) on a level they skipped (a
  variant's probe) steps down one level (game_master.update_mastery); the
  earned ceiling never drops.
- Stuck: 3 questions in a row on the same op with mistakes → one question of a
  different op in the unit (`detour_op`), then back.
- Review: every REVIEW_EVERY questions in a unit, one ordering question from an
  already-mastered unit (game_master.plan_next) — it measures forgetting and
  never changes mastery.
- The difficulty tier (game_master.LEVEL_OPS: XP and within-type difficulty) is
  unchanged; this module only decides WHAT to practise next.
"""
from __future__ import annotations

from dataclasses import dataclass

MASTERY_TYPE = 3        # ordering
TYPE_RANK = {"fill_blank": 1, "find_bug": 2, "ordering": 3}
INTERLEAVE_AFTER = 1    # anchor's clean pass at fill_blank switches the unit to interleaving
STUCK_AFTER = 3         # consecutive same-op questions with mistakes before a detour
REVIEW_EVERY = 4        # unit questions between reviews: the review is the 5th


@dataclass(frozen=True)
class Unit:
    id: str
    title: str
    big_idea: str                    # what the teacher writes on the board
    watch_for: tuple[str, ...]       # the misconceptions this unit's items target
    ops: tuple[str, ...]             # teaching order inside the unit (tie-break of the rotation)
    groups: tuple[tuple[str, ...], ...]   # (primary, *variants); every op is required
    transfer_start: int | None       # a variant's start level once its primary is mastered


UNITS: tuple[Unit, ...] = (
    Unit(
        id="front", title="Change the front",
        big_idea="Link the new node to the old head before you move head. "
                 "Save the old head before you cut it off.",
        watch_for=(
            "Moving head first (head = newNode) loses the whole old list.",
            "After head moves on, free(head) frees the wrong node — that is what temp is for.",
            "An empty list is not a special case: head is just NULL.",
        ),
        ops=("insertAtHead", "removeAtHead", "insertIntoEmpty"),
        groups=(("insertAtHead", "insertIntoEmpty"), ("removeAtHead",)),
        transfer_start=3,
    ),
    Unit(
        id="walk", title="Walk to the node before",
        big_idea="To change a link you must stand on the node BEFORE it. "
                 "Choose the stop condition that lands you there.",
        watch_for=(
            "curr != NULL walks off the end; curr.next != NULL stops on the last node; "
            "curr.next.next != NULL stops on the one before it.",
            "index steps from head land ON index — index-1 steps land on the node before it.",
            "Hook the new node to its successor before the predecessor lets go of it.",
        ),
        ops=("insertAtTail", "removeAtTail", "insertAtPosition", "removeAtPosition"),
        groups=(("insertAtTail", "insertAtPosition"), ("removeAtTail", "removeAtPosition")),
        transfer_start=3,
    ),
    Unit(
        id="sweep", title="Save next, then go",
        big_idea="When a step destroys or rewires curr.next, save it in temp first — "
                 "then you can still move on.",
        watch_for=(
            "curr = curr.next after free(curr) reads memory that is already gone.",
            "In reverse, curr.next = prev overwrites your only way forward.",
            "When the loop ends, which pointer holds the result?",
        ),
        ops=("deleteEntireList", "reverseList"),
        groups=(("deleteEntireList",), ("reverseList",)),
        transfer_start=None,           # two different algorithms, no variants
    ),
    Unit(
        id="two_pointers", title="Two pointers at once",
        big_idea="Two pointers that move by different rules: a faster one can only catch "
                 "a slower one if the list loops; a dummy head lets you build a list "
                 "one node at a time.",
        watch_for=(
            "fast jumps two nodes — guard fast and fast.next, not slow.",
            "Check slow == fast inside the loop, after every step.",
            "The merged list starts at dummy.next, not dummy.",
        ),
        ops=("detectCycle", "mergeSortedLists"),
        groups=(("detectCycle",), ("mergeSortedLists",)),
        transfer_start=None,
    ),
    Unit(
        id="compose", title="Put it together: sort a list",
        big_idea="Merge sort: find the middle with slow/fast, CUT the list in two, "
                 "sort each half, merge them.",
        watch_for=(
            "Without slow.next = NULL the halves are still one list and the recursion never ends.",
            "A list of 0 or 1 nodes is already sorted — that is the base case.",
        ),
        ops=("sortList",),
        groups=(("sortList",),),
        transfer_start=None,
    ),
)

_UNIT_OF = {op: u for u in UNITS for op in u.ops}
ALL_UNIT_OPS = tuple(op for u in UNITS for op in u.ops)


def unit_of(operation: str) -> Unit | None:
    return _UNIT_OF.get(operation)


def op_mastered(m: dict | None) -> bool:
    return (m or {}).get("best_perfect_type", 0) >= MASTERY_TYPE


def unit_mastered(unit: Unit, mastery_map: dict) -> bool:
    return all(op_mastered(mastery_map.get(o)) for o in unit.ops)


class MasteryMap(dict):
    """{operation: mastery info}, plus `unlock_all` for test accounts
    (config UNLOCK_ALL_UNITS_FOR): every unit open, progress untouched."""
    unlock_all: bool = False


def unit_unlocked(index: int, mastery_map: dict) -> bool:
    if getattr(mastery_map, "unlock_all", False):
        return True
    return index == 0 or unit_mastered(UNITS[index - 1], mastery_map)


def all_mastered(mastery_map: dict) -> bool:
    return all(unit_mastered(u, mastery_map) for u in UNITS)


def available_ops(mastery_map: dict) -> list[str]:
    """Operations in unlocked units — what a student may be given."""
    return [op for i, u in enumerate(UNITS) if unit_unlocked(i, mastery_map) for op in u.ops]


def primary_of(operation: str) -> str | None:
    """The primary of a variant's group (None for a primary)."""
    unit = unit_of(operation)
    for g in unit.groups if unit else ():
        if operation in g[1:]:
            return g[0]
    return None


def entry_level(operation: str, mastery_map: dict) -> int:
    """Question type for an operation the student has never attempted: a
    variant whose primary is mastered starts at the unit's transfer probe;
    everything else starts scaffolded at fill_blank."""
    unit, primary = unit_of(operation), primary_of(operation)
    if unit and unit.transfer_start and primary and op_mastered(mastery_map.get(primary)):
        return unit.transfer_start
    return 1


def _started(mastery_map: dict, op: str) -> bool:
    return (mastery_map.get(op) or {}).get("attempts", 0) > 0


def active_ops(unit: Unit, mastery_map: dict) -> list[str]:
    """The unmastered ops in play, in unit order: every primary, plus each
    variant once its primary is mastered (or once the student has started it —
    nothing is left half-done)."""
    out = []
    for g in unit.groups:
        primary, variants = g[0], g[1:]
        if not op_mastered(mastery_map.get(primary)):
            out.append(primary)
        for v in variants:
            if not op_mastered(mastery_map.get(v)) and (
                    op_mastered(mastery_map.get(primary)) or _started(mastery_map, v)):
                out.append(v)
    return sorted(out, key=unit.ops.index)


def interleaving(unit: Unit, mastery_map: dict) -> bool:
    """Blocked until the anchor passes fill_blank cleanly."""
    anchor = unit.groups[0][0]
    return (mastery_map.get(anchor) or {}).get("best_perfect_type", 0) >= INTERLEAVE_AFTER


def _least_recent(ops: list[str], unit: Unit, recency: dict) -> str:
    """Least recently practised first; never practised counts as oldest; ties
    in teaching order. With two ops this alternates, with more it is a fair
    rotation, and it stays fair while ops join (variants) and leave (mastered)."""
    from datetime import datetime
    return min(ops, key=lambda o: (recency.get(o) or datetime.min, unit.ops.index(o)))


def next_op_in_unit(unit: Unit, mastery_map: dict, recency: dict | None = None) -> str:
    """What to practise next inside a unit. `recency` = {op: when the student
    last practised it} (reviews excluded).

    Blocked on the anchor, then the least recently practised op in play.
    A mastered unit is reviewed least-recent first."""
    recency = recency or {}
    active = active_ops(unit, mastery_map)
    if active:
        anchor = unit.groups[0][0]
        if anchor in active and not interleaving(unit, mastery_map):
            return anchor
        return _least_recent(active, unit, recency)
    return _least_recent(list(unit.ops), unit, recency)


def detour_op(unit: Unit, mastery_map: dict, stuck_op: str, recency: dict | None = None) -> str | None:
    """A different op of the same unit for a student stuck on `stuck_op`:
    another op in play first, then a mastered one (a win on familiar ground).
    Never a variant that hasn't joined yet: served now it would start at
    fill_blank and the student would lose its one-question transfer probe.
    None if there is no such op (unit 5 has one op)."""
    recency = recency or {}
    others = [o for o in active_ops(unit, mastery_map) if o != stuck_op] or \
             [o for o in unit.ops if o != stuck_op and op_mastered(mastery_map.get(o))]
    return _least_recent(others, unit, recency) if others else None


def review_candidates(mastery_map: dict, current: Unit | None) -> list[str]:
    """Mastered ops of mastered units other than the current one."""
    return [o for u in UNITS if u is not current and unit_mastered(u, mastery_map)
            for o in u.ops if op_mastered(mastery_map.get(o))]


def summary(mastery_map: dict, op_titles: dict[str, str]) -> list[dict]:
    """The unit path the student sees (mastery_summary['units'])."""
    out = []
    for i, u in enumerate(UNITS):
        ops = []
        for o in u.ops:
            m = mastery_map.get(o) or {}
            ops.append({
                "operation": o,
                "title": op_titles.get(o, o),
                "mastered": op_mastered(m),
                "attempts": m.get("attempts", 0),
                "best_type": m.get("best_perfect_type", 0),
                # a variant is one transfer question once its primary is mastered
                "role": "variant" if primary_of(o) else "primary",
            })
        done = sum(1 for o in ops if o["mastered"])
        last_seen = {o: (mastery_map.get(o) or {}).get("last_seen") for o in u.ops}
        out.append({
            "id": u.id,
            "number": i + 1,
            "title": u.title,
            "big_idea": u.big_idea,
            "watch_for": list(u.watch_for),
            "ops": ops,
            "groups": [list(g) for g in u.groups],
            "ops_done": done,
            "ops_total": len(ops),
            "mastered": done == len(ops),
            "unlocked": unit_unlocked(i, mastery_map),
            # where a session would start (the session re-plans from the attempt history)
            "next_op": next_op_in_unit(u, mastery_map, last_seen),
        })
    return out
