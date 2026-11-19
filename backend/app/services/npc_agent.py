"""
The teachable classmate: "help Quinn" (direction 1, docs/designs/misconception-*.md).

A hybrid NPC (ESS level E3). Everything Quinn KNOWS lives in code:
- Quinn's program is the operation's template with the canonical mutant of every
  misconception Quinn holds (misconceptions.py). Nothing else ever changes it.
- An explanation fixes misconception m only when execution says so. A chosen
  explanation is m's catalog correction; a free-text explanation is translated
  into an edit, and the edit is accepted only if the edited program behaves
  exactly like "Quinn without m" on every harness board. An edit that fixes
  more than one thing is refused (one idea per explanation), so does one that
  breaks something new.
- The model only VOICES Quinn (a few plain-word sentences built from execution
  facts) and, for free text, translates the explanation into an edit. A line
  with code in it is regenerated once, then replaced by a fixed line.
- Coach hints are computed from execution (a board that breaks the program,
  the line that differs), never by a model.

The elective is always open. A case is drawn at random from the operations the
student has learned (passed a find_bug question with no mistakes); a student
who has not learned any yet gets one of unit 1's operations.
"""
from __future__ import annotations

import difflib
import itertools
import json
import logging
import random
import re
import time
from datetime import datetime, timedelta
from functools import lru_cache

from sqlalchemy.orm import Session

from . import anthropic_client, curriculum, misconception_model
from . import misconceptions as mc
from . import pseudo_exec as px
from .item_quality import boards as harness_boards
from .static_questions import TEMPLATES
from ..config import settings
from ..models.mastery import Mastery
from ..models.npc import NpcCase, NpcEvent

logger = logging.getLogger(__name__)

NPC_NAME = "Quinn"
NPC_VERSION = "2026-11-03.1"     # bump whenever what Quinn says or accepts changes

N_CHOICES = 4                    # explanation cards offered per case
TWO_HELD_P = 0.35                # after a first solved case: chance Quinn holds two misconceptions
RECENT_CASES = 5                 # don't repeat a recent (operation, misconception) if avoidable
MAX_TESTS = 40
MAX_TEXT = 500                   # a free-text explanation
MAX_VALUE = 99
RATE_WINDOW_S = 60               # model calls (Quinn's replies, translations) per student
RATE_MAX = 8
VOICE_TIMEOUT_S = 12.0
TRANSLATE_TIMEOUT_S = 20.0
TRANSLATE_EFFORT = "medium"      # a wrong translation is a fidelity failure; worth the latency

FALLBACK_OPS = curriculum.UNITS[0].ops


def enabled() -> bool:
    return bool(settings.npc_enabled)


# ── what a student may build, per operation ────────────────────────────────────
# The operation's precondition, not the generator's minNodes: sortList's base
# case lives on 0- and 1-node lists, start-past-head on insertAtTail only shows
# on a 1-node list. The template is correct on every board in this space
# (tests/test_npc.py), and the harness boards lie inside it, so "passes every
# hidden test" is something a student could have checked themselves.

_LENGTHS: dict[str, tuple[int, int]] = {
    "insertAtHead": (0, 6), "insertAtTail": (1, 6), "removeAtHead": (1, 6), "removeAtTail": (2, 6),
    "insertIntoEmpty": (0, 0), "deleteEntireList": (0, 6), "insertAtPosition": (1, 6),
    "removeAtPosition": (2, 6), "reverseList": (0, 6), "mergeSortedLists": (0, 5),
    "detectCycle": (1, 6), "sortList": (0, 6),
}


class BoardError(ValueError):
    """A board the student built is outside the operation's precondition (shown to them)."""


def board_spec(op: str) -> dict:
    t = TEMPLATES[op]
    lo, hi = _LENGTHS[op]
    spec = {"min_len": lo, "max_len": hi, "max_value": MAX_VALUE,
            "value": bool(t.get("needsValue")), "index": None,
            "two_lists": op == "mergeSortedLists", "cycle": op == "detectCycle"}
    if op == "insertAtPosition":
        spec["index"] = {"min": 1, "max": "len"}       # index == length appends
    elif op == "removeAtPosition":
        spec["index"] = {"min": 1, "max": "len-1"}
    return spec


def signature(op: str) -> str:
    if op == "mergeSortedLists":
        return "mergeSortedLists(l1, l2)  — returns the merged list"
    args = ["head"]
    if TEMPLATES[op].get("needsValue"):
        args.append("value")
    if TEMPLATES[op].get("needsPosition"):
        args.append("index")
    tail = {"detectCycle": "  — returns true or false", "sortList": "  — returns the sorted list"}.get(op, "")
    return f"{op}({', '.join(args)}){tail}"


def _whole(v, what: str, lo: int, hi: int) -> int:
    if not isinstance(v, int) or isinstance(v, bool) or not lo <= v <= hi:
        raise BoardError(f"{what} must be a whole number from {lo} to {hi}")
    return v


def _values(xs, what: str, lo_len: int, hi_len: int) -> tuple[int, ...]:
    if not isinstance(xs, list):
        raise BoardError(f"{what} must be a list of numbers")
    vals = tuple(_whole(v, "each value", 1, MAX_VALUE) for v in xs)
    if not lo_len <= len(vals) <= hi_len:
        raise BoardError(f"{what} needs {lo_len} to {hi_len} nodes" if lo_len != hi_len
                         else f"{what} must have {lo_len} nodes")
    if len(set(vals)) != len(vals):
        raise BoardError("use different values, so you can tell the nodes apart")
    return vals


