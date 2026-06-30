"""
Static question generator — instant, no AI, no Ollama.

Used for the first question of every session so the student sees
something immediately. AI-generated questions take over from Q2 onwards
via the pre-fetch pipeline.
"""

import random
import uuid

from .ll_executor import execute_operation
from .concept_graph import concepts_for_op
from .question_spec import resolve_intra


def _distractor_count(consecutive_passes: int, emotion_default: int) -> int:
    if consecutive_passes == 0:
        return 0
    if consecutive_passes == 1:
        return 1
    return emotion_default

# ── Templates (pseudocode + metadata per operation) ────────────────────────────

TEMPLATES: dict[str, dict] = {
    "insertAtHead": {
        "title": "Insert at Head",
        "pseudocode": ["newNode = createNode(value);", "newNode.next = head;", "head = newNode;"],
        "correctOrder": [0, 1, 2],
        "hint": "What happens to the old head if you overwrite it first?",
        "distractors": ["node.next = newNode;", "free(temp);", "while (node.next != NULL) node = node.next;"],
        "needsValue": True, "needsPosition": False, "minNodes": 1,
    },
    "insertAtTail": {
        "title": "Insert at Tail",
        "pseudocode": ["node = head;", "while (node.next != NULL) node = node.next;", "newNode = createNode(value);", "node.next = newNode;", "newNode.next = NULL;"],
        "correctOrder": [0, 1, 2, 3, 4],
        "validOrders": [[0, 1, 2, 3, 4], [0, 2, 1, 3, 4], [2, 0, 1, 3, 4]],
        "hint": "Traverse to the last node before linking.",
        "distractors": ["head = newNode;", "newNode.next = head;", "free(temp);"],
        "needsValue": True, "needsPosition": False, "minNodes": 1,
    },
    "removeAtHead": {
        "title": "Remove at Head",
        "pseudocode": ["temp = head;", "head = head.next;", "free(temp);"],
        "correctOrder": [0, 1, 2],
        "hint": "Save head before advancing the pointer.",
        "distractors": ["node.next = newNode;", "newNode = createNode(value);", "newNode.next = NULL;"],
        "needsValue": False, "needsPosition": False, "minNodes": 2,
    },
    "removeAtTail": {
        "title": "Remove Last Node",
        "pseudocode": ["node = head;", "while (node.next.next != NULL) node = node.next;", "temp = node.next;", "node.next = NULL;", "free(temp);"],
        "correctOrder": [0, 1, 2, 3, 4],
        "hint": "Stop at the second-to-last node.",
        "distractors": ["head = head.next;", "newNode = createNode(value);", "node.next = newNode;"],
        "needsValue": False, "needsPosition": False, "minNodes": 2,
    },
    "insertIntoEmpty": {
        "title": "Insert into Empty List",
        "pseudocode": ["newNode = createNode(value);", "newNode.next = NULL;", "head = newNode;"],
        "correctOrder": [0, 1, 2],
        "hint": "The new node becomes the only element.",
        "distractors": ["newNode.next = head;", "free(temp);", "node = head;"],
        "needsValue": True, "needsPosition": False, "minNodes": 0,
    },
    "deleteEntireList": {
        "title": "Delete Entire List",
        "pseudocode": ["node = head;", "while (node != NULL) { temp = node.next; free(node); node = temp; }", "head = NULL;"],
        "correctOrder": [0, 1, 2],
        "hint": "Traverse and free each node, then null the head.",
        "distractors": ["newNode = createNode(value);", "node.next = newNode;", "newNode.next = head;"],
        "needsValue": False, "needsPosition": False, "minNodes": 2,
    },
    "insertAtPosition": {
        "title": "Insert at Position",
        "pseudocode": ["node = head;", "for (int i = 0; i < position-1; i++) node = node.next;", "newNode = createNode(value);", "newNode.next = node.next;", "node.next = newNode;"],
        "correctOrder": [0, 1, 2, 3, 4],
        "validOrders": [[0, 1, 2, 3, 4], [0, 2, 1, 3, 4], [2, 0, 1, 3, 4]],
        "hint": "Walk to the predecessor, then splice in.",
        "distractors": ["head = newNode;", "free(temp);", "while (node.next != NULL) node = node.next;"],
        "needsValue": True, "needsPosition": True, "minNodes": 2,
    },
    "removeAtPosition": {
        "title": "Remove at Position",
        "pseudocode": ["node = head;", "for (int i = 0; i < position-2; i++) node = node.next;", "temp = node.next;", "node.next = temp.next;", "free(temp);"],
        "correctOrder": [0, 1, 2, 3, 4],
        "hint": "Walk to the predecessor, bypass the target.",
        "distractors": ["newNode = createNode(value);", "newNode.next = node.next;", "head = head.next;"],
        "needsValue": False, "needsPosition": True, "minNodes": 3,
    },
    "reverseList": {
        "title": "Reverse Linked List",
        "pseudocode": ["prev = NULL;", "node = head;", "while (node != NULL) { temp = node.next; node.next = prev; prev = node; node = temp; }", "head = prev;"],
        "correctOrder": [0, 1, 2, 3],
        "hint": "Reverse each pointer one at a time.",
        "distractors": ["newNode = createNode(value);", "node.next = newNode;", "free(temp);"],
        "needsValue": False, "needsPosition": False, "minNodes": 2,
    },
    "mergeSortedLists": {
        "title": "Merge Two Sorted Lists",
        "pseudocode": ["dummy = createNode(0); node = dummy;", "while (l1 != NULL && l2 != NULL) { if (l1.val <= l2.val) { node.next = l1; l1 = l1.next; } else { node.next = l2; l2 = l2.next; } node = node.next; }", "node.next = (l1 != NULL) ? l1 : l2;", "return dummy.next;"],
        "correctOrder": [0, 1, 2, 3],
        "hint": "Use a dummy node; always attach the smaller value.",
        "distractors": ["head = prev;", "while (node.next != NULL) node = node.next;", "free(temp);"],
        "needsValue": False, "needsPosition": False, "minNodes": 0, "isMerge": True,
    },
    "detectCycle": {
        "title": "Linked List Cycle",
        "pseudocode": ["slow = head; fast = head;", "while (fast != NULL && fast.next != NULL) { slow = slow.next; fast = fast.next.next; }", "if (slow == fast) return true;", "return false;"],
        "correctOrder": [0, 1, 2, 3],
        "hint": "Floyd's algorithm: fast pointer moves twice as fast.",
        "distractors": ["newNode = createNode(value);", "node.next = newNode;", "head = prev;"],
        "needsValue": False, "needsPosition": False, "minNodes": 3,
    },
    "sortList": {
        "title": "Sort Linked List",
        "pseudocode": ["if (head == NULL || head.next == NULL) return head;", "slow = head; fast = head.next;", "while (fast && fast.next) { slow = slow.next; fast = fast.next.next; }", "mid = slow.next; slow.next = NULL;", "return merge(sortList(head), sortList(mid));"],
        "correctOrder": [0, 1, 2, 3, 4],
        "hint": "Split at midpoint using slow/fast, then merge sort.",
        "distractors": ["head = prev;", "newNode = createNode(value);", "node.next = newNode;"],
        "needsValue": False, "needsPosition": False, "minNodes": 3,
    },
}


