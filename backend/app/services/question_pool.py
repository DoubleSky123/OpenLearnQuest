"""Pre-generated question pool: serving + low-water self-heal refill.

Approved design (2026-07 work queue):
- Pool rows are CLASS-SHARED (decision C): a served row is not consumed —
  times_served increments and each student is only excluded from questions
  they have personally attempted (via question_attempts.question_id).
- Refill = manual script (backend/refill_pool.py) + self-heal on the serving
  path (decision D — no cron). Self-heal runs on a daemon thread with its own
  DB session so the student's request is never blocked on Haiku.
- Only AI types are pooled: fill_blank is static and instant, pooling it would
  add nothing. Pool-empty serving falls back to live generation (caller logs).
- generate_validated() has NO static fallback on purpose — a pool filled with
  static questions would silently defeat the pool's reason to exist.
"""
import copy
import hashlib
import logging
import re
import threading
import time

from sqlalchemy.orm import Session

from ..models import GameSession, QuestionAttempt, QuestionPool

logger = logging.getLogger(__name__)

POOLED_TYPES = ("find_bug", "ordering")
LOW_WATER    = 3   # per (operation, type, intra): self-heal below this
TARGET       = 5   # refill up to this many rows per combo
_REFILL_COOLDOWN_S = 120

# in-process guard: one in-flight refill per combo, with cooldown after each try
_refill_lock = threading.Lock()
_refill_last_attempt: dict[tuple, float] = {}
_refill_in_flight: set[tuple] = set()


# The assembled payload carries the operation's payload literal (createNode(35)),
# which is re-rolled on every build. Mask it before hashing or two rows holding
# the SAME bug hash differently and dedup stops working — see the docstring rule
# that node values must not defeat dedup. Only the createNode argument is masked:
# other digits (index-1 vs index-2, .next.next) are the pedagogical difference.
_PAYLOAD_LITERAL = re.compile(r"createNode\(\d+\)")


def content_hash(q: dict, intra_difficulty: int) -> str:
    """Hash of the pedagogical identity, not the whole payload: node values and
    shuffle order vary per build and must not defeat dedup. The intra tier IS
    part of the identity: tiny ops (insertIntoEmpty has 3 steps) genuinely
    reuse the same distractor set across tiers, and without the tier in the
    key whichever tier pools first starves the others permanently (payloads
    still differ per tier — node count etc. come from INTRA_KNOBS)."""
    qtype = q.get("question_type")
    if qtype == "find_bug":
        core = "\n".join(q.get("pseudocode", []))          # contains the buggy line
    else:  # ordering — the distractor set is the identity, under ITS template
        # (steps included so a row built on an old template can't block a
        # fresh one with the same distractors via dedup)
        core = "\n".join(q.get("pseudocode", []) + sorted(q.get("distractors", [])))
    core = _PAYLOAD_LITERAL.sub("createNode(_)", core)
    key = f"{q.get('operation')}|{qtype}|i{intra_difficulty}|{core}"
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def is_current(row: QuestionPool) -> bool:
    """Template-drift guard. Payloads embed TEMPLATES pseudocode at generation
    time; a row built on an older template (e.g. detectCycle before its meeting
    check moved inside the loop, or a 5-step insertAtTail) teaches code that no
    longer exists — or was wrong. Such rows are never served and don't count
    toward the low-water mark, so self-heal replaces them. Rows stay in the
    table (`refill_pool.py --purge` removes them)."""
    from .static_questions import TEMPLATES
    from .item_quality import symbolic
    p = row.payload or {}
    tmpl = TEMPLATES.get(row.operation, {}).get("pseudocode")
    steps = [symbolic(s, p.get("operationValue")) for s in p.get("pseudocode", [])]
    if not tmpl or len(steps) != len(tmpl):
        return False
    if row.question_type == "find_bug":
        line = p.get("bug_line")
        return all(s == t for i, (s, t) in enumerate(zip(steps, tmpl)) if i != line)
    return steps == tmpl