def parse_board(op: str, raw: dict) -> px.Instance:
    spec = board_spec(op)
    if not isinstance(raw, dict):
        raise BoardError("not a board")
    if spec["two_lists"]:
        l1 = _values(raw.get("values", []), "l1", 0, spec["max_len"])
        l2 = _values(raw.get("l2", []), "l2", 0, spec["max_len"])
        if list(l1) != sorted(l1) or list(l2) != sorted(l2):
            raise BoardError("both lists must be sorted, smallest first")
        return px.Instance(l1, l2=l2)
    vals = _values(raw.get("values", []), "the list", spec["min_len"], spec["max_len"])
    n = len(vals)
    value = _whole(raw.get("value"), "the value to insert", 1, MAX_VALUE) if spec["value"] else None
    index = None
    if spec["index"]:
        hi = n if spec["index"]["max"] == "len" else n - 1
        index = _whole(raw.get("index"), "index", 1, hi)
    cycle_to = None
    if spec["cycle"] and raw.get("cycle_to") is not None:
        cycle_to = _whole(raw.get("cycle_to"), "the node the last one links back to", 0, n - 1)
    return px.Instance(vals, value=value, index=index, cycle_to=cycle_to)


board_dict = px.Instance.to_json       # a board as stored / sent (also the API's request shape)
_inst = px.Instance.from_json


# ── Quinn's program ────────────────────────────────────────────────────────────

def program_for(op: str, held: list[str] | tuple[str, ...]) -> list[str]:
    """The template with every held misconception's canonical mutant applied.
    Line numbers in mutants refer to the template, so replaces and swaps go
    first and deletions last (descending)."""
    lines = list(TEMPLATES[op]["pseudocode"])
    muts = [mc.canonical(op, m) for m in held]
    for mu in muts:
        if mu.kind != "delete":
            lines = mc.apply_mutant(lines, mu)
    for i in sorted({i for mu in muts if mu.kind == "delete" for i in mu.lines}, reverse=True):
        del lines[i]
    return lines


def display(lines: list[str]) -> list[str]:
    """What the student reads: the payload is the parameter `value`."""
    return [ln.replace("{value}", "value") for ln in lines]


def undisplay(code: str) -> str:
    """Back to the symbolic form the executor runs (`.value` fields stay fields)."""
    return re.sub(r"(?<![.\w])value\b", "{value}", code)


def changed_lines(old: list[str], new: list[str]) -> list[int]:
    if len(old) == len(new):                 # a replace or a swap: both swapped lines changed
        return [i for i, (a, b) in enumerate(zip(old, new)) if a != b]
    out: list[int] = []
    for tag, _, _, j1, j2 in difflib.SequenceMatcher(a=old, b=new, autojunk=False).get_opcodes():
        if tag in ("replace", "insert"):
            out.extend(range(j1, j2))
    return out


def _touched(op: str, mid: str) -> frozenset[int]:
    return frozenset(mc.canonical(op, mid).lines)


def _fp(op: str, lines: list[str]) -> tuple:
    return mc.fingerprint(op, tuple(lines))


def _template_fp(op: str) -> tuple:
    return _fp(op, TEMPLATES[op]["pseudocode"])


@lru_cache(maxsize=None)
def compatible(op: str, a: str, b: str) -> bool:
    """Quinn can hold a and b together on op: different lines, not related as
    explanations, the combined program is a runnable wrong program, and each
    one VISIBLY contributes — with `newNode = head` there is no new node, so the
    order of the link steps no longer matters, and explaining that order would
    change nothing anyone could see."""
    if a == b or _touched(op, a) & _touched(op, b) or b in related(a):
        return False
    fp = _fp(op, program_for(op, [a, b]))
    return (fp != _template_fp(op) and all(r[0] != "compile_error" for r in fp)
            and fp != _fp(op, program_for(op, [a])) and fp != _fp(op, program_for(op, [b])))


# Explanations that would also be a fair account of each other's bug. Computed:
# two misconceptions whose mutants touch the same line of some operation (stop
# on the target / stop too early / walk off the end are all "where the walk
# stops"). Plus families the line rule can't see because they never share a
# line — read every correction against every bug when the catalog grows.
_FAMILIES = (
    {"advance-after-free", "overwrite-before-save", "save-wrong-node"},   # save next before you lose it
    {"free-before-unlink", "advance-after-free"},                        # a freed node can't be read
    {"free-wrong-node", "save-wrong-node"},                              # which node is the removed one
    {"guard-slow", "walk-off-end", "double-step"},                       # a pointer that runs off the end
    {"move-before-link", "overwrite-before-save"},                       # don't overwrite before saving
)

# Distractors from operations of the same kind read as plausible ("could that
# be it?"); one about inserting a new node, offered for a removal, does not.
_OP_KINDS = (
    {"insertAtHead", "insertAtTail", "insertIntoEmpty", "insertAtPosition"},
    {"removeAtHead", "removeAtTail", "removeAtPosition", "deleteEntireList"},
    {"reverseList", "mergeSortedLists", "detectCycle", "sortList"},
)


@lru_cache(maxsize=None)
def related(mid: str) -> frozenset[str]:
    out: set[str] = set()
    for op, _ in mc.CATALOG[mid].mutants.items():
        for other in mc.applicable(op):
            if other.id != mid and _touched(op, mid) & _touched(op, other.id):
                out.add(other.id)
    for fam in _FAMILIES:
        if mid in fam:
            out |= fam - {mid}
    return frozenset(out)


# ── choosing a case ────────────────────────────────────────────────────────────