# ── Fill-blank definitions (answer + 2 wrong options per pseudocode step) ─────
# Each list entry corresponds to the same-index pseudocode step.
# Each operation has 2 blank sets. One is chosen at random per question.
# "a" = correct answer (must be findable via str.replace(a, "___", 1) in the step text)
# "w" = two wrong options
_BLANKS: dict[str, list[list[dict]]] = {
    # ["newNode = createNode(value);", "newNode.next = head;", "head = newNode;"]
    "insertAtHead": [
        [  # A: what does each var point to?
            {"a": "newNode",          "w": ["head",    "temp"]},
            {"a": "head",             "w": ["head.next","NULL"]},
            {"a": "newNode",          "w": ["head",    "temp"]},
        ],
        [  # B: which role does each var play?
            {"a": "createNode(value)","w": ["NULL",    "head"]},
            {"a": "newNode",          "w": ["head",    "temp"]},
            {"a": "head",             "w": ["newNode", "NULL"]},
        ],
    ],
    # ["node = head;", "while (node.next != NULL) node = node.next;",
    #  "newNode = createNode(value);", "node.next = newNode;", "newNode.next = NULL;"]
    "insertAtTail": [
        [  # A: variable name focus
            {"a": "head",    "w": ["NULL",    "newNode"]},
            {"a": "node.next","w": ["node",   "node.next.next"]},
            {"a": "newNode", "w": ["head",    "temp"]},
            {"a": "newNode", "w": ["head.next","NULL"]},
            {"a": "NULL",    "w": ["newNode", "head"]},
        ],
        [  # B: loop termination & pointer roles
            {"a": "head",    "w": ["NULL",    "newNode"]},
            {"a": "NULL",    "w": ["node",    "node.next"]},
            {"a": "newNode", "w": ["head",    "temp"]},
            {"a": "node.next","w": ["node",   "head"]},
            {"a": "newNode", "w": ["node",    "head"]},
        ],
    ],
    # ["temp = head;", "head = head.next;", "free(temp);"]
    "removeAtHead": [
        [  # A: what each step does
            {"a": "head",    "w": ["NULL",    "temp"]},
            {"a": "head.next","w": ["head",   "NULL"]},
            {"a": "temp",    "w": ["head",    "NULL"]},
        ],
        [  # B: which variable to use
            {"a": "temp",    "w": ["node",    "head"]},
            {"a": "head",    "w": ["temp",    "NULL"]},
            {"a": "temp",    "w": ["node",    "prev"]},
        ],
    ],
    # ["node = head;", "while (node.next.next != NULL) node = node.next;",
    #  "temp = node.next;", "node.next = NULL;", "free(temp);"]
    "removeAtTail": [
        [  # A: condition & what to save
            {"a": "head",          "w": ["NULL",   "temp"]},
            {"a": "node.next.next","w": ["node.next","node"]},
            {"a": "node.next",     "w": ["node",   "head"]},
            {"a": "NULL",          "w": ["temp",   "node.next"]},
            {"a": "temp",          "w": ["node",   "head"]},
        ],
        [  # B: termination value & pointer assignment
            {"a": "head",      "w": ["NULL",     "temp"]},
            {"a": "NULL",      "w": ["node",     "node.next"]},
            {"a": "temp",      "w": ["node",     "head"]},
            {"a": "node.next", "w": ["node",     "head"]},
            {"a": "temp",      "w": ["node",     "prev"]},
        ],
    ],
    # ["newNode = createNode(value);", "newNode.next = NULL;", "head = newNode;"]
    "insertIntoEmpty": [
        [  # A: pointer values
            {"a": "newNode",          "w": ["head", "temp"]},
            {"a": "NULL",             "w": ["newNode","head"]},
            {"a": "newNode",          "w": ["NULL",  "temp"]},
        ],
        [  # B: variable roles
            {"a": "createNode(value)","w": ["NULL", "head"]},
            {"a": "newNode",          "w": ["head", "temp"]},
            {"a": "head",             "w": ["newNode","NULL"]},
        ],
    ],
    # ["node = head;", "while (node != NULL) { temp = node.next; free(node); node = temp; }", "head = NULL;"]
    "deleteEntireList": [
        [  # A: condition variable
            {"a": "head",    "w": ["NULL",   "temp"]},
            {"a": "node",    "w": ["node.next","temp"]},
            {"a": "NULL",    "w": ["temp",   "head.next"]},
        ],
        [  # B: what temp saves
            {"a": "node",    "w": ["head",   "temp"]},
            {"a": "node.next","w": ["node",  "temp"]},
            {"a": "NULL",    "w": ["temp",   "head"]},
        ],
    ],
    # ["node = head;", "for (int i = 0; i < position-1; i++) node = node.next;",
    #  "newNode = createNode(value);", "newNode.next = node.next;", "node.next = newNode;"]
    "insertAtPosition": [
        [  # A: what each pointer is set to
            {"a": "head",      "w": ["NULL",    "newNode"]},
            {"a": "position-1","w": ["position","position-2"]},
            {"a": "newNode",   "w": ["head",    "temp"]},
            {"a": "node.next", "w": ["node",    "NULL"]},
            {"a": "newNode",   "w": ["node.next","NULL"]},
        ],
        [  # B: which variable owns the pointer
            {"a": "head",      "w": ["NULL",    "newNode"]},
            {"a": "position-1","w": ["position","position-2"]},
            {"a": "newNode",   "w": ["head",    "temp"]},
            {"a": "newNode",   "w": ["node",    "head"]},
            {"a": "node.next", "w": ["node",    "head"]},
        ],
    ],
    # ["node = head;", "for (int i = 0; i < position-2; i++) node = node.next;",
    #  "temp = node.next;", "node.next = temp.next;", "free(temp);"]
    "removeAtPosition": [
        [  # A: what to save and bypass
            {"a": "head",      "w": ["NULL",     "temp"]},
            {"a": "position-2","w": ["position-1","position"]},
            {"a": "node.next", "w": ["node",     "temp"]},
            {"a": "temp.next", "w": ["temp",     "node.next"]},
            {"a": "temp",      "w": ["node",     "head"]},
        ],
        [  # B: which variable owns each role
            {"a": "head",      "w": ["NULL",     "temp"]},
            {"a": "position-2","w": ["position-1","position"]},
            {"a": "temp",      "w": ["node",     "head"]},
            {"a": "node.next", "w": ["node",     "head"]},
            {"a": "temp",      "w": ["node",     "prev"]},
        ],
    ],
    # ["prev = NULL;", "node = head;",
    #  "while (node != NULL) { temp = node.next; node.next = prev; prev = node; node = temp; }",
    #  "head = prev;"]
    "reverseList": [
        [  # A: what prev is set to at each step
            {"a": "NULL", "w": ["head",  "temp"]},
            {"a": "head", "w": ["NULL",  "prev"]},
            {"a": "prev", "w": ["node",  "temp"]},
            {"a": "prev", "w": ["node",  "temp"]},
        ],
        [  # B: what saves the next pointer
            {"a": "NULL", "w": ["head",  "temp"]},
            {"a": "head", "w": ["NULL",  "prev"]},
            {"a": "temp", "w": ["prev",  "node"]},
            {"a": "prev", "w": ["node",  "temp"]},
        ],
    ],
    # ["dummy = createNode(0); node = dummy;",
    #  "while (l1 != NULL && l2 != NULL) { ... }",
    #  "node.next = (l1 != NULL) ? l1 : l2;",
    #  "return dummy.next;"]
    "mergeSortedLists": [
        [  # A: l1 conditions
            {"a": "dummy",     "w": ["head", "NULL"]},
            {"a": "l1",        "w": ["l2",   "NULL"]},
            {"a": "l1",        "w": ["l2",   "NULL"]},
            {"a": "dummy.next","w": ["dummy","node"]},
        ],
        [  # B: l2 conditions
            {"a": "dummy",     "w": ["head", "NULL"]},
            {"a": "l2",        "w": ["l1",   "NULL"]},
            {"a": "l2",        "w": ["l1",   "NULL"]},
            {"a": "dummy.next","w": ["dummy","node"]},
        ],
    ],
    # ["slow = head; fast = head;",
    #  "while (fast != NULL && fast.next != NULL) { slow = slow.next; fast = fast.next.next; }",
    #  "if (slow == fast) return true;",
    #  "return false;"]
    "detectCycle": [
        [  # A: how fast pointer advances
            {"a": "head",          "w": ["NULL",  "fast"]},
            {"a": "fast.next.next","w": ["fast.next","slow.next"]},
            {"a": "true",          "w": ["false", "NULL"]},
            {"a": "false",         "w": ["true",  "NULL"]},
        ],
        [  # B: pointer names and condition
            {"a": "fast",  "w": ["slow",  "node"]},
            {"a": "NULL",  "w": ["head",  "slow"]},
            {"a": "slow",  "w": ["fast",  "head"]},
            {"a": "false", "w": ["true",  "NULL"]},
        ],
    ],
    # ["if (head == NULL || head.next == NULL) return head;",
    #  "slow = head; fast = head.next;",
    #  "while (fast && fast.next) { slow = slow.next; fast = fast.next.next; }",
    #  "mid = slow.next; slow.next = NULL;",
    #  "return merge(sortList(head), sortList(mid));"]
    "sortList": [
        [  # A: midpoint and recursion targets
            {"a": "NULL",          "w": ["head",  "mid"]},
            {"a": "head.next",     "w": ["head",  "NULL"]},
            {"a": "fast.next.next","w": ["fast.next","slow.next"]},
            {"a": "slow.next",     "w": ["slow",  "fast.next"]},
            {"a": "mid",           "w": ["head",  "slow"]},
        ],
        [  # B: split and first-half recursion
            {"a": "NULL",          "w": ["head",  "mid"]},
            {"a": "head.next",     "w": ["head",  "NULL"]},
            {"a": "fast.next.next","w": ["fast.next","slow.next"]},
            {"a": "NULL",          "w": ["mid",   "slow"]},
            {"a": "head",          "w": ["mid",   "slow"]},
        ],
    ],
}