def _sanitize(q: dict) -> dict | None:
    """Serve-time item harness for rows generated before it existed (the 2026-10
    audit found wrong fixes that are actually correct, `.val` options, and
    ordering distractors that can stand in for a real step). Drops the bad
    options; returns None if the question itself is not worth asking. Rows are
    never edited — only the served copy."""
    from . import item_quality as iq
    from .static_questions import TEMPLATES, valid_orders_for
    op = q.get("operation")
    steps = TEMPLATES[op]["pseudocode"]
    v = q.get("operationValue")
    if q.get("question_type") == "ordering":
        q["distractors"] = [d for d in q.get("distractors", [])
                            if iq.ordering_distractor_ok(op, iq.symbolic(d, v))]
        q["validOrders"] = valid_orders_for(op)
        return q
    line = q.get("bug_line")
    fix = q.get("fix")
    if not isinstance(line, int) or fix is None:
        return None
    sym = lambda s: iq.symbolic(s, v)
    buggy = sym(q["pseudocode"][line])
    rep = iq.lint_bug(op, steps, line, buggy, sym(fix),
                      [sym(o) for o in q.get("options", []) if o != fix])
    bug = rep.options[0]
    if bug.correct or bug.outcome == "compile_error":
        return None
    board = iq.board_of(op, q.get("initialNodes") or [], v, q.get("operationPosition"), q)
    if not iq.wrong_on_board(op, [sym(s) for s in q["pseudocode"]], board):
        return None
    good = set(iq.usable_wrong_fixes(rep, op))
    wrong = [o for o in q.get("options", []) if o != fix and sym(o) in good]
    if not wrong:
        return None
    q["options"] = [o for o in q["options"] if o == fix or o in wrong]
    return q


def row_misconception(q: dict) -> str | None:
    """The misconception a pooled item shows, decided by execution: an explicit
    target (it passed R4), else its bug (find_bug) or first tagged distractor."""
    from .misconception_model import item_tags
    if q.get("target_misconception"):
        return q["target_misconception"]
    tags = item_tags(q)
    if q.get("question_type") == "find_bug":
        return (tags.get("bug") or [None])[0]
    for ms in (tags.get("distractors") or {}).values():
        if ms:
            return ms[0]
    return None


def _shows(q: dict, misconception: str) -> bool:
    from .misconception_model import available, item_tags
    return misconception in available(item_tags(q))


def _candidates(db: Session, user_id: str, operation: str, qtype: str, intra: int,
                exclude_qid: str | None, misconception: str | None):
    """(the combo's rows, the current ones this student may get, in serving order)."""
    attempted = (
        db.query(QuestionAttempt.question_id)
        .join(GameSession, QuestionAttempt.session_id == GameSession.id)
        .filter(GameSession.user_id == user_id)
    )
    base = db.query(QuestionPool).filter(
        QuestionPool.operation == operation,
        QuestionPool.question_type == qtype,
    )
    base = base.filter(QuestionPool.misconception_id == misconception) if misconception \
        else base.filter(QuestionPool.intra_difficulty == intra)
    pick = base.filter(~QuestionPool.id.in_(attempted.scalar_subquery()))
    if exclude_qid:
        pick = pick.filter(QuestionPool.id != exclude_qid)
    candidates = [
        r for r in pick.order_by(QuestionPool.times_served.asc(), QuestionPool.created_at.asc()).all()
        if is_current(r)
    ]
    if misconception:
        candidates.sort(key=lambda r: r.intra_difficulty != intra)      # stable: tier first
    return base, candidates


def _servable(row: QuestionPool, misconception: str | None) -> dict | None:
    """The sanitised copy serve() would hand out, or None if this row can't be used."""
    try:
        q = _sanitize(copy.deepcopy(row.payload))
    except Exception:   # noqa: BLE001 — one malformed row must not fail serving for the class
        logger.exception("pool row %s could not be sanitised; skipped", row.id)
        return None
    if q is None or (misconception and not _shows(q, misconception)):
        return None
    return q


def can_serve_targeted(db: Session, user_id: str, operation: str, qtype: str, misconception: str) -> bool:
    """serve(..., misconception=m) would return a row for this student: the same
    filters (not attempted, current, survives _sanitize, still shows m). The
    remediation planner asks this; a looser count (rows the student already did)
    planned a remediation every question that could never be served."""
    if qtype not in POOLED_TYPES:
        return False
    _, candidates = _candidates(db, user_id, operation, qtype, 2, None, misconception)
    return any(_servable(r, misconception) is not None for r in candidates)


def serve(db: Session, user_id: str, operation: str, qtype: str,
          intra_difficulty: int | None, exclude_qid: str | None = None,
          misconception: str | None = None) -> dict | None:
    """Return the least-served pool question this student hasn't attempted,
    or None (caller falls back to live generation). Triggers self-heal when
    the combo is at/below the low-water mark.

    exclude_qid: the question currently ON SCREEN — prefetch fires before it
    is answered, so the attempted-filter alone can hand back the very same
    pool row as the "next" question.
    misconception: remediation — only rows tagged with it, any tier (the
    requested tier first); no self-heal (targeted rows are refilled offline:
    refill_pool.py --misconceptions)."""
    if qtype not in POOLED_TYPES:
        return None
    intra = intra_difficulty if intra_difficulty in (1, 2, 3) else 2
    base, candidates = _candidates(db, user_id, operation, qtype, intra, exclude_qid, misconception)
    if not misconception and sum(1 for r in base.all() if is_current(r)) <= LOW_WATER:
        _maybe_refill_async(operation, qtype, intra)

    for row in candidates:
        q = _servable(row, misconception)
        if q is None:
            continue
        row.times_served += 1
        db.commit()
        q["id"] = row.id                                    # exclusion key for this student
        q.setdefault("variant", f"pool:{row.content_hash[:8]}")   # telemetry: which content
        if misconception:
            q["target_misconception"] = misconception
        return q
    return None


