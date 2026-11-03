"""
Misconception diagnosis — evidence in, state out.

    served item  → tags (server-side, by execution: misconceptions.py)
    wrong pick   → 'picked' event   → p(holds m) goes up
    clean finish → 'avoided' events for every m the item offered and the
                   student never picked → p goes down
    targeted item answered cleanly on two different operations → resolved

Per misconception the update is a small Bayesian (BKT-style) rule with fixed,
readable parameters, like the ZPD controller's. A misconception becomes ACTIVE
only with p >= ACTIVE_P AND picks on ACTIVE_ITEMS different questions: one
3-way pick can be a guess. Everything is gated by settings.misconception_mode
(off / shadow / ab / on); in 'off' nothing here writes anything.
"""
from __future__ import annotations

import hashlib
import logging
import re
from dataclasses import dataclass, field, replace
from datetime import datetime

from sqlalchemy.orm import Session

from ..config import settings
from ..models.misconception import MisconceptionEvent, MisconceptionState, ServedItem
from . import item_quality as iq
from . import misconceptions as mc
from . import pseudo_exec as px

logger = logging.getLogger(__name__)

PRIOR = 0.15          # before any evidence
SLIP = 0.35           # holds m, still does not pick m's option
GUESS = 0.15          # does not hold m, picks m's option anyway
ACTIVE_P = 0.6        # active needs p >= this ...
ACTIVE_ITEMS = 2      # ... and picks on this many different questions
CLEAR_P = 0.3         # an active misconception with p below this (no remediation) is demoted
RESOLVED_P = 0.1      # p after resolution
LEARN = 0.2           # a clean TARGETED answer is also a learning opportunity
TAUGHT_FACTOR = 0.8   # teaching the classmate about m (direction 1) is weaker evidence

MODES = ("off", "shadow", "ab", "on")


# ── mode ───────────────────────────────────────────────────────────────────────

def mode() -> str:
    m = (settings.misconception_mode or "off").strip().lower()
    return m if m in MODES else "off"


def recording() -> bool:
    """Tag served items, record evidence, diagnose (shadow, ab, on)."""
    return mode() != "off"


def arm(user_id: str | None) -> str | None:
    """'ab' group, stable per student (same hashing idea as _variant_offset)."""
    if mode() != "ab" or not user_id:
        return None
    h = int(hashlib.sha256(f"misconception:{user_id}".encode()).hexdigest()[:8], 16)
    return "targeted" if h % 2 == 0 else "control"


def targeting(user_id: str | None) -> bool:
    """Does this student actually get remediation (and its feedback)?"""
    return mode() == "on" or (mode() == "ab" and arm(user_id) == "targeted")


# ── tags of a served item ──────────────────────────────────────────────────────

def _sym(code, value) -> str:
    return iq.symbolic(str(code), value)


def item_tags(q: dict) -> dict:
    """Every option's misconceptions for an assembled payload, in symbolic form:
    {"lines": {"<line>": {"answer": a, "options": {opt: [m, ...]}}},
     "bug": [...] (find_bug), "distractors": {d: [...]}, "orders": [...] (ordering)}."""
    from .static_questions import TEMPLATES
    op, qtype = q.get("operation"), q.get("question_type")
    if op not in TEMPLATES:
        return {}
    steps = TEMPLATES[op]["pseudocode"]
    val = q.get("operationValue")
    lines: dict[str, dict] = {}
    out: dict = {"lines": lines}
    if qtype == "fill_blank":
        for b in q.get("blanks") or []:
            line, ans = b.get("line"), _sym(b.get("answer", ""), val)
            if not isinstance(line, int) or not (0 <= line < len(steps)) or ans not in steps[line]:
                continue
            opts = {}
            for o in b.get("options") or []:
                so = _sym(o, val)
                if so != ans:
                    opts[so] = sorted(mc.tag_blank(op, steps, line, ans, so))
            lines[str(line)] = {"answer": ans, "options": opts}
    elif qtype == "find_bug":
        line = q.get("bug_line")
        if isinstance(line, int) and 0 <= line < len(steps):
            fix = _sym(q.get("fix", ""), val)
            opts = {}
            for o in q.get("options") or []:
                so = _sym(o, val)
                if so != fix:
                    opts[so] = sorted(mc.tag_line(op, steps, line, so))
            lines[str(line)] = {"answer": fix, "options": opts}
            pc = q.get("pseudocode") or []
            if line < len(pc):
                out["bug"] = sorted(mc.tag_line(op, steps, line, _sym(pc[line], val)))
    elif qtype == "ordering":
        dist = {}
        for d in q.get("distractors") or []:
            sd = _sym(d, val)
            dist[sd] = sorted(mc.tag_distractor(op, steps, sd))
        out["distractors"] = dist
        out["orders"] = [m.id for m in mc.applicable(op) if mc.canonical(op, m.id).kind == "swap"]
    return out