# ── Bug definitions (one predefined bug per operation) ─────────────────────────
_BUGS: dict[str, dict] = {
    "insertAtHead":     {"line": 1, "buggy": "newNode.next = head.next;",
                         "fix": "newNode.next = head;",
                         "explanation": "head.next skips the original head, losing it from the list",
                         "options": ["newNode.next = head;", "newNode.next = NULL;", "head.next = newNode;"]},
    "insertAtTail":     {"line": 3, "buggy": "node.next = node.next;",
                         "fix": "node.next = newNode;",
                         "explanation": "node.next = node.next creates a self-loop instead of linking the new node",
                         "options": ["node.next = newNode;", "node.next = NULL;", "newNode.next = node;"]},
    "removeAtHead":     {"line": 1, "buggy": "head = head;",
                         "fix": "head = head.next;",
                         "explanation": "head = head doesn't advance the pointer — the old head is never removed",
                         "options": ["head = head.next;", "head = NULL;", "head = temp.next;"]},
    "removeAtTail":     {"line": 1, "buggy": "while (node.next != NULL) node = node.next;",
                         "fix": "while (node.next.next != NULL) node = node.next;",
                         "explanation": "Stopping at node.next == NULL lands on the last node, not its predecessor",
                         "options": ["while (node.next.next != NULL) node = node.next;",
                                     "while (node != NULL) node = node.next;",
                                     "while (node.next != NULL) node = node.next.next;"]},
    "insertIntoEmpty":  {"line": 2, "buggy": "head = NULL;",
                         "fix": "head = newNode;",
                         "explanation": "Setting head = NULL discards the new node; head must point to newNode",
                         "options": ["head = newNode;", "head = head.next;", "head = temp;"]},
    "deleteEntireList": {"line": 0, "buggy": "node = head.next;",
                         "fix": "node = head;",
                         "explanation": "Starting at head.next skips the first node, causing a memory leak",
                         "options": ["node = head;", "node = NULL;", "node = head.next.next;"]},
    "insertAtPosition": {"line": 3, "buggy": "newNode.next = node;",
                         "fix": "newNode.next = node.next;",
                         "explanation": "Pointing to node (predecessor) instead of node.next (successor) corrupts the list",
                         "options": ["newNode.next = node.next;", "newNode.next = NULL;", "newNode.next = node.next.next;"]},
    "removeAtPosition": {"line": 3, "buggy": "node.next = temp;",
                         "fix": "node.next = temp.next;",
                         "explanation": "node.next = temp creates a cycle; it must skip temp by pointing to temp.next",
                         "options": ["node.next = temp.next;", "node.next = NULL;", "node.next = temp.next.next;"]},
    "reverseList":      {"line": 2,
                         "buggy": "while (node != NULL) { temp = node.next; node.next = prev; prev = node; node = node.next; }",
                         "fix":   "while (node != NULL) { temp = node.next; node.next = prev; prev = node; node = temp; }",
                         "explanation": "After node.next = prev, node.next has been overwritten — using node.next instead of temp loses the rest of the list",
                         "options": ["while (node != NULL) { temp = node.next; node.next = prev; prev = node; node = temp; }",
                                     "while (node != NULL) { node.next = prev; prev = node; node = node.next; }",
                                     "while (node != NULL) { temp = node.next; prev = node; node.next = prev; node = temp; }"]},
    "mergeSortedLists": {"line": 2, "buggy": "node.next = (l1 != NULL) ? l2 : l1;",
                         "fix": "node.next = (l1 != NULL) ? l1 : l2;",
                         "explanation": "Conditions are swapped: attaches l2 when l1 remains and vice versa",
                         "options": ["node.next = (l1 != NULL) ? l1 : l2;", "node.next = l1;", "node.next = l2;"]},
    "detectCycle":      {"line": 1,
                         "buggy": "while (fast != NULL && fast.next != NULL) { slow = slow.next; fast = fast.next; }",
                         "fix":   "while (fast != NULL && fast.next != NULL) { slow = slow.next; fast = fast.next.next; }",
                         "explanation": "fast = fast.next moves at the same speed as slow — they never meet in an acyclic list and loop forever in a cycle",
                         "options": ["while (fast != NULL && fast.next != NULL) { slow = slow.next; fast = fast.next.next; }",
                                     "while (fast != NULL) { slow = slow.next; fast = fast.next.next; }",
                                     "while (fast != NULL && fast.next != NULL) { slow = slow.next.next; fast = fast.next.next; }"]},
    "sortList":         {"line": 3, "buggy": "mid = slow; slow.next = NULL;",
                         "fix": "mid = slow.next; slow.next = NULL;",
                         "explanation": "mid = slow splits at slow (predecessor of midpoint) instead of slow.next",
                         "options": ["mid = slow.next; slow.next = NULL;",
                                     "mid = slow; slow = NULL;",
                                     "mid = fast; slow.next = NULL;"]},
}


