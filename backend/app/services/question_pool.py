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
    else:  # ordering — correct steps are fixed; the distractor set is the identity
        core = "\n".join(sorted(q.get("distractors", [])))
    key = f"{q.get('operation')}|{qtype}|i{intra_difficulty}|{core}"
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def serve(db: Session, user_id: str, operation: str, qtype: str,
          intra_difficulty: int | None) -> dict | None:
    """Return the least-served pool question this student hasn't attempted,
    or None (caller falls back to live generation). Triggers self-heal when
    the combo is at/below the low-water mark."""
    if qtype not in POOLED_TYPES:
        return None
    intra = intra_difficulty if intra_difficulty in (1, 2, 3) else 2

    attempted = (
        db.query(QuestionAttempt.question_id)
        .join(GameSession, QuestionAttempt.session_id == GameSession.id)
        .filter(GameSession.user_id == user_id)
    )
    base = db.query(QuestionPool).filter(
        QuestionPool.operation == operation,
        QuestionPool.question_type == qtype,
        QuestionPool.intra_difficulty == intra,
    )
    candidates = (
        base.filter(~QuestionPool.id.in_(attempted.scalar_subquery()))
        .order_by(QuestionPool.times_served.asc(), QuestionPool.created_at.asc())
        .limit(1).all()
    )

    if base.count() <= LOW_WATER:
        _maybe_refill_async(operation, qtype, intra)
    if not candidates:
        return None

    row = candidates[0]
    row.times_served += 1
    db.commit()
    q = copy.deepcopy(row.payload)
    q["id"] = row.id                                    # exclusion key for this student
    q.setdefault("variant", f"pool:{row.content_hash[:8]}")   # telemetry: which content
    return q


def generate_validated(operation: str, qtype: str, intra_difficulty: int,
                       variant_seed: int = 0, avoid: list[str] | None = None) -> dict:
    """gen_check-style loop: build_prompt -> Haiku -> validate, retried, and
    RAISES on total failure (no static fallback — see module docstring).

    `avoid` lists content already in the pool for this combo (buggy lines for
    find_bug, distractors for ordering). Without it the model converges on the
    same bug every call and the refill budget burns on content_hash dedup."""
    from .claude_service import OP_META, MAX_RETRIES, _call_model, _finalize
    from .question_registry import get_handler
    from .question_spec import select_spec

    type_unlocked = {"find_bug": 2, "ordering": 3}[qtype]
    spec    = select_spec(operation, "engaged", type_unlocked, intra_difficulty, variant_seed)
    meta    = OP_META[operation]
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
            return _finalize(handler.validate(raw, operation, meta), operation, spec)
        except Exception as e:
            last_error = str(e)
    raise RuntimeError(f"generation failed after {MAX_RETRIES} attempts: {last_error}")


def _existing_content(rows: list[QuestionPool], qtype: str) -> list[str]:
    """Buggy lines / distractors already pooled, for the avoid-list."""
    out: list[str] = []
    for r in rows:
        p = r.payload
        if qtype == "find_bug":
            steps, line = p.get("pseudocode", []), p.get("bug_line")
            if isinstance(line, int) and 0 <= line < len(steps):
                out.append(steps[line])
        else:
            out.extend(p.get("distractors", []))
    return list(dict.fromkeys(out))


def insert_question(db: Session, q: dict, intra_difficulty: int) -> QuestionPool | None:
    """Insert a validated question; returns None on a content-hash duplicate."""
    h = content_hash(q, intra_difficulty)
    if db.query(QuestionPool.id).filter(QuestionPool.content_hash == h).first():
        return None
    row = QuestionPool(
        operation=q["operation"], question_type=q["question_type"],
        intra_difficulty=intra_difficulty, payload=q, content_hash=h,
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
    existing = db.query(QuestionPool).filter(
        QuestionPool.operation == operation,
        QuestionPool.question_type == qtype,
        QuestionPool.intra_difficulty == intra,
    ).all()
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