def available(tags: dict) -> set[str]:
    """Misconceptions the item gave the student a chance to show."""
    out: set[str] = set()
    for ln in (tags.get("lines") or {}).values():
        for ms in (ln.get("options") or {}).values():
            out.update(ms)
    out.update(tags.get("bug") or [])
    for ms in (tags.get("distractors") or {}).values():
        out.update(ms)
    out.update(tags.get("orders") or [])
    return out


def board_of_payload(q: dict) -> dict | None:
    """The board the student saw, as plain JSON."""
    try:
        extra = {"cycleTo": q["cycleTo"]} if q.get("cycleTo") is not None else None
        inst = iq.board_of(q["operation"], q.get("initialNodes") or [], q.get("operationValue"),
                           q.get("operationPosition"), extra)
    except Exception:   # noqa: BLE001 — a display aid, never worth failing a request
        return None
    return inst.to_json()


def record_served(db: Session, user_id: str | None, q: dict | None, *, session_id: str | None = None,
                  purpose: str | None = None, target: str | None = None, shadow: dict | None = None) -> None:
    """Upsert what was handed to this student. Never fails the request."""
    if not recording() or not user_id or not q or not q.get("id") or not q.get("operation"):
        return
    try:
        qid = str(q["id"])
        row = (db.query(ServedItem)
               .filter(ServedItem.user_id == user_id, ServedItem.question_id == qid).first())
        if row is None:
            row = ServedItem(user_id=user_id, question_id=qid)
            db.add(row)
        row.session_id = session_id or row.session_id
        row.operation = q["operation"]
        row.question_type = q.get("question_type") or "ordering"
        row.variant = q.get("variant")
        row.purpose = purpose
        row.target_misconception = target
        row.arm = arm(user_id)
        row.operation_value = q.get("operationValue")
        row.tags = item_tags(q)
        row.board = board_of_payload(q)
        row.shadow_plan = shadow
        row.served_at = datetime.utcnow()
        db.commit()
    except Exception:   # noqa: BLE001
        db.rollback()
        logger.exception("record_served failed for %s", q.get("id"))


def served(db: Session, user_id: str, question_id: str) -> ServedItem | None:
    return (db.query(ServedItem)
            .filter(ServedItem.user_id == user_id, ServedItem.question_id == str(question_id)).first())


# ── the update rule (pure) ─────────────────────────────────────────────────────

@dataclass
class Diagnosis:
    p: float = PRIOR
    n_picked: int = 0
    n_avoided: int = 0
    picked_items: list = field(default_factory=list)
    picked_ops: list = field(default_factory=list)
    resolved_ops: list = field(default_factory=list)
    status: str = "unknown"


def update(d: Diagnosis, kind: str, *, question_id: str | None = None, operation: str | None = None,
           targeted: bool = False, clean: bool = False, n_ops: int = 2) -> Diagnosis:
    """One piece of evidence. kind: picked | avoided | taught.
    n_ops: how many operations the misconception applies to — resolution asks
    for clean targeted answers on two of them (twice on the same one if it has
    only one)."""
    d = replace(d, picked_items=list(d.picked_items), picked_ops=list(d.picked_ops),
                resolved_ops=list(d.resolved_ops))
    p = d.p
    if kind == "picked":
        p = p * (1 - SLIP) / (p * (1 - SLIP) + (1 - p) * GUESS)
        d.n_picked += 1
        if question_id and question_id not in d.picked_items:
            d.picked_items.append(question_id)
        if operation and operation not in d.picked_ops:
            d.picked_ops.append(operation)
        if d.status == "resolved":                      # relapse: start over
            d.status, d.resolved_ops = "suspected", []
    elif kind in ("avoided", "taught"):
        if kind == "avoided":
            p = p * SLIP / (p * SLIP + (1 - p) * (1 - GUESS))
            d.n_avoided += 1
        else:
            p = p * TAUGHT_FACTOR
        if targeted and clean:
            p = p * (1 - LEARN)
            if operation:
                d.resolved_ops.append(operation)
    else:
        raise ValueError(f"unknown evidence kind {kind!r}")
    d.p = round(p, 6)

    if d.status in ("unknown", "suspected"):
        if d.p >= ACTIVE_P and len(d.picked_items) >= ACTIVE_ITEMS:
            d.status = "active"
        elif d.n_picked:
            d.status = "suspected"
    elif d.status == "active":
        need_ops = 2 if n_ops >= 2 else 1
        if len(set(d.resolved_ops)) >= need_ops and len(d.resolved_ops) >= 2:
            d.status, d.p = "resolved", min(d.p, RESOLVED_P)
        elif d.p < CLEAR_P and not targeted:
            d.status = "suspected"
    return d


