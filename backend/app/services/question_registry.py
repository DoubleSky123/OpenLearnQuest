"""
Question type registry.
Add a new type by implementing three functions and calling register().
"""
import json
import logging
import random
import re
import uuid
from dataclasses import dataclass
from typing import Callable

# ── Singly-linked-list variable guard ─────────────────────────────────────────
# reverseList legitimately uses `prev`; all other SLL ops must not.
# The traversal pointer is ALWAYS named `curr` — never `node`. It has to match
# TEMPLATES and the hint animation, which both label the cursor `curr`.
_SLL_CONSTRAINT = """\
PSEUDOCODE SYNTAX (mandatory — C-style):
- while loops: "while (condition)" — no colon, no "do". Single-statement body inline: "while (curr.next != NULL) curr = curr.next;"
- Multi-statement loop body uses braces: "while (curr != NULL) { temp = curr.next; curr = temp; }"
- if statements: "if (condition)" — no colon after condition
- Boolean operators: && (not "and"), || (not "or")
- Statements end with semicolons
- Pointer access via dot notation: "curr.next" — never use "->"
- Use ASCII operators ONLY: != (never ≠), <= (never ≤), >= (never ≥), == for equality check
- NULL (uppercase) for null pointer; true/false (lowercase) for booleans

SINGLY LINKED LIST CONSTRAINTS (mandatory):
- The traversal pointer is named "curr" — NEVER "node", "cur", "current" or "p"
- The target position is named "index" — NEVER "position", "pos" or "k"
- "{value}" is a PLACEHOLDER for the operation's payload. Reproduce it verbatim
  as "{value}" — do not invent a number for it and do not rename it
- No "tail" variable — no tail pointer exists; traverse from head using curr/temp
- No ".prev" field — singly linked lists only have .next
- Valid variables: head, curr, newNode, temp, prev, index, NULL, and operation-specific names (slow/fast for cycle, dummy for merge)
"""

_UNICODE_OPS = [
    ('≠', '!='),   # ≠
    ('≤', '<='),   # ≤
    ('≥', '>='),   # ≥
    ('→', '->'),   # →
    ('←', '='),    # ←
    ('≠', '!='),
    ('¹', ''),     # superscripts
]


def _ascii_ops(text: str) -> str:
    """Replace Unicode math/arrow symbols with ASCII equivalents."""
    for uni, asc in _UNICODE_OPS:
        text = text.replace(uni, asc)
    return text

_PREV_ALLOWED_OPS = {"reverseList"}


def _sll_reject_reason(text: str, operation: str) -> str | None:
    """Return a rejection reason if text violates SLL or pseudocode syntax constraints.

    Callers pass CODE fields only (pseudocode steps, options, distractors) — never
    English prose. That is what lets the `node` and `tail` checks be bare word
    matches: "the last node" is fine in an explanation, `node = head` is not code
    we accept. `newNode` is unaffected (no word boundary before the capital N).
    """
    if re.search(r'\btail\b', text, re.IGNORECASE):
        return "uses 'tail' variable (not valid in singly linked list)"
    if re.search(r'\bnode\b', text):
        return "names the traversal pointer 'node' — it must be 'curr'"
    if re.search(r'\b(cur|current)\b', text):
        return "abbreviates the traversal pointer — it must be spelled 'curr'"
    if re.search(r'\b(position|pos)\b', text):
        return "names the target position 'position'/'pos' — it must be 'index'"
    if operation not in _PREV_ALLOWED_OPS and re.search(r'\.prev\b', text):
        return "uses '.prev' field (not valid in singly linked list)"
    # Pascal/Lua-style do keyword (e.g. "while x != null do")
    if re.search(r'\bdo\b', text):
        return "uses Pascal-style 'do' keyword — use Python-style 'while (cond):' instead"
    return None

from .question_spec import QuestionSpec
from .ll_executor import execute_operation, find_head_id
from .static_questions import _rand_position, instantiate

logger = logging.getLogger(__name__)


@dataclass
class QuestionTypeHandler:
    build_prompt: Callable   # (operation, meta, spec) -> str
    validate:     Callable   # (raw_str, operation, meta) -> dict
    build_static: Callable   # (operation, spec) -> dict


_REGISTRY: dict[str, QuestionTypeHandler] = {}