CONCEPT_HINTS: dict[str, str] = {
    "pointer_assignment": "Focus on which pointer gets overwritten — once you reassign it, can you still reach the original node?",
    "node_creation":      "Think about when the new node needs to exist before you can link it into the list.",
    "traversal":          "Think about where your loop should stop — one node too early or too late changes everything.",
    "memory_management":  "Make sure you save a reference before you overwrite the pointer that points there.",
    "list_structure":     "Consider the whole list state — what does head point to after each step?",
}


def generate_static_question(
    operation: str,
    emotion: str = "engaged",
    consecutive_passes: int = 0,
    concept_mastery: dict[str, float] | None = None,
    intra_level: int | None = None,
) -> dict:
    """
    Instant question generation — no AI, no network calls.
    Returns a valid question dict compatible with the frontend game board.

    intra_level (state axis): when set, node count + distractor count come from
    INTRA_KNOBS["ordering"]. When None, legacy behaviour (emotion → nodes,
    consecutive_passes → distractors) is used.
    """
    tmpl = TEMPLATES.get(operation)
    if not tmpl:
        raise ValueError(f"Unknown operation: {operation}")

    is_merge     = tmpl.get("isMerge", False)
    needs_value  = tmpl["needsValue"]
    needs_pos    = tmpl["needsPosition"]

    knobs = resolve_intra("ordering", intra_level)
    if knobs:
        node_count = max(knobs["node_count"], tmpl["minNodes"])
        n_dist     = min(knobs["distractors"], len(tmpl["distractors"]))
    else:
        # Legacy: node count from emotion, distractor count from consecutive passes
        base_nodes = {"frustrated": 2, "confused": 2, "engaged": 3, "bored": 4}.get(emotion, 3)
        node_count = max(base_nodes, tmpl["minNodes"])
        n_dist     = _distractor_count(consecutive_passes, 2)

    # Pick hint targeting the student's weakest concept for this operation
    hint = tmpl["hint"]
    if concept_mastery:
        concepts = concepts_for_op(operation)
        if concepts:
            weakest = min(concepts, key=lambda c: concept_mastery.get(c, 0.0))
            hint = CONCEPT_HINTS.get(weakest, hint)

    if is_merge:
        n = max(2, node_count - 1)
        l1 = sorted(random.sample(range(1, 50), n))
        l2 = sorted(random.sample([v for v in range(1, 50) if v not in l1], n))
        goal = sorted(l1 + l2)
        initial_nodes = [{"id": i + 1, "value": v, "next": i + 2 if i + 1 < len(l1) else None} for i, v in enumerate(l1)]
        return {
            "id": str(uuid.uuid4()), "title": tmpl["title"], "operation": operation,
            "operationValue": {"l1Values": l1, "l2Values": l2}, "operationPosition": None,
            "pseudocode": tmpl["pseudocode"], "correctOrder": tmpl["correctOrder"],
            "validOrders": tmpl.get("validOrders", [tmpl["correctOrder"]]),
            "distractors": _pick(tmpl["distractors"], n_dist),
            "initialNodes": initial_nodes, "goalPattern": goal,
            "hint": hint, "isMerge": True, "l1Values": l1, "l2Values": l2,
        }

    # Build random initial nodes
    if node_count > 0:
        vals = random.sample(range(1, 100), node_count)
        nodes = [{"id": i + 1, "value": v, "next": i + 2 if i + 1 < node_count else None}
                 for i, v in enumerate(vals)]
    else:
        nodes = []

    op_value = None
    op_pos   = None

    if needs_value:
        used = {n["value"] for n in nodes}
        op_value = random.choice([v for v in range(1, 100) if v not in used])

    if needs_pos and node_count >= 2:
        op_pos = random.randint(2, node_count)

    # Compute goalPattern via executor (ground truth)
    result = execute_operation(operation, nodes, op_value, op_pos)
    goal   = result["values"]

    return {
        "id": str(uuid.uuid4()), "title": tmpl["title"], "operation": operation,
        "operationValue": op_value, "operationPosition": op_pos,
        "pseudocode": tmpl["pseudocode"], "correctOrder": tmpl["correctOrder"],
        "validOrders": tmpl.get("validOrders", [tmpl["correctOrder"]]),
        "distractors": _pick(tmpl["distractors"], n_dist),
        "initialNodes": nodes, "goalPattern": goal,
        "hint": hint, "isMerge": False,
    }