# ── persistence ────────────────────────────────────────────────────────────────

def _row(db: Session, user_id: str, mid: str) -> MisconceptionState:
    row = (db.query(MisconceptionState)
           .filter(MisconceptionState.user_id == user_id, MisconceptionState.misconception_id == mid).first())
    if row is None:
        row = MisconceptionState(user_id=user_id, misconception_id=mid, p_hold=PRIOR, n_picked=0, n_avoided=0,
                                 picked_items=[], picked_ops=[], resolved_ops=[], status="unknown")
        db.add(row)
    return row


def _apply(db: Session, user_id: str, mid: str, kind: str, **kw) -> float:
    row = _row(db, user_id, mid)
    before = Diagnosis(row.p_hold, row.n_picked or 0, row.n_avoided or 0, list(row.picked_items or []),
                       list(row.picked_ops or []), list(row.resolved_ops or []), row.status or "unknown")
    after = update(before, kind, n_ops=len(mc.ops_for(mid)) if mid in mc.CATALOG else 2, **kw)
    row.p_hold, row.n_picked, row.n_avoided = after.p, after.n_picked, after.n_avoided
    row.picked_items, row.picked_ops, row.resolved_ops = after.picked_items[-50:], after.picked_ops, after.resolved_ops
    if after.status == "resolved" and before.status != "resolved":
        row.resolved_at = datetime.utcnow()
    row.status = after.status
    row.updated_at = datetime.utcnow()
    return after.p


def _events(db: Session, user_id: str, question_id: str, kind: str) -> list[MisconceptionEvent]:
    return (db.query(MisconceptionEvent)
            .filter(MisconceptionEvent.user_id == user_id, MisconceptionEvent.question_id == str(question_id),
                    MisconceptionEvent.kind == kind).all())


_LINE_PICK = re.compile(r"^line (\d+): (.*)$", re.S)


def parse_pick(your_answer: list[str] | None) -> tuple[int | None, str | None]:
    """Older clients only send your_answer = ["line N: option"] (1-based N)."""
    if your_answer and len(your_answer) == 1:
        m = _LINE_PICK.match(your_answer[0])
        if m:
            return int(m.group(1)) - 1, m.group(2)
    return None, None


def record_pick(db: Session, user_id: str, question_id: str, *, line: int | None = None,
                option: str | None = None, assembly: list[str] | None = None) -> list[str]:
    """A wrong pick. Returns the misconceptions it counted as evidence for.
    Evidence from one question counts once per misconception."""
    if not recording():
        return []
    try:
        item = served(db, user_id, question_id)
        if item is None:
            return []
        op, val = item.operation, item.operation_value
        stored = None
        if item.question_type == "ordering":
            if not assembly:
                return []
            prog = [_sym(s, val) for s in assembly]
            mids = sorted(mc.classify_program(op, prog))
            stored, line = "\n".join(prog), None
        else:
            if line is None or option is None:
                return []
            stored = _sym(option, val)
            mids = ((item.tags.get("lines") or {}).get(str(line), {}).get("options") or {}).get(stored, [])
        counted = {e.misconception_id for e in _events(db, user_id, question_id, "picked")}
        out = []
        for m in mids:
            if m in counted or m not in mc.CATALOG:
                continue
            p = _apply(db, user_id, m, "picked", question_id=str(question_id), operation=op)
            db.add(MisconceptionEvent(user_id=user_id, misconception_id=m, kind="picked",
                                      question_id=str(question_id), operation=op,
                                      question_type=item.question_type, line=line, option=stored,
                                      targeted=item.target_misconception == m, p_after=p))
            out.append(m)
        db.commit()
        return out
    except Exception:   # noqa: BLE001 — diagnosis must never fail the mistake-book write
        db.rollback()
        logger.exception("record_pick failed for %s", question_id)
        return []


def record_outcome(db: Session, user_id: str, question_id: str, *, passed: bool, error_count: int) -> None:
    """The question was finished: every misconception it offered and the
    student never picked is 'avoided'. A clean answer on an item that targeted
    m also counts toward resolving m. Idempotent per question."""
    if not recording() or not passed:
        return
    try:
        item = served(db, user_id, question_id)
        if item is None:
            return
        picked = {e.misconception_id for e in _events(db, user_id, question_id, "picked")}
        done = {e.misconception_id for e in _events(db, user_id, question_id, "avoided")}
        for m in sorted(available(item.tags or {}) - picked - done):
            if m not in mc.CATALOG:
                continue
            targeted = item.target_misconception == m
            p = _apply(db, user_id, m, "avoided", question_id=str(question_id), operation=item.operation,
                       targeted=targeted, clean=(error_count or 0) == 0)
            db.add(MisconceptionEvent(user_id=user_id, misconception_id=m, kind="avoided",
                                      question_id=str(question_id), operation=item.operation,
                                      question_type=item.question_type, targeted=targeted, p_after=p))
        db.commit()
    except Exception:   # noqa: BLE001
        db.rollback()
        logger.exception("record_outcome failed for %s", question_id)