def register(type_name: str, handler: QuestionTypeHandler) -> None:
    _REGISTRY[type_name] = handler


def get_handler(type_name: str) -> QuestionTypeHandler:
    if type_name not in _REGISTRY:
        raise ValueError(f"Unknown question type: {type_name}")
    return _REGISTRY[type_name]


# ── Shared helpers ─────────────────────────────────────────────────────────────

def _parse_json(raw: str) -> dict:
    clean = re.sub(r"```(?:json)?", "", raw).strip().strip("`").strip()
    start, end = clean.find("{"), clean.rfind("}") + 1
    if start == -1 or end == 0:
        raise ValueError("No JSON object found in response")
    return json.loads(clean[start:end])


def _assert_valid_list(nodes: list[dict]) -> None:
    ids   = {n["id"] for n in nodes}
    nexts = {n["next"] for n in nodes if n.get("next") is not None}
    for ref in nexts:
        if ref not in ids:
            raise ValueError(f"Dangling next reference: id={ref}")
    if find_head_id(nodes) is None:
        raise ValueError("Cannot find head node")


def _compute_goal(q: dict, operation: str, meta: dict) -> dict:
    """Run executor to compute goalPattern (ground truth). Returns enriched q.
    Merge assemblies set goalPattern themselves; detectCycle's executor is a
    stub (the ANSWER is a boolean, the frontend renders it as text), so its
    goal falls back to the current values. sortList runs the executor normally."""
    if meta.get("isMerge"):
        return q
    nodes = q.get("initialNodes") or []
    if operation == "detectCycle":
        q.setdefault("goalPattern", [n["value"] for n in nodes])
        return q
    if nodes:
        _assert_valid_list(nodes)
    result = execute_operation(
        operation=operation,
        nodes=nodes,
        operation_value=q.get("operationValue"),
        operation_position=q.get("operationPosition"),
    )
    q["goalPattern"] = result["values"]
    return q


def _enrich(q: dict, operation: str, meta: dict, qtype: str) -> dict:
    q["id"]            = str(uuid.uuid4())
    q["question_type"] = qtype
    q["operation"]     = operation
    q["isMerge"]       = meta.get("isMerge", False)
    if operation == "detectCycle" and q.get("initialNodes"):
        # display metadata: tail loops back to index 1 (LeetCode pos style);
        # initialNodes stay LINEAR so board/executor logic never walks a cycle
        q["cycleTo"] = 1
    q = _compute_goal(q, operation, meta)
    # Payload literals LAST: everything upstream (prompts, validators, alias
    # analysis, content_hash) works on the symbolic {value} form, so the
    # rename-detection and dedup logic never sees a random number.
    return instantiate(q)


# ── ordering: parallel-create valid orders ─────────────────────────────────────

_PARALLEL_CREATE_OPS = {"insertAtTail", "insertAtPosition"}


def _build_valid_orders(pseudocode: list[str], correct: list[int], operation: str) -> list[list[int]]:
    if operation not in _PARALLEL_CREATE_OPS:
        return [list(correct)]
    create_idx: int | None = None
    for idx, step in enumerate(pseudocode):
        s = step.lower().replace(" ", "")
        if "create" in s or "newnode(" in s or "=node(" in s or "malloc" in s:
            create_idx = idx
            break
    if create_idx is None:
        return [list(correct)]
    traversal, wiring = [], []
    for idx in correct:
        if idx == create_idx:
            continue
        s = pseudocode[idx].lower().replace(" ", "")
        (wiring if "newnode" in s else traversal).append(idx)
    orders: list[tuple] = [
        tuple([create_idx] + traversal + wiring),
    ]
    if traversal:
        orders.append(tuple([traversal[0], create_idx] + traversal[1:] + wiring))
    orders.append(tuple(traversal + [create_idx] + wiring))
    seen: set[tuple] = set()
    unique: list[list[int]] = []
    for o in orders:
        if o not in seen:
            seen.add(o)
            unique.append(list(o))
    return unique


# ══════════════════════════════════════════════════════════════════════════════
# ORDERING
# ══════════════════════════════════════════════════════════════════════════════