def _pick(pool: list, k: int = 2) -> list:
    return random.sample(pool, min(k, len(pool)))


def _build_nodes_and_goal(operation: str, tmpl: dict, node_count: int):
    """Shared helper: build random nodes + op_value/pos + goalPattern."""
    needs_value = tmpl["needsValue"]
    needs_pos   = tmpl["needsPosition"]

    if node_count > 0:
        vals  = random.sample(range(1, 100), node_count)
        nodes = [{"id": i + 1, "value": v, "next": i + 2 if i + 1 < node_count else None}
                 for i, v in enumerate(vals)]
    else:
        nodes = []

    op_value = None
    op_pos   = None
    if needs_value:
        used = {n["value"] for n in nodes}
        op_value = random.choice([v for v in range(1, 100) if v not in used])
    if needs_pos and node_count >= 2:
        op_pos = random.randint(2, node_count)

    result = execute_operation(operation, nodes, op_value, op_pos)
    return nodes, op_value, op_pos, result["values"]


def generate_fill_blank_question(operation: str, spec) -> dict:
    """Static fill-in-the-blank using predefined blank sets (randomly chosen)."""
    tmpl      = TEMPLATES.get(operation)
    blank_sets = _BLANKS.get(operation)
    if not tmpl or not blank_sets:
        return generate_static_question(operation, spec.emotion)

    knobs = resolve_intra("fill_blank", getattr(spec, "intra_difficulty", None))
    if knobs:
        node_count = max(knobs["node_count"], tmpl["minNodes"])
        n_opts     = knobs["options"]
        num_blanks = knobs["num_blanks"]
    else:
        node_count = max(2, tmpl["minNodes"])
        n_opts     = 3
        num_blanks = None   # blank every step

    nodes, op_value, op_pos, goal = _build_nodes_and_goal(operation, tmpl, node_count)

    blanks_d = random.choice(blank_sets)   # pick one set at random
    pseudocode = tmpl["pseudocode"]
    total = len(pseudocode)
    # Which steps to blank: a subset (easier) or all. Non-blanked steps show the
    # correct code, so the student only fills the chosen ones (completion problem).
    if num_blanks is None or num_blanks >= total:
        blank_idxs = set(range(total))
    else:
        blank_idxs = set(random.sample(range(total), max(1, num_blanks)))

    blanked: list[str] = []
    blanks:  list[dict] = []
    for i, (step, bd) in enumerate(zip(pseudocode, blanks_d)):
        if i not in blank_idxs:
            blanked.append(step)   # full correct step, no blank
            continue
        answer  = bd["a"]
        blanked_step = step.replace(answer, "___", 1)
        options = [answer] + bd["w"][:max(1, n_opts - 1)]
        random.shuffle(options)
        blanked.append(blanked_step)
        blanks.append({"line": i, "answer": answer, "options": options})

    return {
        "id":              str(uuid.uuid4()),
        "question_type":   "fill_blank",
        "operation":       operation,
        "title":           tmpl["title"],
        "difficulty":      spec.difficulty,
        "pseudocode":      blanked,
        "blanks":          blanks,
        "initialNodes":    nodes,
        "operationValue":  op_value,
        "operationPosition": op_pos,
        "goalPattern":     goal,
        "hint":            tmpl["hint"],
        "isMerge":         tmpl.get("isMerge", False),
    }