def choose_case(rng: random.Random, ops: list[str], recent: list[tuple[str, str]],
                solved_before: int) -> tuple[str, list[str]]:
    """A random (operation, misconception) from what the student has learned,
    avoiding recent ones when possible; sometimes a second, compatible one."""
    fresh = {op: [m.id for m in mc.applicable(op) if (op, m.id) not in recent] for op in ops}
    pool = [op for op in ops if fresh[op]] or [op for op in ops if mc.applicable(op)]
    op = rng.choice(pool)
    first = rng.choice(fresh[op] or [m.id for m in mc.applicable(op)])
    held = [first]
    if solved_before and rng.random() < TWO_HELD_P:
        partners = [m.id for m in mc.applicable(op) if compatible(op, first, m.id)]
        if partners:
            held.append(rng.choice(partners))
    return op, held


def choices_for(rng: random.Random, op: str, held: list[str]) -> list[dict]:
    """The held misconceptions' corrections plus distractors that are true
    statements about something else: same operation first (they could be about
    Quinn's code), then operations of the same kind, the same unit, anything —
    never one related to a held misconception (it would also explain the bug)."""
    blocked = set(held).union(*(related(m) for m in held))
    touched = frozenset().union(*(_touched(op, m) for m in held))
    unit = curriculum.unit_of(op)
    kind = next((k for k in _OP_KINDS if op in k), {op})
    same_op = [m.id for m in mc.applicable(op) if m.id not in blocked and not (_touched(op, m.id) & touched)]
    others = [m for m in mc.CATALOG if m not in blocked and m not in same_op and op not in mc.CATALOG[m].mutants]
    same_kind = [m for m in others if set(mc.CATALOG[m].mutants) & kind]
    same_unit = [m for m in others if m not in same_kind and unit and mc.CATALOG[m].unit == unit.id]
    rest = [m for m in others if m not in same_kind and m not in same_unit]
    for group in (same_op, same_kind, same_unit, rest):
        rng.shuffle(group)
    # distractors unrelated to each other too: two near-synonyms ("stop one node
    # earlier" / "stop exactly on the node before") rule each other out by sight
    picks = list(held)
    for m in same_op + same_kind + same_unit + rest:
        if len(picks) >= N_CHOICES:
            break
        if not any(m in related(p) for p in picks[len(held):]):
            picks.append(m)
    rng.shuffle(picks)
    return [{"id": f"c{i}", "mid": m} for i, m in enumerate(picks)]


# ── running boards ─────────────────────────────────────────────────────────────

def run_board(op: str, lines: list[str], inst: px.Instance) -> dict:
    r = px.run(op, lines, inst)
    v = px.judge(op, lines, inst)
    want = px.expected(op, inst)
    return {"passed": v.correct, "outcome": r.outcome, "reason": v.reason,
            "expected": want if op == "detectCycle" else list(want),
            "values": list(r.values) if r.values is not None else None,
            "returned": r.returned if op == "detectCycle" and isinstance(r.returned, bool) else None,
            "cyclic": r.cyclic, "leaked": list(r.leaked), "dangling": r.dangling}


def exposes(op: str, held: list[str], inst: px.Instance) -> list[str]:
    """Held misconceptions this board shows on its own (server-side only)."""
    return [m for m in held if not px.judge(op, program_for(op, [m]), inst).correct]


def hidden_failing(op: str, lines: list[str]) -> int:
    return sum(not px.judge(op, lines, b).correct for b in harness_boards(op))


@lru_cache(maxsize=None)
def probe_boards(op: str) -> tuple[px.Instance, ...]:
    """Buildable boards, simplest first (for the coach), then the harness boards."""
    spec, out = board_spec(op), []
    for n in range(spec["min_len"], spec["max_len"] + 1):
        vals = tuple(10 * (i + 1) for i in range(n))
        if spec["two_lists"]:
            out += [px.Instance(vals, l2=tuple(15 + 10 * j for j in range(k))) for k in range(0, 4)]
            out += [px.Instance(tuple(15 + 10 * j for j in range(k)), l2=vals) for k in range(0, 4)]
            continue
        value = 77 if spec["value"] else None
        if spec["cycle"]:
            out += [px.Instance(vals)] + [px.Instance(vals, cycle_to=c) for c in range(n)]
        elif op == "sortList":
            out.append(px.Instance(tuple(reversed(vals))))
        elif spec["index"]:
            hi = n if spec["index"]["max"] == "len" else n - 1
            out += [px.Instance(vals, value=value, index=i) for i in range(1, hi + 1)]
        else:
            out.append(px.Instance(vals, value=value))
    return tuple(out) + harness_boards(op)


def _lst(vals) -> str:
    return " → ".join(map(str, vals)) if vals else "an empty list"


def board_text(op: str, inst: px.Instance) -> str:
    if op == "mergeSortedLists":
        def one(vals):
            return " → ".join(map(str, vals)) if vals else "(empty)"
        return f"l1 = {one(inst.values)} and l2 = {one(inst.l2 or ())}"
    s = _lst(inst.values)
    if inst.value is not None:
        s += f", inserting {inst.value}"
    if inst.index is not None:
        s += f" at index {inst.index}"
    if inst.cycle_to is not None:
        s += f", where the last node links back to index {inst.cycle_to}"
    return s


def shape_text(op: str, inst: px.Instance) -> str:
    """A board's shape without its values (the coach's 'try a list like ...')."""
    if op == "mergeSortedLists":
        return board_text(op, inst)
    n = len(inst.values)
    s = "an empty list" if n == 0 else f"a list of {n} node{'s' if n != 1 else ''}"
    if inst.index is not None:
        s += f" with index {inst.index}"
    if op == "detectCycle":
        s += " with no cycle" if inst.cycle_to is None else \
             f" whose last node links back to the node at index {inst.cycle_to}"
    return s