def _ordering_prompt(operation: str, meta: dict, spec: QuestionSpec) -> str:
    from .static_questions import TEMPLATES
    p      = spec.params
    n_dist = 3 if spec.difficulty >= 3 else 2
    title  = meta["title"]

    correct_steps = TEMPLATES.get(operation, {}).get("pseudocode", [])
    steps_json    = json.dumps(correct_steps, ensure_ascii=False)

    return f"""The correct pseudocode for "{title}" ({operation}) is:
{steps_json}

Generate {n_dist} distractor steps that look plausible for {operation} but are WRONG.
Return ONLY this JSON:
{{
  "distractors": ["<wrong step 1>", "<wrong step 2>"{', "<wrong step 3>"' if n_dist >= 3 else ''}],
  "hint": "<one sentence conceptual hint for this operation>"
}}

Rules:
- distractors must NOT be copies of any step in the correct pseudocode above
- distractor style: {p['distractor_similarity']}
- distractors must be plausible pointer operations in C-style pseudocode
{_SLL_CONSTRAINT}
Return ONLY the JSON."""


def _ordering_validate(raw: str, operation: str, meta: dict) -> dict:
    from .static_questions import TEMPLATES
    ai = _parse_json(raw)
    for f in ("distractors", "hint"):
        if f not in ai:
            raise ValueError(f"Missing field: {f}")
    if not isinstance(ai["distractors"], list) or not ai["distractors"]:
        raise ValueError("distractors must be a non-empty list")

    correct_steps = TEMPLATES.get(operation, {}).get("pseudocode", [])
    if not correct_steps:
        raise ValueError(f"No template found for operation '{operation}'")

    # Normalise distractors
    distractors = [_ascii_ops(d) for d in ai["distractors"]]

    # Distractors must not copy correct steps
    step_set = {s.strip() for s in correct_steps}
    seen: set[str] = set()
    clean: list[str] = []
    for d in distractors:
        key = d.strip()
        if key in step_set:
            raise ValueError(f"distractor '{d}' is identical to a correct pseudocode step")
        if key not in seen:
            clean.append(d)
            seen.add(key)
    if not clean:
        raise ValueError("No valid distractors after dedup")

    # SLL constraint check
    reason = _sll_reject_reason(" ".join(correct_steps + clean), operation)
    if reason:
        raise ValueError(f"SLL violation in ordering question: {reason}")

    # ── Assemble full question ─────────────────────────────────────────────────
    # startsEmpty (insertIntoEmpty): the executor ignores any initial list, so
    # rendering one would show a 'Current state' that contradicts the operation.
    nodes      = 0 if meta.get("startsEmpty") else max(meta["minNodes"], 3)
    is_merge   = meta.get("isMerge", False)
    correct_order = list(range(len(correct_steps)))

    if is_merge:
        size      = max(2, nodes // 2)
        l1_vals   = sorted(random.sample(range(1, 30), size))
        l2_vals   = sorted(random.sample([v for v in range(1, 30) if v not in l1_vals], size))
        op_value  = {"l1Values": l1_vals, "l2Values": l2_vals}
        init_nodes = [{"id": i + 1, "value": v, "next": i + 2 if i + 1 < len(l1_vals) else None}
                      for i, v in enumerate(l1_vals)]
        goal       = sorted(l1_vals + l2_vals)
    else:
        values     = random.sample(range(1, 99), nodes)
        init_nodes = [{"id": i + 1, "value": values[i], "next": i + 2 if i + 1 < nodes else None}
                      for i in range(nodes)]
        op_value   = random.randint(1, 99) if meta["needsValue"] else None
        op_pos     = _rand_position(operation, nodes) if meta["needsPosition"] else None
        goal       = None  # computed by _enrich → _compute_goal

    q = {
        "question_type":     "ordering",
        "title":             meta["title"],
        "pseudocode":        correct_steps,
        "correctOrder":      correct_order,
        "distractors":       clean,
        "hint":              ai["hint"],
        "initialNodes":      init_nodes,
        "operationValue":    op_value if not meta["needsPosition"] else op_value,
        "operationPosition": op_pos if meta["needsPosition"] else None,
        "isMerge":           is_merge,
    }
    if is_merge:
        q["goalPattern"] = goal
        q["l1Values"]    = l1_vals
        q["l2Values"]    = l2_vals

    q = _enrich(q, operation, meta, "ordering")
    q["validOrders"] = TEMPLATES.get(operation, {}).get("validOrders") or \
                       _build_valid_orders(correct_steps, correct_order, operation)
    return q


def _ordering_static(operation: str, spec: QuestionSpec) -> dict:
    from .static_questions import generate_static_question
    q = generate_static_question(operation, spec.emotion, 0, None, intra_level=spec.intra_difficulty)
    q["question_type"] = "ordering"
    q["difficulty"]    = spec.difficulty
    return q


# ══════════════════════════════════════════════════════════════════════════════
# FILL BLANK
# ══════════════════════════════════════════════════════════════════════════════

def _fill_blank_prompt(operation: str, meta: dict, spec: QuestionSpec) -> str:
    nodes = max(meta["minNodes"], 2)
    title = meta["title"]
    pos_note = (f'\n  "operationPosition": <1-indexed int, 2 <= pos <= {nodes}>'
                if meta["needsPosition"] else '\n  "operationPosition": null')
    val_note = ('\n  "operationValue": <integer 1-99, different from node values>'
                if meta["needsValue"] else '\n  "operationValue": null')

    return f"""Generate a "{title}" ({operation}) fill-in-the-blank pseudocode question.
The pseudocode is in CORRECT ORDER. Replace exactly ONE key variable or operator per step with ___.
VARIABLE STYLE: {spec.params['variable_style']}
{_SLL_CONSTRAINT}
Return ONLY this JSON:
{{
  "question_type": "fill_blank",
  "title": "{title}",
  "pseudocode": ["create ___","___.next = head","head = ___"],
  "blanks": [
    {{"line":0,"answer":"newNode","options":["newNode","head","temp"]}},
    {{"line":1,"answer":"newNode","options":["newNode","null","temp"]}},
    {{"line":2,"answer":"newNode","options":["newNode","temp","NULL"]}}
  ],
  "initialNodes": [{{"id":1,"value":5,"next":2}},{{"id":2,"value":8,"next":null}}],{val_note},{pos_note},
  "goalPattern": [result values in traversal order],
  "hint": "one sentence hint"
}}
Rules:
- Each pseudocode step has exactly one ___ blank
- blanks array has one entry per step (same length as pseudocode)
- options: 3 items — 1 correct answer + 2 plausible wrong singly-linked-list variables (no "prev", no "tail")
- answer MUST appear in options
- initialNodes: {nodes} nodes, ids from 1
Return ONLY the JSON."""


def _fill_blank_validate(raw: str, operation: str, meta: dict) -> dict:
    q = _parse_json(raw)
    for f in ("pseudocode", "blanks", "initialNodes", "operationValue", "operationPosition", "hint"):
        if f not in q:
            raise ValueError(f"Missing field: {f}")
    if not isinstance(q["pseudocode"], list) or not q["pseudocode"]:
        raise ValueError("pseudocode must be non-empty list")

    # Normalise Unicode operators
    q["pseudocode"] = [_ascii_ops(s) for s in q["pseudocode"]]
    for b in q.get("blanks", []):
        if isinstance(b.get("options"), list):
            b["options"] = [_ascii_ops(o) for o in b["options"]]
        if isinstance(b.get("answer"), str):
            b["answer"] = _ascii_ops(b["answer"])

    if not isinstance(q["blanks"], list) or len(q["blanks"]) != len(q["pseudocode"]):
        raise ValueError(f"blanks length {len(q.get('blanks',[]))} != pseudocode length {len(q['pseudocode'])}")
    all_options: list[str] = []
    for b in q["blanks"]:
        if not {"line", "answer", "options"} <= set(b):
            raise ValueError(f"blank missing fields: {b}")
        if b["answer"] not in b["options"]:
            raise ValueError(f"answer '{b['answer']}' not in options {b['options']}")
        if len(b["options"]) < 2:
            raise ValueError("Each blank needs >= 2 options")
        all_options.extend(b["options"])

    # Every pseudocode step must contain exactly one ___ blank
    for i, step in enumerate(q["pseudocode"]):
        if "___" not in step:
            raise ValueError(f"Step {i} has no blank (___): {step!r}")

    # SLL constraint check
    all_text = " ".join(q["pseudocode"] + all_options)
    reason = _sll_reject_reason(all_text, operation)
    if reason:
        raise ValueError(f"SLL violation in fill_blank question: {reason}")

    return _enrich(q, operation, meta, "fill_blank")


def _fill_blank_static(operation: str, spec: QuestionSpec) -> dict:
    from .static_questions import generate_fill_blank_question
    return generate_fill_blank_question(operation, spec)


# ══════════════════════════════════════════════════════════════════════════════
# FIND BUG
# ══════════════════════════════════════════════════════════════════════════════

# find_bug bug subtlety per within-type difficulty (state axis). Level 1 also
# uses fewer fix options (2 total = fix + 1 wrong) so it is genuinely easier.
def _aliases_before(steps: list[str], bug_line: int) -> dict[str, str]:
    """Textual aliases still live when `bug_line` runs: only assignments BEFORE
    it count (later ones haven't executed), and a reassignment KILLS stale
    aliases — after 'temp = head; head = head.next;' the alias temp->head no
    longer holds (temp names the OLD head). A self-referential assignment like
    'head = head.next' yields no textual alias at all. Without the kill rule,
    sequential substitution chained temp->head->head.next and wrongly rejected
    real bugs (e.g. removeAtHead's 'free(head.next);'). Shared by the find_bug
    prompt (concrete forbidden-rewrite list) and validator (equivalence check)."""
    alias: dict[str, str] = {}
    for i, step in enumerate(steps):
        if i >= bug_line:
            break
        m = re.match(r'^(\w[\w.]*)\s*=\s*(.+)$', step.strip().rstrip(";"))
        if not m:
            continue
        target, rhs = m.group(1).strip(), m.group(2).strip()
        alias = {t: r for t, r in alias.items()
                 if not re.search(rf'\b{re.escape(target)}\b', r)}
        alias.pop(target, None)
        if not re.search(rf'\b{re.escape(target)}\b', rhs):
            alias[target] = rhs
    return alias


_BUG_SUBTLETY = {
    1: "OBVIOUS — use a clearly wrong variable or drop the assignment target; a beginner can spot it",
    2: "PLAUSIBLE — right idea but wrong target or wrong order (a mistake a learner would actually make)",
    3: "SUBTLE — an off-by-one pointer such as .next vs .next.next, or swapped operands; easy to miss",
}


def _find_bug_prompt(operation: str, meta: dict, spec: QuestionSpec) -> str:
    from .static_questions import TEMPLATES
    correct_steps = TEMPLATES.get(operation, {}).get("pseudocode", [])
    # Randomly pick a line to corrupt; prefer pointer-assignment lines
    candidates = [i for i, s in enumerate(correct_steps)
                  if any(t in s for t in ["=", ".next", ".val"])]
    bug_line = random.choice(candidates) if candidates else random.randrange(len(correct_steps))
    correct_line = correct_steps[bug_line]

    intra    = spec.intra_difficulty or 2
    subtlety = _BUG_SUBTLETY.get(intra, _BUG_SUBTLETY[2])
    n_wrong  = 1 if intra == 1 else 2

    # Alias warning: assignments BEFORE the bug line make some rewrites of the
    # correct line behave identically (the validator rejects those). List the
    # forbidden rewrites CONCRETELY — the abstract "don't swap aliased names"
    # version still produced 'head = temp.next;' every attempt; on 3-line ops
    # like removeAtHead the mutation space is tiny and this dominates retries.
    alias_note = ""
    aliases = _aliases_before(correct_steps, bug_line)
    if aliases:
        forbidden: list[str] = []
        for t, r in aliases.items():
            occ = [m.start() for m in re.finditer(rf'\b{re.escape(r)}\b', correct_line)]
            for pos in occ:
                forbidden.append(correct_line[:pos] + t + correct_line[pos + len(r):])
            if len(occ) > 1:
                forbidden.append(re.sub(rf'\b{re.escape(r)}\b', t, correct_line))
        forbidden = [f for f in dict.fromkeys(forbidden) if f != correct_line][:6]
        facts = "; ".join(f'"{t}" holds "{r}"' for t, r in aliases.items())
        if forbidden:
            alias_note = (
                f"\n- When line {bug_line} runs, {facts}. These rewrites behave IDENTICALLY "
                f"to the correct line and will be REJECTED: {json.dumps(forbidden)}. "
                f"Make a genuinely different read/write instead (different field depth "
                f"like .next.next, a different variable, or the wrong side of the assignment)."
            )

    # Few-shot anchor: show a real authored bug of the requested subtlety so the
    # model calibrates "how hidden" instead of interpreting adjectives freely.
    from .static_questions import _BUGS, _pick_bug_variant
    example = ""
    variants = _BUGS.get(operation)
    if variants:
        ref = _pick_bug_variant(variants, intra, 0)
        example = (
            f'\nReference example of this subtlety level for this operation:\n'
            f'  correct: "{ref["fix"]}"  ->  buggy: "{ref["buggy"]}"\n'
            f'Produce a DIFFERENT bug (different line or different mutation), at a similar subtlety.\n'
        )

    return f"""The correct pseudocode for "{meta['title']}" ({operation}) is:
{json.dumps(correct_steps, ensure_ascii=False)}

Line {bug_line} (0-based) is: "{correct_line}"
{example}
Introduce a bug into line {bug_line} only, at this difficulty: {subtlety}.
Return ONLY this JSON:
{{
  "bug_line": {bug_line},
  "buggy_line": "<corrupted version of line {bug_line} — wrong pointer or wrong variable>",
  "wrong_options": [{', '.join(f'"<plausible wrong fix {i+1}>"' for i in range(n_wrong))}],
  "bug_explanation": "<one sentence: why the buggy version is wrong>",
  "hint": "<one sentence: conceptual hint without naming the line>"
}}

Rules:
- buggy_line must differ from "{correct_line}" and produce WRONG output when run
- RENAMING a variable is NOT a bug: if your buggy_line is just "{correct_line}" with a
  variable renamed consistently (e.g. temp -> node), it behaves identically and will be
  REJECTED. The bug must change which pointer/value is read or written.
- provide exactly {n_wrong} wrong_option(s): incorrect variants of line {bug_line} (not copies of other steps)
- wrong_options must NOT include the correct line "{correct_line}" — it is added
  automatically as the right answer; every wrong_option must be genuinely wrong
- match the requested subtlety: {subtlety}{alias_note}
{_SLL_CONSTRAINT}
Return ONLY the JSON."""


def _find_bug_validate(raw: str, operation: str, meta: dict) -> dict:
    from .static_questions import TEMPLATES
    ai = _parse_json(raw)
    for f in ("bug_line", "buggy_line", "wrong_options", "bug_explanation", "hint"):
        if f not in ai:
            raise ValueError(f"Missing field: {f}")

    bug_line = ai["bug_line"]
    template_steps = TEMPLATES.get(operation, {}).get("pseudocode", [])
    if not template_steps:
        raise ValueError(f"No template found for operation '{operation}'")
    if not isinstance(bug_line, int) or not (0 <= bug_line < len(template_steps)):
        raise ValueError(f"bug_line {bug_line} out of range for {len(template_steps)}-step template")

    correct_line = template_steps[bug_line]
    buggy_line   = _ascii_ops(str(ai["buggy_line"]))

    # Buggy line must actually differ from the correct line
    if buggy_line.strip().rstrip(";") == correct_line.strip().rstrip(";"):
        raise ValueError(f"buggy_line is identical to the correct line '{correct_line}'")

    # Semantic equivalence check (alias substitution) — aliases via
    # _aliases_before (kill rule documented there).
    alias = _aliases_before(template_steps, bug_line)
    def _substitute(expr: str) -> str:
        # Single simultaneous pass (longest names first) — no re-substitution of
        # produced text, so aliases never chain.
        if not alias:
            return expr
        pattern = re.compile("|".join(
            rf'\b{re.escape(v)}\b' for v in sorted(alias, key=len, reverse=True)))
        return pattern.sub(lambda mo: alias[mo.group(0)], expr)
    b_norm = buggy_line.strip().rstrip(";")
    c_norm = correct_line.strip().rstrip(";")
    if _substitute(b_norm) == c_norm or b_norm == _substitute(c_norm):
        facts = "; ".join(f"'{t}' holds '{r}'" for t, r in alias.items())
        raise ValueError(
            f"buggy_line '{buggy_line}' behaves identically to the correct line "
            f"'{correct_line}' because {facts} — swapping aliased names is a rename, "
            f"not a bug; change which pointer/field is read or written (different "
            f"field depth like .next.next, or a different variable entirely)")

    # Sanitize wrong_options instead of rejecting: models persistently include
    # the correct line as a "plausible fix" (it IS the most plausible one), and
    # burning retries on that starved removeAtHead. Drop copies of the correct
    # line (textual OR alias-equivalent — 'head = temp.next;' is a working fix
    # when temp holds head, and a student picking it must not be marked wrong),
    # copies of other template steps, and duplicates; the question is still
    # sound with one fewer distractor as long as one real wrong survives.
    correct_key = correct_line.strip().rstrip(";")
    other_lines = {s.strip().rstrip(";") for i, s in enumerate(template_steps) if i != bug_line}
    seen: set[str] = set()
    wrong_opts: list[str] = []
    for opt in (_ascii_ops(o) for o in ai.get("wrong_options", [])):
        key = opt.strip().rstrip(";")
        if (key == correct_key or key in other_lines or key in seen
                or _substitute(key) == c_norm or key == _substitute(c_norm)):
            continue
        seen.add(key)
        wrong_opts.append(opt)
    if not wrong_opts:
        raise ValueError(
            "no usable wrong_options: every option was the correct line, a copy of "
            "another step, or a duplicate — provide genuinely incorrect fixes")

    # SLL constraint check — CODE fields only. bug_explanation is English prose:
    # "the tail of the list" is correct teaching language for insertAtTail and
    # must not trip the no-'tail'-variable rule.
    all_text = " ".join(template_steps + [buggy_line] + wrong_opts)
    reason = _sll_reject_reason(all_text, operation)
    if reason:
        raise ValueError(f"SLL violation in find_bug question: {reason}")

    # ── Assemble the full question from template + AI contributions ────────────
    pseudocode = list(template_steps)
    pseudocode[bug_line] = buggy_line

    # startsEmpty (insertIntoEmpty): the executor ignores any initial list, so
    # rendering one would show a 'Current state' that contradicts the operation.
    nodes = 0 if meta.get("startsEmpty") else max(meta["minNodes"], 3)
    if meta.get("isMerge"):
        # merge needs TWO input lists + the merged goal — a generic node chain
        # rendered a bogus single list with an empty goal state
        size    = 3
        l1_vals = sorted(random.sample(range(1, 50), size))
        l2_vals = sorted(random.sample([v for v in range(1, 50) if v not in l1_vals], size))
        init_nodes = [{"id": i + 1, "value": v, "next": i + 2 if i + 1 < len(l1_vals) else None}
                      for i, v in enumerate(l1_vals)]
        op_value, op_position = {"l1Values": l1_vals, "l2Values": l2_vals}, None
    else:
        init_nodes = [{"id": i, "value": random.randint(1, 30) * i, "next": i + 1 if i < nodes else None}
                      for i in range(1, nodes + 1)]
        if init_nodes:
            init_nodes[-1]["next"] = None
        op_value    = random.randint(1, 99) if meta["needsValue"] else None
        op_position = _rand_position(operation, nodes) if meta["needsPosition"] else None

    q = {
        "question_type": "find_bug",
        "title":         meta["title"],
        "pseudocode":    pseudocode,
        "bug_line":      bug_line,
        "fix":           correct_line,
        "options":       [correct_line] + wrong_opts,
        "bug_explanation": ai["bug_explanation"],
        "hint":          ai["hint"],
        "initialNodes":  init_nodes,
        "operationValue":    op_value,
        "operationPosition": op_position,
    }
    if meta.get("isMerge"):
        q["goalPattern"] = sorted(l1_vals + l2_vals)
        q["l1Values"], q["l2Values"] = l1_vals, l2_vals
    return _enrich(q, operation, meta, "find_bug")


def _find_bug_static(operation: str, spec: QuestionSpec) -> dict:
    from .static_questions import generate_find_bug_question
    return generate_find_bug_question(operation, spec)


# ── Registration ───────────────────────────────────────────────────────────────

register("ordering",   QuestionTypeHandler(_ordering_prompt,   _ordering_validate,   _ordering_static))
register("fill_blank", QuestionTypeHandler(_fill_blank_prompt,  _fill_blank_validate,  _fill_blank_static))
register("find_bug",   QuestionTypeHandler(_find_bug_prompt,    _find_bug_validate,    _find_bug_static))