def generate_find_bug_question(operation: str, spec) -> dict:
    """Static find-the-bug fallback using predefined bug definitions."""
    tmpl   = TEMPLATES.get(operation)
    bug_d  = _BUGS.get(operation)
    if not tmpl or not bug_d:
        return generate_static_question(operation, spec.emotion)

    knobs = resolve_intra("find_bug", getattr(spec, "intra_difficulty", None))
    if knobs:
        node_count = max(knobs["node_count"], tmpl["minNodes"])
        n_opts     = knobs["options"]
    else:
        node_count = max(3, tmpl["minNodes"])
        n_opts     = None
    nodes, op_value, op_pos, goal = _build_nodes_and_goal(operation, tmpl, node_count)

    # Inject bug into pseudocode
    # TODO(intra): bug subtlety is fixed (one predefined bug per op). To make
    # find_bug truly easier/harder we need multiple bug variants per op or AI.
    pseudocode = list(tmpl["pseudocode"])
    bug_line   = bug_d["line"]
    pseudocode[bug_line] = bug_d["buggy"]

    options = list(bug_d["options"])
    if n_opts and n_opts < len(options):
        fix   = bug_d["fix"]
        wrong = [o for o in options if o != fix][:max(1, n_opts - 1)]
        options = [fix] + wrong
    random.shuffle(options)

    return {
        "id":              str(uuid.uuid4()),
        "question_type":   "find_bug",
        "operation":       operation,
        "title":           tmpl["title"],
        "difficulty":      spec.difficulty,
        "pseudocode":      pseudocode,
        "bug_line":        bug_line,
        "bug_explanation": bug_d["explanation"],
        "fix":             bug_d["fix"],
        "options":         options,
        "initialNodes":    nodes,
        "operationValue":  op_value,
        "operationPosition": op_pos,
        "goalPattern":     goal,
        "hint":            tmpl["hint"],
        "isMerge":         tmpl.get("isMerge", False),
    }