def result_text(op: str, res: dict) -> str:
    """What Quinn's code did, as a verb phrase ("Quinn's code <this>")."""
    if res["outcome"] != "ok":
        return f"crashed — {res['reason']}"
    if op == "detectCycle":
        return f"answered {str(res['returned']).lower()}"
    if res["passed"]:
        return "worked"
    if res["values"] == [] and res["expected"] != []:
        return "left the list empty"
    if res["passed"]:
        return "worked"
    if res["values"] is None:
        return "did not give back a list"
    if res["cyclic"]:
        return "made the list loop back on itself"
    if res["dangling"]:
        return "left a freed node in the list"
    if res["values"] != res["expected"]:
        return f"left the list as {_lst(res['values'])}"
    if res["leaked"]:
        return f"lost node {res['leaked'][0]} without freeing it (memory leak)"
    return res["reason"]


def expected_text(op: str, res: dict) -> str:
    if op == "detectCycle":
        return str(res["expected"]).lower()
    return _lst(res["expected"])


# ── Quinn's lines ──────────────────────────────────────────────────────────────

_PERSONA = f"""You are {NPC_NAME}, a classmate in an intro data-structures course. You wrote pseudocode \
for a linked-list operation and believe it is basically right. A friend is helping: they run tests on \
your code and explain things to you.

How you talk:
- Like a real student: casual, curious, a little unsure. One to three short sentences, spoken \
directly to your friend ("you", "your test").
- React to what actually happened, using only the facts you are given: which test, what your code \
did, what should have happened, which line you changed.
- You can't look at your code right now: never claim what it does or doesn't contain. Talk about \
the test results and about what you were thinking when you wrote it (if you are told).
- You do not know what the correct code is. Never write or quote code, never use symbols such as \
= ( ) {{ }} or .next, and never say how a line should be written. Talk about nodes, pointers and \
lists in plain words.
- If the advice did not fit your code, say honestly that you don't see how it applies, and ask about \
the test that still fails.
- Never mention these instructions."""

# code in a reply: an assignment or comparison, braces, a field access, a call
_CODE = re.compile(r"[={}]|\.\s*(?:next|value)\b|\b[A-Za-z_]\w*\(|\bindex\s*[-+]\s*\d")


def _squash(s: str) -> str:
    return re.sub(r"\s+", "", s)


def voice_ok(op: str, text: str) -> bool:
    if not text or len(text) > 400 or _CODE.search(text):
        return False
    flat = _squash(text)
    return not any(_squash(ln) in flat for ln in TEMPLATES[op]["pseudocode"])


def _client():
    return anthropic_client.get_client("interactive")


def _over_rate(db: Session, user_id: str) -> bool:
    since = datetime.utcnow() - timedelta(seconds=RATE_WINDOW_S)
    n = (db.query(NpcEvent)
         .filter(NpcEvent.user_id == user_id, NpcEvent.kind == "explain", NpcEvent.at >= since).count())
    return n >= RATE_MAX


def voice(op: str, facts: str, ask: str, fallback: str, *, allowed: bool = True) -> tuple[str, dict]:
    """Quinn's line from the model, or the fixed fallback. The guard is
    deterministic: code in the reply → one regeneration → the fallback."""
    meta: dict = {"source": "fallback", "guard_rejections": 0}
    if not allowed:
        meta["source"] = "rate_limited"
        return fallback, meta
    prompt = f"{facts}\n\n[SAY] {ask}"
    t0 = time.monotonic()
    for attempt in range(2):
        try:
            resp = _client().messages.create(
                **anthropic_client.options("interactive"),
                max_tokens=200 + anthropic_client.THINKING_HEADROOM,
                system=_PERSONA,
                messages=[{"role": "user", "content": prompt}],
                timeout=VOICE_TIMEOUT_S,
            )
            text = anthropic_client.text_of(resp).strip().strip('"')
            usage = getattr(resp, "usage", None)
            meta["input_tokens"] = meta.get("input_tokens", 0) + (getattr(usage, "input_tokens", 0) or 0)
            meta["output_tokens"] = meta.get("output_tokens", 0) + (getattr(usage, "output_tokens", 0) or 0)
        except Exception as e:   # noqa: BLE001 — Quinn falls back to a fixed line, never an error
            logger.warning("npc voice failed: %r", e)
            meta["error"] = type(e).__name__
            break
        if voice_ok(op, text):
            meta["source"] = "model"
            meta["ms"] = int((time.monotonic() - t0) * 1000)
            return text, meta
        meta["guard_rejections"] += 1
        prompt += "\n\nImportant: plain words only. No code, no code symbols, no line of the program."
    meta["ms"] = int((time.monotonic() - t0) * 1000)
    return fallback, meta


_INTROS = (
    "Hi, I'm {npc}! I wrote {title} and I'm pretty sure it works, but the teacher's tests say it doesn't. "
    "Could you try it on a few lists and help me see what's wrong?",
    "Hey, I'm {npc}. My {title} keeps failing the teacher's tests and I can't see why. "
    "Can you test it with some lists of your own and help me figure it out?",
)