def record_taught(db: Session, user_id: str, case_id: str, operation: str, mid: str, *, how: str) -> None:
    """The student explained m to the classmate well enough that execution
    accepted the fix (direction 1). Weaker evidence than avoiding m's option
    (TAUGHT_FACTOR); once per case and misconception. `how`: choice | text."""
    if not recording() or mid not in mc.CATALOG:
        return
    qid = f"npc:{case_id}"
    try:
        if any(e.misconception_id == mid for e in _events(db, user_id, qid, "taught")):
            return
        p = _apply(db, user_id, mid, "taught", question_id=qid, operation=operation)
        db.add(MisconceptionEvent(user_id=user_id, misconception_id=mid, kind="taught", question_id=qid,
                                  operation=operation, question_type=f"teach_{how}", p_after=p))
        db.commit()
    except Exception:   # noqa: BLE001 — diagnosis must never fail the teaching flow
        db.rollback()
        logger.exception("record_taught failed for %s", qid)


# ── reads ──────────────────────────────────────────────────────────────────────

def active(db: Session, user_id: str) -> list[MisconceptionState]:
    """Active misconceptions, most likely first (ties in catalog order)."""
    order = {mid: i for i, mid in enumerate(mc.CATALOG)}
    rows = (db.query(MisconceptionState)
            .filter(MisconceptionState.user_id == user_id, MisconceptionState.status == "active").all())
    return sorted(rows, key=lambda r: (-r.p_hold, order.get(r.misconception_id, 99)))


def _display(code: str, value) -> str:
    return code.replace("{value}", str(value)) if isinstance(value, int) else code


def feedback_for(db: Session, user_id: str, question_id: str) -> list[dict]:
    """'What your choice did' for the analysis card: each wrong pick on this
    question that shows a known misconception, run on the board the student saw."""
    from .static_questions import TEMPLATES
    item = served(db, user_id, question_id)
    if item is None:
        return []
    op, val = item.operation, item.operation_value
    steps = TEMPLATES[op]["pseudocode"]
    out = []
    for e in sorted(_events(db, user_id, question_id, "picked"), key=lambda e: e.at or datetime.min):
        m = mc.CATALOG.get(e.misconception_id)
        if m is None or e.option is None:
            continue
        if item.question_type == "ordering":
            prog, shown = e.option.split("\n"), None
        else:
            ln = (item.tags.get("lines") or {}).get(str(e.line), {})
            prog = list(steps)
            if item.question_type == "fill_blank" and ln.get("answer"):
                prog[e.line] = steps[e.line].replace(ln["answer"], e.option, 1)
            else:
                prog[e.line] = e.option
            shown = _display(e.option, val)
        consequence = None
        if item.board:
            v = px.judge(op, prog, px.Instance.from_json(item.board))
            consequence = None if v.correct else v.reason
        out.append({"misconception": m.id, "belief": m.belief, "correction": m.correction,
                    "line": e.line, "option": shown, "consequence": consequence})
    return out


def tutor_block(db: Session, user_id: str, operation: str) -> str:
    """[LIKELY MISCONCEPTIONS] for the tutor's first-turn context: active ones that
    apply to this operation, with the evidence count. Deterministic."""
    rows = [r for r in active(db, user_id)
            if r.misconception_id in mc.CATALOG and operation in mc.CATALOG[r.misconception_id].mutants]
    if not rows:
        return ""
    lines = [f"- {mc.CATALOG[r.misconception_id].tutor_note} "
             f"(picked on {len(r.picked_items or [])} different question(s))" for r in rows[:3]]
    return ("[LIKELY MISCONCEPTIONS — inferred from the student's own wrong picks, deterministic]\n"
            + "\n".join(lines)
            + "\n[Use this to aim your questions; do not label the student or name the misconception.]")


def can_target(db: Session, user_id: str, operation: str, qtype: str, mid: str) -> bool:
    """An item of this type that targets `mid` can be served to this student right
    now without a live model call: authored content (never used up), or (find_bug /
    ordering) a tagged pool row they haven't done — exactly what serve() would find."""
    if mc.authored_target_exists(operation, qtype, mid):
        return True
    from . import question_pool
    return question_pool.can_serve_targeted(db, user_id, operation, qtype, mid)
