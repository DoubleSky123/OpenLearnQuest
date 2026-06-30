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
_SLL_CONSTRAINT = """\
PSEUDOCODE SYNTAX (mandatory — C-style):
- while loops: "while (condition)" — no colon, no "do". Single-statement body inline: "while (node.next != NULL) node = node.next;"
- Multi-statement loop body uses braces: "while (node != NULL) { temp = node.next; node = temp; }"
- if statements: "if (condition)" — no colon after condition
- Boolean operators: && (not "and"), || (not "or")
- Statements end with semicolons
- Pointer access via dot notation: "node.next" — never use "->"
- Use ASCII operators ONLY: != (never ≠), <= (never ≤), >= (never ≥), == for equality check
- NULL (uppercase) for null pointer; true/false (lowercase) for booleans

SINGLY LINKED LIST CONSTRAINTS (mandatory):
- No "tail" variable — no tail pointer exists; traverse from head using node/curr/temp
- No ".prev" field — singly linked lists only have .next
- Valid variables: head, node, curr, newNode, temp, NULL, and operation-specific names (slow/fast for cycle, dummy for merge)
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
    """Return a rejection reason if text violates SLL or pseudocode syntax constraints."""
    if re.search(r'\btail\b', text, re.IGNORECASE):
        return "uses 'tail' variable (not valid in singly linked list)"
    if operation not in _PREV_ALLOWED_OPS and re.search(r'\.prev\b', text):
        return "uses '.prev' field (not valid in singly linked list)"
    # Pascal/Lua-style do keyword (e.g. "while x != null do")
    if re.search(r'\bdo\b', text):
        return "uses Pascal-style 'do' keyword — use Python-style 'while (cond):' instead"
    return None

from .question_spec import QuestionSpec
from .ll_executor import execute_operation, find_head_id

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
    """Run executor to compute goalPattern (ground truth). Returns enriched q."""
    if meta.get("isMerge") or operation in ("detectCycle", "sortList"):
        return q
    nodes = q.get("initialNodes") or []
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
    return _compute_goal(q, operation, meta)


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
    nodes      = max(meta["minNodes"], 3)
    is_merge   = meta.get("isMerge", False)
    correct_order = list(range(len(correct_steps)))

    if is_merge:
        size      = max(2, nodes // 2)
        l1_vals   = sorted(random.sample(range(1, 30), size))
        l2_vals   = sorted(random.sample(range(1, 30), size))
        op_value  = {"l1Values": l1_vals, "l2Values": l2_vals}
        init_nodes = []
        goal       = sorted(l1_vals + l2_vals)
    else:
        values     = random.sample(range(1, 99), nodes)
        init_nodes = [{"id": i + 1, "value": values[i], "next": i + 2 if i + 1 < nodes else None}
                      for i in range(nodes)]
        op_value   = random.randint(1, 99) if meta["needsValue"] else None
        op_pos     = random.randint(2, nodes) if meta["needsPosition"] else None
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

    return f"""The correct pseudocode for "{meta['title']}" ({operation}) is:
{json.dumps(correct_steps, ensure_ascii=False)}

Line {bug_line} (0-based) is: "{correct_line}"

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
- provide exactly {n_wrong} wrong_option(s): incorrect variants of line {bug_line} (not copies of other steps)
- match the requested subtlety: {subtlety}
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

    # Semantic equivalence check (alias substitution)
    alias: dict[str, str] = {}
    for i, step in enumerate(template_steps):
        if i == bug_line:
            continue
        m = re.match(r'^(\w[\w.]*)\s*=\s*(.+)$', step.strip().rstrip(";"))
        if m:
            alias[m.group(1).strip()] = m.group(2).strip()
    def _substitute(expr: str) -> str:
        for var, val in alias.items():
            expr = re.sub(rf'\b{re.escape(var)}\b', val, expr)
        return expr
    b_norm = buggy_line.strip().rstrip(";")
    c_norm = correct_line.strip().rstrip(";")
    if _substitute(b_norm) == c_norm or b_norm == _substitute(c_norm):
        raise ValueError(
            f"buggy_line is semantically equivalent to correct line after alias substitution"
        )

    # wrong_options must not copy other template lines
    correct_line_set = {s.strip().rstrip(";") for i, s in enumerate(template_steps) if i != bug_line}
    wrong_opts = [_ascii_ops(o) for o in ai.get("wrong_options", [])]
    for opt in wrong_opts:
        if opt.strip().rstrip(";") in correct_line_set:
            raise ValueError(f"wrong_option '{opt}' is identical to a correct pseudocode line")

    # Options must be distinct (fix + 2 wrong)
    all_opts = [correct_line] + wrong_opts
    opt_keys = [o.strip().rstrip(";") for o in all_opts]
    if len(opt_keys) != len(set(opt_keys)):
        raise ValueError("options contains duplicates")

    # SLL constraint check
    all_text = " ".join(template_steps + [buggy_line] + wrong_opts + [ai.get("bug_explanation", "")])
    reason = _sll_reject_reason(all_text, operation)
    if reason:
        raise ValueError(f"SLL violation in find_bug question: {reason}")

    # ── Assemble the full question from template + AI contributions ────────────
    pseudocode = list(template_steps)
    pseudocode[bug_line] = buggy_line

    nodes = max(meta["minNodes"], 3)
    init_nodes = [{"id": i, "value": random.randint(1, 30) * i, "next": i + 1 if i < nodes else None}
                  for i in range(1, nodes + 1)]
    init_nodes[-1]["next"] = None

    op_value    = random.randint(1, 99) if meta["needsValue"] else None
    op_position = random.randint(2, nodes) if meta["needsPosition"] else None

    q = {
        "question_type": "find_bug",
        "title":         meta["title"],
        "pseudocode":    pseudocode,
        "bug_line":      bug_line,
        "fix":           correct_line,
        "options":       all_opts,
        "bug_explanation": ai["bug_explanation"],
        "hint":          ai["hint"],
        "initialNodes":  init_nodes,
        "operationValue":    op_value,
        "operationPosition": op_position,
    }
    return _enrich(q, operation, meta, "find_bug")


def _find_bug_static(operation: str, spec: QuestionSpec) -> dict:
    from .static_questions import generate_find_bug_question
    return generate_find_bug_question(operation, spec)


# ── Registration ───────────────────────────────────────────────────────────────

register("ordering",   QuestionTypeHandler(_ordering_prompt,   _ordering_validate,   _ordering_static))
register("fill_blank", QuestionTypeHandler(_fill_blank_prompt,  _fill_blank_validate,  _fill_blank_static))
register("find_bug",   QuestionTypeHandler(_find_bug_prompt,    _find_bug_validate,    _find_bug_static))