def reaction(op: str, inst: px.Instance, res: dict) -> str:
    """Quinn's reaction to a test — fixed lines, no model call."""
    on = board_text(op, inst)
    if res["passed"]:
        return f"On {on} it works! So my code is fine there, right?"
    if res["outcome"] != "ok":
        return f"Whoa, on {on} it crashed: {res['reason']}. I didn't expect that at all."
    if op == "detectCycle":
        return (f"On {on} my code answered {str(res['returned']).lower()}, "
                f"but it should be {str(res['expected']).lower()}? Hmm.")
    if res["leaked"] and res["values"] == res["expected"]:
        return (f"On {on} the list looks right to me... but you're saying node {res['leaked'][0]} "
                f"is lost and never freed? Why does that matter?")
    return f"Hmm, on {on} my code {result_text(op, res)}, but it should give {expected_text(op, res)}. That's weird."


# ── free-text explanations (phase 5) ───────────────────────────────────────────

_TRANSLATE_SYSTEM = f"""A student is explaining a bug to their classmate {NPC_NAME}. You turn the \
explanation into the edit {NPC_NAME} would make to {NPC_NAME}'s code.

Rules:
- Change ONLY what the explanation tells {NPC_NAME} to change. Do not fix anything else, even if you \
can see other problems in the code.
- If the explanation is vague ("fix it", "it's wrong"), does not say what to change, or does not fit \
the code, make no edit.
- Keep {NPC_NAME}'s style: the same names, one statement per line as in the code.

Answer with JSON only, no prose:
{{"edits": [ ... ]}} where each edit is one of
  {{"action": "replace", "line": <line number>, "code": "<the new line>"}}
  {{"action": "insert_after", "line": <line number, 0 = before the first line>, "code": "<the new line>"}}
  {{"action": "delete", "line": <line number>}}
  {{"action": "swap", "line": <line number>, "with": <line number>}}
Use {{"edits": []}} when the explanation does not tell {NPC_NAME} what to change."""


def _parse_edits(raw: str) -> list[dict] | None:
    m = re.search(r"\{.*\}", raw or "", re.S)
    if not m:
        return None
    try:
        obj = json.loads(m.group(0))
    except json.JSONDecodeError:
        return None
    edits = obj.get("edits") if isinstance(obj, dict) else None
    return edits if isinstance(edits, list) else None


def apply_edits(lines: list[str], edits: list[dict]) -> list[str] | None:
    """Apply 1-based edits to Quinn's displayed program. None if any edit is malformed."""
    if len(edits) > 3:
        return None
    out = list(lines)
    n = len(out)

    def line_no(e, key="line", lo=1):
        v = e.get(key)
        return v if isinstance(v, int) and not isinstance(v, bool) and lo <= v <= n else None

    def code_of(e):
        c = e.get("code")
        return c.strip() if isinstance(c, str) and 0 < len(c.strip()) <= 240 else None

    inserts, deletes = [], set()
    for e in edits:
        if not isinstance(e, dict):
            return None
        act = e.get("action")
        if act == "replace":
            i, c = line_no(e), code_of(e)
            if i is None or c is None:
                return None
            out[i - 1] = c
        elif act == "swap":
            i, j = line_no(e), line_no(e, "with")
            if i is None or j is None:
                return None
            out[i - 1], out[j - 1] = out[j - 1], out[i - 1]
        elif act == "delete":
            i = line_no(e)
            if i is None:
                return None
            deletes.add(i - 1)
        elif act == "insert_after":
            i, c = line_no(e, lo=0), code_of(e)
            if i is None or c is None:
                return None
            inserts.append((i, c))
        else:
            return None
    # inserts/deletes refer to the original numbering: rebuild in one pass
    result = []
    for k in range(n + 1):
        for i, c in inserts:
            if i == k:
                result.append(c)
        if k < n and k not in deletes:
            result.append(out[k])
    return result


def translate(op: str, program: list[str], text: str) -> tuple[list[dict] | None, dict]:
    """The model's reading of a free-text explanation as an edit (None = failed)."""
    meta: dict = {"ok": False}
    numbered = "\n".join(f"{i + 1}: {ln}" for i, ln in enumerate(display(program)))
    user = (f"Operation: {TEMPLATES[op]['title']} — {signature(op)}\n\n"
            f"{NPC_NAME}'s code:\n{numbered}\n\n"
            f"The student's explanation:\n\"\"\"{text}\"\"\"")
    t0 = time.monotonic()
    try:
        resp = _client().messages.create(
            model=anthropic_client.MODEL,
            output_config={"effort": TRANSLATE_EFFORT},
            max_tokens=400 + anthropic_client.THINKING_HEADROOM,
            system=_TRANSLATE_SYSTEM,
            messages=[{"role": "user", "content": user}],
            timeout=TRANSLATE_TIMEOUT_S,
        )
        raw = anthropic_client.text_of(resp)
    except Exception as e:   # noqa: BLE001
        logger.warning("npc translate failed: %r", e)
        meta["error"] = type(e).__name__
        return None, meta
    meta["ms"] = int((time.monotonic() - t0) * 1000)
    edits = _parse_edits(raw)
    meta["ok"] = edits is not None
    return edits, meta


def adjudicate(op: str, held: list[str], lines: list[str]) -> tuple[str, str | None]:
    """What an edited program means, decided by execution on the harness boards:
    fixed (exactly one held misconception gone, nothing else changed), no_change,
    overfix (more than one gone at once), or wrong (broken in some new way)."""
    try:
        fp = _fp(op, lines)
    except Exception:   # noqa: BLE001 — an unparseable edit is just wrong
        return "wrong", None
    if fp == _fp(op, program_for(op, held)):
        return "no_change", None
    for m in held:
        if fp == _fp(op, program_for(op, [x for x in held if x != m])):
            return "fixed", m
    for k in range(2, len(held) + 1):
        for gone in itertools.combinations(held, k):
            if fp == _fp(op, program_for(op, [x for x in held if x not in gone])):
                return "overfix", None
    return "wrong", None


