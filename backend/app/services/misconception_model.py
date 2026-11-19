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
import uuid
from dataclasses import dataclass, field, replace
from datetime import datetime

from sqlalchemy.exc import IntegrityError
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


def arm(user_id: str | None, *, db: Session | None = None, operation: str | None = None) -> str | None:
    """'ab' group. In a study (STUDY_ENABLED) it is the STORED assignment
    (services/study.py; per unit of `operation` under a crossover; None for a
    student who declined or is not assigned yet). Outside a study: a stable hash
    of the student (same idea as _variant_offset)."""
    if mode() != "ab" or not user_id:
        return None
    from . import study
    if study.enabled():
        if db is None:
            raise ValueError("arm() needs the db in a study: the assignment is stored")
        return study.arm_for(db, user_id, operation)
    h = int(hashlib.sha256(f"misconception:{user_id}".encode()).hexdigest()[:8], 16)
    return "targeted" if h % 2 == 0 else "control"


CHANNELS = ("tutor", "remediation", "feedback")


def channels() -> set[str]:
    """MISCONCEPTION_CHANNELS: what a treated student gets (see config.py)."""
    raw = settings.misconception_channels if settings.misconception_channels is not None else ",".join(CHANNELS)
    return {c.strip().lower() for c in raw.split(",") if c.strip().lower() in CHANNELS}


def treated(user_id: str | None, *, db: Session | None = None, operation: str | None = None) -> bool:
    """'on', or the 'targeted' half of 'ab' (on this operation's unit, in a crossover study)."""
    return mode() == "on" or (mode() == "ab" and arm(user_id, db=db, operation=operation) == "targeted")


def targeting(user_id: str | None, channel: str, *, db: Session | None = None,
              operation: str | None = None) -> bool:
    """Does this student get this channel: tutor | remediation | feedback?
    Separate channels let a study vary one thing (e.g. only what the tutor
    knows) while both arms get the same questions and the same analysis card.
    db + operation: needed in a study (stored assignment; per unit in a crossover)."""
    if channel not in CHANNELS:
        raise ValueError(f"unknown channel {channel!r}")
    return channel in channels() and treated(user_id, db=db, operation=operation)


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
        row.arm = arm(user_id, db=db, operation=q["operation"])
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

# Evidence writes are race-free: two quick wrong picks (or a resend racing the
# original) must neither count one question twice nor lose an update.
#   1. the state row is LOCKED before it is read (SELECT ... FOR UPDATE; a
#      first-time row is created with INSERT ... ON CONFLICT DO NOTHING, so two
#      first inserts don't collide), held until commit;
#   2. only then is "did this question already give this evidence?" checked —
#      the second request waits on the lock and sees the first one's event;
#   3. uq_misconception_events_once is the backstop: a duplicate that still gets
#      through rolls the request back (IntegrityError) instead of being counted.
# Misconceptions are always locked in sorted order (no deadlock between two
# requests). SQLite (tests) has no row locks and writes one at a time anyway.

def _state_query(db: Session, user_id: str, mid: str):
    return (db.query(MisconceptionState)
            .filter(MisconceptionState.user_id == user_id, MisconceptionState.misconception_id == mid)
            .with_for_update().populate_existing())


def _insert_state(db: Session, user_id: str, mid: str) -> None:
    values = dict(id=str(uuid.uuid4()), user_id=user_id, misconception_id=mid, p_hold=PRIOR, n_picked=0,
                  n_avoided=0, picked_items=[], picked_ops=[], resolved_ops=[], status="unknown",
                  updated_at=datetime.utcnow())
    dialect = db.get_bind().dialect.name
    if dialect == "postgresql":
        from sqlalchemy.dialects.postgresql import insert
    elif dialect == "sqlite":
        from sqlalchemy.dialects.sqlite import insert
    else:                                    # no upsert: a collision rolls the request back (IntegrityError)
        db.add(MisconceptionState(**values))
        db.flush()
        return
    db.execute(insert(MisconceptionState).values(**values)
               .on_conflict_do_nothing(index_elements=["user_id", "misconception_id"]))


