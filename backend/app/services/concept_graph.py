"""
Concept graph for linked list algorithm teaching.

Concepts are the fundamental skills underlying each operation.
The graph defines prerequisite relationships between concepts,
and maps each operation to the concepts it exercises.
"""

# ── Concept definitions with prerequisite relationships ────────────────────────

CONCEPTS: dict[str, dict] = {
    "pointer_assignment": {
        "prereqs": [],
        "description": "Assigning and reassigning pointer variables",
    },
    "node_creation": {
        "prereqs": ["pointer_assignment"],
        "description": "Allocating a new node and setting its fields",
    },
    "traversal": {
        "prereqs": ["pointer_assignment"],
        "description": "Walking a linked list from head to a target node",
    },
    "memory_management": {
        "prereqs": ["traversal"],
        "description": "Freeing nodes and nulling stale pointers",
    },
    "list_structure": {
        "prereqs": ["traversal", "node_creation"],
        "description": "Understanding whole-list invariants (head, tail, cycle)",
    },
}

# ── Concepts each operation exercises (ordered by primary → secondary) ─────────

OP_CONCEPTS: dict[str, list[str]] = {
    "insertAtHead":     ["node_creation", "pointer_assignment"],
    "insertAtTail":     ["traversal", "node_creation", "pointer_assignment"],
    "removeAtHead":     ["pointer_assignment", "memory_management"],
    "removeAtTail":     ["traversal", "pointer_assignment", "memory_management"],
    "insertIntoEmpty":  ["node_creation", "pointer_assignment"],
    "deleteEntireList": ["traversal", "memory_management", "list_structure"],
    "insertAtPosition": ["traversal", "node_creation", "pointer_assignment"],
    "removeAtPosition": ["traversal", "pointer_assignment", "memory_management"],
    "reverseList":      ["traversal", "pointer_assignment", "list_structure"],
    "mergeSortedLists": ["traversal", "pointer_assignment", "list_structure"],
    "detectCycle":      ["traversal", "list_structure"],
    "sortList":         ["traversal", "list_structure", "pointer_assignment"],
}

# ── Helpers ────────────────────────────────────────────────────────────────────

def concepts_for_op(operation: str) -> list[str]:
    return OP_CONCEPTS.get(operation, [])


def prereqs_met(concept: str, mastery_map: dict[str, float], threshold: float = 0.4) -> bool:
    """Return True if all prerequisites for a concept are mastered above threshold."""
    for prereq in CONCEPTS[concept]["prereqs"]:
        if mastery_map.get(prereq, 0.0) < threshold:
            return False
    return True


def op_prereqs_met(operation: str, mastery_map: dict[str, float], threshold: float = 0.4) -> bool:
    """Return True if prerequisites for all concepts of an operation are met."""
    for concept in concepts_for_op(operation):
        if not prereqs_met(concept, mastery_map, threshold):
            return False
    return True


def weakest_concept_score(operation: str, mastery_map: dict[str, float]) -> float:
    """Return the lowest concept mastery score among the concepts this operation exercises."""
    concepts = concepts_for_op(operation)
    if not concepts:
        return 1.0
    return min(mastery_map.get(c, 0.0) for c in concepts)