# ── the coach: hints computed from execution ───────────────────────────────────

def _program_line(op: str, held: list[str], mid: str, template_line: int) -> int:
    """0-based index in Quinn's program of a template line (other held deletions shift it)."""
    dels = {i for m in held if m != mid and mc.canonical(op, m).kind == "delete" for i in mc.canonical(op, m).lines}
    return template_line - sum(1 for d in dels if d < template_line)


def line_hint(op: str, held: list[str], mid: str) -> str:
    mu = mc.canonical(op, mid)
    if mu.kind == "swap":
        a, b = (_program_line(op, held, mid, i) + 1 for i in mu.lines)
        return (f"Look at the order of lines {a} and {b}. Trace them on your failing test in the "
                f"order {NPC_NAME} wrote them: what is lost or read too late?")
    if mu.kind == "delete":
        after = _program_line(op, held, mid, min(mu.lines))
        where = f"after line {after}" if after else "before the first line"
        return (f"Trace your failing test right to the end. Something may be missing {where}: "
                f"is every node that leaves the list taken care of?")
    k = _program_line(op, held, mid, mu.lines[0]) + 1
    return f"Look closely at line {k}. Trace it on your failing test: does it do what that step needs?"


def simplest_failing(op: str, lines: list[str]) -> px.Instance | None:
    return next((b for b in probe_boards(op) if not px.judge(op, lines, b).correct), None)


def coach_hint(case: NpcCase, failing: list[px.Instance]) -> tuple[str, str]:
    """(situation key, hint). Each press gives the next hint for the situation:
    first a way of thinking, then something concrete."""
    op, held = case.operation, list(case.held)
    n_fixed = len(case.held_initial) - len(held)
    if not failing:
        key = f"find{n_fixed}"
        level = (case.coach or {}).get(key, 0)
        if level == 0:
            return key, ("Before you run a test, predict what the list should look like afterwards. "
                         "List code usually breaks at the edges: the shortest list allowed, the first "
                         "node, the last node.")
        board = simplest_failing(op, case.program)
        return key, (f"Try {shape_text(op, board)}." if board else
                     f"{NPC_NAME}'s code passes everything now.")
    key = f"explain{n_fixed}"
    level = (case.coach or {}).get(key, 0)
    if level == 0:
        return key, (f"Take a test where {NPC_NAME}'s code fails. Trace the code on it by hand, one "
                     f"line at a time, writing down which node each pointer is on. Where does it stop "
                     f"matching what should happen?")
    shown = [m for m in held if any(not px.judge(op, program_for(op, [m]), b).correct for b in failing)]
    target = sorted(shown or held, key=lambda m: min(_touched(op, m)))[0]
    return key, line_hint(op, held, target)


# ── persistence ────────────────────────────────────────────────────────────────

def eligible_ops(db: Session, user_id: str) -> tuple[list[str], bool]:
    """Operations the student has learned (a zero-error find_bug pass), in
    curriculum order; unit 1's operations if none yet (learned=False)."""
    rows = (db.query(Mastery)
            .filter(Mastery.user_id == user_id, Mastery.module_id == "singly",
                    Mastery.best_perfect_type >= 2).all())
    have = {r.operation for r in rows}
    order = [op for u in curriculum.UNITS for op in u.ops]
    ops = [op for op in order if op in have and mc.applicable(op)]
    return (ops, True) if ops else (list(FALLBACK_OPS), False)


def current(db: Session, user_id: str) -> NpcCase | None:
    return (db.query(NpcCase).filter(NpcCase.user_id == user_id, NpcCase.status == "open")
            .order_by(NpcCase.created_at.desc()).first())


def get_case(db: Session, user_id: str, case_id: str) -> NpcCase | None:
    return db.query(NpcCase).filter(NpcCase.id == case_id, NpcCase.user_id == user_id).first()


def _event(db: Session, case: NpcCase, kind: str, payload: dict) -> NpcEvent:
    ev = NpcEvent(case_id=case.id, user_id=case.user_id, kind=kind, payload=payload)
    db.add(ev)
    case.updated_at = datetime.utcnow()
    return ev


def start_case(db: Session, user_id: str, *, fresh: bool = False, rng: random.Random | None = None) -> NpcCase:
    """Resume the open case, or (fresh) abandon it and draw a new one."""
    rng = rng or random.Random()
    open_case = current(db, user_id)
    if open_case and not fresh:
        return open_case
    if open_case:
        open_case.status = "abandoned"
    ops, learned = eligible_ops(db, user_id)
    past = (db.query(NpcCase).filter(NpcCase.user_id == user_id)
            .order_by(NpcCase.created_at.desc()).limit(RECENT_CASES).all())
    recent = [(c.operation, m) for c in past for m in (c.held_initial or [])]
    solved = db.query(NpcCase).filter(NpcCase.user_id == user_id, NpcCase.status == "solved").count()
    op, held = choose_case(rng, ops, recent, solved)
    case = NpcCase(user_id=user_id, operation=op, held_initial=list(held), held=list(held),
                   program=program_for(op, held), changed=[], choices=choices_for(rng, op, held),
                   tried=[], tests=[], coach={}, policy="random", status="open", n_wrong=0,
                   npc_version=NPC_VERSION)
    db.add(case)
    db.flush()
    intro = rng.choice(_INTROS).format(npc=NPC_NAME, title=TEMPLATES[op]["title"].lower())
    _event(db, case, "start", {"npc": intro, "learned": learned, "ops": ops})
    db.commit()
    return case