def _row(db: Session, user_id: str, mid: str) -> MisconceptionState:
    """m's state row for this student, created if needed, locked until commit."""
    row = _state_query(db, user_id, mid).first()
    if row is None:
        _insert_state(db, user_id, mid)
        row = _state_query(db, user_id, mid).one()
    return row


def _has_event(db: Session, user_id: str, question_id: str, mid: str, kind: str) -> bool:
    return db.query(MisconceptionEvent.id).filter(
        MisconceptionEvent.user_id == user_id, MisconceptionEvent.question_id == str(question_id),
        MisconceptionEvent.misconception_id == mid, MisconceptionEvent.kind == kind).first() is not None


def _write_evidence(db: Session, user_id: str, mid: str, kind: str, question_id: str, *,
                    update_kw: dict, event_kw: dict) -> float | None:
    """Lock m's state, then record one piece of evidence unless this question
    already gave it. Returns p after the update, or None if already counted.
    The caller commits."""
    row = _row(db, user_id, mid)
    if _has_event(db, user_id, question_id, mid, kind):
        return None
    p = _apply(db, user_id, mid, kind, row=row, question_id=question_id, **update_kw)
    db.add(MisconceptionEvent(user_id=user_id, misconception_id=mid, kind=kind, question_id=question_id,
                              p_after=p, **event_kw))
    return p


def _apply(db: Session, user_id: str, mid: str, kind: str, *, row: MisconceptionState | None = None,
           **kw) -> float:
    row = row if row is not None else _row(db, user_id, mid)
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


_LINE_PICK = re.compile(r"^line (\d{1,3}): (.*)$", re.S)


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
            # only a board the student could have built: exactly the slots of the
            # item, filled from its own steps and distractors. A client can send any
            # lines; running made-up ones would credit misconceptions never offered.
            from .static_questions import TEMPLATES
            offered = set(TEMPLATES[op]["pseudocode"]) | set((item.tags or {}).get("distractors") or {})
            if len(prog) != len(TEMPLATES[op]["pseudocode"]) or not set(prog) <= offered:
                return []
            mids = sorted(mc.classify_assembly(op, prog))
            stored, line = "\n".join(prog), None
        else:
            if line is None or option is None:
                return []
            stored = _sym(option, val)
            mids = ((item.tags.get("lines") or {}).get(str(line), {}).get("options") or {}).get(stored, [])
        out = []
        for m in sorted(set(mids)):                        # sorted: the lock order
            if m not in mc.CATALOG:
                continue
            p = _write_evidence(db, user_id, m, "picked", str(question_id),
                                update_kw=dict(operation=op),
                                event_kw=dict(operation=op, question_type=item.question_type, line=line,
                                              option=stored, targeted=item.target_misconception == m))
            if p is not None:
                out.append(m)
        db.commit()
        return out
    except IntegrityError:   # a concurrent request wrote this evidence first: it counts once
        db.rollback()
        logger.warning("record_pick: duplicate evidence for %s ignored", question_id)
        return []
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
        qid = str(question_id)
        for m in sorted(available(item.tags or {})):          # sorted: the lock order
            if m not in mc.CATALOG:
                continue
            _row(db, user_id, m)                               # lock first, then look (see above)
            if _has_event(db, user_id, qid, m, "picked"):
                continue
            targeted = item.target_misconception == m
            _write_evidence(db, user_id, m, "avoided", qid,
                            update_kw=dict(operation=item.operation, targeted=targeted,
                                           clean=(error_count or 0) == 0),
                            event_kw=dict(operation=item.operation, question_type=item.question_type,
                                          targeted=targeted))
        db.commit()
    except IntegrityError:   # a concurrent request (the /next resend) wrote it first
        db.rollback()
        logger.warning("record_outcome: duplicate evidence for %s ignored", question_id)
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
        _write_evidence(db, user_id, mid, "taught", qid, update_kw=dict(operation=operation),
                        event_kw=dict(operation=operation, question_type=f"teach_{how}"))
        db.commit()
    except IntegrityError:   # a concurrent request wrote it first
        db.rollback()
        logger.warning("record_taught: duplicate evidence for %s ignored", qid)
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


EARLIER_MAX = 3   # earlier misconceptions shown to the tutor, most questions first