def count_tagged(db: Session, operation: str, qtype: str, misconception: str) -> int:
    rows = db.query(QuestionPool).filter(
        QuestionPool.operation == operation, QuestionPool.question_type == qtype,
        QuestionPool.misconception_id == misconception).all()
    return sum(1 for r in rows if is_current(r))


def rehash_existing(db: Session) -> tuple[int, int]:
    """Recompute content_hash on rows hashed by an older formula (ordering once
    hashed its distractors only). A stale hash doesn't dedup, so the pool could
    store the same question twice. Free. Rows whose identity another row already
    holds are left alone (counted, never overwritten). Returns (rehashed, clashes)."""
    rows = db.query(QuestionPool).all()
    taken = {r.content_hash for r in rows}
    n = clashes = 0
    for row in rows:
        h = content_hash({**(row.payload or {}), "question_type": row.question_type,
                          "operation": row.operation}, row.intra_difficulty)
        if h == row.content_hash:
            continue
        if h in taken:
            clashes += 1
            continue
        taken.discard(row.content_hash)
        taken.add(h)
        row.content_hash = h
        n += 1
    db.commit()
    return n, clashes


def tag_existing(db: Session) -> int:
    """Backfill misconception_id on rows inserted before tagging existed.
    Free (execution only). Returns rows tagged."""
    n = 0
    for row in db.query(QuestionPool).filter(QuestionPool.misconception_id.is_(None)).all():
        m = row_misconception(row.payload or {})
        if m:
            row.misconception_id = m
            n += 1
    db.commit()
    return n


def generate_validated(operation: str, qtype: str, intra_difficulty: int,
                       variant_seed: int = 0, avoid: list[str] | None = None,
                       target_misconception: str | None = None) -> dict:
    """gen_check-style loop: build_prompt -> Haiku -> validate, retried, and
    RAISES on total failure (no static fallback — see module docstring).

    `avoid` lists content already in the pool for this combo (buggy lines for
    find_bug, distractors for ordering). Without it the model converges on the
    same bug every call and the refill budget burns on content_hash dedup.
    target_misconception: the item must show it (R4 in the validator)."""
    from .claude_service import OP_META, MAX_RETRIES, _call_model, _finalize
    from .question_registry import ai_can_target, get_handler
    from .question_spec import select_spec

    if target_misconception and not ai_can_target(operation, target_misconception):
        raise RuntimeError(f"{target_misconception} has no one-line form on {operation}: "
                           f"model output can never show it (authored content only)")

    type_unlocked = {"find_bug": 2, "ordering": 3}[qtype]
    spec    = select_spec(operation, "engaged", type_unlocked, intra_difficulty, variant_seed,
                          target_misconception)
    meta    = OP_META[operation]
    if target_misconception:
        meta = {**meta, "target_misconception": target_misconception}
    handler = get_handler(spec.type)

    last_error = ""
    for _ in range(MAX_RETRIES):
        prompt = handler.build_prompt(operation, meta, spec)
        if avoid:
            noun = "buggy lines" if qtype == "find_bug" else "distractors"
            listing = "\n".join(f"- {a}" for a in avoid[:12])
            prompt += (f"\n\nAlready in the question pool for this operation ({noun}) — "
                       f"produce something DIFFERENT from all of these:\n{listing}")
        if last_error:
            prompt += f"\n\nPrevious attempt failed: {last_error}\nReturn valid JSON only."
        raw = _call_model(prompt)
        try:
            q = handler.validate(raw, operation, meta)
            if target_misconception:
                q["target_misconception"] = target_misconception
            return _finalize(q, operation, spec)
        except Exception as e:
            last_error = str(e)
    raise RuntimeError(f"generation failed after {MAX_RETRIES} attempts: {last_error}")


def _existing_content(rows: list[QuestionPool], qtype: str) -> list[str]:
    """Buggy lines / distractors already pooled, for the avoid-list.

    Payload literals are folded back to {value}: the model is asked to emit the
    placeholder, so showing it `createNode(35)` here would read as a different
    line than the one it is being told not to repeat."""
    out: list[str] = []
    for r in rows:
        p = r.payload
        if qtype == "find_bug":
            steps, line = p.get("pseudocode", []), p.get("bug_line")
            if isinstance(line, int) and 0 <= line < len(steps):
                out.append(steps[line])
        else:
            out.extend(p.get("distractors", []))
    return list(dict.fromkeys(_PAYLOAD_LITERAL.sub("createNode({value})", s) for s in out))