def run_test(db: Session, case: NpcCase, raw: dict) -> dict:
    if case.status != "open":
        raise BoardError("this case is finished — start a new one")
    if len(case.tests or []) >= MAX_TESTS:
        raise BoardError("that's a lot of tests! Look closely at the ones you have")
    inst = parse_board(case.operation, raw)
    res = run_board(case.operation, case.program, inst)
    shows = exposes(case.operation, list(case.held), inst)
    case.tests = list(case.tests or []) + [board_dict(inst)]
    line = reaction(case.operation, inst, res)
    _event(db, case, "test", {"board": board_dict(inst), "passed": res["passed"], "outcome": res["outcome"],
                              "exposes": shows, "npc": line})
    db.commit()
    return {"kind": "test", "passed": res["passed"]}


def _failing_tests(case: NpcCase) -> list[px.Instance]:
    return [b for b in map(_inst, case.tests or []) if not px.judge(case.operation, case.program, b).correct]


def _tests_status(case: NpcCase) -> tuple[int, int]:
    insts = [_inst(t) for t in case.tests or []]
    return len(insts), sum(not px.judge(case.operation, case.program, b).correct for b in insts)


def _after_fix_facts(case: NpcCase, advice: str) -> tuple[str, str, str]:
    op = case.operation
    n, failing = _tests_status(case)
    hidden = hidden_failing(op, case.program)
    lines = ", ".join(str(i + 1) for i in case.changed) or "a line"
    facts = (f"[OPERATION] {TEMPLATES[op]['title']}\n"
             f"[WHAT JUST HAPPENED] Your friend explained: \"{advice}\" It made sense, so you changed "
             f"line {lines} of your code.\n"
             f"[TESTS NOW] Your friend's tests: {n} run, {failing} still failing. "
             f"The teacher's hidden tests: {hidden} of {len(harness_boards(op))} failing.")
    if case.status == "solved":
        return (facts, "Thank your friend warmly and say, in your own words, what you understand now.",
                f"It passes everything now! Thanks for explaining — I really get it now.")
    if failing:
        ask = "Say what you changed in plain words and that one of their tests still fails. Ask what else is wrong."
        fb = f"Oh, I think I get it — I changed line {lines}. But one of your tests still fails. Is something else wrong?"
    else:
        ask = ("Say what you changed in plain words. Your friend's tests all pass now, but some of the "
               "teacher's hidden tests still fail: ask them to find a test that still breaks your code.")
        fb = (f"Oh, I think I get it — I changed line {lines}. Your tests pass now, but {hidden} of the "
              f"teacher's tests still fail. Can you find another test that breaks it?")
    return facts, ask, fb


def _still_failing_facts(case: NpcCase, advice: str, why: str) -> tuple[str, str]:
    op = case.operation
    failing = _failing_tests(case)
    b = failing[-1]
    res = run_board(op, case.program, b)
    facts = (f"[OPERATION] {TEMPLATES[op]['title']}\n"
             f"[WHAT JUST HAPPENED] Your friend explained: \"{advice}\" {why}\n"
             f"[A TEST THAT STILL FAILS] On {board_text(op, b)}, your code {result_text(op, res)}; "
             f"it should give {expected_text(op, res)}.")
    if case.n_wrong >= 2:
        shown = [m for m in case.held if not px.judge(op, program_for(op, [m]), b).correct] or list(case.held)
        facts += f"\n[WHAT YOU WERE THINKING WHEN YOU WROTE IT] {mc.CATALOG[shown[0]].belief}"
    return facts, f"On {board_text(op, b)} my code still {result_text(op, res)} — it should give {expected_text(op, res)}."


