"""
Deterministic error diagnosis for linked-list pseudocode assembly.

Analyzes WHAT went wrong by comparing the student's step order against
the correct order. Returns a structured diagnosis dict consumed by:
  - game_master.get_hint()  → immediate concept-targeted hint (no LLM)
  - tutor_agent.py          → LLM context block for targeted Socratic question
"""

from .concept_graph import concepts_for_op

# ── Concept keyword rules ─────────────────────────────────────────────────────
# Each entry: (concept, [lowercase fragment patterns]).
# First matching rule wins — more specific rules appear first.
# Traversal is checked before memory_management so "!= null" doesn't
# accidentally match the memory_management " = null" pattern.

_CONCEPT_RULES: list[tuple[str, list[str]]] = [
    ("traversal",          ["while", "for i in", "!= null", ".next.next",
                            "node = node.next", "current = current.next",
                            "slow = slow.next", "fast = fast.next"]),
    ("memory_management",  ["free(", " = null", "= none", ".next = null",
                            "head = null", "node = null", "prev = null"]),
    # Match explicit creation syntax only — "newnod" alone is too broad and
    # would match pointer-assignment steps like "head = newNode".
    ("node_creation",      ["create", "= node(", "newnode(", "node(val", "allocate"]),
    ("list_structure",     ["dummy", "return", "merge(", "mid =", "slow, fast"]),
    ("pointer_assignment", [".next =", "= head", "prev =", "temp =", "head =",
                            "= prev", "= temp", "= new"]),
]


def classify_step(step: str) -> str:
    """Map a pseudocode step text to its most likely concept."""
    lower = step.lower()
    for concept, keywords in _CONCEPT_RULES:
        if any(kw in lower for kw in keywords):
            return concept
    return "pointer_assignment"


def analyze_error(
    operation: str,
    your_answer: list[str],
    correct_answer: list[str],
    distractors: list[str] | None = None,
) -> dict:
    """
    Diagnose the primary error in the student's step assembly.

    Args:
        operation:      e.g. "insertAtHead"
        your_answer:    list of step texts the student placed (in order)
        correct_answer: list of step texts in the correct order
        distractors:    list of distractor step texts (optional)

    Returns:
        error_type:      "distractor_used" | "wrong_order" | "missing_steps" | "correct"
        misplaced_step:  the specific wrong step text (or None)
        first_wrong_pos: 0-indexed position of first error (or None)
        error_concept:   concept key the error relates to
        confidence:      "high" | "medium" | "low"
        detail:          one-line description for LLM context injection
    """
    primary_concepts = concepts_for_op(operation)
    default_concept  = primary_concepts[0] if primary_concepts else "pointer_assignment"

    if not your_answer:
        return {
            "error_type":      "missing_steps",
            "misplaced_step":  None,
            "first_wrong_pos": 0,
            "error_concept":   default_concept,
            "confidence":      "low",
            "detail":          "Student has not placed any steps yet.",
        }

    distractor_set = set(distractors or [])

    # 1. Distractor in assembly?
    for pos, step in enumerate(your_answer):
        if step in distractor_set:
            # Use the concept of what *should* be at this position
            concept = (
                classify_step(correct_answer[pos])
                if pos < len(correct_answer)
                else classify_step(step)
            )
            return {
                "error_type":      "distractor_used",
                "misplaced_step":  step,
                "first_wrong_pos": pos,
                "error_concept":   concept,
                "confidence":      "high",
                "detail":          f"Used distractor '{step}' at position {pos + 1}.",
            }

    # 2. Find first positional mismatch
    first_wrong = None
    for i, expected in enumerate(correct_answer):
        if i >= len(your_answer) or your_answer[i] != expected:
            first_wrong = i
            break

    # 3. All correct steps matched
    if first_wrong is None:
        if len(your_answer) > len(correct_answer):
            extra = your_answer[len(correct_answer)]
            return {
                "error_type":      "wrong_order",
                "misplaced_step":  extra,
                "first_wrong_pos": len(correct_answer),
                "error_concept":   classify_step(extra),
                "confidence":      "medium",
                "detail":          f"Extra step '{extra}' placed beyond the answer.",
            }
        return {
            "error_type":      "correct",
            "misplaced_step":  None,
            "first_wrong_pos": None,
            "error_concept":   None,
            "confidence":      "high",
            "detail":          "Assembly matches correct order.",
        }

    misplaced     = your_answer[first_wrong] if first_wrong < len(your_answer) else None
    expected_step = correct_answer[first_wrong]

    # Classify by the CORRECT step's concept — teaches what the student needs to know
    error_concept = classify_step(expected_step)

    wrong_count = sum(
        1 for i, e in enumerate(correct_answer)
        if i >= len(your_answer) or your_answer[i] != e
    )
    confidence = "high" if wrong_count == 1 else ("medium" if wrong_count <= 2 else "low")

    got_text = f"'{misplaced}'" if misplaced else "(missing)"
    detail   = (
        f"Position {first_wrong + 1}: placed {got_text}, "
        f"correct is '{expected_step}'."
    )

    return {
        "error_type":      "wrong_order",
        "misplaced_step":  misplaced,
        "first_wrong_pos": first_wrong,
        "error_concept":   error_concept,
        "confidence":      confidence,
        "detail":          detail,
    }