def insert_question(db: Session, q: dict, intra_difficulty: int) -> QuestionPool | None:
    """Insert a validated question; returns None on a content-hash duplicate."""
    h = content_hash(q, intra_difficulty)
    if db.query(QuestionPool.id).filter(QuestionPool.content_hash == h).first():
        return None
    row = QuestionPool(
        operation=q["operation"], question_type=q["question_type"],
        intra_difficulty=intra_difficulty, payload=q, content_hash=h,
        misconception_id=row_misconception(q),
    )
    db.add(row)
    db.flush()
    row.payload = {**q, "id": row.id}   # served copies carry the pool id
    db.commit()
    return row


def refill_combo(db: Session, operation: str, qtype: str, intra: int,
                 target: int = TARGET, max_calls: int | None = None) -> int:
    """Generate+insert until the combo holds `target` rows. Returns rows added.
    Duplicates and failed generations count against max_calls (default 2x need).
    Existing pool content is fed back as an avoid-list so the model doesn't
    regenerate the same bug/distractors (dedup exhaustion)."""
    existing = [r for r in db.query(QuestionPool).filter(
        QuestionPool.operation == operation,
        QuestionPool.question_type == qtype,
        QuestionPool.intra_difficulty == intra,
    ).all() if is_current(r)]
    have = len(existing)
    need = target - have
    if need <= 0:
        return 0
    avoid = _existing_content(existing, qtype)
    added, calls = 0, 0
    budget = max_calls if max_calls is not None else need * 2
    seed = have
    while added < need and calls < budget:
        calls += 1
        seed += 1
        try:
            q = generate_validated(operation, qtype, intra, variant_seed=seed, avoid=avoid)
        except Exception as e:
            logger.warning("pool refill generation failed (%s/%s/i%s): %s",
                           operation, qtype, intra, e)
            continue
        row = insert_question(db, q, intra)
        if row:
            added += 1
            avoid = list(dict.fromkeys(avoid + _existing_content([row], qtype)))
    return added


def refill_targeted(db: Session, operation: str, qtype: str, misconception: str,
                    target: int = 2, intra: int = 2, max_calls: int | None = None) -> int:
    """Stock rows that show one misconception for a (operation, type) the
    authored content cannot target. Returns rows added. Costs model calls."""
    from .misconceptions import CATALOG, canonical
    if misconception not in CATALOG or operation not in CATALOG[misconception].mutants:
        return 0
    if canonical(operation, misconception).kind != "replace":
        return 0              # swaps are tested by any ordering item; deletes are authored-only
    need = target - count_tagged(db, operation, qtype, misconception)
    if need <= 0:
        return 0
    rows = db.query(QuestionPool).filter(QuestionPool.operation == operation,
                                         QuestionPool.question_type == qtype).all()
    avoid = _existing_content([r for r in rows if r.misconception_id == misconception and is_current(r)], qtype)
    added = calls = 0
    budget = max_calls if max_calls is not None else need * 3
    while added < need and calls < budget:
        calls += 1
        try:
            q = generate_validated(operation, qtype, intra, variant_seed=calls, avoid=avoid,
                                   target_misconception=misconception)
        except Exception as e:
            logger.warning("targeted refill failed (%s/%s/%s): %s", operation, qtype, misconception, e)
            continue
        row = insert_question(db, q, intra)
        if row is None:       # same content already pooled: make sure it carries the tag
            h = content_hash(q, intra)
            existing = db.query(QuestionPool).filter(QuestionPool.content_hash == h).first()
            if existing and existing.misconception_id is None:
                existing.misconception_id = misconception
                db.commit()
                added += 1
            continue
        added += 1
        avoid = list(dict.fromkeys(avoid + _existing_content([row], qtype)))
    return added


def _maybe_refill_async(operation: str, qtype: str, intra: int) -> None:
    """Spawn at most one background refill per combo, with a cooldown so a dead
    API key doesn't get hammered on every serve."""
    combo = (operation, qtype, intra)
    now = time.monotonic()
    with _refill_lock:
        if combo in _refill_in_flight:
            return
        if now - _refill_last_attempt.get(combo, 0) < _REFILL_COOLDOWN_S:
            return
        _refill_in_flight.add(combo)
        _refill_last_attempt[combo] = now

    def _run():
        from ..database import SessionLocal
        db = SessionLocal()
        try:
            added = refill_combo(db, operation, qtype, intra)
            if added:
                logger.info("pool self-heal added %d question(s) for %s/%s/i%s",
                            added, operation, qtype, intra)
        except Exception as e:
            logger.warning("pool self-heal failed for %s/%s/i%s: %s",
                           operation, qtype, intra, e)
        finally:
            db.close()
            with _refill_lock:
                _refill_in_flight.discard(combo)

    threading.Thread(target=_run, daemon=True, name=f"pool-refill-{operation}-{qtype}-{intra}").start()