def explain(db: Session, case: NpcCase, *, choice_id: str | None = None, text: str | None = None) -> dict:
    """An explanation: a choice card, or free text (phase 5). Execution decides
    whether Quinn learns; the model only words the reply."""
    if case.status != "open":
        raise BoardError("this case is finished — start a new one")
    if not _failing_tests(case):
        raise BoardError(f"first run a test that breaks {NPC_NAME}'s code, so you can show what goes wrong")
    op, held = case.operation, list(case.held)
    allowed = not _over_rate(db, case.user_id)
    payload: dict = {"how": "choice" if choice_id else "text"}

    if choice_id:
        ch = next((c for c in case.choices or [] if c["id"] == choice_id), None)
        if ch is None:
            raise BoardError("unknown explanation")
        if choice_id in (case.tried or []) or (ch["mid"] in case.held_initial and ch["mid"] not in held):
            raise BoardError("you already gave that explanation")
        advice = mc.CATALOG[ch["mid"]].correction
        payload.update(choice=choice_id, mid=ch["mid"], advice=advice)
        verdict, fixed = ("fixed", ch["mid"]) if ch["mid"] in held else ("unchanged", None)
    else:
        advice = (text or "").strip()
        if not advice:
            raise BoardError("write your explanation first")
        advice = advice[:MAX_TEXT]
        payload["advice"] = advice
        if not allowed:
            raise BoardError(f"{NPC_NAME} needs a moment to think — try again in a few seconds")
        edits, tmeta = translate(op, case.program, advice)
        payload.update(edits=edits, translate=tmeta)
        if edits is None:
            verdict, fixed = "not_understood", None
        elif not edits:
            verdict, fixed = "not_understood", None
        else:
            edited = apply_edits(display(case.program), edits)
            if edited is None:
                verdict, fixed = "not_understood", None
            else:
                verdict, fixed = adjudicate(op, held, [undisplay(ln) for ln in edited])
        payload["edited_verdict"] = verdict

    payload["verdict"] = verdict
    if verdict == "fixed":
        payload["had_exposing_test"] = any(fixed in exposes(op, [fixed], _inst(t)) for t in case.tests or [])
        old = list(case.program)
        case.held = [m for m in held if m != fixed]
        case.program = program_for(op, case.held)
        case.changed = changed_lines(old, case.program)
        payload["fixed"] = fixed
        if not case.held:
            case.status, case.solved_at = "solved", datetime.utcnow()
        facts, ask, fallback = _after_fix_facts(case, advice)
    else:
        case.n_wrong = (case.n_wrong or 0) + 1
        if choice_id:
            case.tried = list(case.tried or []) + [choice_id]
        why, ask, fb_head = {
            "unchanged": ("You don't see how that applies to your code, so you changed nothing.",
                          "Say kindly that you don't see how that advice fits your code, and ask what is "
                          "going wrong on the failing test.", "Hmm, I'm not sure how that fits my code."),
            "not_understood": ("You couldn't tell what to change from it, so you changed nothing.",
                               "Say you're not sure what to change, and ask which part of your code is wrong and why.",
                               "I'm not sure what to change from that. Which part of my code is wrong, and why?"),
            "no_change": ("You changed your code the way they said, but it behaves exactly the same.",
                          "Say you tried it but nothing changed on the failing test, and ask what you missed.",
                          "I changed it the way you said, but it does exactly the same thing."),
            "overfix": ("Doing what they said would change more than one thing at once, so you only want "
                        "to change one idea at a time.",
                        "Ask them, kindly, to explain one problem at a time so you really understand it.",
                        "That would change more than one thing at once — can you explain one problem at a time?"),
            "wrong": ("You tried changing it that way, but then it broke in a new way, so you put it back.",
                      "Say you tried it but it broke differently, so you undid it; ask them to explain it another way.",
                      "I tried that, but it broke in a new way, so I put it back."),
        }[verdict]
        facts, fb_tail = _still_failing_facts(case, advice, why)
        fallback = f"{fb_head} {fb_tail}"
    reply, vmeta = voice(op, facts, ask, fallback, allowed=allowed)
    payload.update(npc=reply, voice=vmeta)
    _event(db, case, "explain", payload)
    db.commit()
    solved = case.status == "solved"
    if verdict == "fixed":
        # after the case is committed: record_taught rolls back on its own failure,
        # which must never take Quinn's fix (or the event saying so) with it
        misconception_model.record_taught(db, case.user_id, case.id, op, fixed, how=payload["how"])
    return {"kind": "explain", "verdict": verdict, "solved": solved}


def coach(db: Session, case: NpcCase) -> dict:
    if case.status != "open":
        raise BoardError("this case is finished — start a new one")
    key, hint = coach_hint(case, _failing_tests(case))
    case.coach = {**(case.coach or {}), key: (case.coach or {}).get(key, 0) + 1}
    _event(db, case, "coach", {"key": key, "level": case.coach[key], "hint": hint})
    db.commit()
    return {"kind": "coach"}


# ── what the client sees ───────────────────────────────────────────────────────

def _messages(db: Session, case: NpcCase) -> list[dict]:
    evs = db.query(NpcEvent).filter(NpcEvent.case_id == case.id).order_by(NpcEvent.at).all()
    out: list[dict] = []
    for e in evs:
        p = e.payload or {}
        if e.kind == "start":
            out.append({"who": "npc", "text": p.get("npc", "")})
            if not p.get("learned", True):
                out.append({"who": "system", "text": (
                    "You haven't passed a find-the-bug question yet, so Quinn brought an operation from "
                    "Unit 1. Learn more operations and Quinn will bring other kinds of problems.")})
        elif e.kind == "test":
            out.append({"who": "npc", "text": p.get("npc", "")})
        elif e.kind == "explain":
            out.append({"who": "you", "text": p.get("advice", "")})
            out.append({"who": "npc", "text": p.get("npc", "")})
        elif e.kind == "coach":
            out.append({"who": "coach", "text": p.get("hint", "")})
    if case.status == "solved":
        out.append({"who": "system", "text": f"{NPC_NAME}'s code passes every test. Case solved!"})
    return out


def state(db: Session, case: NpcCase, last: dict | None = None) -> dict:
    op = case.operation
    tests = []
    for i, t in enumerate(case.tests or []):
        inst = _inst(t)
        res = run_board(op, case.program, inst)
        tests.append({"id": i, "board": t, "board_text": board_text(op, inst), "result": res,
                      "result_text": result_text(op, res), "expected_text": expected_text(op, res)})
    held_now = set(case.held or [])
    choices = []
    for c in case.choices or []:
        st = ("taught" if c["mid"] in (case.held_initial or []) and c["mid"] not in held_now
              else "tried" if c["id"] in (case.tried or []) else "open")
        choices.append({"id": c["id"], "text": mc.CATALOG[c["mid"]].correction, "state": st})
    return {
        "id": case.id, "status": case.status, "npc": NPC_NAME,
        "operation": op, "title": TEMPLATES[op]["title"], "signature": signature(op),
        "spec": board_spec(op), "code": display(case.program), "changed": list(case.changed or []),
        "tests": tests, "hidden": {"total": len(harness_boards(op)), "failing": hidden_failing(op, case.program)},
        "choices": choices, "can_explain": case.status == "open" and any(not t["result"]["passed"] for t in tests),
        "messages": _messages(db, case), "fixed": len(case.held_initial or []) - len(case.held or []),
        "last": last,
    }