def tutor_evidence(db: Session, user_id: str, question_id: str | None, operation: str) -> list[dict]:
    """What the tutor can be told about this student's misconceptions, rebuilt on
    every turn (deterministic, no model):
    - this_question: each misconception the student's wrong picks HERE showed,
      with what the pick did on their board, and how many earlier questions
      showed it too — something no model can infer from this question alone;
    - earlier: misconceptions picked on other questions, not resolved since,
      that apply to this operation.
    Only belief prose reaches the prompt (tutor_note), never the correction:
    the correction is this exercise's answer in plain English."""
    states = {r.misconception_id: r for r in db.query(MisconceptionState)
              .filter(MisconceptionState.user_id == user_id).all()}
    before: dict[str, dict] = {}
    for e in (db.query(MisconceptionEvent)
              .filter(MisconceptionEvent.user_id == user_id, MisconceptionEvent.kind == "picked")
              .order_by(MisconceptionEvent.at).all()):
        if e.misconception_id not in mc.CATALOG or (question_id and e.question_id == str(question_id)):
            continue
        b = before.setdefault(e.misconception_id, {"questions": [], "operations": []})
        if e.question_id not in b["questions"]:
            b["questions"].append(e.question_id)
        if e.operation and e.operation not in b["operations"]:
            b["operations"].append(e.operation)

    def earlier(mid: str) -> dict:
        st = states.get(mid)
        if mid not in before or (st is not None and st.status == "resolved"):
            return {"earlier_questions": 0, "earlier_operations": []}
        return {"earlier_questions": len(before[mid]["questions"]), "earlier_operations": before[mid]["operations"]}

    items: list[dict] = []
    shown: set[str] = set()
    for f in (feedback_for(db, user_id, question_id) if question_id else []):
        if f["misconception"] in shown:
            continue
        shown.add(f["misconception"])
        items.append({"id": f["misconception"], "where": "this_question", "line": f["line"],
                      "option": f["option"], "consequence": f["consequence"], **earlier(f["misconception"])})
    rest = [mid for mid in before if mid not in shown and operation in mc.CATALOG[mid].mutants
            and earlier(mid)["earlier_questions"]]
    rest.sort(key=lambda mid: (-len(before[mid]["questions"]), list(mc.CATALOG).index(mid)))
    items += [{"id": mid, "where": "earlier", **earlier(mid)} for mid in rest[:EARLIER_MAX]]
    return items


def tutor_note(items: list[dict]) -> str:
    """[MISCONCEPTION EVIDENCE] — the block a treated student's tutor gets on every turn."""
    if not items:
        return ""
    lines = []
    for it in items:
        m = mc.CATALOG[it["id"]]
        ops = ", ".join(it.get("earlier_operations") or [])
        again = (f" They showed the same belief on {it['earlier_questions']} earlier question(s) ({ops})."
                 if it.get("earlier_questions") else "")
        if it["where"] == "this_question":
            what = ("their step order" if it.get("option") is None else
                    f"their choice `{it['option']}`" + (f" on line {it['line'] + 1}" if it.get("line") is not None else ""))
            ran = f" When run on their board: {it['consequence']}." if it.get("consequence") else ""
            lines.append(f"- On THIS question, {what} fits this belief: \"{m.belief}\"{ran}{again}")
        else:
            lines.append(f"- On {it['earlier_questions']} earlier question(s) ({ops}) their choices fit this "
                         f"belief: \"{m.belief}\" It applies to this exercise too.")
    return ("[MISCONCEPTION EVIDENCE — from the student's own wrong choices, checked by running them; "
            "background, never quote]\n" + "\n".join(lines)
            + "\n[Aim your questions at the belief behind the mistake. Do not name or label it, and the "
              "answer rule still holds.]")


def can_target(db: Session, user_id: str, operation: str, qtype: str, mid: str) -> bool:
    """An item of this type that targets `mid` can be served to this student right
    now without a live model call: authored content (never used up), or (find_bug /
    ordering) a tagged pool row they haven't done — exactly what serve() would find."""
    if mc.authored_target_exists(operation, qtype, mid):
        return True
    if settings.authored_only:                       # QUESTION_SOURCE=authored: no pool rows
        return False
    from . import question_pool
    return question_pool.can_serve_targeted(db, user_id, operation, qtype, mid)
